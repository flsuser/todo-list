/** 一条推送的内容 */
export interface NotifyPayload {
  /** 消息标题（Server酱 会截断到 32 字） */
  title: string
  /** Markdown 正文 */
  body: string
  /** 事件开始时间（已按用户时区格式化） */
  eventTime: string
  /** 「查看详情」跳转链接 */
  url?: string
}

/**
 * 推送渠道适配器。
 * 新增渠道（企业微信、邮件、通用 Webhook）时实现该接口并注册到 NotifyService 即可，
 * 其余业务代码无需改动。
 */
export interface NotifyAdapter {
  readonly name: string
  send(token: string, payload: NotifyPayload): Promise<void>
}
