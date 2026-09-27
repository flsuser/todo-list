import dayjs, { Dayjs } from 'dayjs'
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore'
import isoWeek from 'dayjs/plugin/isoWeek'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import 'dayjs/locale/zh-cn'
import type { EventItem } from '@/api/types'

dayjs.extend(isoWeek)
dayjs.extend(isSameOrBefore)
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.locale('zh-cn')

export { dayjs }
export type { Dayjs }

/** 周一起始的星期表头 */
export const WEEK_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

/** 时间轴粒度：30 分钟一格 */
export const SLOT_MINUTES = 30
/** 拖拽改时间时的吸附粒度 */
export const SNAP_MINUTES = 15
/** 每格像素高度，与 main.css 中的 --slot-h 保持一致 */
export const SLOT_PX = 26
export const PX_PER_MINUTE = SLOT_PX / SLOT_MINUTES

export const d = dayjs

/** 周一为一周起点 */
export function startOfWeek(date: Dayjs): Dayjs {
  return date.startOf('isoWeek')
}

/** 月视图用的 6×7 网格（周一开头，含前后补白的相邻月日期） */
export function monthMatrix(date: Dayjs): Dayjs[][] {
  const first = date.startOf('month')
  const start = startOfWeek(first)
  const rows: Dayjs[][] = []
  for (let r = 0; r < 6; r++) {
    const row: Dayjs[] = []
    for (let c = 0; c < 7; c++) {
      row.push(start.add(r * 7 + c, 'day'))
    }
    rows.push(row)
  }
  return rows
}

/** 周视图的 7 天 */
export function weekDays(date: Dayjs): Dayjs[] {
  const start = startOfWeek(date)
  return Array.from({ length: 7 }, (_, i) => start.add(i, 'day'))
}

export function isSameDay(a: Dayjs, b: Dayjs): boolean {
  return a.isSame(b, 'day')
}

export function isToday(date: Dayjs): boolean {
  return date.isSame(dayjs(), 'day')
}

/** 事件在某一天内的展示时间文案 */
export function timeLabel(item: EventItem): string {
  if (item.allDay) return '全天'
  return dayjs(item.startAt).format('HH:mm')
}

/** 事件跨天时的完整时间文案 */
export function fullTimeLabel(item: EventItem): string {
  const start = dayjs(item.startAt)
  if (item.allDay) return start.format('YYYY年MM月DD日 全天')
  if (!item.endAt) return start.format('YYYY-MM-DD HH:mm')
  const end = dayjs(item.endAt)
  return start.isSame(end, 'day')
    ? `${start.format('MM月DD日 HH:mm')} - ${end.format('HH:mm')}`
    : `${start.format('MM月DD日 HH:mm')} - ${end.format('MM月DD日 HH:mm')}`
}

/** 距离开始的相对文案，用于列表与提醒条 */
export function fromNowLabel(iso: string): string {
  const diffMin = dayjs(iso).diff(dayjs(), 'minute')
  if (diffMin < 0) {
    const abs = -diffMin
    if (abs < 60) return `${abs} 分钟前`
    if (abs < 60 * 24) return `${Math.floor(abs / 60)} 小时前`
    return `${Math.floor(abs / 1440)} 天前`
  }
  if (diffMin < 60) return diffMin <= 1 ? '即将开始' : `${diffMin} 分钟后`
  if (diffMin < 60 * 24) return `${Math.floor(diffMin / 60)} 小时后`
  return `${Math.floor(diffMin / 1440)} 天后`
}

/** 当天 00:00 起的分钟数，用于时间轴定位 */
export function minutesFromMidnight(date: Dayjs): number {
  return date.hour() * 60 + date.minute()
}

export function minutesToPx(minutes: number): number {
  return minutes * PX_PER_MINUTE
}

/** 像素 -> 分钟，并按 SNAP_MINUTES 吸附 */
export function pxToSnappedMinutes(px: number): number {
  const raw = px / PX_PER_MINUTE
  return Math.round(raw / SNAP_MINUTES) * SNAP_MINUTES
}

/** 时间轴总高度（24 小时） */
export const DAY_HEIGHT_PX = minutesToPx(24 * 60)

/**
 * 提交给后端的时间串：
 * 全天事件用 YYYY-MM-DD，定时事件用带本地偏移的 ISO（后端按偏移换算成 UTC 入库）
 */
export function toApiTime(value: string | Dayjs | Date, allDay: boolean): string {
  const t = dayjs(value)
  return allDay ? t.format('YYYY-MM-DD') : t.format()
}

/** el-date-picker 的取值格式，随全天开关切换 */
export function pickerFormat(allDay: boolean): string {
  return allDay ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH:mm:ss'
}

export function pickerType(allDay: boolean): 'date' | 'datetime' {
  return allDay ? 'date' : 'datetime'
}

/** 月视图翻页：按当前模式移动一个单位 */
export function shiftDate(date: Dayjs, mode: 'month' | 'week' | 'day', step: number): Dayjs {
  if (mode === 'month') return date.add(step, 'month')
  if (mode === 'week') return date.add(step * 7, 'day')
  return date.add(step, 'day')
}

/** 当前视图的标题文案 */
export function rangeTitle(date: Dayjs, mode: 'month' | 'week' | 'day'): string {
  if (mode === 'month') return date.format('YYYY 年 M 月')
  if (mode === 'day') return date.format('YYYY 年 M 月 D 日')
  const start = startOfWeek(date)
  const end = start.add(6, 'day')
  return start.isSame(end, 'month')
    ? `${start.format('YYYY 年 M 月 D 日')} - ${end.format('D 日')}`
    : `${start.format('YYYY 年 M 月 D 日')} - ${end.format('M 月 D 日')}`
}

/** RRULE 的 UNTIL 需要 UTC 基本格式：20260922T140000Z */
export function toUntilString(value: string | Dayjs): string {
  return dayjs(value).utc().format('YYYYMMDDTHHmmss[Z]')
}

/** 把 RRULE 里的 UNTIL 还原成日期选择器可用的本地时间 */
export function fromUntilString(value: string): string {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/)
  if (!m) return ''
  return dayjs.utc(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`).local().format('YYYY-MM-DDTHH:mm:ss')
}
