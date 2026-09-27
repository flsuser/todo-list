import * as path from 'path'

/** AI 识别的临时图片目录：upload 落盘、ServeStatic 托管、清理任务都指向这里 */
export const TMP_DIR = path.resolve(process.env.TMP_DIR ?? './tmp')

/** 前端站点地址，用于推送消息里的跳转链接 */
export const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL ?? '').replace(/\/$/, '')

/** 临时图片保留天数，超期由定时任务清理 */
export const TMP_TTL_DAYS = 7
