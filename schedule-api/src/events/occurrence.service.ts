import { Injectable, Logger } from '@nestjs/common'
import { Event, EventOccurrence, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { expandBetween } from './rrule.util'

/** 落库后的实例记录，用于回填「仅此次」的状态与推送标记 */
export type OccurrenceRow = Pick<
  EventOccurrence,
  'id' | 'eventId' | 'occurAt' | 'status' | 'notifiedAt'
>

@Injectable()
export class OccurrenceService {
  private readonly logger = new Logger('Occurrence')

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 展开一批重复事件在 [from, to] 内的全部实例，并把实例写入 EventOccurrence（已存在则跳过）。
   * 返回 eventId -> 实例列表；调用方据此渲染日历，重复事件只按实例渲染，不再单独渲染主事件。
   */
  async expand(events: Event[], from: Date, to: Date): Promise<Map<number, OccurrenceRow[]>> {
    const result = new Map<number, OccurrenceRow[]>()
    const recurring = events.filter((e) => Boolean(e.rrule))
    if (!recurring.length) return result

    const pending: Prisma.EventOccurrenceCreateManyInput[] = []
    for (const ev of recurring) {
      result.set(ev.id, [])
      for (const occurAt of expandBetween(ev.rrule as string, ev.startAt, from, to)) {
        pending.push({ eventId: ev.id, userId: ev.userId, occurAt })
      }
    }
    if (!pending.length) return result

    // 已存在的实例保留其 status / notifiedAt，只补插新的
    await this.prisma.eventOccurrence.createMany({ data: pending, skipDuplicates: true })

    const stored = await this.prisma.eventOccurrence.findMany({
      where: {
        eventId: { in: recurring.map((e) => e.id) },
        occurAt: { gte: from, lte: to },
      },
      select: { id: true, eventId: true, occurAt: true, status: true, notifiedAt: true },
      orderBy: { occurAt: 'asc' },
    })
    for (const row of stored) {
      result.get(row.eventId)?.push(row)
    }
    return result
  }

  /**
   * 为提醒定时任务预生成未来窗口内的实例（跨用户）。
   * 用户可能几天没打开日历，若不在这里物化，重复日程的提醒就会漏发。
   */
  async materialize(from: Date, to: Date): Promise<void> {
    const events = await this.prisma.event.findMany({
      where: {
        rrule: { not: null },
        status: { notIn: ['done', 'cancelled'] },
        startAt: { lte: to },
      },
      select: { id: true, userId: true, startAt: true, rrule: true },
      take: 500,
    })
    if (!events.length) return

    const pending: Prisma.EventOccurrenceCreateManyInput[] = []
    for (const ev of events) {
      for (const occurAt of expandBetween(ev.rrule as string, ev.startAt, from, to)) {
        pending.push({ eventId: ev.id, userId: ev.userId, occurAt })
      }
    }
    if (!pending.length) return

    try {
      await this.prisma.eventOccurrence.createMany({ data: pending, skipDuplicates: true })
    } catch (e) {
      // 并发下唯一键冲突属正常，忽略即可
      this.logger.warn(`物化重复实例失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /** 主事件时间被修改后，旧的展开结果已失效，清理掉让其重新生成 */
  async resetForEvent(eventId: number): Promise<void> {
    await this.prisma.eventOccurrence.deleteMany({ where: { eventId } })
  }

  /** 读取某个实例（校验归属），供「仅完成这一次」使用 */
  async findOneForUser(occurrenceId: number, userId: number): Promise<EventOccurrence | null> {
    return this.prisma.eventOccurrence.findFirst({ where: { id: occurrenceId, userId } })
  }
}
