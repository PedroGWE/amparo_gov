import { ConflictException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { InventoryService } from './inventory.service'

describe('InventoryService movements', () => {
  function setup(updatedCount = 1, itemFound = true) {
    const tx = {
      inventoryItem: {
        findFirst: jest.fn().mockResolvedValue(itemFound ? { id: 'item-1' } : null),
        updateMany: jest.fn().mockResolvedValue({ count: updatedCount }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ quantity: new Prisma.Decimal(4) }),
      },
      inventoryMovement: { create: jest.fn().mockResolvedValue({ id: 'movement-1' }) },
    }
    const prisma = { $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)) }
    return { service: new InventoryService(prisma as never), tx }
  }

  it('keeps movements within the actor tenant and records the resulting balance', async () => {
    const { service, tx } = setup()
    await service.move('tenant-1', 'user-1', 'item-1', { type: 'SAIDA', quantity: 2 })

    expect(tx.inventoryItem.findFirst).toHaveBeenCalledWith({ where: { id: 'item-1', tenant_id: 'tenant-1', is_active: true } })
    expect(tx.inventoryItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'item-1', tenant_id: 'tenant-1', is_active: true, quantity: { gte: new Prisma.Decimal(2) } },
      data: { quantity: { decrement: new Prisma.Decimal(2) } },
    })
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenant_id: 'tenant-1', item_id: 'item-1', created_by: 'user-1', balance_after: new Prisma.Decimal(4) }),
    }))
  })

  it('rejects a withdrawal when the stock update cannot reserve the requested quantity', async () => {
    const { service, tx } = setup(0)
    await expect(service.move('tenant-1', 'user-1', 'item-1', { type: 'SAIDA', quantity: 8 })).rejects.toBeInstanceOf(ConflictException)
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled()
  })

  it('does not move an item outside the actor tenant', async () => {
    const { service, tx } = setup(1, false)
    await expect(service.move('tenant-1', 'user-1', 'item-2', { type: 'ENTRADA', quantity: 2 })).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.inventoryItem.updateMany).not.toHaveBeenCalled()
  })
})
