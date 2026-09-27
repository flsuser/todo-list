import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { Event, EventList, User } from '@prisma/client'
import { PUBLIC_BASE_URL } from '../common/config'
import { Page } from '../common/types'
import { formatInTz, safeTimezone } from '../common/utils/time'
import { PrismaService } from '../prisma/prisma.service'
import { DingTalkAdapter } from './adapters/dingtalk.adapter'
import { NotifyAdapter, NotifyPayload } from './adapters/notify.adapter'
import { ServerChanAdapter } from './adapters/serverchan.adapter'

/** 发送失败后的重试间隔（毫秒） */
const RETRY_DELAYS = [1000, 3000]

type EventWithList = Event & { list?: EventList | null }

export interface DeliverOptions {
  user: User
  payload: NotifyPayload
  eventId?: number | null
  occurrenceId?: number | null
}

@Injectable()
export class NotifyService {
  private readonly logger = new Logger('Notify')
  private readonly adapters: Record<string, NotifyAdapter>

  constructor(
    private readonly prisma: PrismaService,
    serverChan: ServerChanAdapter,
    dingtalk: DingTalkAdapter,
  ) {
    // 渠道名与 User.notifyChannel 的取值一一对应
    this.adapters = { [serverChan.name]: serverChan, [dingtalk.name]: dingtalk }
  }

  /** 可用渠道列表，供前端设置页渲染 */
  channels(): { value: string; label: string; hint: string }[] {
    return [
      { value: 'none', label: '关闭推送', hint: '仅在页面内展示提醒' },
      { value: 'serverchan', label: 'Server酱3', hint: '填写 SendKey，推送到微信服务号（免费额度每日 5 条）' },
      { value: 'dingtalk', label: '钉钉机器人', hint: '填写 Webhook 地址与加签密钥，推送到钉钉群' },
    ]
  }

  /**
   * 发送一条推送：失败按 RETRY_DELAYS 重试，最终结果（无论成败）写入 NotifyLog。
   * 返回是否成功。
   */
  async deliver(opts: DeliverOptions): Promise<boolean> {
    const { user, payload } = opts
    const adapter = this.adapters[user.notifyChannel]
    if (!adapter || !user.notifyToken) return false

    let lastError = ''
    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
      if (attempt > 0) await sleep(RETRY_DELAYS[attempt - 1])
      try {
        await adapter.send(user.notifyToken, payload)
        await this.writeLog({ ...opts, ok: true, error: null })
        return true
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e)
      }
    }

    this.logger.warn(`推送失败 user=${user.id} event=${opts.eventId ?? '-'}: ${lastError}`)
    await this.writeLog({ ...opts, ok: false, error: lastError })
    return false
  }

  /** 设置页「发送测试消息」：立即验证渠道配置是否正确 */
  async sendTest(user: User): Promise<void> {
    const adapter = this.adapters[user.notifyChannel]
    if (!adapter) throw new BadRequestException('请先选择推送渠道')
    if (!user.notifyToken) throw new BadRequestException('请先填写推送凭证')

    const tz = safeTimezone(user.timezone)
    try {
      await adapter.send(user.notifyToken, {
        title: '日程提醒测试',
        body: [
          '### 日程提醒测试',
          '',
          `这是一条来自日程站的测试消息，收到即表示 **${user.notifyChannel}** 渠道配置成功。`,
          '',
          `- 发送时间：${formatInTz(new Date(), tz, 'YYYY-MM-DD HH:mm:ss')}`,
          `- 默认提前提醒：${user.notifyBefore} 分钟`,
        ].join('\n'),
        eventTime: formatInTz(new Date(), tz),
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      await this.writeLog({ user, payload: { title: '测试消息', body: '', eventTime: '' }, ok: false, error: message })
      throw new BadRequestException(`测试推送失败：${message}`)
    }

    await this.writeLog({ user, payload: { title: '测试消息', body: '', eventTime: '' }, ok: true, error: null })
  }

  /** 组装一条日程提醒的 Markdown 文案 */
  buildPayload(event: EventWithList, startAt: Date, user: User): NotifyPayload {
    const tz = safeTimezone(user.timezone)
    const timeText = event.allDay
      ? `${formatInTz(startAt, tz, 'YYYY年MM月DD日')} 全天`
      : formatInTz(startAt, tz, 'YYYY年MM月DD日 HH:mm')

    const lines = [
      `### ${event.title}`,
      '',
      `- 时间：${timeText}`,
    ]
    if (event.location) lines.push(`- 地点：${event.location}`)
    if (event.list) lines.push(`- 清单：${event.list.name}`)
    if (event.rrule) lines.push(`- 重复：${event.rrule.replace(/^RRULE:/, '')}`)
    if (event.notes) lines.push(`- 备注：${event.notes.slice(0, 200)}`)

    const url = PUBLIC_BASE_URL
      ? `${PUBLIC_BASE_URL}/calendar?date=${formatInTz(startAt, tz, 'YYYY-MM-DD')}&focus=${event.id}`
      : undefined
    if (url) lines.push('', `[查看详情](${url})`)

    return {
      title: `日程提醒：${event.title}`,
      body: lines.join('\n'),
      eventTime: timeText,
      url,
    }
  }

  /** 推送日志分页，供设置页展示 */
  async logs(userId: number, page: number, limit: number): Promise<Page<unknown>> {
    const where = { userId }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.notifyLog.count({ where }),
      this.prisma.notifyLog.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])
    return { total, items }
  }

  private async writeLog(opts: DeliverOptions & { ok: boolean; error: string | null }): Promise<void> {
    try {
      await this.prisma.notifyLog.create({
        data: {
          userId: opts.user.id,
          eventId: opts.eventId ?? null,
          occurrenceId: opts.occurrenceId ?? null,
          channel: opts.user.notifyChannel,
          title: opts.payload.title.slice(0, 190),
          ok: opts.ok,
          error: opts.error?.slice(0, 500) ?? null,
        },
      })
    } catch (e) {
      // 日志写失败不应影响主流程
      this.logger.error(`写入推送日志失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
