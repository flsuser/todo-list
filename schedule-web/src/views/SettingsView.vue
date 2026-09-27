<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Edit, Plus } from '@element-plus/icons-vue'
import { api } from '@/api'
import type { NotifyChannelOption, NotifyLogItem, UserStats } from '@/api/types'
import { useAuthStore } from '@/stores/auth'
import { useEventsStore } from '@/stores/events'
import { LIST_COLORS } from '@/utils/color'
import { dayjs } from '@/utils/time'

const LOG_LIMIT = 15

const auth = useAuthStore()
const store = useEventsStore()
const route = useRoute()

const TAB_NAMES = ['profile', 'lists', 'notify', 'ai', 'logs', 'usage']

const tab = ref('profile')
const timezones = ref<string[]>([])
const channels = ref<NotifyChannelOption[]>([])
const stats = ref<UserStats | null>(null)

const savingProfile = ref(false)
const savingPassword = ref(false)
const savingNotify = ref(false)
const savingAi = ref(false)
const testing = ref(false)

const profileForm = reactive({ nickname: '', email: '', timezone: 'Asia/Shanghai' })
const passwordForm = reactive({ oldPassword: '', newPassword: '', confirm: '' })
const notifyForm = reactive({ channel: 'none', token: '', secret: '', notifyBefore: 15 })
const aiForm = reactive({ key: '', model: '', visionModel: '' })

/** 下拉只提供常见模型，配合 allow-create 仍可手输任意模型名 */
const TEXT_MODEL_OPTIONS = [
  { value: 'deepseek-chat', label: 'deepseek-chat（通用，推荐）' },
  { value: 'deepseek-reasoner', label: 'deepseek-reasoner（深度推理）' },
]
const VISION_MODEL_OPTIONS = [
  { value: 'deepseek-v4-flash-vision-exp', label: 'deepseek-v4-flash-vision-exp（多模态实验版）' },
]

const logs = ref<NotifyLogItem[]>([])
const logTotal = ref(0)
const logPage = ref(1)

const listDialog = reactive({ visible: false, id: 0, name: '', color: '#409EFF' })
const dragIndex = ref<number | null>(null)

const channelHint = computed(
  () => channels.value.find((c) => c.value === notifyForm.channel)?.hint ?? '',
)
const tokenPlaceholder = computed(() => {
  if (!auth.profile?.notifyConfigured) {
    return notifyForm.channel === 'dingtalk' ? 'https://oapi.dingtalk.com/robot/send?access_token=…' : 'SCT……t'
  }
  return '已配置，留空表示保持不变'
})
const aiKeyPlaceholder = computed(() =>
  auth.profile?.aiKeyConfigured && auth.profile.aiKeyMask
    ? `已配置 ${auth.profile.aiKeyMask}，留空表示保持不变`
    : 'sk-…（在 platform.deepseek.com 创建）',
)

function fillForms() {
  const p = auth.profile
  if (!p) return
  profileForm.nickname = p.nickname
  profileForm.email = p.email
  profileForm.timezone = p.timezone
  notifyForm.channel = p.notifyChannel
  notifyForm.notifyBefore = p.notifyBefore
  notifyForm.token = ''
  notifyForm.secret = ''
  aiForm.key = ''
  aiForm.model = p.aiModel ?? ''
  aiForm.visionModel = p.aiVisionModel ?? ''
}

async function saveProfile() {
  if (!profileForm.nickname.trim()) {
    ElMessage.warning('昵称不能为空')
    return
  }
  savingProfile.value = true
  try {
    const updated = await api.updateProfile({
      nickname: profileForm.nickname.trim(),
      email: profileForm.email.trim(),
      timezone: profileForm.timezone,
    })
    auth.setProfile(updated)
    ElMessage.success('资料已保存')
  } catch {
    // 拦截器已提示
  } finally {
    savingProfile.value = false
  }
}

async function savePassword() {
  if (!passwordForm.oldPassword || !passwordForm.newPassword) {
    ElMessage.warning('请填写当前密码与新密码')
    return
  }
  if (passwordForm.newPassword.length < 6) {
    ElMessage.warning('新密码至少 6 位')
    return
  }
  if (passwordForm.newPassword !== passwordForm.confirm) {
    ElMessage.warning('两次输入的新密码不一致')
    return
  }
  savingPassword.value = true
  try {
    await api.changePassword(passwordForm.oldPassword, passwordForm.newPassword)
    passwordForm.oldPassword = ''
    passwordForm.newPassword = ''
    passwordForm.confirm = ''
    ElMessage.success('密码已修改')
  } catch {
    // 拦截器已提示
  } finally {
    savingPassword.value = false
  }
}

async function saveNotify() {
  savingNotify.value = true
  try {
    const updated = await api.updateNotify({
      channel: notifyForm.channel,
      token: notifyForm.token.trim() || undefined,
      secret: notifyForm.channel === 'dingtalk' ? notifyForm.secret.trim() : undefined,
      notifyBefore: notifyForm.notifyBefore,
    })
    auth.setProfile(updated)
    notifyForm.token = ''
    notifyForm.secret = ''
    ElMessage.success('推送设置已保存')
  } catch {
    // 拦截器已提示
  } finally {
    savingNotify.value = false
  }
}

async function testNotify() {
  testing.value = true
  try {
    await api.notifyTest()
    ElMessage.success('测试消息已发出，请到手机上确认')
    await loadLogs(1)
  } catch {
    // 失败原因由后端返回，拦截器已提示
  } finally {
    testing.value = false
  }
}

// ---------- AI 配置 ----------

async function saveAi() {
  savingAi.value = true
  try {
    const updated = await api.updateAi({
      apiKey: aiForm.key.trim() || undefined,
      model: aiForm.model?.trim() ?? '',
      visionModel: aiForm.visionModel?.trim() ?? '',
    })
    auth.setProfile(updated)
    aiForm.key = ''
    ElMessage.success('AI 配置已保存，识别页立即生效')
  } catch {
    // 拦截器已提示
  } finally {
    savingAi.value = false
  }
}

async function clearAiKey() {
  try {
    await ElMessageBox.confirm(
      '清除后将回退使用服务器预配置的 Key（如果有）；都没有则 AI 识别不可用。确定继续吗？',
      '清除 DeepSeek Key',
      { type: 'warning', confirmButtonText: '清除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  savingAi.value = true
  try {
    const updated = await api.updateAi({ apiKey: null })
    auth.setProfile(updated)
    aiForm.key = ''
    ElMessage.success('Key 已清除')
  } catch {
    // 拦截器已提示
  } finally {
    savingAi.value = false
  }
}

// ---------- 清单 ----------

function openCreateList() {
  listDialog.id = 0
  listDialog.name = ''
  listDialog.color = LIST_COLORS[store.lists.length % LIST_COLORS.length]
  listDialog.visible = true
}

function openEditList(id: number, name: string, color: string) {
  listDialog.id = id
  listDialog.name = name
  listDialog.color = color
  listDialog.visible = true
}

async function saveList() {
  const name = listDialog.name.trim()
  if (!name) {
    ElMessage.warning('请填写清单名称')
    return
  }
  try {
    if (listDialog.id) await api.updateList(listDialog.id, { name, color: listDialog.color })
    else await api.createList({ name, color: listDialog.color })
    listDialog.visible = false
    await store.loadLists()
    await loadStats()
    ElMessage.success('已保存')
  } catch {
    // 拦截器已提示
  }
}

async function removeList(id: number, name: string) {
  try {
    await ElMessageBox.confirm(
      `删除清单「${name}」后，其下日程会变成未分组，确定继续吗？`,
      '删除清单',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await api.removeList(id)
    await Promise.all([store.loadLists(), store.refresh(), loadStats()])
    ElMessage.success('已删除')
  } catch {
    // 拦截器已提示
  }
}

/** 拖拽排序：落点确定后整体重排并回写 sortOrder */
async function onDropList(targetIndex: number) {
  const from = dragIndex.value
  dragIndex.value = null
  if (from === null || from === targetIndex) return

  const next = [...store.lists]
  const [moved] = next.splice(from, 1)
  next.splice(targetIndex, 0, moved)
  try {
    await api.sortLists(next.map((l) => l.id))
    await store.loadLists()
  } catch {
    // 拦截器已提示
  }
}

// ---------- 日志与统计 ----------

async function loadLogs(page = logPage.value) {
  logPage.value = page
  try {
    const res = await api.notifyLogs(page, LOG_LIMIT)
    logs.value = res.items
    logTotal.value = res.total
  } catch {
    logs.value = []
  }
}

async function loadStats() {
  try {
    stats.value = await api.stats()
  } catch {
    stats.value = null
  }
}

function onTabChange(name: string | number) {
  if (name === 'logs') loadLogs(1)
  if (name === 'usage') loadStats()
}

onMounted(async () => {
  const q = route.query.tab
  if (typeof q === 'string' && TAB_NAMES.includes(q)) tab.value = q
  fillForms()
  await Promise.all([
    api.timezones().then((t) => (timezones.value = t)).catch(() => undefined),
    api.notifyChannels().then((c) => (channels.value = c)).catch(() => undefined),
    store.loadLists(),
    loadStats(),
  ])
  // 拉取时区/渠道后资料可能已刷新，再同步一次表单
  fillForms()
})
</script>

<template>
  <div class="page">
    <div class="panel">
      <div class="panel-head">
        <h3 class="panel-title">设置</h3>
        <span class="muted small">账号资料、清单、提醒推送与用量</span>
      </div>

      <el-tabs v-model="tab" class="tabs" @tab-change="onTabChange">
        <!-- 个人资料 -->
        <el-tab-pane label="个人资料" name="profile">
          <el-form label-width="92px" class="form">
            <el-form-item label="用户名">
              <el-input :model-value="auth.profile?.username" disabled />
            </el-form-item>
            <el-form-item label="昵称">
              <el-input v-model="profileForm.nickname" maxlength="30" />
            </el-form-item>
            <el-form-item label="邮箱">
              <el-input v-model="profileForm.email" maxlength="120" />
            </el-form-item>
            <el-form-item label="时区">
              <el-select v-model="profileForm.timezone" filterable style="width: 100%">
                <el-option v-for="tz in timezones" :key="tz" :value="tz" :label="tz" />
              </el-select>
              <div class="muted small tip">
                时区决定「全天日程」的日期归属，以及 AI 换算「下周三」这类相对时间的基准
              </div>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="savingProfile" @click="saveProfile">
                保存资料
              </el-button>
            </el-form-item>
          </el-form>

          <el-divider content-position="left">修改密码</el-divider>

          <el-form label-width="92px" class="form">
            <el-form-item label="当前密码">
              <el-input v-model="passwordForm.oldPassword" type="password" show-password />
            </el-form-item>
            <el-form-item label="新密码">
              <el-input v-model="passwordForm.newPassword" type="password" show-password />
            </el-form-item>
            <el-form-item label="确认新密码">
              <el-input v-model="passwordForm.confirm" type="password" show-password />
            </el-form-item>
            <el-form-item>
              <el-button :loading="savingPassword" @click="savePassword">修改密码</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 清单管理 -->
        <el-tab-pane label="清单管理" name="lists">
          <div class="list-toolbar">
            <span class="muted small">拖动可调整顺序；删除清单不会删除其下日程</span>
            <el-button type="primary" size="small" :icon="Plus" @click="openCreateList">
              新建清单
            </el-button>
          </div>

          <p v-if="!store.lists.length" class="empty-tip">还没有清单</p>
          <ul v-else class="list-rows">
            <li
              v-for="(l, i) in store.lists"
              :key="l.id"
              class="list-row"
              draggable="true"
              @dragstart="dragIndex = i"
              @dragover.prevent
              @drop="onDropList(i)"
            >
              <span class="grip muted">⋮⋮</span>
              <i class="prio-dot" :style="{ background: l.color }" />
              <span class="list-row-name">{{ l.name }}</span>
              <span class="muted small">{{ l.activeCount ?? 0 }} 条未完成</span>
              <span class="spacer" />
              <el-button link :icon="Edit" @click="openEditList(l.id, l.name, l.color)" />
              <el-button link :icon="Delete" @click="removeList(l.id, l.name)" />
            </li>
          </ul>
        </el-tab-pane>

        <!-- 提醒推送 -->
        <el-tab-pane label="提醒推送" name="notify">
          <el-form label-width="112px" class="form">
            <el-form-item label="推送渠道">
              <el-radio-group v-model="notifyForm.channel">
                <el-radio v-for="c in channels" :key="c.value" :value="c.value">
                  {{ c.label }}
                </el-radio>
              </el-radio-group>
              <div v-if="channelHint" class="muted small tip">{{ channelHint }}</div>
            </el-form-item>

            <template v-if="notifyForm.channel === 'serverchan'">
              <el-form-item label="SendKey">
                <el-input
                  v-model="notifyForm.token"
                  :placeholder="tokenPlaceholder"
                  maxlength="600"
                  show-password
                />
                <div class="muted small tip">
                  在 sct.ftqq.com 登录后复制 SendKey；免费额度每日 5 条
                </div>
              </el-form-item>
            </template>

            <template v-else-if="notifyForm.channel === 'dingtalk'">
              <el-form-item label="Webhook 地址">
                <el-input v-model="notifyForm.token" :placeholder="tokenPlaceholder" maxlength="600" />
              </el-form-item>
              <el-form-item label="加签密钥">
                <el-input
                  v-model="notifyForm.secret"
                  placeholder="SEC 开头；未开启加签可留空"
                  maxlength="200"
                  show-password
                />
              </el-form-item>
            </template>

            <el-form-item label="默认提前">
              <el-input-number v-model="notifyForm.notifyBefore" :min="0" :max="1440" :step="5" />
              <span class="remind-unit">分钟</span>
              <div class="muted small tip">单条日程可在编辑弹窗里单独覆盖这个值</div>
            </el-form-item>

            <el-form-item>
              <el-button type="primary" :loading="savingNotify" @click="saveNotify">
                保存推送设置
              </el-button>
              <el-button
                :loading="testing"
                :disabled="notifyForm.channel === 'none'"
                @click="testNotify"
              >
                发送测试消息
              </el-button>
            </el-form-item>
          </el-form>

          <el-alert
            type="info"
            :closable="false"
            show-icon
            title="提醒是怎么发出的"
            description="服务端每分钟扫描一次即将开始的日程，命中「开始时间 - 提前分钟数」时通过你配置的渠道推送。因此即使浏览器没打开也能收到；页面打开时另有站内提醒条。"
          />
        </el-tab-pane>

        <!-- AI 识别 -->
        <el-tab-pane label="AI 识别" name="ai">
          <el-form label-width="112px" class="form">
            <el-form-item label="DeepSeek Key">
              <el-input v-model="aiForm.key" :placeholder="aiKeyPlaceholder" maxlength="200" show-password />
              <div class="muted small tip">
                在 platform.deepseek.com → API Keys 创建。Key 加密后存在本站服务器，仅用于你自己的识别请求；留空则使用服务器预配置的 Key（如果有）。
              </div>
            </el-form-item>
            <el-form-item label="文本模型">
              <el-select
                v-model="aiForm.model"
                filterable
                allow-create
                clearable
                placeholder="留空使用默认 deepseek-chat（或服务器预配置模型）"
                style="width: 100%"
              >
                <el-option v-for="m in TEXT_MODEL_OPTIONS" :key="m.value" :value="m.value" :label="m.label" />
              </el-select>
              <div class="muted small tip">
                用于文字识别与顶部快速添加；下拉为常见模型，也可直接输入 DeepSeek 支持的任意模型名
              </div>
            </el-form-item>
            <el-form-item label="视觉模型">
              <el-select
                v-model="aiForm.visionModel"
                filterable
                allow-create
                clearable
                placeholder="留空 = 仅文字识别；选择/输入多模态模型名后启用图片识别"
                style="width: 100%"
              >
                <el-option v-for="m in VISION_MODEL_OPTIONS" :key="m.value" :value="m.value" :label="m.label" />
              </el-select>
              <div class="muted small tip">
                模型名以 DeepSeek 官方文档为准；留空时识别页会自动隐藏图片上传入口
              </div>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="savingAi" @click="saveAi">保存 AI 配置</el-button>
              <el-button
                v-if="auth.profile?.aiKeyConfigured"
                type="danger"
                plain
                :loading="savingAi"
                @click="clearAiKey"
              >
                清除 Key
              </el-button>
            </el-form-item>
          </el-form>

          <el-alert
            type="info"
            :closable="false"
            show-icon
            title="Key 是怎么被使用的"
            description="识别请求由服务器统一发往 DeepSeek，Key 不会下发到浏览器；费用计在你自己的 DeepSeek 账号上。保存后在 AI 识别页与顶部快速添加栏立即生效。"
          />
        </el-tab-pane>

        <!-- 推送日志 -->
        <el-tab-pane label="推送日志" name="logs">
          <p v-if="!logs.length" class="empty-tip">暂无推送记录</p>
          <el-table v-else :data="logs" size="small" stripe>
            <el-table-column type="expand">
              <template #default="{ row }">
                <div class="log-detail">
                  <div><strong>标题：</strong>{{ row.title }}</div>
                  <div v-if="row.error"><strong>错误：</strong>{{ row.error }}</div>
                  <div><strong>日程 ID：</strong>{{ row.eventId ?? '-' }}</div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="时间" width="160">
              <template #default="{ row }">{{ dayjs(row.createdAt).format('MM-DD HH:mm:ss') }}</template>
            </el-table-column>
            <el-table-column prop="channel" label="渠道" width="110" />
            <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
            <el-table-column label="结果" width="90" align="center">
              <template #default="{ row }">
                <el-tag size="small" :type="row.ok ? 'success' : 'danger'" effect="plain">
                  {{ row.ok ? '成功' : '失败' }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>

          <el-pagination
            v-if="logTotal > LOG_LIMIT"
            class="pager"
            layout="prev, pager, next"
            :total="logTotal"
            :page-size="LOG_LIMIT"
            :current-page="logPage"
            @current-change="loadLogs"
          />
        </el-tab-pane>

        <!-- AI 用量 -->
        <el-tab-pane label="AI 用量" name="usage">
          <el-descriptions v-if="stats" :column="2" border>
            <el-descriptions-item label="日程总数">{{ stats.events }}</el-descriptions-item>
            <el-descriptions-item label="今日待办">{{ stats.todayTodo }}</el-descriptions-item>
            <el-descriptions-item label="已逾期未完成">{{ stats.overdue }}</el-descriptions-item>
            <el-descriptions-item label="清单数">{{ stats.lists }}</el-descriptions-item>
            <el-descriptions-item label="本月识别次数">{{ stats.ai.batches }}</el-descriptions-item>
            <el-descriptions-item label="本月 Token 消耗">
              {{ stats.ai.promptTokens + stats.ai.completionTokens }}
              <span class="muted small">
                （输入 {{ stats.ai.promptTokens }} / 输出 {{ stats.ai.completionTokens }}）
              </span>
            </el-descriptions-item>
          </el-descriptions>
          <p v-else class="empty-tip">统计数据加载失败，请稍后重试</p>
          <el-button class="mt" size="small" @click="loadStats">刷新统计</el-button>
        </el-tab-pane>
      </el-tabs>
    </div>

    <el-dialog v-model="listDialog.visible" :title="listDialog.id ? '编辑清单' : '新建清单'" width="420px">
      <el-form label-width="70px">
        <el-form-item label="名称">
          <el-input v-model="listDialog.name" maxlength="30" placeholder="例如：工作 / 生活 / 学习" />
        </el-form-item>
        <el-form-item label="颜色">
          <div class="swatches">
            <button
              v-for="c in LIST_COLORS"
              :key="c"
              class="swatch"
              :class="{ on: listDialog.color === c }"
              :style="{ background: c }"
              @click="listDialog.color = c"
            />
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="listDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="saveList">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.tabs {
  padding: 0 16px 16px;
}

.form {
  max-width: 560px;
}

.tip {
  width: 100%;
  line-height: 1.6;
}

.remind-unit {
  margin-left: 8px;
  color: var(--text-sub);
}

.list-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.list-rows {
  margin: 0;
  padding: 0;
  list-style: none;
  max-width: 620px;
}

.list-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: 1px solid var(--border-light);
  border-radius: 6px;
  margin-bottom: 6px;
  background: var(--bg-panel);
  cursor: grab;
}

.list-row:hover {
  border-color: #c6e2ff;
}

.grip {
  cursor: grab;
  letter-spacing: -2px;
}

.list-row-name {
  font-size: 14px;
}

.spacer {
  flex: 1;
}

.small {
  font-size: 12px;
}

.mt {
  margin-top: 12px;
}

.pager {
  margin-top: 12px;
  justify-content: flex-end;
}

.log-detail {
  padding: 6px 16px;
  font-size: 12px;
  line-height: 1.8;
  color: var(--text-sub);
}

.swatches {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.swatch {
  width: 26px;
  height: 26px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 50%;
  cursor: pointer;
}

.swatch.on {
  border-color: #303133;
  box-shadow: 0 0 0 2px #fff inset;
}
</style>
