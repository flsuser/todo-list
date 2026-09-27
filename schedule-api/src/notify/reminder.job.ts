import { Injectable, Logger } from '@nestjs/common'
import { Event, EventList, User } from '@prisma/client'
import { Cron, CronExpression } from '@nestjs/schedule'
import { OccurrenceService } from '../events/occurrence.service'
import { PrismaService } from '../prisma/prisma.service'
import { NotifyService } from './notify.service'

type EventFull = Event & { list: EventList | null; user: User }

/** 提前提醒的最大跨度；与 DTO 中 remindBefore 的上限保持一致 */
const HORIZON_MS = 25 * 60 * 60 * 1000
/** 已错过开始时间但仍在该窗口内的，补发一次提醒 */
const GRACE_MS = 5 * 60 * 1000
/** 单轮最多处理的条数，防止突发把推送渠道打爆 */
const BATCH_LIMIT = 50

@Injectable()
export class ReminderJob {
  private readonly logger = new Logger('Reminder')
  /** 上一轮未跑完时直接跳过，避免定时任务重叠 */
  private running = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
    private readonly occurrences: OccurrenceService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      await this.scan()
    } catch (e) {
      this.logger.error(`提醒扫描失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      this.running = false
    }
  }

  private async scan(): Promise<void> {
    const now = new Date()
    const horizon = new Date(now.getTime() + HORIZON_MS)
    const grace = new Date(now.getTime() - GRACE_MS)

    // 用户可能几天没打开日历，这里先把窗口内的重复实例物化出来，否则提醒会漏发
    await this.occurrences.materialize(grace, horizon)

    const singles = await this.prisma.event.findMany({
      where: {
        rrule: null,
        remind: true,
        notifiedAt: null,
        status: { notIn: ['done', 'cancelled'] },
        startAt: { gte: grace, lte: horizon },
      },
      include: { list: true, user: true },
      take: BATCH_LIMIT,
    })

    const occurrences = await this.prisma.eventOccurrence.findMany({
      where: {
        notifiedAt: null,
        status: { notIn: ['done', 'cancelled'] },
        occurAt: { gte: grace, lte: horizon },
        event: { remind: true, status: { notIn: ['done', 'cancelled'] } },
      },
      include: { event: { include: { list: true, user: true } } },
      take: BATCH_LIMIT,
    })

    for (const event of singles) {
      await this.fire(event, event.startAt, null)
    }
    for (const occ of occurrences) {
      await this.fire(occ.event, occ.occurAt, occ.id)
    }
  }

  /** 到达提醒时间点后推送；无论成败都打标，避免每分钟重复轰炸 */
  private async fire(event: EventFull, startAt: Date, occurrenceId: number | null): Promise<void> {
    const { user } = event
    const beforeMinutes = event.remindBefore ?? user.notifyBefore
    if (Date.now() < startAt.getTime() - beforeMinutes * 60_000) return

    // 没配推送渠道的用户直接打标，站内提醒条走 /events/upcoming 轮询
    if (user.notifyChannel === 'none' || !user.notifyToken) {
      await this.markNotified(event.id, occurrenceId)
      return
    }

    const payload = this.notify.buildPayload(event, startAt, user)
    const ok = await this.notify.deliver({ user, payload, eventId: event.id, occurrenceId })
    if (ok) this.logger.log(`已推送提醒 event=${event.id} occurrence=${occurrenceId ?? '-'} via ${user.notifyChannel}`)
    await this.markNotified(event.id, occurrenceId)
  }

  private async markNotified(eventId: number, occurrenceId: number | null): Promise<void> {
    const now = new Date()
    try {
      if (occurrenceId) {
        await this.prisma.eventOccurrence.update({
          where: { id: occurrenceId },
          data: { notifiedAt: now },
        })
      } else {
        await this.prisma.event.update({ where: { id: eventId }, data: { notifiedAt: now } })
      }
    } catch (e) {
      this.logger.warn(`写入 notifiedAt 失败 event=${eventId}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}
