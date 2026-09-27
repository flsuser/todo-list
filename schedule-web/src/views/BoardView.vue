<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Refresh, Search } from '@element-plus/icons-vue'
import KanbanBoard from '@/components/board/KanbanBoard.vue'
import { api } from '@/api'
import type { BoardResponse, EventItem, EventStatus } from '@/api/types'
import { useEventsStore } from '@/stores/events'
import { useUiStore } from '@/stores/ui'

const store = useEventsStore()
const ui = useUiStore()

const loading = ref(false)
const board = ref<BoardResponse>({ todo: [], doing: [], done: [] })

const filters = reactive({
  listId: undefined as number | undefined,
  keyword: ui.searchKeyword,
})

let debounceTimer: number | undefined

async function load() {
  loading.value = true
  try {
    board.value = await api.eventsBoard({
      listId: filters.listId,
      keyword: filters.keyword.trim() || undefined,
    })
  } catch {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}

watch(
  () => filters.keyword,
  (value) => {
    ui.searchKeyword = value
    if (debounceTimer) window.clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(load, 300)
  },
)

watch(() => filters.listId, load)

watch(
  () => ui.dialogVisible,
  (visible, prev) => {
    if (prev && !visible) load()
  },
)

/** 拖拽换列：先本地挪卡片保证跟手，请求失败再整块回滚 */
async function onChange(item: EventItem, status: EventStatus) {
  const snapshot = board.value
  const moved: EventItem = { ...item, status }
  board.value = {
    todo: status === 'todo' ? [...snapshot.todo, moved] : snapshot.todo.filter((i) => i.id !== item.id),
    doing: status === 'doing' ? [...snapshot.doing, moved] : snapshot.doing.filter((i) => i.id !== item.id),
    done: status === 'done' ? [...snapshot.done, moved] : snapshot.done.filter((i) => i.id !== item.id),
  }

  try {
    await store.changeStatus(item, status)
  } catch {
    board.value = snapshot
    ElMessage.error('状态更新失败，已还原')
  }
}

onMounted(() => {
  filters.keyword = ui.searchKeyword
  load()
})
</script>

<template>
  <div class="page">
    <div class="toolbar panel">
      <div class="toolbar-left">
        <h2 class="title">看板</h2>
        <span class="muted">拖动卡片切换状态</span>
      </div>

      <div class="toolbar-right">
        <el-input
          v-model="filters.keyword"
          placeholder="搜索标题"
          :prefix-icon="Search"
          clearable
          style="width: 200px"
        />
        <el-select v-model="filters.listId" placeholder="全部清单" clearable style="width: 130px">
          <el-option
            v-for="opt in store.listOptions"
            :key="opt.value"
            :value="opt.value"
            :label="opt.label"
          />
        </el-select>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="ui.openCreate()">新建日程</el-button>
      </div>
    </div>

    <div v-loading="loading">
      <KanbanBoard :board="board" @open="ui.openEdit" @change="onChange" />
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 16px;
  margin-bottom: 14px;
}

.toolbar-left {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
