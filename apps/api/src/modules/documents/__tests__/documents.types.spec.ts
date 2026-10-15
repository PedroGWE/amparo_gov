import { BadRequestException, ConflictException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { DocumentsController } from '../documents.controller'
import { DocumentsService } from '../documents.service'

function setup() {
  const category = { id: 'category-tenant-a', name: 'Outros documentos', order: 100 }
  const prisma = {
    institutionalDocCategory: {
      count: jest.fn().mockResolvedValue(4),
      upsert: jest.fn().mockResolvedValue(category),
    },
    institutionalDocType: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockResolvedValue({
          id: 'custom-type',
          name: 'Contrato social',
          required: false,
          default_validity_days: null,
        }),
    },
  }
  const service = new DocumentsService(prisma as any, {} as any)
  return { prisma, service, category, controller: new DocumentsController(service) }
}

describe('Tipos personalizados de documentos', () => {
  it('normaliza o nome e cria na categoria da instituição autenticada', async () => {
    const { prisma, controller, category } = setup()
    const result = await controller.createType('tenant-a', {
      name: '  Contrato   social  ',
      tenant_id: 'tenant-b',
      category_id: 'foreign-category',
    })
    expect(prisma.institutionalDocType.findFirst).toHaveBeenCalledWith({
      where: {
        category: { tenant_id: 'tenant-a' },
        name: { equals: 'Contrato social', mode: 'insensitive' },
      },
      select: { id: true },
    })
    expect(prisma.institutionalDocCategory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenant_id_name: { tenant_id: 'tenant-a', name: 'Outros documentos' } },
        create: { tenant_id: 'tenant-a', name: 'Outros documentos', order: 100 },
      }),
    )
    expect(prisma.institutionalDocType.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { category_id: category.id, name: 'Contrato social', required: false },
      }),
    )
    expect(result).toMatchObject({
      id: 'custom-type',
      name: 'Contrato social',
      status: 'PENDENTE',
      document: null,
      category,
    })
  })

  it.each([{}, { name: '' }, { name: '   ' }, { name: 'a'.repeat(151) }, { name: 42 }])(
    'rejeita nome inválido: %j',
    (body) => {
      const { controller, prisma } = setup()
      expect(() => controller.createType('tenant-a', body)).toThrow(BadRequestException)
      expect(prisma.institutionalDocType.create).not.toHaveBeenCalled()
    },
  )

  it('rejeita nome já cadastrado sem criar categoria nem tipo', async () => {
    const { service, prisma } = setup()
    prisma.institutionalDocType.findFirst.mockResolvedValue({ id: 'existing' })
    await expect(
      service.createType('tenant-a', { name: 'Contrato social' }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(prisma.institutionalDocCategory.upsert).not.toHaveBeenCalled()
    expect(prisma.institutionalDocType.create).not.toHaveBeenCalled()
  })

  it('trata duplicação simultânea com mensagem de conflito', async () => {
    const { service, prisma } = setup()
    prisma.institutionalDocType.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '5' }),
    )
    await expect(
      service.createType('tenant-a', { name: 'Contrato social' }),
    ).rejects.toBeInstanceOf(ConflictException)
  })
})
