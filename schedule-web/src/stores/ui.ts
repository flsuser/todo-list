import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { EventItem } from '@/api/types'
import { dayjs } from '@/utils/time'

/** 打开新建弹窗时可预填的上下文（点了日历哪个格子） */
export interface CreatePreset {
  start?: string
  end?: string
  allDay?: boolean
  listId?: number | null
}

export const useUiStore = defineStore('ui', () => {
  const dialogVisible = ref(false)
  const dialogMode = ref<'create' | 'edit'>('create')
  const dialogItem = ref<EventItem | null>(null)
  const dialogPreset = ref<CreatePreset>({})
  /** 全局搜索关键词，由头部输入框写入，列表/看板视图读取 */
  const searchKeyword = ref('')
  /** 需要高亮定位的日程 id（推送链接跳转过来时带上） */
  const focusEventId = ref<number | null>(null)

  /** 是否移动端（窄屏），驱动抽屉导航 / 弹窗全屏 / 表单竖排等适配 */
  const mobileQuery = window.matchMedia('(max-width: 900px)')
  const isMobile = ref(mobileQuery.matches)
  /** 移动端侧栏抽屉是否展开 */
  const mobileNavOpen = ref(false)

  mobileQuery.addEventListener('change', (e) => {
    isMobile.value = e.matches
    // 回到宽屏时收起抽屉，避免残留遮罩
    if (!e.matches) mobileNavOpen.value = false
  })

  function toggleMobileNav() {
    mobileNavOpen.value = !mobileNavOpen.value
  }
  function closeMobileNav() {
    mobileNavOpen.value = false
  }

  const isEdit = computed(() => dialogMode.value === 'edit')

  function openCreate(preset: CreatePreset = {}) {
    dialogMode.value = 'create'
    dialogItem.value = null
    // 没给时间就默认「今天的下一个整点」，比空着更好用
    dialogPreset.value = {
      allDay: false,
      ...preset,
      start: preset.start ?? dayjs().minute(0).second(0).millisecond(0).add(1, 'hour').format(),
    }
    dialogVisible.value = true
  }

  function openEdit(item: EventItem) {
    dialogMode.value = 'edit'
    dialogItem.value = item
    dialogPreset.value = {}
    dialogVisible.value = true
  }

  function close() {
    dialogVisible.value = false
    dialogItem.value = null
    dialogPreset.value = {}
  }

  function setFocus(id: number | null) {
    focusEventId.value = id
  }

  return {
    dialogVisible,
    dialogMode,
    dialogItem,
    dialogPreset,
    isEdit,
    searchKeyword,
    focusEventId,
    isMobile,
    mobileNavOpen,
    toggleMobileNav,
    closeMobileNav,
    openCreate,
    openEdit,
    close,
    setFocus,
  }
})
