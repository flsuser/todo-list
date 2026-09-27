import { Injectable } from '@nestjs/common'
import { NotifyAdapter, NotifyPayload } from './notify.adapter'

interface ServerChanResponse {
  code?: number
  message?: string
  info?: string
  data?: unknown
}

/**
 * Server酱3（sct.ftqq.com）：token 即 SendKey。
 * 免费额度每日 5 条，超出会返回非 0 code，此处原样透出便于排查。
 */
@Injectable()
export class ServerChanAdapter implements NotifyAdapter {
  readonly name = 'serverchan'

  async send(token: string, payload: NotifyPayload): Promise<void> {
    const url = `https://sctapi.ftqq.com/${encodeURIComponent(token.trim())}.send`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        // Server酱 标题上限 32 字符，超长直接截断
        title: payload.title.slice(0, 32),
        desp: payload.body,
      }),
    })

    const data = (await res.json().catch(() => ({}))) as ServerChanResponse
    if (!res.ok || (typeof data.code === 'number' && data.code !== 0)) {
      throw new Error(data.message || data.info || `HTTP ${res.status} ${res.statusText}`)
    }
  }
}
