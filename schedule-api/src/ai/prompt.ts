import { describeNow } from '../common/utils/time'

/** AI 需要产出的 JSON 结构说明，直接写进 system 提示词 */
const OUTPUT_CONTRACT = `
输出要求：只输出一个 JSON 对象，不要任何解释文字、前后缀或 markdown 代码块。结构如下：
{
  "events": [
    {
      "title": "事项标题，简洁不超过 50 字",
      "startAt": "2026-09-24T14:00:00+08:00 或全天事件用 2026-09-24，无法确定则为 null",
      "endAt": "同上格式，未知则为 null",
      "allDay": false,
      "rrule": "RRULE:FREQ=WEEKLY;BYDAY=MO,WE，不重复则为 null",
      "location": "地点，无则为 null",
      "notes": "补充说明，无则为 null",
      "priority": "low | medium | high | urgent",
      "listName": "工作 / 生活 / 学习 等分类名，无法判断则为 null",
      "remindBefore": 15,
      "needsReview": false,
      "confidence": 0.92
    }
  ]
}
`.trim()

const RULES = `
硬性规则：
1. 所有相对时间（今天、明天、后天、下周三、月底、周五下午）必须以「当前时间」为基准换算成绝对时间；startAt/endAt 必须带与当前时区一致的偏移量。
2. 只给出日期、没有具体时刻的，allDay 设为 true，startAt 用 YYYY-MM-DD。
3. 给出了具体时刻的，allDay 设为 false，startAt 用完整 ISO-8601；未说明结束时间时，会议/课程/面试类默认 1 小时，其余留 null。
4. 中文口语时间换算：凌晨一点=01:00，上午九点=09:00，中午十二点=12:00，下午三点=15:00，晚上八点=20:00，半夜十二点=00:00。
5. 「下周X」指下一个自然周的周X；「本周X/这周X」若该日已过则顺延到下周同一天。
6. 重复规则用 RRULE 表示，FREQ 取 DAILY/WEEKLY/MONTHLY/YEARLY，星期用 BYDAY=MO,TU,WE,TH,FR,SA,SU；「工作日」= BYDAY=MO,TU,WE,TH,FR；「每周一三五」= BYDAY=MO,WE,FR；有明确截止日期时补 UNTIL=YYYYMMDDTHHMMSSZ。
7. 优先级判断：出现「紧急」「立刻」「截止」「重要」等词用 urgent 或 high；普通事项用 medium；「有空再」「不急」用 low。
8. 严禁编造原文没有的信息。title 直接取原文关键词，不要加「提醒：」「日程：」这类前缀。
9. 图片中的表格、聊天截图、日历截图要逐条拆分提取，不要把多条合并成一条，也不要漏条。
10. 完全无法确定时间的事项仍然要输出，startAt 置为 null 并把 needsReview 设为 true。
11. 单次最多输出 30 条，按时间先后排序；没有任何日程信息时输出 {"events": []}。
`.trim()

/**
 * 构造 system 提示词。
 * 当前时间必须每次都实时注入，否则模型无法正确换算「下周三」这类相对时间。
 */
export function buildSystemPrompt(timezone: string, withImages: boolean): string {
  const source = withImages ? '用户提供的文字与图片' : '用户提供的文字'
  return [
    '你是一个日程解析助手，任务是从' + source + '中提取全部日程、待办与提醒事项，并转换为结构化 JSON。',
    '',
    `当前时间：${describeNow(timezone)}`,
    '',
    OUTPUT_CONTRACT,
    '',
    RULES,
  ].join('\n')
}

/** 用户没有输入文字、只传了图片时使用的兜底指令 */
export const IMAGE_ONLY_USER_TEXT = '请识别图片中的全部日程、待办与提醒事项，逐条提取。'
