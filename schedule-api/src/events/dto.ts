import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

export const EVENT_STATUS = ['todo', 'doing', 'done', 'cancelled'] as const
export const EVENT_PRIORITY = ['low', 'medium', 'high', 'urgent'] as const

/** 时间字段一律收字符串，由服务端按用户时区归一化：
 *  定时事件 `2026-09-22T14:00:00+08:00`；全天事件 `2026-09-22` */
export class CreateEventDto {
  @ApiProperty({ example: '和张总开产品评审会' })
  @IsString()
  @IsNotEmpty({ message: '标题不能为空' })
  @MaxLength(200, { message: '标题最多 200 字' })
  title: string

  @ApiPropertyOptional({ description: '所属清单 id，为空表示未分组' })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  listId?: number | null

  @ApiPropertyOptional({ example: '2026-09-22T14:00:00+08:00' })
  @IsString()
  @IsNotEmpty({ message: '开始时间不能为空' })
  start: string

  @ApiPropertyOptional({ example: '2026-09-22T15:30:00+08:00' })
  @IsString()
  @IsOptional()
  end?: string | null

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  allDay?: boolean

  @ApiPropertyOptional({ example: 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE', description: '留空表示不重复' })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  rrule?: string | null

  @ApiPropertyOptional({ enum: EVENT_PRIORITY, default: 'medium' })
  @IsIn(EVENT_PRIORITY as unknown as string[], { message: '优先级取值不正确' })
  @IsOptional()
  priority?: string

  @ApiPropertyOptional({ enum: EVENT_STATUS, default: 'todo' })
  @IsIn(EVENT_STATUS as unknown as string[], { message: '状态取值不正确' })
  @IsOptional()
  status?: string

  @ApiPropertyOptional({ example: '三楼会议室' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  location?: string | null

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(5000)
  @IsOptional()
  notes?: string | null

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  remind?: boolean

  @ApiPropertyOptional({ description: '提前提醒分钟数（最大 24 小时），为空则用用户默认值' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(24 * 60)
  @IsOptional()
  remindBefore?: number | null
}

export class UpdateEventDto extends PartialType(CreateEventDto) {}

export class QueryRangeDto {
  @ApiProperty({ example: '2026-09-01T00:00:00+08:00' })
  @IsString()
  @IsNotEmpty({ message: '缺少起始时间' })
  from: string

  @ApiProperty({ example: '2026-09-30T23:59:59+08:00' })
  @IsString()
  @IsNotEmpty({ message: '缺少结束时间' })
  to: string
}

export class QueryListDto {
  @ApiPropertyOptional({ enum: ['all', 'overdue', 'today', 'tomorrow', 'week', 'later', 'done'] })
  @IsIn(['all', 'overdue', 'today', 'tomorrow', 'week', 'later', 'done'])
  @IsOptional()
  group?: string

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  listId?: number

  @ApiPropertyOptional({ enum: EVENT_PRIORITY })
  @IsIn(EVENT_PRIORITY as unknown as string[])
  @IsOptional()
  priority?: string

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(100)
  @IsOptional()
  keyword?: string
}

export class QueryUpcomingDto {
  @ApiPropertyOptional({ default: 60, description: '未来多少分钟内到期' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  @IsOptional()
  within: number = 60
}

export class ChangeStatusDto {
  @ApiProperty({ enum: EVENT_STATUS })
  @IsIn(EVENT_STATUS as unknown as string[], { message: '状态取值不正确' })
  status: string

  @ApiPropertyOptional({ description: '重复日程只改这一次时传入实例 id' })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  occurrenceId?: number
}

export class BatchCreateItemDto extends CreateEventDto {}

export class BatchCreateDto {
  @ApiProperty({ type: [BatchCreateItemDto] })
  @IsArray()
  @ArrayMaxSize(100, { message: '单次最多创建 100 条' })
  @ValidateNested({ each: true })
  @Type(() => BatchCreateItemDto)
  items: BatchCreateItemDto[]
}

export class BatchStatusDto {
  @ApiProperty({ type: [Number] })
  @IsArray()
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  @Type(() => Number)
  ids: number[]

  @ApiProperty({ enum: EVENT_STATUS })
  @IsIn(EVENT_STATUS as unknown as string[], { message: '状态取值不正确' })
  status: string
}

/** 编辑/删除重复日程时的作用范围 */
export class ScopeQueryDto {
  @ApiPropertyOptional({
    enum: ['all', 'single', 'future'],
    default: 'all',
    description: 'all=整个日程，single=仅此次，future=此次及后续',
  })
  @IsIn(['all', 'single', 'future'], { message: 'scope 取值不正确' })
  @IsOptional()
  scope: 'all' | 'single' | 'future' = 'all'

  @ApiPropertyOptional({ description: 'scope 为 single/future 时必传' })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  occurrenceId?: number
}

/** 详情接口可选定位到某一次实例 */
export class OccurrenceQueryDto {
  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  occurrenceId?: number
}

/** 全局搜索与看板/列表共用的分页参数 */
export class PageQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = 1

  @ApiPropertyOptional({ default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit: number = 20
}
