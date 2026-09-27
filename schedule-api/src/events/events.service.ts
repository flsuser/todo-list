import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Event, EventList, Prisma } from '@prisma/client'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import {
  endOfDayInTz,
  formatInTz,
  parseWhen,
  safeTimezone,
} from '../common/utils/time'
import { PrismaService } from '../prisma/prisma.service'
import {
  BatchCreateDto,
  BatchStatusDto,
  ChangeStatusDto,
  CreateEventDto,
  QueryListDto,
  QueryRangeDto,
  UpdateEventDto,
} from './dto'
import { OccurrenceRow, OccurrenceService } from './occurrence.service'
import { describeRRule, isValidRRule, lastBefore, withUntil } from './rrule.util'

dayjs.extend(utc)
dayjs.extend(timezone)

type EventWithList = Event & { list?: EventList | null }

/** 编辑重复日程时的作用范围 */
export type EditScope = 'all' | 'single' | 'future'

/** 归一化后的事件字段，create 与 update 共用同一套构造逻辑 */
interface NormalizedInput {
  title: string
  start: string
  end?: string | null
  allDay: boolean
  listId?: number | null
  rrule?: string | null
  priority?: string
  status?: string
  location?: string | null
  notes?: string | null
  remind?: boolean
  remindBefore?: number | null
}

/** 单次 AI 批量入库时附带的来源信息 */
export interface CreateMeta {
  source?: string
  batchId?: string | null
}

/** build() 产出的、可直接入库的字段集合 */
interface EventFields {
  userId: number
  title: string
  listId: number | null
  startAt: Date
  endAt: Date | null
  allDay: boolean
  rrule: string | null
  priority: string
  status: string
  location: string | null
  notes: string | null
  remind: boolean
  remindBefore: number | null
}

/** 返回给前端的日程结构（重复日程已展开为单个实例） */
export interface EventView {
  id: number
  occurrenceId: number | null
  isRecurring: boolean
  title: string
  notes: string | null
  location: string | null
  allDay: boolean
  startAt: string
  endAt: string | null
  rrule: string | null
  rruleText: string
  status: string
  priority: string
  remind: boolean
  remindBefore: number | null
  source: string
  listId: number | null
  list: { id: number; name: string; color: string } | null
  createdAt: Date
  updatedAt: Date
}

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly occurrences: OccurrenceService,
  ) {}

  // ---------- 查询 ----------

  /** 日历视图：区间内的全部日程，重复日程按实例展开 */
  async range(userId: number, tz: string, q: QueryRangeDto) {
    const zone = safeTimezone(tz)
    const from = parseWhen(q.from, zone)
    const to = parseWhen(q.to, zone)
    if (from.getTime() >= to.getTime()) throw new BadRequestException('时间区间不正确')
    if (to.getTime() - from.getTime() > 400 * 86_400_000) {
      throw new BadRequestException('查询区间过大，请缩小范围')
    }

    const events = await this.prisma.event.findMany({
      where: {
        userId,
        startAt: { lte: to },
        OR: [
          { rrule: { not: null } }, // 重复日程是否有实例落在区间内，交给展开逻辑判断
          { endAt: null, startAt: { gte: from } },
          { endAt: { gte: from } },
        ],
      },
      include: { list: true },
      take: 3000,
    })

    const items = await this.expandAll(events, from, to)
    return { total: items.length, items }
  }

  /**
   * 列表视图：按 已过期/今天/明天/本周/以后/已完成 分桶。
   * 不传 group 时返回全部分组，传具体分组时返回该组的分页结构。
   */
  async list(userId: number, tz: string, q: QueryListDto) {
    const zone = safeTimezone(tz)
    const now = new Date()
    const from = dayjs(now).tz(zone).subtract(60, 'day').startOf('day').toDate()
    const to = dayjs(now).tz(zone).add(90, 'day').endOf('day').toDate()

    const where: Prisma.EventWhereInput = {
      userId,
      status: { notIn: ['cancelled'] },
      OR: [
        { rrule: { not: null } },
        { startAt: { gte: from, lte: to } },
        { endAt: { gte: from, lte: to } },
      ],
    }
    if (q.listId) where.listId = q.listId
    if (q.priority) where.priority = q.priority
    if (q.keyword) {
      where.AND = [
        {
          OR: [
            { title: { contains: q.keyword } },
            { notes: { contains: q.keyword } },
            { location: { contains: q.keyword } },
          ],
        },
      ]
    }

    const events = await this.prisma.event.findMany({ where, include: { list: true }, take: 3000 })
    const items = await this.expandAll(events, from, to)
    const groups = this.bucket(items, now, zone)
    const total = items.length

    if (q.group && q.group !== 'all') {
      const bucket = groups[q.group] ?? []
      return { total: bucket.length, items: bucket, groups: undefined }
    }
    return { total, items: undefined, groups }
  }

  /** 看板视图：以主事件为卡片（重复日程不按实例拆分），按状态分三列 */
  async board(userId: number, q: QueryListDto) {
    const where: Prisma.EventWhereInput = {
      userId,
      status: { in: ['todo', 'doing', 'done'] },
    }
    if (q.listId) where.listId = q.listId
    if (q.priority) where.priority = q.priority
    if (q.keyword) where.title = { contains: q.keyword }

    const events = await this.prisma.event.findMany({
      where,
      include: { list: true },
      orderBy: [{ startAt: 'asc' }, { id: 'desc' }],
      take: 600,
    })
    const items = events.map((e) => this.serialize(e))
    return {
      todo: items.filter((i) => i.status === 'todo'),
      doing: items.filter((i) => i.status === 'doing'),
      done: items.filter((i) => i.status === 'done'),
    }
  }

  /** 站内提醒条轮询：未来 within 分钟内开始且开启了提醒的日程 */
  async upcoming(userId: number, tz: string, within: number) {
    const zone = safeTimezone(tz)
    const now = new Date()
    const until = new Date(now.getTime() + within * 60_000)

    const events = await this.prisma.event.findMany({
      where: {
        userId,
        remind: true,
        status: { notIn: ['done', 'cancelled'] },
        OR: [
          { rrule: null, startAt: { gte: now, lte: until } },
          { rrule: { not: null }, startAt: { lte: until } },
        ],
      },
      include: { list: true },
      take: 200,
    })
    const items = (await this.expandAll(events, now, until)).filter(
      (i) => i.status !== 'done' && i.status !== 'cancelled',
    )
    return { total: items.length, items }
  }

  /** 详情；传 occurrenceId 时返回该实例的展开结果 */
  async findOne(userId: number, id: number, occurrenceId?: number) {
    const event = await this.prisma.event.findFirst({ where: { id, userId }, include: { list: true } })
    if (!event) throw new NotFoundException('日程不存在')

    if (occurrenceId) {
      const occ = await this.occurrences.findOneForUser(occurrenceId, userId)
      if (!occ || occ.eventId !== id) throw new NotFoundException('该次日程不存在')
      return this.serialize(event, occ)
    }
    return this.serialize(event)
  }

  // ---------- 写入 ----------

  async create(userId: number, tz: string, dto: CreateEventDto, meta: CreateMeta = {}) {
    const zone = safeTimezone(tz)
    const data = await this.build(userId, zone, this.normalizeCreate(dto))
    const event = await this.prisma.event.create({
      data: {
        ...(data as unknown as Prisma.EventUncheckedCreateInput),
        source: meta.source ?? 'manual',
        batchId: meta.batchId ?? null,
      },
      include: { list: true },
    })
    return this.serialize(event)
  }

  /** 批量创建（AI 草稿确认入库复用），逐条校验，单条失败即整体中止 */
  async batchCreate(userId: number, tz: string, dto: BatchCreateDto, meta: CreateMeta = {}) {
    const items = []
    for (const item of dto.items) {
      items.push(await this.create(userId, tz, item, meta))
    }
    return { total: items.length, items }
  }

  /**
   * 编辑日程。
   * scope=single：把这一次拆成独立的一次性日程，原实例标记为 cancelled
   * scope=future：原事件补 UNTIL 截止到上一次，新事件承接此次及后续的重复规则
   */
  async update(
    userId: number,
    tz: string,
    id: number,
    dto: UpdateEventDto,
    scope: EditScope = 'all',
    occurrenceId?: number,
  ) {
    const zone = safeTimezone(tz)
    const event = await this.prisma.event.findFirst({ where: { id, userId }, include: { list: true } })
    if (!event) throw new NotFoundException('日程不存在')

    // 修改重复日程的单次实例时，以该次时间为基准合并未传字段
    const target =
      event.rrule && scope !== 'all'
        ? await this.occurrences.findOneForUser(occurrenceId ?? 0, userId)
        : null
    if (event.rrule && scope !== 'all' && (!target || target.eventId !== id)) {
      throw new BadRequestException('请选择要修改的具体次数')
    }

    const merged = this.mergeForUpdate(event, dto, zone, target)
    const data = await this.build(userId, zone, merged)

    // 非重复日程，或未指定作用范围，直接改主事件
    if (!event.rrule || scope === 'all') {
      const updated = await this.prisma.event.update({
        where: { id },
        data: data as unknown as Prisma.EventUncheckedUpdateInput,
        include: { list: true },
      })
      // 时间或重复规则变了，旧的展开结果作废
      if (dto.start !== undefined || dto.rrule !== undefined || dto.allDay !== undefined) {
        await this.occurrences.resetForEvent(id)
      }
      return this.serialize(updated)
    }

    const occ = target as OccurrenceRow

    if (scope === 'single') {
      const detached = await this.prisma.event.create({
        data: {
          ...(data as unknown as Prisma.EventUncheckedCreateInput),
          rrule: null,
          source: event.source,
        },
        include: { list: true },
      })
      await this.prisma.eventOccurrence.update({
        where: { id: occ.id },
        data: { status: 'cancelled' },
      })
      return this.serialize(detached)
    }

    // scope === 'future'
    const previous = lastBefore(event.rrule, event.startAt, occ.occurAt)
    if (!previous) throw new BadRequestException('这已是第一次，请直接修改整个日程')
    await this.prisma.event.update({
      where: { id },
      data: { rrule: withUntil(event.rrule, previous) },
    })
    await this.occurrences.resetForEvent(id)
    const next = await this.prisma.event.create({
      data: {
        ...(data as unknown as Prisma.EventUncheckedCreateInput),
        rrule: event.rrule,
        source: event.source,
      },
      include: { list: true },
    })
    return this.serialize(next)
  }

  /** 切换状态；带 occurrenceId 时只改重复日程的这一次 */
  async changeStatus(userId: number, id: number, dto: ChangeStatusDto) {
    const event = await this.prisma.event.findFirst({ where: { id, userId }, select: { id: true, rrule: true } })
    if (!event) throw new NotFoundException('日程不存在')

    if (dto.occurrenceId) {
      const occ = await this.occurrences.findOneForUser(dto.occurrenceId, userId)
      if (!occ || occ.eventId !== id) throw new BadRequestException('该次日程不存在')
      const updated = await this.prisma.eventOccurrence.update({
        where: { id: occ.id },
        data: { status: dto.status },
      })
      const full = await this.prisma.event.findFirst({ where: { id }, include: { list: true } })
      return full ? this.serialize(full, updated) : null
    }

    const updated = await this.prisma.event.update({
      where: { id },
      data: { status: dto.status },
      include: { list: true },
    })
    return this.serialize(updated)
  }

  /** 看板批量改状态 */
  async batchStatus(userId: number, dto: BatchStatusDto) {
    const res = await this.prisma.event.updateMany({
      where: { id: { in: dto.ids }, userId },
      data: { status: dto.status },
    })
    return { updated: res.count }
  }

  /** 删除；scope=single 时仅取消该次实例，scope=future 时截断后续重复 */
  async remove(userId: number, id: number, scope: EditScope = 'all', occurrenceId?: number) {
    const event = await this.prisma.event.findFirst({ where: { id, userId } })
    if (!event) throw new NotFoundException('日程不存在')

    if (!event.rrule || scope === 'all') {
      await this.prisma.event.delete({ where: { id } })
      return { deleted: true }
    }

    const occ = await this.occurrences.findOneForUser(occurrenceId ?? 0, userId)
    if (!occ || occ.eventId !== id) throw new BadRequestException('请选择要删除的具体次数')

    if (scope === 'single') {
      await this.prisma.eventOccurrence.update({ where: { id: occ.id }, data: { status: 'cancelled' } })
      return { deleted: false, cancelledOccurrence: occ.id }
    }

    const previous = lastBefore(event.rrule, event.startAt, occ.occurAt)
    if (!previous) {
      await this.prisma.event.delete({ where: { id } })
      return { deleted: true }
    }
    await this.prisma.event.update({
      where: { id },
      data: { rrule: withUntil(event.rrule, previous) },
    })
    await this.occurrences.resetForEvent(id)
    return { deleted: false, truncated: true }
  }

  // ---------- 内部工具 ----------

  /** 把主事件与重复实例合并成扁平的日历项 */
  private async expandAll(events: EventWithList[], from: Date, to: Date) {
    const recurring = events.filter((e) => Boolean(e.rrule))
    const singles = events.filter((e) => !e.rrule)
    const occMap = await this.occurrences.expand(recurring, from, to)

    const items = [
      ...singles.map((e) => this.serialize(e)),
      ...recurring.flatMap((e) =>
        (occMap.get(e.id) ?? []).map((o: OccurrenceRow) => this.serialize(e, o)),
      ),
    ]
    return items.sort(compareItems)
  }

  /** 按时间远近分桶，供列表视图分组渲染 */
  private bucket(items: EventView[], now: Date, tz: string) {
    const dayEnd = endOfDayInTz(now, tz)
    const tomorrowEnd = endOfDayInTz(dayjs(now).tz(tz).add(1, 'day').toDate(), tz)
    const weekEnd = endOfDayInTz(dayjs(now).tz(tz).add(7, 'day').toDate(), tz)

    const groups: Record<string, EventView[]> = {
      overdue: [],
      today: [],
      tomorrow: [],
      week: [],
      later: [],
      done: [],
    }
    for (const it of items) {
      const start = new Date(it.startAt)
      if (it.status === 'done') groups.done.push(it)
      else if (start < now) groups.overdue.push(it)
      else if (start <= dayEnd) groups.today.push(it)
      else if (start <= tomorrowEnd) groups.tomorrow.push(it)
      else if (start <= weekEnd) groups.week.push(it)
      else groups.later.push(it)
    }
    // 已完成按时间倒序，最近的排前面
    groups.done.sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime())
    return groups
  }

  private serialize(event: EventWithList, occ?: OccurrenceRow | null): EventView {
    const durationMs = event.endAt ? event.endAt.getTime() - event.startAt.getTime() : 0
    const startAt = occ ? occ.occurAt : event.startAt
    // 重复日程的每一次都保持与主事件相同的时长
    const endAt = event.endAt ? new Date(startAt.getTime() + durationMs) : null
    // 主事件已完成/已取消时，实例状态不再单独生效
    const terminal = event.status === 'done' || event.status === 'cancelled'

    return {
      id: event.id,
      occurrenceId: occ?.id ?? null,
      isRecurring: Boolean(event.rrule),
      title: event.title,
      notes: event.notes,
      location: event.location,
      allDay: event.allDay,
      startAt: startAt.toISOString(),
      endAt: endAt ? endAt.toISOString() : null,
      rrule: event.rrule,
      rruleText: describeRRule(event.rrule),
      status: terminal ? event.status : (occ?.status ?? event.status),
      priority: event.priority,
      remind: event.remind,
      remindBefore: event.remindBefore,
      source: event.source,
      listId: event.listId,
      list: event.list
        ? { id: event.list.id, name: event.list.name, color: event.list.color }
        : null,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    }
  }

  private normalizeCreate(dto: CreateEventDto): NormalizedInput {
    return {
      title: dto.title.trim(),
      start: dto.start,
      end: dto.end ?? null,
      allDay: dto.allDay ?? false,
      listId: dto.listId ?? null,
      rrule: dto.rrule ?? null,
      priority: dto.priority ?? 'medium',
      status: dto.status ?? 'todo',
      location: dto.location ?? null,
      notes: dto.notes ?? null,
      remind: dto.remind ?? true,
      remindBefore: dto.remindBefore ?? null,
    }
  }

  /** 更新时未传的字段沿用当前值；针对实例编辑时以该次时间为基准 */
  private mergeForUpdate(
    event: EventWithList,
    dto: UpdateEventDto,
    tz: string,
    occ?: OccurrenceRow | null,
  ): NormalizedInput {
    const allDay = dto.allDay ?? event.allDay
    const durationMs = event.endAt ? event.endAt.getTime() - event.startAt.getTime() : 0

    // 基准开始时间：实例 > 主事件；全天事件必须按用户时区格式化成 YYYY-MM-DD，
    // 否则 toISOString() 会把 UTC 日期带回前一天
    const baseStart = occ ? occ.occurAt : event.startAt
    const fallbackStart = allDay
      ? formatInTz(baseStart, tz, 'YYYY-MM-DD')
      : baseStart.toISOString()

    const baseEnd = occ && event.endAt ? new Date(occ.occurAt.getTime() + durationMs) : event.endAt
    const fallbackEnd = baseEnd
      ? allDay
        ? formatInTz(baseEnd, tz, 'YYYY-MM-DD')
        : baseEnd.toISOString()
      : null

    // 只改开始时间（日历上整块拖动）时，结束时间随之平移以保持原时长，
    // 否则拖到原结束时间之后会被「结束时间必须晚于开始时间」拦下
    const start = dto.start ?? fallbackStart
    let end = dto.end !== undefined ? dto.end : fallbackEnd
    if (dto.start !== undefined && dto.end === undefined && baseEnd && durationMs > 0) {
      const shifted = new Date(baseEnd.getTime() + (parseWhen(start, tz, allDay).getTime() - baseStart.getTime()))
      end = allDay ? formatInTz(shifted, tz, 'YYYY-MM-DD') : shifted.toISOString()
    }

    return {
      title: dto.title !== undefined ? dto.title.trim() : event.title,
      start,
      end,
      allDay,
      listId: dto.listId !== undefined ? dto.listId : event.listId,
      rrule: dto.rrule !== undefined ? dto.rrule : event.rrule,
      priority: dto.priority ?? event.priority,
      status: dto.status ?? event.status,
      location: dto.location !== undefined ? dto.location : event.location,
      notes: dto.notes !== undefined ? dto.notes : event.notes,
      remind: dto.remind ?? event.remind,
      remindBefore: dto.remindBefore !== undefined ? dto.remindBefore : event.remindBefore,
    }
  }

  /** 校验并换算成可直接入库的字段集合 */
  private async build(
    userId: number,
    tz: string,
    input: NormalizedInput,
  ): Promise<EventFields> {
    if (!input.title) throw new BadRequestException('标题不能为空')

    const allDay = Boolean(input.allDay)
    const startAt = parseWhen(input.start, tz, allDay)
    // 全天事件统一补到当天 23:59:59，便于区间重叠查询
    let endAt: Date | null = input.end
      ? parseWhen(input.end, tz, allDay)
      : allDay
        ? startAt
        : null
    if (allDay) endAt = endOfDayInTz(endAt ?? startAt, tz)
    if (endAt && endAt.getTime() <= startAt.getTime()) {
      throw new BadRequestException('结束时间必须晚于开始时间')
    }

    return {
      userId,
      title: input.title,
      listId: await this.resolveListId(userId, input.listId),
      startAt,
      endAt,
      allDay,
      rrule: normalizeRRule(input.rrule),
      priority: input.priority ?? 'medium',
      status: input.status ?? 'todo',
      location: input.location ?? null,
      notes: input.notes ?? null,
      remind: input.remind ?? true,
      remindBefore: input.remindBefore ?? null,
    }
  }

  /** 清单必须属于当前用户，否则视为未分组 */
  private async resolveListId(userId: number, listId?: number | null): Promise<number | null> {
    if (!listId) return null
    const list = await this.prisma.eventList.findFirst({
      where: { id: listId, userId },
      select: { id: true },
    })
    if (!list) throw new BadRequestException('清单不存在或无权访问')
    return list.id
  }
}

/** 空规则归一化为 null；非空但非法则直接报错，避免静默丢掉用户的重复设置 */
function normalizeRRule(rule?: string | null): string | null {
  if (!rule || !rule.trim()) return null
  const trimmed = rule.trim()
  const normalized = /^RRULE:/i.test(trimmed)
    ? `RRULE:${trimmed.slice(6).trim()}`
    : `RRULE:${trimmed}`
  if (!isValidRRule(normalized)) throw new BadRequestException('重复规则格式不正确')
  return normalized
}

/** 日历排序：全天事件置顶，其余按开始时间升序 */
function compareItems(a: { allDay: boolean; startAt: string; id: number }, b: typeof a): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
  const diff = new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
  return diff !== 0 ? diff : a.id - b.id
}
