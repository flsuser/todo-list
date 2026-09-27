import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CreateListDto, SortListDto, UpdateListDto } from './dto'

const DEFAULT_COLOR = '#409EFF'

@Injectable()
export class ListsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 全部清单，附带各清单下未完成的日程数 */
  async findAll(userId: number) {
    const lists = await this.prisma.eventList.findMany({
      where: { userId },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    })
    const counted = await this.prisma.event.groupBy({
      by: ['listId'],
      where: { userId, listId: { not: null }, status: { in: ['todo', 'doing'] } },
      orderBy: { listId: 'asc' },
      _count: { _all: true },
    })

    const counts = new Map<number, number>()
    for (const row of counted) {
      if (row.listId === null) continue
      // groupBy 的 _count 返回类型是联合型，这里取 _all 并兼容缺失
      const total = (row._count as { _all?: number } | undefined)?._all ?? 0
      counts.set(row.listId, total)
    }
    return lists.map((l) => ({ ...l, activeCount: counts.get(l.id) ?? 0 }))
  }

  async create(userId: number, dto: CreateListDto) {
    const sortOrder = await this.prisma.eventList.count({ where: { userId } })
    try {
      return await this.prisma.eventList.create({
        data: {
          userId,
          name: dto.name.trim(),
          color: dto.color ?? DEFAULT_COLOR,
          sortOrder,
        },
      })
    } catch (e) {
      throw this.nameError(e)
    }
  }

  async update(userId: number, id: number, dto: UpdateListDto) {
    await this.assertOwned(userId, id)
    try {
      return await this.prisma.eventList.update({
        where: { id },
        data: { name: dto.name.trim(), color: dto.color ?? DEFAULT_COLOR },
      })
    } catch (e) {
      throw this.nameError(e)
    }
  }

  /** 删除清单；其下日程的 listId 由 onDelete: SetNull 自动解绑 */
  async remove(userId: number, id: number) {
    await this.assertOwned(userId, id)
    await this.prisma.eventList.delete({ where: { id } })
    return { deleted: true }
  }

  /** 拖拽排序：按传入顺序重写 sortOrder */
  async sort(userId: number, dto: SortListDto) {
    await this.prisma.$transaction(
      dto.ids.map((id, index) =>
        this.prisma.eventList.updateMany({
          where: { id, userId },
          data: { sortOrder: index },
        }),
      ),
    )
    return this.findAll(userId)
  }

  /** AI 解析出的清单名 -> id，不存在则自动创建 */
  async resolveByName(userId: number, name?: string | null): Promise<number | null> {
    const trimmed = name?.trim()
    if (!trimmed) return null

    const existing = await this.prisma.eventList.findUnique({
      where: { userId_name: { userId, name: trimmed } },
      select: { id: true },
    })
    if (existing) return existing.id

    try {
      const created = await this.create(userId, { name: trimmed.slice(0, 30) })
      return created.id
    } catch {
      // 并发创建撞唯一键时退回到查询
      const retry = await this.prisma.eventList.findUnique({
        where: { userId_name: { userId, name: trimmed } },
        select: { id: true },
      })
      return retry?.id ?? null
    }
  }

  private async assertOwned(userId: number, id: number) {
    const list = await this.prisma.eventList.findFirst({ where: { id, userId }, select: { id: true } })
    if (!list) throw new NotFoundException('清单不存在')
  }

  private nameError(e: unknown): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ConflictException('已存在同名清单')
    }
    throw e
  }
}
