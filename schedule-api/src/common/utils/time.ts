import { BadRequestException } from '@nestjs/common'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)

export const DEFAULT_TZ = 'Asia/Shanghai'

const WEEKDAY_CN = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

/** 校验 IANA 时区名是否可用（用户可自填，非法值一律回退到默认时区） */
export function safeTimezone(tz?: string | null): string {
  if (!tz) return DEFAULT_TZ
  try {
    // Intl 对非法时区名会直接抛 RangeError
    dayjs().tz(tz)
    return tz
  } catch {
    return DEFAULT_TZ
  }
}

/** 带 Z 或 ±HH:MM 偏移的字符串才视为「已指定时区」 */
const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i

/**
 * 把前端传入的时间统一换算成 UTC Date 入库。
 * - 全天事件：只取前 10 位日期，按用户时区的 00:00 落库
 * - 定时事件：带偏移的 ISO 直接解析；不带偏移的按用户时区解释
 */
export function parseWhen(input: string, tz: string, allDay = false): Date {
  if (!input || typeof input !== 'string') {
    throw new BadRequestException('时间不能为空')
  }

  if (allDay) {
    const d = dayjs.tz(input.slice(0, 10), 'YYYY-MM-DD', tz)
    if (!d.isValid()) throw new BadRequestException('日期格式不正确，应为 YYYY-MM-DD')
    return d.startOf('day').toDate()
  }

  const d = HAS_OFFSET.test(input) ? dayjs(input) : dayjs.tz(input, tz)
  if (!d.isValid()) throw new BadRequestException('时间格式不正确')
  return d.toDate()
}

/** 某个时刻在指定时区下的当天 00:00 */
export function startOfDayInTz(date: Date, tz: string): Date {
  return dayjs(date).tz(tz).startOf('day').toDate()
}

/** 某个时刻在指定时区下的当天 23:59:59.999 */
export function endOfDayInTz(date: Date, tz: string): Date {
  return dayjs(date).tz(tz).endOf('day').toDate()
}

/** 按用户时区格式化，供推送文案与列表展示使用 */
export function formatInTz(date: Date, tz: string, template = 'YYYY-MM-DD HH:mm'): string {
  return dayjs(date).tz(tz).format(template)
}

/** 判断两个时刻在指定时区下是否为同一天 */
export function isSameDayInTz(a: Date, b: Date, tz: string): boolean {
  return dayjs(a).tz(tz).isSame(dayjs(b).tz(tz), 'day')
}

/**
 * 生成给 AI 的「当前时间」上下文。
 * 相对时间（下周三、后天下午三点）必须依赖它才能换算成绝对时间。
 */
export function describeNow(tz: string): string {
  const now = dayjs().tz(tz)
  return [
    `${now.format('YYYY年MM月DD日')} ${WEEKDAY_CN[now.day()]} ${now.format('HH:mm:ss')}`,
    `时区 ${tz}（UTC${now.format('Z')}）`,
    `ISO 格式：${now.toISOString()}`,
  ].join('，')
}

/** 把 UTC Date 转成用户时区的 ISO 串（带偏移），返回给前端 */
export function toIsoInTz(date: Date, tz: string): string {
  return dayjs(date).tz(tz).format()
}
