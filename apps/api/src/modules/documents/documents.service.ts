import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { OrganizationDocumentStatus, Prisma } from '@prisma/client'
import { extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  DOCUMENT_MAX_SIZE_BYTES,
  DOCUMENT_MAX_SIZE_MB,
  DOCUMENT_FORMAT_LABEL,
  isAllowedDocumentMime,
  type CreateInstitutionalDocTypeInput,
  type InstitutionalDocStatus,
} from '@cidadao/shared'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from './storage/storage.service'
import { DEFAULT_DOCUMENT_CATEGORIES } from './default-documents'

export interface UploadedDocFile {
  buffer: Buffer
  mimetype: string
  filename: string
}

/** Regra de status: com arquivo e (validade nula ou futura) = VALIDO; validade passada = VENCIDO. */
export function statusForValidity(
  validUntil: Date | null,
  now = new Date(),
): OrganizationDocumentStatus {
  if (validUntil && validUntil.getTime() < now.getTime()) return OrganizationDocumentStatus.VENCIDO
  return OrganizationDocumentStatus.VALIDO
}

const DOC_SELECT = {
  id: true,
  file_name: true,
  mime_type: true,
  size_bytes: true,
  sent_at: true,
  valid_until: true,
  status: true,
  doc_type_id: true,
  uploader: { select: { id: true, name: true } },
} satisfies Prisma.InstitutionalDocumentSelect

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  /** Cria as categorias/tipos padrão para o tenant, se ainda não existirem (idempotente). */
  async ensureDefaults(tenantId: string) {
    const count = await this.prisma.institutionalDocCategory.count({
      where: { tenant_id: tenantId },
    })
    if (count > 0) return
    for (const cat of DEFAULT_DOCUMENT_CATEGORIES) {
      await this.prisma.institutionalDocCategory.create({
        data: {
          tenant_id: tenantId,
          name: cat.name,
          order: cat.order,
          types: {
            create: cat.types.map((t) => ({
              name: t.name,
              required: t.required ?? false,
              default_validity_days: t.default_validity_days ?? null,
            })),
          },
        },
      })
    }
  }

  async createType(tenantId: string, input: CreateInstitutionalDocTypeInput) {
    await this.ensureDefaults(tenantId)
    const existing = await this.prisma.institutionalDocType.findFirst({
      where: {
        category: { tenant_id: tenantId },
        name: { equals: input.name, mode: 'insensitive' },
      },
      select: { id: true },
    })
    if (existing)
      throw new ConflictException(
        'Já existe um tipo de documento com esse nome. Selecione-o na lista.',
      )

    const category = await this.prisma.institutionalDocCategory.upsert({
      where: { tenant_id_name: { tenant_id: tenantId, name: 'Outros documentos' } },
      create: { tenant_id: tenantId, name: 'Outros documentos', order: 100 },
      update: {},
      select: { id: true, name: true, order: true },
    })
    try {
      const row = await this.prisma.institutionalDocType.create({
        data: { category_id: category.id, name: input.name, required: false },
        select: { id: true, name: true, required: true, default_validity_days: true },
      })
      return { ...row, category, status: 'PENDENTE' as const, document: null }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          'Já existe um tipo de documento com esse nome. Selecione-o na lista.',
        )
      }
      throw error
    }
  }

  /** Persiste a transição VALIDO→VENCIDO dos documentos cuja validade expirou. */
  async refreshExpired(tenantId: string, now = new Date()) {
    await this.prisma.institutionalDocument.updateMany({
      where: {
        tenant_id: tenantId,
        status: OrganizationDocumentStatus.VALIDO,
        valid_until: { lt: now },
      },
      data: { status: OrganizationDocumentStatus.VENCIDO },
    })
  }

  async summary(tenantId: string) {
    await this.ensureDefaults(tenantId)
    await this.refreshExpired(tenantId)

    const [totalTypes, validos, vencidos] = await Promise.all([
      this.prisma.institutionalDocType.count({
        where: { category: { tenant_id: tenantId } },
      }),
      this.prisma.institutionalDocument.count({
        where: { tenant_id: tenantId, status: OrganizationDocumentStatus.VALIDO },
      }),
      this.prisma.institutionalDocument.count({
        where: { tenant_id: tenantId, status: OrganizationDocumentStatus.VENCIDO },
      }),
    ])

    return { validos, vencidos, pendentes: Math.max(totalTypes - validos - vencidos, 0) }
  }

  /** Listagem agrupada por categoria; tipos sem documento aparecem como PENDENTE. */
  async list(tenantId: string, filter: { status?: InstitutionalDocStatus; category_id?: string }) {
    await this.ensureDefaults(tenantId)
    await this.refreshExpired(tenantId)

    const categories = await this.prisma.institutionalDocCategory.findMany({
      where: { tenant_id: tenantId, ...(filter.category_id && { id: filter.category_id }) },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        name: true,
        order: true,
        types: {
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            required: true,
            default_validity_days: true,
            documents: { where: { tenant_id: tenantId }, select: DOC_SELECT, take: 1 },
          },
        },
      },
    })

    return categories
      .map((cat) => ({
        id: cat.id,
        name: cat.name,
        order: cat.order,
        types: cat.types
          .map((t) => {
            const document = t.documents[0] ?? null
            const status: InstitutionalDocStatus = document
              ? (document.status as InstitutionalDocStatus)
              : 'PENDENTE'
            return {
              id: t.id,
              name: t.name,
              required: t.required,
              default_validity_days: t.default_validity_days,
              status,
              document,
            }
          })
          .filter((t) => !filter.status || t.status === filter.status),
      }))
      .filter((cat) => cat.types.length > 0)
  }

  async upload(
    tenantId: string,
    userId: string,
    docTypeId: string,
    file: UploadedDocFile,
    validUntil?: string,
  ) {
    if (!isAllowedDocumentMime(file.mimetype)) {
      throw new BadRequestException(`Formato não permitido. Envie ${DOCUMENT_FORMAT_LABEL}.`)
    }
    if (file.buffer.length > DOCUMENT_MAX_SIZE_BYTES) {
      throw new BadRequestException(`Arquivo excede o tamanho máximo de ${DOCUMENT_MAX_SIZE_MB} MB.`)
    }

    // tipo precisa pertencer a uma categoria deste tenant (isolamento multi-tenant)
    const docType = await this.prisma.institutionalDocType.findFirst({
      where: { id: docTypeId, category: { tenant_id: tenantId } },
      select: { id: true },
    })
    if (!docType) throw new NotFoundException('Tipo de documento não encontrado')

    const validUntilDate = validUntil ? new Date(validUntil) : null
    if (validUntilDate && Number.isNaN(validUntilDate.getTime())) {
      throw new BadRequestException('Data de validade inválida')
    }

    const existing = await this.prisma.institutionalDocument.findUnique({
      where: { tenant_id_doc_type_id: { tenant_id: tenantId, doc_type_id: docTypeId } },
      select: { id: true, file_url: true },
    })

    const key = `${tenantId}/${randomUUID()}${extname(file.filename) || ''}`
    await this.storage.save(key, file.buffer)

    const data = {
      file_url: key,
      file_name: file.filename,
      mime_type: file.mimetype,
      size_bytes: file.buffer.length,
      sent_at: new Date(),
      valid_until: validUntilDate,
      status: statusForValidity(validUntilDate),
      uploaded_by: userId,
    }

    try {
      const document = await this.prisma.institutionalDocument.upsert({
        where: { tenant_id_doc_type_id: { tenant_id: tenantId, doc_type_id: docTypeId } },
        create: { tenant_id: tenantId, doc_type_id: docTypeId, ...data },
        update: data,
        select: DOC_SELECT,
      })
      if (existing?.file_url && existing.file_url !== key) {
        await this.storage.delete(existing.file_url).catch(() => undefined)
      }
      return document
    } catch (error) {
      await this.storage.delete(key).catch(() => undefined)
      throw error
    }
  }

  /** Remove o arquivo e o registro; o tipo volta a aparecer como PENDENTE. */
  async remove(tenantId: string, id: string) {
    const doc = await this.prisma.institutionalDocument.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true, file_url: true },
    })
    if (!doc) throw new NotFoundException('Documento não encontrado')

    await this.prisma.institutionalDocument.delete({ where: { id: doc.id } })
    await this.storage.delete(doc.file_url).catch(() => undefined)
    return { success: true }
  }

  async getDownload(tenantId: string, id: string) {
    const doc = await this.prisma.institutionalDocument.findFirst({
      where: { id, tenant_id: tenantId },
      select: { file_url: true, file_name: true, mime_type: true },
    })
    if (!doc) throw new NotFoundException('Documento não encontrado')
    return {
      stream: this.storage.readStream(doc.file_url),
      filename: doc.file_name,
      mimeType: doc.mime_type,
    }
  }
}
