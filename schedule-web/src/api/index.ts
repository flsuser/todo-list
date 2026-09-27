import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '@/router'
import type {
  AiBatchSummary,
  AiCapability,
  AiConfirmResult,
  AiDraftPayload,
  AiParseResult,
  BoardResponse,
  EditScope,
  EventInput,
  EventItem,
  EventList,
  EventStatus,
  ListResponse,
  NotifyChannelOption,
  NotifyLogItem,
  Page,
  RrulePreset,
  UserProfile,
  UserStats,
} from './types'

export const TOKEN_KEY = 'schedule-token'
export const NICKNAME_KEY = 'schedule-nickname'

/** 登录页无需鉴权，401 时也不应循环跳转 */
const PUBLIC_PATHS = ['/login', '/register']

export const http = axios.create({ baseURL: '/api', timeout: 20000 })

http.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

http.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status
    const message = err.response?.data?.message
    const current = router.currentRoute.value.path

    if (status === 401 && !PUBLIC_PATHS.includes(current)) {
      // 令牌过期或账号被删除，清掉本地状态回登录页
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(NICKNAME_KEY)
      router.push({ path: '/login', query: { redirect: current } })
    } else if (message) {
      ElMessage.error(Array.isArray(message) ? String(message[0]) : String(message))
    } else if (err.code === 'ECONNABORTED') {
      ElMessage.error('请求超时，请稍后重试')
    } else {
      ElMessage.error('网络异常，请稍后重试')
    }
    return Promise.reject(err)
  },
)

// ---------- 类型化请求封装 ----------

async function get<T>(url: string, params?: object): Promise<T> {
  return (await http.get<T>(url, { params })).data
}

async function post<T>(url: string, body?: unknown, config?: object): Promise<T> {
  return (await http.post<T>(url, body, config)).data
}

async function patch<T>(url: string, body?: unknown, params?: object): Promise<T> {
  return (await http.patch<T>(url, body, { params })).data
}

async function del<T>(url: string, params?: object): Promise<T> {
  return (await http.delete<T>(url, { params })).data
}

export interface AuthResult {
  accessToken: string
  user: UserProfile
}

export interface ListQuery {
  group?: string
  listId?: number
  priority?: string
  keyword?: string
}

export const api = {
  // 认证
  login: (username: string, password: string) =>
    post<AuthResult>('/auth/login', { username, password }),
  register: (data: { username: string; email: string; password: string; nickname?: string }) =>
    post<AuthResult>('/auth/register', data),

  // 当前用户
  me: () => get<UserProfile>('/users/me'),
  stats: () => get<UserStats>('/users/me/stats'),
  timezones: () => get<string[]>('/users/me/timezones'),
  updateProfile: (data: { nickname?: string; email?: string; timezone?: string }) =>
    patch<UserProfile>('/users/me', data),
  changePassword: (oldPassword: string, newPassword: string) =>
    patch<{ ok: boolean }>('/users/me/password', { oldPassword, newPassword }),
  updateNotify: (data: {
    channel: string
    token?: string
    secret?: string
    notifyBefore?: number
  }) => patch<UserProfile>('/users/me/notify', data),
  notifyTest: () => post<{ ok: boolean }>('/users/me/notify-test'),
  updateAi: (data: { apiKey?: string | null; model?: string | null; visionModel?: string | null }) =>
    patch<UserProfile>('/users/me/ai', data),
  notifyChannels: () => get<NotifyChannelOption[]>('/notify/channels'),
  notifyLogs: (page = 1, limit = 20) => get<Page<NotifyLogItem>>('/notify/logs', { page, limit }),

  // 清单
  lists: () => get<EventList[]>('/lists'),
  createList: (data: { name: string; color?: string }) => post<EventList>('/lists', data),
  updateList: (id: number, data: { name: string; color?: string }) =>
    patch<EventList>(`/lists/${id}`, data),
  removeList: (id: number) => del<{ deleted: boolean }>(`/lists/${id}`),
  sortLists: (ids: number[]) => patch<EventList[]>('/lists/sort', { ids }),

  // 日程
  eventsInRange: (from: string, to: string) =>
    get<{ total: number; items: EventItem[] }>('/events/range', { from, to }),
  eventsList: (q: ListQuery = {}) => get<ListResponse>('/events/list', q),
  eventsBoard: (q: ListQuery = {}) => get<BoardResponse>('/events/board', q),
  upcoming: (within = 60) => get<{ total: number; items: EventItem[] }>('/events/upcoming', { within }),
  event: (id: number, occurrenceId?: number | null) =>
    get<EventItem>(`/events/${id}`, occurrenceId ? { occurrenceId } : undefined),
  rrulePresets: () => get<RrulePreset[]>('/events/rrule-presets'),
  createEvent: (input: EventInput) => post<EventItem>('/events', input),
  updateEvent: (id: number, input: Partial<EventInput>, scope?: EditScope, occurrenceId?: number | null) =>
    patch<EventItem>(`/events/${id}`, input, compact({ scope, occurrenceId: occurrenceId ?? undefined })),
  changeStatus: (id: number, status: EventStatus, occurrenceId?: number | null) =>
    patch<EventItem>(`/events/${id}/status`, { status, occurrenceId: occurrenceId ?? undefined }),
  batchCreateEvents: (items: EventInput[]) =>
    post<{ total: number; items: EventItem[] }>('/events/batch', { items }),
  batchChangeStatus: (ids: number[], status: EventStatus) =>
    patch<{ updated: number }>('/events/batch-status', { ids, status }),
  removeEvent: (id: number, scope?: EditScope, occurrenceId?: number | null) =>
    del<{ deleted: boolean }>(`/events/${id}`, compact({ scope, occurrenceId: occurrenceId ?? undefined })),

  // AI 识别
  aiCapability: () => get<AiCapability>('/ai/capability'),
  /** 图文识别耗时较长，单独放宽超时到 3 分钟 */
  aiParse: (text: string, images: File[]) => {
    const form = new FormData()
    form.append('text', text)
    images.forEach((file) => form.append('images', file))
    return http
      .post<AiParseResult>('/ai/parse', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 180000,
      })
      .then((res) => res.data)
  },
  aiConfirm: (batchId: string, items: { itemId: number; payload?: AiDraftPayload }[]) =>
    post<AiConfirmResult>('/ai/confirm', { batchId, items }),
  aiDiscard: (batchId: string) => del<{ discarded: boolean }>(`/ai/batches/${batchId}`),
  aiBatches: (page = 1, limit = 10) => get<Page<AiBatchSummary>>('/ai/batches', { page, limit }),
  aiBatch: (id: string) => get<AiBatchSummary & { items: { itemId: number; payload: AiDraftPayload }[] }>(`/ai/batches/${id}`),
}

/** 去掉 undefined，避免 axios 拼出 scope=undefined 这类查询串 */
function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {}
  for (const key of Object.keys(obj) as (keyof T)[]) {
    if (obj[key] !== undefined) out[key] = obj[key]
  }
  return out
}
