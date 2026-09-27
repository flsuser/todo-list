import { createHmac } from 'crypto'
import { Injectable } from '@nestjs/common'
import { NotifyAdapter, NotifyPayload } from './notify.adapter'

interface DingTalkResponse {
  errcode?: number
  errmsg?: string
}

/**
 * 钉钉自定义群机器人。
 * token 约定格式：`webhookUrl|secret`；未开启加签时 secret 留空即可（`webhookUrl|`）。
 */
@Injectable()
export class DingTalkAdapter implements NotifyAdapter {
  readonly name = 'dingtalk'

  async send(token: string, payload: NotifyPayload): Promise<void> {
    const [rawUrl, rawSecret] = token.split('|')
    const webhook = rawUrl?.trim()
    if (!webhook) throw new Error('钉钉 Webhook 地址未配置')

    const url = this.signedUrl(webhook, rawSecret?.trim())
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'markdown',
        markdown: { title: payload.title.slice(0, 60), text: payload.body },
      }),
    })

    const data = (await res.json().catch(() => ({}))) as DingTalkResponse
    if (!res.ok || (typeof data.errcode === 'number' && data.errcode !== 0)) {
      throw new Error(data.errmsg || `HTTP ${res.status} ${res.statusText}`)
    }
  }

  /** 加签模式：sign = urlEncode(base64(HMAC-SHA256(secret, `${timestamp}\n${secret}`))) */
  private signedUrl(webhook: string, secret?: string): string {
    if (!secret) return webhook

    const timestamp = Date.now()
    const sign = createHmac('sha256', secret)
      .update(`${timestamp}\n${secret}`)
      .digest('base64')
    const sep = webhook.includes('?') ? '&' : '?'
    return `${webhook}${sep}timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`
  }
}
