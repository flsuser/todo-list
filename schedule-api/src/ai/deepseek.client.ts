import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { decryptSecret } from '../common/utils/secret'

/** OpenAI 兼容的多模态消息片段 */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ContentPart[]
}

export interface ChatResult {
  content: string
  model: string
  promptTokens: number
  completionTokens: number
}

/** 一次识别请求最终使用的配置：用户自填 Key 优先，否则回退服务器环境变量 */
export interface ResolvedAiConfig {
  apiKey: string
  textModel: string
  visionModel: string
  source: 'user' | 'server'
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[]
  model?: string
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  error?: { message?: string; type?: string }
}

/**
 * DeepSeek Chat Completions 客户端（OpenAI 兼容协议）。
 * 纯文本与图文混合走同一个接口，区别只在 model 与消息里是否带 image_url 片段。
 */
@Injectable()
export class DeepseekClient {
  private readonly logger = new Logger('DeepSeek')

  get apiKey(): string {
    return (process.env.DEEPSEEK_API_KEY ?? '').trim()
  }
  get baseUrl(): string {
    return (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(/\/$/, '')
  }
  /** 纯文本识别模型 */
  get textModel(): string {
    return (process.env.DEEPSEEK_MODEL ?? 'deepseek-chat').trim()
  }
  /** 图文识别模型；留空表示未开通视觉能力 */
  get visionModel(): string {
    return (process.env.DEEPSEEK_VISION_MODEL ?? '').trim()
  }
  get timeoutMs(): number {
    const n = Number(process.env.DEEPSEEK_TIMEOUT_MS)
    return Number.isFinite(n) && n > 0 ? n : 60_000
  }

  get enabled(): boolean {
    return Boolean(this.apiKey)
  }
  get visionEnabled(): boolean {
    return Boolean(this.visionModel)
  }

  /**
   * Key 优先级：用户自己在网站里填的（加密存在 User 表）> 服务器环境变量。
   * 模型优先级：用户自选 > 服务器环境变量/内置默认；
   * 用户自带 Key 时视觉模型只认用户填的值（可能为空 = 仅文字识别）。
   */
  resolveConfig(user: {
    deepseekKey: string | null
    deepseekModel: string | null
    deepseekVisionModel: string | null
  } | null): ResolvedAiConfig {
    const userModel = (user?.deepseekModel ?? '').trim()
    const userVision = (user?.deepseekVisionModel ?? '').trim()
    const textModel = userModel || this.textModel

    const userKey = decryptSecret(user?.deepseekKey)
    if (userKey) {
      return { apiKey: userKey, textModel, visionModel: userVision, source: 'user' }
    }
    return { apiKey: this.apiKey, textModel, visionModel: userVision || this.visionModel, source: 'server' }
  }

  async chat(messages: ChatMessage[], model: string, apiKey: string): Promise<ChatResult> {
    if (!apiKey) {
      throw new ServiceUnavailableException('未配置 DeepSeek API Key，AI 识别暂不可用')
    }

    // 部分模型不支持 JSON mode，遇到 400 时去掉 response_format 再试一次
    try {
      return await this.request(messages, model, apiKey, true)
    } catch (e) {
      if (e instanceof BadGatewayException && /response_format|json/i.test(e.message)) {
        this.logger.warn('模型不支持 JSON mode，回退为普通对话重试')
        return this.request(messages, model, apiKey, false)
      }
      throw e
    }
  }

  private async request(messages: ChatMessage[], model: string, apiKey: string, jsonMode: boolean): Promise<ChatResult> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    const body: Record<string, unknown> = { model, messages, temperature: 0.1, stream: false }
    if (jsonMode) body.response_format = { type: 'json_object' }

    let res: Response
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      throw new BadGatewayException(
        controller.signal.aborted
          ? `DeepSeek 请求超时（${this.timeoutMs}ms），图片过多或过大时可减少后重试`
          : `无法连接 DeepSeek：${reason}`,
      )
    } finally {
      clearTimeout(timer)
    }

    const data = (await res.json().catch(() => null)) as ChatCompletionResponse | null
    if (!res.ok) {
      const detail = data?.error?.message ?? `HTTP ${res.status} ${res.statusText}`
      this.logger.error(`DeepSeek 调用失败：${detail}`)
      throw new BadGatewayException(`DeepSeek 调用失败：${detail}`)
    }

    const content = data?.choices?.[0]?.message?.content?.trim()
    if (!content) throw new BadGatewayException('DeepSeek 未返回有效内容')

    return {
      content,
      model: data?.model ?? model,
      promptTokens: data?.usage?.prompt_tokens ?? 0,
      completionTokens: data?.usage?.completion_tokens ?? 0,
    }
  }
}
