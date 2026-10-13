import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { CreateInventoryItemDto, InventoryMovementDto, InventoryQueryDto, UpdateInventoryItemDto } from './dto/inventory.dto'

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async list(tenantId: string, query: InventoryQueryDto) {
    const page = query.page ?? 1
    const limit = query.limit ?? 50
    const where: Prisma.InventoryItemWhereInput = {
      tenant_id: tenantId,
      ...(query.active !== 'all' && { is_active: query.active !== 'false' }),
      ...(query.search?.trim() && {
        OR: [
          { name: { contains: query.search.trim(), mode: 'insensitive' } },
          { sku: { contains: query.search.trim(), mode: 'insensitive' } },
          { category: { contains: query.search.trim(), mode: 'insensitive' } },
        ],
      }),
    }
    const [data, total] = await Promise.all([
      this.prisma.inventoryItem.findMany({ where, orderBy: { name: 'asc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.inventoryItem.count({ where }),
    ])
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
  }

  async summary(tenantId: string) {
    const items = await this.prisma.inventoryItem.findMany({
      where: { tenant_id: tenantId, is_active: true },
      select: { quantity: true, minimum_quantity: true },
    })
    return {
      total: items.length,
      low_stock: items.filter((item) => item.quantity.lte(item.minimum_quantity)).length,
      out_of_stock: items.filter((item) => item.quantity.isZero()).length,
    }
  }

  async create(tenantId: string, dto: CreateInventoryItemDto) {
    try {
      return await this.prisma.inventoryItem.create({
        data: {
          tenant_id: tenantId,
          name: dto.name.trim(),
          sku: dto.sku?.trim() || null,
          category: dto.category?.trim() || null,
          unit: dto.unit?.trim() || 'UN',
          location: dto.location?.trim() || null,
          minimum_quantity: dto.minimum_quantity ?? 0,
        },
      })
    } catch (error) {
      this.handleUniqueSku(error)
    }
  }

  async update(tenantId: string, id: string, dto: UpdateInventoryItemDto) {
    await this.assertItem(tenantId, id)
    try {
      return await this.prisma.inventoryItem.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.sku !== undefined && { sku: dto.sku.trim() || null }),
          ...(dto.category !== undefined && { category: dto.category.trim() || null }),
          ...(dto.unit !== undefined && { unit: dto.unit.trim() || 'UN' }),
          ...(dto.location !== undefined && { location: dto.location.trim() || null }),
          ...(dto.minimum_quantity !== undefined && { minimum_quantity: dto.minimum_quantity }),
          ...(dto.is_active !== undefined && { is_active: dto.is_active }),
        },
      })
    } catch (error) {
      this.handleUniqueSku(error)
    }
  }

  async history(tenantId: string, itemId?: string) {
    return this.prisma.inventoryMovement.findMany({
      where: { tenant_id: tenantId, ...(itemId && { item_id: itemId }) },
      include: { item: { select: { id: true, name: true, unit: true } }, actor: { select: { name: true } } },
      orderBy: { created_at: 'desc' },
      take: 100,
    })
  }

  async move(tenantId: string, userId: string, itemId: string, dto: InventoryMovementDto) {
    const quantity = new Prisma.Decimal(dto.quantity)
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findFirst({ where: { id: itemId, tenant_id: tenantId, is_active: true } })
      if (!item) throw new NotFoundException('Item de estoque não encontrado')

      const updated = await tx.inventoryItem.updateMany({
        where: {
          id: itemId,
          tenant_id: tenantId,
          is_active: true,
          ...(dto.type === 'SAIDA' && { quantity: { gte: quantity } }),
        },
        data: { quantity: dto.type === 'ENTRADA' ? { increment: quantity } : { decrement: quantity } },
      })
      if (updated.count !== 1) throw new ConflictException('Saldo insuficiente para esta saída')

      const balance = await tx.inventoryItem.findUniqueOrThrow({ where: { id: itemId }, select: { quantity: true } })
      return tx.inventoryMovement.create({
        data: {
          tenant_id: tenantId,
          item_id: itemId,
          type: dto.type,
          quantity,
          balance_after: balance.quantity,
          note: dto.note?.trim() || null,
          created_by: userId,
        },
        include: { item: { select: { id: true, name: true, unit: true } }, actor: { select: { name: true } } },
      })
    })
  }

  private async assertItem(tenantId: string, id: string) {
    const item = await this.prisma.inventoryItem.findFirst({ where: { id, tenant_id: tenantId }, select: { id: true } })
    if (!item) throw new NotFoundException('Item de estoque não encontrado')
  }

  private handleUniqueSku(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Código do item já cadastrado nesta organização')
    }
    throw error
  }
}
