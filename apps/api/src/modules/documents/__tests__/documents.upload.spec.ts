import { BadRequestException, NotFoundException } from '@nestjs/common'
import { OrganizationDocumentStatus } from '@prisma/client'
import { DOCUMENT_MAX_SIZE_BYTES } from '@cidadao/shared'
import { DocumentsService, type UploadedDocFile } from '../documents.service'

function makeMocks() {
  const prisma = {
    institutionalDocType: {
      findFirst: jest.fn().mockResolvedValue({ id: 'type-1' }),
    },
    institutionalDocument: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockImplementation(({ create }: any) => Promise.resolve(create)),
    },
  }
  const storage = {
    save: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    readStream: jest.fn(),
  }
  return { prisma, storage }
}

const pdf = (size = 100): UploadedDocFile => ({
  buffer: Buffer.alloc(size),
  mimetype: 'application/pdf',
  filename: 'doc.pdf',
})

describe('DocumentsService.upload', () => {
  it.each([
    ['contrato.doc', 'application/msword'],
    ['contrato.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ])('aceita Word e preserva formato no download: %s', async (filename, mimetype) => {
    const { prisma, storage } = makeMocks()
    const service = new DocumentsService(prisma as any, storage as any)
    const doc = await service.upload('t1', 'u1', 'type-1', { ...pdf(), filename, mimetype })
    expect(doc.file_name).toBe(filename)
    expect(doc.mime_type).toBe(mimetype)
    expect(storage.save).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(filename.endsWith('.docx') ? '\\.docx$' : '\\.doc$')),
      expect.any(Buffer),
    )
  })

  it('mantém limite de tamanho para Word', async () => {
    const { prisma, storage } = makeMocks()
    const service = new DocumentsService(prisma as any, storage as any)
    await expect(
      service.upload('t1', 'u1', 'type-1', {
        ...pdf(DOCUMENT_MAX_SIZE_BYTES + 1),
        filename: 'grande.doc',
        mimetype: 'application/msword',
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(storage.save).not.toHaveBeenCalled()
  })

  it('rejeita mime não permitido', async () => {
    const { prisma, storage } = makeMocks()
    const service = new DocumentsService(prisma as any, storage as any)

    await expect(
      service.upload('t1', 'u1', 'type-1', { ...pdf(), mimetype: 'application/zip' }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(storage.save).not.toHaveBeenCalled()
  })

  it('aceita um PDF no limite de 20 MB', async () => {
    const { prisma, storage } = makeMocks()
    const service = new DocumentsService(prisma as any, storage as any)
    const file = pdf(20 * 1024 * 1024)

    const doc = await service.upload('t1', 'u1', 'type-1', file)

    expect(doc.size_bytes).toBe(20 * 1024 * 1024)
    expect(storage.save).toHaveBeenCalledTimes(1)
    expect(storage.save.mock.calls[0][1]).toBe(file.buffer)
  })

  it('rejeita arquivo um byte acima de 20 MB', async () => {
    const { prisma, storage } = makeMocks()
    const service = new DocumentsService(prisma as any, storage as any)

    await expect(
      service.upload('t1', 'u1', 'type-1', pdf(20 * 1024 * 1024 + 1)),
    ).rejects.toThrow('Arquivo excede o tamanho máximo de 20 MB.')
    expect(storage.save).not.toHaveBeenCalled()
  })

  it('rejeita tipo de documento de outro tenant (isolamento)', async () => {
    const { prisma, storage } = makeMocks()
    prisma.institutionalDocType.findFirst.mockResolvedValue(null)
    const service = new DocumentsService(prisma as any, storage as any)

    await expect(service.upload('t1', 'u1', 'type-de-outro-tenant', pdf())).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(prisma.institutionalDocType.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'type-de-outro-tenant', category: { tenant_id: 't1' } },
      }),
    )
  })

  it('salva com status VALIDO quando validade é futura', async () => {
    const { prisma, storage } = makeMocks()
    const service = new DocumentsService(prisma as any, storage as any)

    const future = new Date(Date.now() + 86_400_000).toISOString()
    const doc: any = await service.upload('t1', 'u1', 'type-1', pdf(), future)

    expect(storage.save).toHaveBeenCalledTimes(1)
    expect(doc.status).toBe(OrganizationDocumentStatus.VALIDO)
    expect(doc.tenant_id).toBe('t1')
  })

  it('salva com status VENCIDO quando validade já passou', async () => {
    const { prisma, storage } = makeMocks()
    const service = new DocumentsService(prisma as any, storage as any)

    const doc: any = await service.upload('t1', 'u1', 'type-1', pdf(), '2020-01-01')
    expect(doc.status).toBe(OrganizationDocumentStatus.VENCIDO)
  })

  it('substitui arquivo anterior no reenvio (upsert + delete do arquivo antigo)', async () => {
    const { prisma, storage } = makeMocks()
    prisma.institutionalDocument.findUnique.mockResolvedValue({
      id: 'doc-1',
      file_url: 't1/old.pdf',
    })
    const service = new DocumentsService(prisma as any, storage as any)

    await service.upload('t1', 'u1', 'type-1', pdf())

    expect(storage.delete).toHaveBeenCalledWith('t1/old.pdf')
    expect(prisma.institutionalDocument.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenant_id_doc_type_id: { tenant_id: 't1', doc_type_id: 'type-1' } },
      }),
    )
  })

  it('preserva o arquivo anterior e remove o novo quando o banco falha', async () => {
    const { prisma, storage } = makeMocks()
    prisma.institutionalDocument.findUnique.mockResolvedValue({
      id: 'doc-1',
      file_url: 't1/old.pdf',
    })
    prisma.institutionalDocument.upsert.mockRejectedValue(new Error('database unavailable'))
    const service = new DocumentsService(prisma as any, storage as any)

    await expect(service.upload('t1', 'u1', 'type-1', pdf())).rejects.toThrow(
      'database unavailable',
    )

    expect(storage.delete).toHaveBeenCalledTimes(1)
    expect(storage.delete).not.toHaveBeenCalledWith('t1/old.pdf')
  })
})
