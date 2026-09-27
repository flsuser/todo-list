import { BadGatewayException } from '@nestjs/common'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { isValidRRule } from '../events/rrule.util'
import { AiDraftPayload } from './dto'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)

const PRIORITIES = ['low', 'medium', 'high', 'urgent']

/**
 * DeepSeek 返回内容的解析与清洗。
 * 单独成模块是因为这些都是纯函数，模型输出千变万化，需要能脱离服务独立验证。
 */

/** 从模型输出里挖出 events 数组；解析失败时把原文回传，方便用户手动录入 */
export function extractEvents(content: string): unknown[] {
  const parsed = tryParseJson(content)
  if (!parsed) {
    throw new BadGatewayException(`AI 返回内容无法解析为 JSON，原文：${content.slice(0, 300)}`)
  }

  const obj = parsed as Record<string, unknown>
  const arr = Array.isArray(parsed)
    ? parsed
    : Array.isArray(obj.events)
      ? obj.events
      : Array.isArray(obj.items)
        ? obj.items
        : Array.isArray(obj.data)
          ? obj.data
          : null
  if (!arr) {
    throw new BadGatewayException(`AI 返回结构中没有 events 数组，原文：${content.slice(0, 300)}`)
  }
  return arr.filter((x) => x && typeof x === 'object')
}

/** 依次尝试：整体解析 -> markdown 代码块 -> 首尾大括号/中括号截取 */
export function tryParseJson(content: string): unknown | null {
  const attempts: string[] = [content]

  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) attempts.push(fenced[1].trim())

  const brace = content.indexOf('{')
  const braceEnd = content.lastIndexOf('}')
  if (brace >= 0 && braceEnd > brace) attempts.push(content.slice(brace, braceEnd + 1))

  const bracket = content.indexOf('[')
  const bracketEnd = content.lastIndexOf(']')
  if (bracket >= 0 && bracketEnd > bracket) attempts.push(content.slice(bracket, bracketEnd + 1))

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate)
    } catch {
      // 换下一种截取方式
    }
  }
  return null
}

/**
 * 把模型输出（或前端改过的草稿）清洗成可入库的结构。
 * 模型偶尔会给出非法时间、越界优先级或不存在的 RRULE，这里统一兜底。
 */
export function sanitizeDraft(raw: unknown, tz: string): AiDraftPayload {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const allDay = Boolean(o.allDay)
  const startAt = normalizeTime(o.startAt, allDay, tz)
  const endAt = normalizeTime(o.endAt, allDay, tz)
  const confidence = clampNumber(o.confidence, 0, 1, 0.75)

  return {
    title: (text(o.title) ?? '未命名日程').slice(0, 200),
    startAt,
    // 结束时间不晚于开始时间时直接丢弃，交给入库逻辑按默认时长处理
    endAt: endAt && startAt && dayjs(endAt).isAfter(dayjs(startAt)) ? endAt : null,
    allDay,
    rrule: normalizeRrule(o.rrule),
    location: text(o.location)?.slice(0, 200) ?? null,
    notes: text(o.notes)?.slice(0, 2000) ?? null,
    priority: PRIORITIES.includes(String(o.priority)) ? String(o.priority) : 'medium',
    listName: text(o.listName)?.slice(0, 30) ?? null,
    remindBefore: clampInt(o.remindBefore, 0, 24 * 60),
    needsReview: Boolean(o.needsReview) || !startAt || confidence < 0.6,
    confidence,
  }
}

/** 统一成用户时区下的字符串：全天 YYYY-MM-DD，定时为带偏移的 ISO */
export function normalizeTime(value: unknown, allDay: boolean, tz: string): string | null {
  const s = text(value)
  if (!s) return null

  if (allDay) {
    const d = s.includes('T') ? dayjs(s) : dayjs(s.slice(0, 10), 'YYYY-MM-DD')
    return d.isValid() ? d.tz(tz).format('YYYY-MM-DD') : null
  }

  // 只给了日期却标成定时事件时，默认放到上午 9 点，避免落到 00:00 半夜提醒
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s)
    ? dayjs.tz(s, 'YYYY-MM-DD', tz).hour(9).minute(0).second(0)
    : dayjs(s)
  return d.isValid() ? d.tz(tz).format() : null
}

export function normalizeRrule(value: unknown): string | null {
  const s = text(value)
  if (!s) return null
  const rule = /^RRULE:/i.test(s) ? s : `RRULE:${s}`
  return isValidRRule(rule) ? rule.toUpperCase() : null
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  return s || null
}

function clampInt(value: unknown, min: number, max: number): number | null {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.min(max, Math.max(min, Math.round(n)))
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}
