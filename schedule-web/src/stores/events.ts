import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/api'
import type { EditScope, EventInput, EventItem, EventList, EventStatus } from '@/api/types'
import type { Dayjs } from '@/utils/time'
import { toApiTime } from '@/utils/time'

export const useEventsStore = defineStore('events', () => {
  /** 当前区间内的日程（重复日程已由后端展开成实例） */
  const items = ref<EventItem[]>([])
  const lists = ref<EventList[]>([])
  const loading = ref(false)
  /** 站内提醒条的数据源 */
  const upcoming = ref<EventItem[]>([])
  const lastRange = ref<{ from: string; to: string } | null>(null)

  /** 区间缓存：来回翻页时命中缓存不再请求 */
  const cache = new Map<string, EventItem[]>()

  const listMap = computed(() => new Map(lists.value.map((l) => [l.id, l])))
  const listOptions = computed(() =>
    lists.value.map((l) => ({ value: l.id, label: l.name, color: l.color })),
  )

  const rangeKey = (from: string, to: string) => `${from}|${to}`

  function findLocal(item: EventItem): EventItem | undefined {
    return items.value.find((i) => i.id === item.id && i.occurrenceId === item.occurrenceId)
  }

  function writeBackCache() {
    if (lastRange.value) cache.set(rangeKey(lastRange.value.from, lastRange.value.to), items.value)
  }

  async function loadRange(from: string, to: string, force = false) {
    const key = rangeKey(from, to)
    const hit = cache.get(key)
    if (hit && !force) {
      items.value = hit
      lastRange.value = { from, to }
      return hit
    }
    loading.value = true
    try {
      const res = await api.eventsInRange(from, to)
      items.value = res.items
      cache.set(key, res.items)
      lastRange.value = { from, to }
      return res.items
    } finally {
      loading.value = false
    }
  }

  function invalidate() {
    cache.clear()
  }

  /** 数据被改动后重新拉取当前区间 */
  async function refresh() {
    invalidate()
    if (lastRange.value) await loadRange(lastRange.value.from, lastRange.value.to, true)
  }

  async function loadLists() {
    lists.value = await api.lists()
    return lists.value
  }

  /** 提醒条轮询：失败静默，避免每分钟弹一次错误提示 */
  async function loadUpcoming(within = 60) {
    try {
      const res = await api.upcoming(within)
      upcoming.value = res.items
    } catch {
      /* 忽略轮询失败 */
    }
  }

  /** 乐观更新：先改本地让交互即时响应，失败回滚到快照 */
  async function optimistic<T>(apply: () => void, request: () => Promise<T>): Promise<T> {
    const snapshot = items.value.map((i) => ({ ...i }))
    apply()
    try {
      return await request()
    } catch (e) {
      items.value = snapshot
      writeBackCache()
      throw e
    }
  }

  async function createEvent(input: EventInput) {
    const created = await api.createEvent(input)
    await Promise.all([refresh(), loadLists()])
    return created
  }

  /** AI 草稿批量入库 */
  async function createMany(inputs: EventInput[]) {
    const res = await api.batchCreateEvents(inputs)
    await Promise.all([refresh(), loadLists()])
    return res
  }

  async function updateEvent(item: EventItem, input: Partial<EventInput>, scope: EditScope = 'all') {
    const updated = await api.updateEvent(item.id, input, scope, item.occurrenceId)
    await Promise.all([refresh(), loadLists()])
    return updated
  }

  async function changeStatus(item: EventItem, status: EventStatus) {
    await optimistic(
      () => {
        const target = findLocal(item)
        if (target) target.status = status
      },
      () => api.changeStatus(item.id, status, item.occurrenceId),
    )
    writeBackCache()
    await loadLists()
  }

  async function toggleDone(item: EventItem) {
    await changeStatus(item, item.status === 'done' ? 'todo' : 'done')
  }

  /**
   * 拖拽改时间。
   * 重复日程拖动单次实例时后端会把它拆成一次性日程（scope=single），
   * 条目身份变了，必须整段重拉；普通日程保留乐观结果，交互更跟手。
   */
  async function moveEvent(item: EventItem, start: Dayjs, end: Dayjs | null) {
    const scope: EditScope = item.isRecurring && item.occurrenceId ? 'single' : 'all'
    const payload: Partial<EventInput> = {
      start: toApiTime(start, item.allDay),
      end: end ? toApiTime(end, item.allDay) : null,
    }

    await optimistic(
      () => {
        const target = findLocal(item)
        if (!target) return
        target.startAt = start.toISOString()
        target.endAt = end ? end.toISOString() : null
      },
      () => api.updateEvent(item.id, payload, scope, item.occurrenceId),
    )

    if (scope === 'single') await refresh()
    else writeBackCache()
  }

  async function removeEvent(item: EventItem, scope: EditScope = 'all') {
    await api.removeEvent(item.id, scope, item.occurrenceId)
    await Promise.all([refresh(), loadLists()])
  }

  async function batchStatus(ids: number[], status: EventStatus) {
    const res = await api.batchChangeStatus(ids, status)
    await Promise.all([refresh(), loadLists()])
    return res
  }

  function clear() {
    items.value = []
    lists.value = []
    upcoming.value = []
    lastRange.value = null
    cache.clear()
  }

  return {
    items,
    lists,
    loading,
    upcoming,
    lastRange,
    listMap,
    listOptions,
    loadRange,
    invalidate,
    refresh,
    loadLists,
    loadUpcoming,
    createEvent,
    createMany,
    updateEvent,
    changeStatus,
    toggleDone,
    moveEvent,
    removeEvent,
    batchStatus,
    clear,
  }
})
