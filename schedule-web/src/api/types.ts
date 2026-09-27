/** 与 schedule-api 返回结构一一对应的类型定义 */

export interface Page<T> {
  total: number
  items: T[]
}

export type EventStatus = 'todo' | 'doing' | 'done' | 'cancelled'
export type EventPriority = 'low' | 'medium' | 'high' | 'urgent'
export type NotifyChannel = 'none' | 'serverchan' | 'dingtalk'
export type EditScope = 'all' | 'single' | 'future'

export interface EventList {
  id: number
  userId: number
  name: string
  color: string
  sortOrder: number
  /** 未完成日程数，由后端聚合返回 */
  activeCount?: number
}

/** 后端已把重复日程展开为单个实例，日历/列表直接按此渲染 */
export interface EventItem {
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
  status: EventStatus
  priority: EventPriority
  remind: boolean
  remindBefore: number | null
  source: 'manual' | 'ai' | string
  listId: number | null
  list: { id: number; name: string; color: string } | null
  createdAt: string
  updatedAt: string
}

/** 新建/编辑提交的字段；时间为带偏移的 ISO 串，全天事件为 YYYY-MM-DD */
export interface EventInput {
  title: string
  start: string
  end?: string | null
  allDay?: boolean
  listId?: number | null
  rrule?: string | null
  priority?: EventPriority
  status?: EventStatus
  location?: string | null
  notes?: string | null
  remind?: boolean
  remindBefore?: number | null
}

/** 列表视图的分组键 */
export type EventGroup = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'done'

export interface ListResponse {
  total: number
  /** 指定 group 时返回 */
  items?: EventItem[]
  /** 不指定 group 时按 已过期/今天/明天/本周/以后/已完成 分桶返回 */
  groups?: Partial<Record<EventGroup, EventItem[]>>
}

export interface BoardResponse {
  todo: EventItem[]
  doing: EventItem[]
  done: EventItem[]
}

export interface UserProfile {
  id: number
  username: string
  email: string
  nickname: string
  timezone: string
  notifyChannel: NotifyChannel
  notifyConfigured: boolean
  notifyBefore: number
  aiKeyConfigured: boolean
  aiKeyMask: string | null
  aiModel: string | null
  aiVisionModel: string | null
  createdAt: string
}

export interface UserStats {
  events: number
  todayTodo: number
  overdue: number
  lists: number
  ai: { batches: number; promptTokens: number; completionTokens: number }
}

/** AI 单条草稿；确认前所有字段都可在前端修改 */
export interface AiDraftPayload {
  title: string
  startAt: string | null
  endAt: string | null
  allDay: boolean
  rrule: string | null
  location: string | null
  notes: string | null
  priority: EventPriority
  listName: string | null
  remindBefore: number | null
  needsReview: boolean
  confidence: number
}

export interface AiDraft {
  itemId: number
  payload: AiDraftPayload
}

export interface AiParseResult {
  batchId: string
  model: string
  images: string[]
  usage: { promptTokens?: number; completionTokens?: number } | null
  items: AiDraft[]
}

export interface AiConfirmResult {
  total: number
  items: EventItem[]
  skipped: string[]
}

export interface AiBatchSummary {
  id: string
  status: 'pending' | 'confirmed' | 'discarded'
  model: string
  rawText: string
  images: string[]
  usage: { promptTokens?: number; completionTokens?: number } | null
  createdAt: string
  itemCount: number
  importedCount: number
}

export interface AiCapability {
  enabled: boolean
  visionEnabled: boolean
  /** Key 来源：用户自填 / 服务器环境变量 / 未配置 */
  keySource: 'user' | 'server' | 'none'
  textModel: string
  visionModel: string | null
  maxImages: number
  timeoutMs: number
}

export interface NotifyLogItem {
  id: number
  userId: number
  eventId: number | null
  occurrenceId: number | null
  channel: string
  title: string
  ok: boolean
  error: string | null
  createdAt: string
}

export interface RrulePreset {
  value: string
  label: string
}

export interface NotifyChannelOption {
  value: NotifyChannel
  label: string
  hint: string
}
