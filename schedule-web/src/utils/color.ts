import type { EventPriority, EventStatus } from '@/api/types'

export interface PriorityMeta {
  label: string
  color: string
}

export const PRIORITY_META: Record<EventPriority, PriorityMeta> = {
  low: { label: '低', color: '#909399' },
  medium: { label: '中', color: '#409eff' },
  high: { label: '高', color: '#e6a23c' },
  urgent: { label: '紧急', color: '#f56c6c' },
}

export const PRIORITY_OPTIONS = (Object.keys(PRIORITY_META) as EventPriority[]).map((value) => ({
  value,
  label: PRIORITY_META[value].label,
}))

export type TagType = '' | 'success' | 'info' | 'warning' | 'danger'

export const STATUS_META: Record<EventStatus, { label: string; type: TagType }> = {
  todo: { label: '待办', type: 'info' },
  doing: { label: '进行中', type: 'warning' },
  done: { label: '已完成', type: 'success' },
  cancelled: { label: '已取消', type: 'danger' },
}

/** 看板三列的顺序与标题（已取消不进看板） */
export const BOARD_COLUMNS: { status: Exclude<EventStatus, 'cancelled'>; label: string }[] = [
  { status: 'todo', label: '待办' },
  { status: 'doing', label: '进行中' },
  { status: 'done', label: '已完成' },
]

/** 清单可选配色 */
export const LIST_COLORS = [
  '#409eff',
  '#67c23a',
  '#e6a23c',
  '#f56c6c',
  '#909399',
  '#9254de',
  '#13c2c2',
  '#eb2f96',
]

/** 事件主色：清单色优先，未分组时退回优先级色 */
export function eventColor(item: {
  list?: { color: string } | null
  priority?: EventPriority | string
}): string {
  if (item.list?.color) return item.list.color
  return PRIORITY_META[item.priority as EventPriority]?.color ?? '#409eff'
}

/** #RGB / #RRGGBB -> rgba()，非法值退回主题蓝 */
export function withAlpha(hex: string, alpha: number): string {
  const raw = (hex || '').replace('#', '').trim()
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
  const num = parseInt(full, 16)
  if (!Number.isFinite(num) || full.length !== 6) return `rgba(64, 158, 255, ${alpha})`
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** 日历色块：浅色底 + 左侧主色条 */
export function chipStyle(color: string): Record<string, string> {
  return {
    background: withAlpha(color, 0.14),
    borderLeftColor: color,
  }
}

/** 时间轴上的事件块：比色块更实一些，白字保证可读 */
export function blockStyle(color: string): Record<string, string> {
  return {
    background: withAlpha(color, 0.88),
    borderColor: color,
  }
}
