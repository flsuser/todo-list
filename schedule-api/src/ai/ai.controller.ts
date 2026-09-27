import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { AuthUser } from '../common/types'
import { PageQueryDto } from '../events/dto'
import { MAX_IMAGES, tmpImageUploadOptions } from '../upload/tmp.storage'
import { AiService } from './ai.service'
import { ConfirmBatchDto } from './dto'

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('capability')
  @ApiOperation({ summary: '当前用户的 AI 能力：Key 来源、是否支持图片识别' })
  capability(@CurrentUser() user: AuthUser) {
    return this.ai.capability(user)
  }

  @Post('parse')
  // DeepSeek 按量计费，单独收紧限流
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '上传图片/文字，识别为待确认的日程草稿' })
  @UseInterceptors(FilesInterceptor('images', MAX_IMAGES, tmpImageUploadOptions))
  parse(
    @CurrentUser() user: AuthUser,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body('text') text?: string,
  ) {
    return this.ai.parse(user, text, files ?? [])
  }

  @Post('confirm')
  @ApiOperation({ summary: '确认草稿并批量写入日程' })
  confirm(@CurrentUser() user: AuthUser, @Body() dto: ConfirmBatchDto) {
    return this.ai.confirm(user, dto)
  }

  @Get('batches')
  @ApiOperation({ summary: '历史识别批次' })
  batches(@CurrentUser() user: AuthUser, @Query() q: PageQueryDto) {
    return this.ai.batches(user.id, q.page, q.limit)
  }

  @Get('batches/:id')
  @ApiOperation({ summary: '单个批次的草稿详情' })
  batchDetail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ai.batchDetail(user.id, id)
  }

  @Delete('batches/:id')
  @ApiOperation({ summary: '丢弃整批草稿' })
  discard(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ai.discard(user, id)
  }
}
