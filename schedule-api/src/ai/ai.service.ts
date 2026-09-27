import { promises as fsp } from 'fs'
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { AuthUser, Page } from '../common/types'
import { safeTimezone } from '../common/utils/time'
import { EventView, EventsService } from '../events/events.service'
import { ListsService } from '../lists/lists.service'
import { PrismaService } from '../prisma/prisma.service'
import { MAX_IMAGES, toTmpUrl } from '../upload/tmp.storage'
import { ChatResult, ContentPart, DeepseekClient } from './deepseek.client'
import { extractEvents, sanitizeDraft } from './draft.util'
import { AiDraftPayload, ConfirmBatchDto } from './dto'
import { buildSystemPrompt, IMAGE_ONLY_USER_TEXT } from './prompt'

/** 单次识别最多采纳的条数，与提示词中的约定一致 */
const MAX_DRAFTS = 30

@Injectable()
export class AiService {
  private readonly logger = new Logger('AI')

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: DeepseekClient,
    private readonly events: EventsService,
    private readonly lists: ListsService,
  ) {}

  /** 前端据此决定是否放开图片上传入口；Key 优先取用户自填的 */
  capability(user: AuthUser) {
    const cfg = this.client.resolveConfig(user)
    return {
      enabled: Boolean(cfg.apiKey),
      visionEnabled: Boolean(cfg.visionModel),
      keySource: cfg.apiKey ? cfg.source : ('none' as const),
      textModel: cfg.textModel,
      visionModel: cfg.visionModel || null,
      maxImages: MAX_IMAGES,
      timeoutMs: this.client.timeoutMs,
    }
  }

  /**
   * 图文识别：把图片转成 base64 data URI，连同文字一起交给 DeepSeek，
   * 结果清洗后存成一个待确认批次（不会直接写进日程表）。
   */
  async parse(user: AuthUser, rawText: string | undefined, files: Express.Multer.File[]) {
    const tz = safeTimezone(user.timezone)
    const text = (rawText ?? '').trim()
    const images = files ?? []
    const cfg = this.client.resolveConfig(user)

    if (!cfg.apiKey) {
      await this.discardFiles(images)
      throw new ServiceUnavailableException(
        '尚未配置 DeepSeek API Key：请到「设置 → AI 识别」填入你自己的 Key，或联系管理员配置服务器级 Key',
      )
    }
    if (images.length && !cfg.visionModel) {
      await this.discardFiles(images)
      throw new BadRequestException('未配置视觉模型：请仅使用文字识别，或在「设置 → AI 识别」中填写视觉模型名')
    }
    if (!text && !images.length) {
      throw new BadRequestException('请输入文字或上传图片')
    }

    const parts: ContentPart[] = [{ type: 'text', text: text || IMAGE_ONLY_USER_TEXT }]
    for (const file of images) {
      const buf = await fsp.readFile(file.path)
      parts.push({
        type: 'image_url',
        image_url: { url: `data:${file.mimetype};base64,${buf.toString('base64')}` },
      })
    }

    const model = images.length ? cfg.visionModel : cfg.textModel
    let result: ChatResult
    try {
      result = await this.client.chat(
        [
          { role: 'system', content: buildSystemPrompt(tz, images.length > 0) },
          { role: 'user', content: parts },
        ],
        model,
        cfg.apiKey,
      )
    } catch (e) {
      // 调用失败时图片已无用处，立即回收
      await this.discardFiles(images)
      throw e
    }

    const drafts = extractEvents(result.content)
      .slice(0, MAX_DRAFTS)
      .map((raw) => sanitizeDraft(raw, tz))

    if (!drafts.length) {
      await this.discardFiles(images)
      throw new NotFoundException('没有识别出日程，请补充更明确的事项与时间描述后重试')
    }

    const imageUrls = images.map((f) => toTmpUrl(f.filename))
    const batch = await this.prisma.aiParseBatch.create({
      data: {
        userId: user.id,
        rawText: text,
        images: imageUrls as unknown as Prisma.InputJsonValue,
        model: result.model,
        usage: {
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
        } as unknown as Prisma.InputJsonValue,
        items: {
          create: drafts.map((payload) => ({
            userId: user.id,
            payload: payload as unknown as Prisma.InputJsonValue,
          })),
        },
      },
      include: { items: { orderBy: { id: 'asc' } } },
    })

    this.logger.log(
      `识别完成 user=${user.id} model=${result.model} 图片=${images.length} 草稿=${drafts.length} tokens=${result.promptTokens}+${result.completionTokens}`,
    )

    return {
      batchId: batch.id,
      model: batch.model,
      images: imageUrls,
      usage: batch.usage,
      items: batch.items.map((i) => ({ itemId: i.id, payload: i.payload as unknown as AiDraftPayload })),
    }
  }

  /** 草稿确认入库：逐条创建日程，缺时间的条目跳过并在 skipped 中回报名字 */
  async confirm(user: AuthUser, dto: ConfirmBatchDto) {
    const tz = safeTimezone(user.timezone)
    const batch = await this.prisma.aiParseBatch.findFirst({
      where: { id: dto.batchId, userId: user.id },
      include: { items: true },
    })
    if (!batch) throw new NotFoundException('识别记录不存在')
    if (batch.status === 'confirmed') throw new BadRequestException('该批草稿已确认入库，请勿重复提交')
    if (batch.status === 'discarded') throw new BadRequestException('该批草稿已被丢弃')

    const itemMap = new Map(batch.items.map((i) => [i.id, i]))
    const created: EventView[] = []
    const skipped: string[] = []

    for (const req of dto.items) {
      const item = itemMap.get(req.itemId)
      if (!item) continue

      // 前端可能改过字段，合并后重新清洗一遍，避免脏数据入库
      const draft = sanitizeDraft({ ...(item.payload as object), ...(req.payload ?? {}) }, tz)
      if (!draft.startAt) {
        skipped.push(draft.title)
        await this.prisma.aiParseItem.update({
          where: { id: item.id },
          data: { selected: false, payload: draft as unknown as Prisma.InputJsonValue },
        })
        continue
      }

      const listId = await this.lists.resolveByName(user.id, draft.listName)
      const event = await this.events.create(
        user.id,
        tz,
        {
          title: draft.title,
          start: draft.startAt,
          end: draft.endAt,
          allDay: draft.allDay,
          rrule: draft.rrule,
          priority: draft.priority,
          status: 'todo',
          location: draft.location,
          notes: draft.notes,
          remind: true,
          remindBefore: draft.remindBefore,
          listId,
        },
        { source: 'ai', batchId: batch.id },
      )

      await this.prisma.aiParseItem.update({
        where: { id: item.id },
        data: {
          eventId: event.id,
          selected: true,
          payload: draft as unknown as Prisma.InputJsonValue,
        },
      })
      created.push(event)
    }

    if (!created.length) {
      throw new BadRequestException(
        skipped.length
          ? `以下日程缺少开始时间，请补充后再确认：${skipped.join('、')}`
          : '没有勾选任何草稿',
      )
    }

    await this.prisma.aiParseBatch.update({ where: { id: batch.id }, data: { status: 'confirmed' } })
    return { total: created.length, items: created, skipped }
  }

  /** 丢弃整批草稿 */
  async discard(user: AuthUser, batchId: string) {
    const batch = await this.prisma.aiParseBatch.findFirst({ where: { id: batchId, userId: user.id } })
    if (!batch) throw new NotFoundException('识别记录不存在')
    if (batch.status === 'confirmed') throw new BadRequestException('已入库的批次无法丢弃')

    await this.prisma.aiParseBatch.update({ where: { id: batch.id }, data: { status: 'discarded' } })
    return { discarded: true }
  }

  /** 历史识别批次 */
  async batches(userId: number, page: number, limit: number): Promise<Page<unknown>> {
    const where = { userId }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.aiParseBatch.count({ where }),
      this.prisma.aiParseBatch.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { items: { select: { id: true, eventId: true, selected: true } } },
      }),
    ])

    return {
      total,
      items: rows.map((b) => ({
        id: b.id,
        status: b.status,
        model: b.model,
        rawText: b.rawText.slice(0, 200),
        images: b.images,
        usage: b.usage,
        createdAt: b.createdAt,
        itemCount: b.items.length,
        importedCount: b.items.filter((i) => i.eventId).length,
      })),
    }
  }

  /** 单批草稿详情，供历史面板展开查看 */
  async batchDetail(userId: number, batchId: string) {
    const batch = await this.prisma.aiParseBatch.findFirst({
      where: { id: batchId, userId },
      include: { items: { orderBy: { id: 'asc' } } },
    })
    if (!batch) throw new NotFoundException('识别记录不存在')
    return {
      id: batch.id,
      status: batch.status,
      model: batch.model,
      rawText: batch.rawText,
      images: batch.images,
      usage: batch.usage,
      createdAt: batch.createdAt,
      items: batch.items.map((i) => ({
        itemId: i.id,
        eventId: i.eventId,
        selected: i.selected,
        payload: i.payload as unknown as AiDraftPayload,
      })),
    }
  }

  /** 识别失败或批次作废时回收临时图片 */
  private async discardFiles(files: Express.Multer.File[]): Promise<void> {
    for (const file of files) {
      await fsp.unlink(file.path).catch(() => undefined)
    }
  }
}
