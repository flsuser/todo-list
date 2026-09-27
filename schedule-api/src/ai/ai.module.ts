import { Module } from '@nestjs/common'
import { EventsModule } from '../events/events.module'
import { ListsModule } from '../lists/lists.module'
import { AiController } from './ai.controller'
import { AiService } from './ai.service'
import { DeepseekClient } from './deepseek.client'

@Module({
  imports: [EventsModule, ListsModule],
  controllers: [AiController],
  providers: [AiService, DeepseekClient],
  exports: [AiService],
})
export class AiModule {}
