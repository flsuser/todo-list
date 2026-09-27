import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { AuthUser } from '../common/types'
import { CreateListDto, SortListDto, UpdateListDto } from './dto'
import { ListsService } from './lists.service'

@ApiTags('lists')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('lists')
export class ListsController {
  constructor(private readonly lists: ListsService) {}

  @Get()
  @ApiOperation({ summary: '清单列表（含未完成日程数）' })
  findAll(@CurrentUser() user: AuthUser) {
    return this.lists.findAll(user.id)
  }

  @Post()
  @ApiOperation({ summary: '新建清单' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateListDto) {
    return this.lists.create(user.id, dto)
  }

  @Patch('sort')
  @ApiOperation({ summary: '拖拽排序' })
  sort(@CurrentUser() user: AuthUser, @Body() dto: SortListDto) {
    return this.lists.sort(user.id, dto)
  }

  @Patch(':id')
  @ApiOperation({ summary: '重命名 / 改颜色' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateListDto,
  ) {
    return this.lists.update(user.id, id, dto)
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除清单（其下日程自动变为未分组）' })
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.lists.remove(user.id, id)
  }
}
