<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Calendar, Grid, List, MagicStick, Setting } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { useEventsStore } from '@/stores/events'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import { dayjs, fromNowLabel, timeLabel } from '@/utils/time'

const router = useRouter()
const auth = useAuthStore()
const store = useEventsStore()
const settings = useSettingsStore()
const ui = useUiStore()

const NAV = [
  { path: '/calendar', label: '日历', icon: Calendar },
  { path: '/list', label: '列表', icon: List },
  { path: '/board', label: '看板', icon: Grid },
  { path: '/inbox', label: 'AI 识别', icon: MagicStick },
  { path: '/settings', label: '设置', icon: Setting },
]

/** 迷你月历当前展示的月份 */
const cursor = ref(dayjs())

const miniRows = computed(() => {
  const first = cursor.value.startOf('month')
  const start = first.startOf('isoWeek')
  return Array.from({ length: 6 }, (_, r) =>
    Array.from({ length: 7 }, (_, c) => start.add(r * 7 + c, 'day')),
  )
})

const collapsed = computed(() => !ui.isMobile && settings.prefs.sidebarCollapsed)

function goMini(date: ReturnType<typeof dayjs>) {
  router.push({ path: '/calendar', query: { date: date.format('YYYY-MM-DD') } })
}

function openList(listId?: number) {
  router.push({ path: '/list', query: listId ? { list: String(listId) } : {} })
}

onMounted(() => {
  // 迷你月历跟随系统月份，跨月时自动翻页
  const timer = window.setInterval(() => {
    if (!cursor.value.isSame(dayjs(), 'month')) cursor.value = dayjs()
  }, 60_000)
  window.addEventListener('beforeunload', () => window.clearInterval(timer))
})
</script>

<template>
  <aside class="sidebar" :class="{ collapsed, 'drawer-open': ui.mobileNavOpen }">
    <div class="upcoming" v-if="store.upcoming.length">
      <div class="upcoming-title">即将开始</div>
      <button
        v-for="ev in store.upcoming.slice(0, 3)"
        :key="`${ev.id}-${ev.occurrenceId}`"
        class="upcoming-item"
        @click="openList()"
      >
        <span class="prio-dot" :class="`prio-${ev.priority}`" />
        <span class="upcoming-text">
          <strong>{{ ev.title }}</strong>
          <em>{{ timeLabel(ev) }} · {{ fromNowLabel(ev.startAt) }}</em>
        </span>
      </button>
    </div>

    <nav class="nav">
      <router-link
        v-for="n in NAV"
        :key="n.path"
        :to="n.path"
        class="nav-item"
        active-class="active"
      >
        <el-icon><component :is="n.icon" /></el-icon>
        <span v-if="!collapsed">{{ n.label }}</span>
      </router-link>
    </nav>

    <template v-if="!collapsed">
      <section class="block">
        <div class="block-head">
          <span>清单</span>
          <el-button link type="primary" size="small" @click="router.push('/settings')">
            管理
          </el-button>
        </div>
        <button class="list-item all" @click="openList()">
          <i class="prio-dot" style="background: #303133" />
          <span class="list-name">全部</span>
        </button>
        <button
          v-for="l in store.lists"
          :key="l.id"
          class="list-item"
          @click="openList(l.id)"
        >
          <i class="prio-dot" :style="{ background: l.color }" />
          <span class="list-name">{{ l.name }}</span>
          <span v-if="l.activeCount" class="list-count">{{ l.activeCount }}</span>
        </button>
      </section>

      <section class="block mini-cal">
        <div class="block-head">
          <el-button link size="small" @click="cursor = cursor.subtract(1, 'month')">‹</el-button>
          <span>{{ cursor.format('YYYY 年 M 月') }}</span>
          <el-button link size="small" @click="cursor = cursor.add(1, 'month')">›</el-button>
        </div>
        <div class="mini-week">
          <span v-for="w in ['一', '二', '三', '四', '五', '六', '日']" :key="w">{{ w }}</span>
        </div>
        <div v-for="(row, ri) in miniRows" :key="ri" class="mini-row">
          <button
            v-for="date in row"
            :key="date.format('YYYY-MM-DD')"
            class="mini-day"
            :class="{
              other: !date.isSame(cursor, 'month'),
              today: date.isSame(dayjs(), 'day'),
            }"
            @click="goMini(date)"
          >
            {{ date.date() }}
          </button>
        </div>
      </section>
    </template>

    <div class="sidebar-foot" v-if="!collapsed && auth.profile">
      <div class="muted">{{ auth.profile.timezone }}</div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: var(--sidebar-w);
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px 12px;
  background: var(--bg-panel);
  border-right: 1px solid var(--border-light);
  overflow-y: auto;
}

.sidebar.collapsed {
  width: 60px;
  padding: 14px 8px;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 6px;
  color: var(--text-main);
  font-size: 14px;
  transition: background 0.15s;
}

.nav-item:hover {
  background: #f2f3f5;
}

.nav-item.active {
  background: #ecf5ff;
  color: #409eff;
  font-weight: 600;
}

.block {
  border-top: 1px solid var(--border-light);
  padding-top: 12px;
}

.block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--text-sub);
}

.list-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  text-align: left;
}

.list-item:hover {
  background: #f2f3f5;
}

.list-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list-count {
  min-width: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: #f0f2f5;
  color: var(--text-sub);
  font-size: 11px;
  text-align: center;
}

/* 迷你月历 */
.mini-week,
.mini-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}

.mini-week span {
  text-align: center;
  font-size: 11px;
  color: var(--text-sub);
  padding: 2px 0;
}

.mini-day {
  height: 26px;
  border: none;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-main);
}

.mini-day:hover {
  background: #f2f3f5;
}

.mini-day.other {
  color: #c8c9cc;
}

.mini-day.today {
  background: #409eff;
  color: #fff;
  font-weight: 600;
}

.sidebar-foot {
  margin-top: auto;
  font-size: 12px;
  text-align: center;
}

/* 移动端：侧栏变为抽屉，默认滑出屏幕外，展开时滑入 */
@media (max-width: 900px) {
  .sidebar {
    position: fixed;
    top: var(--header-h);
    left: 0;
    bottom: 0;
    z-index: 1000;
    width: 264px;
    transform: translateX(-100%);
    transition: transform 0.22s ease;
    box-shadow: 2px 0 12px rgba(0, 0, 0, 0.12);
  }

  .sidebar.drawer-open {
    transform: translateX(0);
  }
}

/* 即将开始提醒条 */
.upcoming {
  padding: 10px;
  border-radius: 8px;
  background: #fdf6ec;
  border: 1px solid #faecd8;
}

.upcoming-title {
  font-size: 12px;
  font-weight: 600;
  color: #e6a23c;
  margin-bottom: 6px;
}

.upcoming-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  width: 100%;
  padding: 4px 0;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.upcoming-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.upcoming-text strong {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upcoming-text em {
  font-size: 11px;
  font-style: normal;
  color: #b88230;
}
</style>
