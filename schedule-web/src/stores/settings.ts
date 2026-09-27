import { defineStore } from 'pinia'
import { ref } from 'vue'

export type CalendarMode = 'month' | 'week' | 'day'
export type ViewName = 'calendar' | 'list' | 'board' | 'inbox' | 'settings'

interface Preferences {
  /** 登录后默认落到哪个视图 */
  defaultView: ViewName
  /** 日历默认模式 */
  calendarMode: CalendarMode
  /** 周视图是否显示周末 */
  showWeekend: boolean
  /** 侧栏是否折叠 */
  sidebarCollapsed: boolean
  /** 日历上是否显示已取消的日程 */
  showCancelled: boolean
}

const STORAGE_KEY = 'schedule-prefs'

const DEFAULTS: Preferences = {
  defaultView: 'calendar',
  calendarMode: 'month',
  showWeekend: true,
  sidebarCollapsed: false,
  showCancelled: false,
}

function load(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Preferences>) }
  } catch {
    return { ...DEFAULTS }
  }
}

/** 视图偏好：与账号无关，按浏览器本地保存 */
export const useSettingsStore = defineStore('settings', () => {
  const prefs = ref<Preferences>(load())

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs.value))
  }

  function set<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    prefs.value[key] = value
    save()
  }

  function toggle(key: 'showWeekend' | 'sidebarCollapsed' | 'showCancelled') {
    set(key, !prefs.value[key])
  }

  return { prefs, set, toggle }
})
