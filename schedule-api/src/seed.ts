import './env'

import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)
dayjs.extend(timezone)

const prisma = new PrismaClient()

const TZ = 'Asia/Shanghai'
const USERNAME = process.env.DEMO_USERNAME ?? 'demo'
const PASSWORD = process.env.DEMO_PASSWORD ?? 'demo123'
const EMAIL = process.env.DEMO_EMAIL ?? 'demo@example.com'

const LISTS = [
  { name: '收件箱', color: '#909399', sortOrder: 0 },
  { name: '工作', color: '#409EFF', sortOrder: 1 },
  { name: '生活', color: '#67C23A', sortOrder: 2 },
]

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10)

  const user = await prisma.user.upsert({
    where: { username: USERNAME },
    update: {},
    create: {
      username: USERNAME,
      email: EMAIL,
      passwordHash,
      nickname: '演示用户',
      timezone: TZ,
      lists: { create: LISTS },
    },
  })

  const lists = await prisma.eventList.findMany({ where: { userId: user.id } })
  const byName = new Map(lists.map((l) => [l.name, l.id]))
  const work = byName.get('工作') ?? null
  const life = byName.get('生活') ?? null

  const existing = await prisma.event.count({ where: { userId: user.id } })
  if (existing > 0) {
    console.log(`>>> 演示账号 ${USERNAME} 已有 ${existing} 条日程，跳过示例数据`)
    return
  }

  const now = dayjs().tz(TZ)
  /** 生成带用户时区偏移的 ISO 串，与前端提交格式一致 */
  const at = (offsetDay: number, hour: number, minute = 0) =>
    now.add(offsetDay, 'day').hour(hour).minute(minute).second(0).millisecond(0).format()
  // 全天事件按用户时区的当天 00:00 / 23:59:59 落库
  const tomorrowStart = now.add(1, 'day').startOf('day').toDate()
  const tomorrowEnd = now.add(1, 'day').endOf('day').toDate()

  await prisma.event.createMany({
    data: [
      {
        userId: user.id,
        listId: work,
        title: '产品需求评审会',
        location: '三楼会议室',
        notes: '带上原型稿与埋点方案',
        startAt: new Date(at(0, 10)),
        endAt: new Date(at(0, 11, 30)),
        priority: 'high',
        remindBefore: 15,
      },
      {
        userId: user.id,
        listId: work,
        title: '提交周报',
        startAt: new Date(at(0, 18)),
        endAt: new Date(at(0, 18, 30)),
        priority: 'medium',
      },
      {
        userId: user.id,
        listId: life,
        title: '健身房 · 力量训练',
        startAt: new Date(at(0, 20)),
        endAt: new Date(at(0, 21)),
        priority: 'low',
      },
      {
        userId: user.id,
        listId: life,
        title: '家庭聚餐',
        location: '外婆家（万象城店）',
        allDay: true,
        startAt: tomorrowStart,
        endAt: tomorrowEnd,
        priority: 'high',
      },
      {
        userId: user.id,
        listId: work,
        title: '每日站会',
        startAt: new Date(at(0, 9, 30)),
        endAt: new Date(at(0, 9, 45)),
        rrule: 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
        priority: 'medium',
        remindBefore: 5,
      },
      {
        userId: user.id,
        listId: work,
        title: '整理季度 OKR 复盘材料',
        startAt: new Date(at(-2, 15)),
        endAt: new Date(at(-2, 17)),
        status: 'todo',
        priority: 'urgent',
      },
      {
        userId: user.id,
        listId: life,
        title: '缴纳水电费',
        startAt: new Date(at(-1, 9)),
        status: 'done',
        priority: 'low',
      },
    ],
  })

  console.log(`>>> 演示账号已就绪：${USERNAME} / ${PASSWORD}（时区 ${TZ}）`)
}

main()
  .catch((e) => {
    console.error('seed 失败：', e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
