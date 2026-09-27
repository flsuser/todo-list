import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator'

/** AI 产出的单条草稿，前端可在确认前逐字段修改 */
export interface AiDraftPayload {
  title: string
  /** 定时事件为带偏移的 ISO 串；全天事件为 YYYY-MM-DD；识别不出时为 null */
  startAt: string | null
  endAt: string | null
  allDay: boolean
  rrule: string | null
  location: string | null
  notes: string | null
  priority: string
  listName: string | null
  remindBefore: number | null
  needsReview: boolean
  confidence: number
}

export class ConfirmItemDto {
  @ApiProperty({ description: 'AiParseItem.id' })
  @Type(() => Number)
  @IsInt()
  itemId: number

  @ApiPropertyOptional({
    description: '用户在前端改过的草稿内容；缺省则沿用 AI 的原始结果。服务端会重新做一次清洗校验',
  })
  @IsObject()
  @IsOptional()
  payload?: Record<string, unknown>
}

export class ConfirmBatchDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: '缺少批次 id' })
  @MaxLength(40)
  batchId: string

  @ApiProperty({ type: [ConfirmItemDto] })
  @IsArray()
  @ArrayMaxSize(50, { message: '单次最多确认 50 条' })
  @ValidateNested({ each: true })
  @Type(() => ConfirmItemDto)
  items: ConfirmItemDto[]
}
