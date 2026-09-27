import { Module } from '@nestjs/common'
import { TmpCleanupJob } from './tmp-cleanup.job'

/**
 * 临时图片模块：只提供 multer 落盘配置（tmp.storage.ts）与过期清理任务，
 * 不单独开放上传接口 —— AI 识别接口直接用 FilesInterceptor 接收图片。
 */
@Module({
  providers: [TmpCleanupJob],
})
export class UploadModule {}
