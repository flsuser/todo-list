import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AuthUser } from '../common/types'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import {
  BatchCreateDto,
  BatchStatusDto,
  ChangeStatusDto,
  CreateEventDto,
  OccurrenceQueryDto,
  QueryListDto,
  QueryRangeDto,
  QueryUpcomingDto,
  ScopeQueryDto,
  UpdateEventDto,
} from './dto'
import { EventsService } from './events.service'
import { RRULE_PRESETS } from './rrule.util'

@ApiTags('events')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  // 静态路由必须声明在 ':id' 之前，否则会被参数路由抢先匹配

  @Get('range')
  @ApiOperation({ summary: '区间内的日程（重复日程按实例展开），供日历视图使用' })
  range(@CurrentUser() user: AuthUser, @Query() q: QueryRangeDto) {
    return this.events.range(user.id, user.timezone, q)
  }

  @Get('list')
  @ApiOperation({ summary: '列表视图：按 已过期/今天/明天/本周/以后/已完成 分组' })
  list(@CurrentUser() user: AuthUser, @Query() q: QueryListDto) {
    return this.events.list(user.id, user.timezone, q)
  }

  @Get('board')
  @ApiOperation({ summary: '看板视图：待办/进行中/已完成 三列' })
  board(@CurrentUser() user: AuthUser, @Query() q: QueryListDto) {
    return this.events.board(user.id, q)
  }

  @Get('upcoming')
  @ApiOperation({ summary: '未来 N 分钟内到期的日程，供站内提醒条轮询' })
  upcoming(@CurrentUser() user: AuthUser, @Query() q: QueryUpcomingDto) {
    return this.events.upcoming(user.id, user.timezone, q.within)
  }

  @Get('rrule-presets')
  @ApiOperation({ summary: '重复规则预设项，供编辑弹窗渲染下拉' })
  rrulePresets() {
    return RRULE_PRESETS
  }

  @Post('batch')
  @ApiOperation({ summary: '批量创建日程' })
  batchCreate(@CurrentUser() user: AuthUser, @Body() dto: BatchCreateDto) {
    return this.events.batchCreate(user.id, user.timezone, dto)
  }

  @Patch('batch-status')
  @ApiOperation({ summary: '批量修改状态（看板拖拽多选）' })
  batchStatus(@CurrentUser() user: AuthUser, @Body() dto: BatchStatusDto) {
    return this.events.batchStatus(user.id, dto)
  }

  @Get(':id')
  @ApiOperation({ summary: '日程详情' })
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() q: OccurrenceQueryDto,
  ) {
    return this.events.findOne(user.id, id, q.occurrenceId)
  }

  @Post()
  @ApiOperation({ summary: '新建日程' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEventDto) {
    return this.events.create(user.id, user.timezone, dto)
  }

  @Patch(':id/status')
  @ApiOperation({ summary: '切换状态；带 occurrenceId 时只改重复日程的这一次' })
  changeStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeStatusDto,
  ) {
    return this.events.changeStatus(user.id, id, dto)
  }

  @Patch(':id')
  @ApiOperation({ summary: '编辑日程（拖拽改时间只需传 start/end）' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEventDto,
    @Query() q: ScopeQueryDto,
  ) {
    return this.events.update(user.id, user.timezone, id, dto, q.scope, q.occurrenceId)
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除日程；scope=single 时仅取消该次实例' })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() q: ScopeQueryDto,
  ) {
    return this.events.remove(user.id, id, q.scope, q.occurrenceId)
  }
}
