import { Module } from '@nestjs/common'
import { EventsController } from './events.controller'
import { EventsService } from './events.service'
import { OccurrenceService } from './occurrence.service'

// EventsService / OccurrenceService 供 AI 批量入库与提醒定时任务复用，故对外导出
@Module({
  controllers: [EventsController],
  providers: [EventsService, OccurrenceService],
  exports: [EventsService, OccurrenceService],
})
export class EventsModule {}
