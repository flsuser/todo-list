import * as path from 'path'
import { promises as fsp } from 'fs'
import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { TMP_DIR, TMP_TTL_DAYS } from '../common/config'

/** 每天凌晨 4 点清理过期的 AI 识别临时图片 */
@Injectable()
export class TmpCleanupJob {
  private readonly logger = new Logger('TmpCleanup')

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async clean(): Promise<void> {
    const cutoff = Date.now() - TMP_TTL_DAYS * 86_400_000

    let names: string[]
    try {
      names = await fsp.readdir(TMP_DIR)
    } catch {
      return // 目录尚未创建，无需处理
    }

    let removed = 0
    for (const name of names) {
      const full = path.join(TMP_DIR, name)
      try {
        const stat = await fsp.stat(full)
        if (stat.isFile() && stat.mtimeMs < cutoff) {
          await fsp.unlink(full)
          removed++
        }
      } catch {
        // 单个文件失败不影响其余清理
      }
    }
    if (removed) this.logger.log(`已清理过期临时图片 ${removed} 个`)
  }
}
