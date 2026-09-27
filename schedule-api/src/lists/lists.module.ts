import { Module } from '@nestjs/common'
import { ListsController } from './lists.controller'
import { ListsService } from './lists.service'

// ListsService.resolveByName 供 AI 草稿入库时按名称匹配清单，故对外导出
@Module({
  controllers: [ListsController],
  providers: [ListsService],
  exports: [ListsService],
})
export class ListsModule {}
