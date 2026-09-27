import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'
import { BadRequestException } from '@nestjs/common'
import { diskStorage, Options } from 'multer'
import { TMP_DIR } from '../common/config'

export const ALLOWED_IMAGE_MIME = /^image\/(jpeg|png|webp)$/
export const MAX_IMAGE_SIZE = 8 * 1024 * 1024 // 8MB
export const MAX_IMAGES = 5

/** AI 识别用的临时图片落盘配置：扁平存放于 TMP_DIR，由定时任务按保留期清理 */
export const tmpImageUploadOptions: Options = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(TMP_DIR, { recursive: true })
      cb(null, TMP_DIR)
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg'
      cb(null, `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}${ext}`)
    },
  }),
  limits: { fileSize: MAX_IMAGE_SIZE, files: MAX_IMAGES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME.test(file.mimetype)) {
      // 单参形式：multer 会把异常交给 next()，NestJS 全局过滤器统一转成 400 响应
      return cb(new BadRequestException('仅支持 jpg / png / webp 格式图片'))
    }
    cb(null, true)
  },
}

/** 落盘文件名 -> 可通过 ServeStatic 访问的 URL */
export function toTmpUrl(filename: string): string {
  return `/tmp/${filename}`
}
