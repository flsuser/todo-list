import { Options, RRule } from 'rrule'

/** 单个事件在一个窗口内最多展开的实例数，防御性上限 */
const MAX_EXPAND = 500

/** 频率编号 -> 中文（RRule.DAILY 等静态常量在运行时求值） */
const FREQ_CN: Record<number, string> = {
  [RRule.DAILY]: '每天',
  [RRule.WEEKLY]: '每周',
  [RRule.MONTHLY]: '每月',
  [RRule.YEARLY]: '每年',
}

const UNIT_CN: Record<number, string> = {
  [RRule.DAILY]: '天',
  [RRule.WEEKLY]: '周',
  [RRule.MONTHLY]: '月',
  [RRule.YEARLY]: '年',
}

const BYDAY_CN: Record<string, string> = {
  MO: '周一',
  TU: '周二',
  WE: '周三',
  TH: '周四',
  FR: '周五',
  SA: '周六',
  SU: '周日',
}

/** 去掉可能存在的 `RRULE:` 前缀 */
function stripPrefix(rule: string): string {
  return rule.trim().replace(/^RRULE:/i, '')
}

/**
 * 校验 RRULE 字符串是否可被解析。
 * 只接受以 FREQ= 开头的规则，DTSTART 由事件的 startAt 提供。
 */
export function isValidRRule(rule: string): boolean {
  try {
    const opts = RRule.parseString(stripPrefix(rule))
    return Boolean(opts?.freq)
  } catch {
    return false
  }
}

/** 以事件开始时间为起点构造 RRule；规则非法时返回 null */
export function buildRRule(rule: string, dtstart: Date): RRule | null {
  try {
    const opts = RRule.parseString(stripPrefix(rule))
    if (!opts?.freq) return null
    return new RRule({ ...opts, dtstart })
  } catch {
    return null
  }
}

/**
 * 展开 [from, to] 闭区间内的实例时刻。
 *
 * 说明：rrule 在未指定 tzid 时按 UTC 计算，因此这里传入的 dtstart（UTC 瞬时）
 * 与返回值都是精确的 UTC 瞬时，对固定偏移时区（如 Asia/Shanghai）完全准确；
 * 对存在夏令时的时区，"每天 9 点"这类规则在切换日后会偏移一小时，属已知取舍。
 */
export function expandBetween(rule: string, dtstart: Date, from: Date, to: Date): Date[] {
  const rrule = buildRRule(rule, dtstart)
  if (!rrule) return []
  try {
    // inc=true 表示包含 from/to 边界；实例时刻统一抹掉毫秒，便于与数据库唯一键匹配
    return rrule
      .between(from, to, true)
      .slice(0, MAX_EXPAND)
      .map((d) => new Date(Math.floor(d.getTime() / 1000) * 1000))
  } catch {
    return []
  }
}

/** 取 when 之前（不含）的最后一个实例，用于「此次及后续」拆分时给原事件补 UNTIL */
export function lastBefore(rule: string, dtstart: Date, when: Date): Date | null {
  const rrule = buildRRule(rule, dtstart)
  if (!rrule) return null
  try {
    return rrule.before(when, false) ?? null
  } catch {
    return null
  }
}

/** 给 RRULE 追加（或替换）UNTIL，时间为 UTC 基本格式 */
export function withUntil(rule: string, until: Date): string {
  const body = stripPrefix(rule).replace(/;?\s*UNTIL=[^;]*/gi, '')
  const value = [
    until.getUTCFullYear(),
    pad(until.getUTCMonth() + 1),
    pad(until.getUTCDate()),
    'T',
    pad(until.getUTCHours()),
    pad(until.getUTCMinutes()),
    pad(until.getUTCSeconds()),
    'Z',
  ].join('')
  return `RRULE:${body};UNTIL=${value}`
}

/** 生成规则的中文描述，用于列表与日历上的提示 */
export function describeRRule(rule?: string | null): string {
  if (!rule) return ''
  let opts: Partial<Options>
  try {
    opts = RRule.parseString(stripPrefix(rule))
  } catch {
    return rule
  }
  if (!opts.freq) return rule

  const parts: string[] = []
  const interval = opts.interval && opts.interval > 1 ? opts.interval : 0
  const freq = opts.freq

  if (interval) parts.push(`每 ${interval} ${UNIT_CN[freq] ?? '次'}`)
  else parts.push(FREQ_CN[freq] ?? '重复')

  const byweekday = toArray(opts.byweekday).map(normalizeWeekday).filter(Boolean)
  if (byweekday.length) parts.push(byweekday.join('、'))

  const bymonthday = toArray(opts.bymonthday)
  if (bymonthday.length) parts.push(bymonthday.map((d) => `${d} 日`).join('、'))

  const bymonth = toArray(opts.bymonth)
  if (bymonth.length) parts.push(bymonth.map((m) => `${m} 月`).join('、'))

  if (opts.count) parts.push(`共 ${opts.count} 次`)
  if (opts.until) parts.push(`至 ${formatDate(opts.until)}`)

  return parts.join(' ')
}

function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

/** byweekday 可能是数字、Weekday 实例或字符串，统一成 MO/TU… 再转中文 */
function normalizeWeekday(value: unknown): string {
  const code = typeof value === 'object' && value !== null && 'weekday' in value
    ? Object.keys(BYDAY_CN)[(value as { weekday: number }).weekday]
    : typeof value === 'number'
      ? Object.keys(BYDAY_CN)[value]
      : String(value).toUpperCase().slice(0, 2)
  return BYDAY_CN[code] ?? ''
}

function formatDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** 前端「重复」下拉的预设项，后端用于校验与回填描述 */
export const RRULE_PRESETS: { value: string; label: string }[] = [
  { value: '', label: '不重复' },
  { value: 'RRULE:FREQ=DAILY', label: '每天' },
  { value: 'RRULE:FREQ=WEEKLY', label: '每周' },
  { value: 'RRULE:FREQ=MONTHLY', label: '每月' },
  { value: 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', label: '每个工作日' },
  { value: 'RRULE:FREQ=WEEKLY;BYDAY=SA,SU', label: '每个周末' },
  { value: 'RRULE:FREQ=YEARLY', label: '每年' },
]
