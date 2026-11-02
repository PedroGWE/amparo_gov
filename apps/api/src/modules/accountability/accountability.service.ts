import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { AccountabilityReportStatus, Prisma, TransactionType } from '@prisma/client'
import type { CreateAccountabilityDto } from './dto/accountability.dto'
import { csvCell } from './monthly-rules'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class AccountabilityService {
  constructor(private prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.accountabilityReport.findMany({
      where: { tenant_id: tenantId },
      include: { project: { select: { id: true, name: true } }, _count: { select: { items: true, glosses: true, fiscal_notes: true } } },
      orderBy: { updated_at: 'desc' },
    })
  }

  async findOne(tenantId: string, id: string) {
    const report = await this.prisma.accountabilityReport.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        project: { select: { id: true, name: true } },
        items: { include: { transaction: { select: { id: true, date: true, type: true, status: true,
          invoices: { where: { tenant_id: tenantId }, select: { id: true, number: true, supplier_name: true, status: true } } } } }, orderBy: { created_at: 'asc' } },
        glosses: true,
        fiscal_notes: { select: { id: true, transaction_id: true, status: true, environment: true,
          customer_name: true, amount: true, provider_message: true, number: true,
          access_key: true, xml_storage_key: true, pdf_storage_key: true } },
      },
    })
    if (!report) throw new NotFoundException('Prestação de contas não encontrada')
    return report
  }

  async create(tenantId: string, userId: string, dto: CreateAccountabilityDto) {
    const start = new Date(dto.period_start)
    const end = new Date(dto.period_end)
    if (end < start) throw new BadRequestException('A data final deve ser posterior à inicial')
    if (dto.project_id) {
      const project = await this.prisma.project.findFirst({ where: { id: dto.project_id, tenant_id: tenantId, deleted_at: null } })
      if (!project) throw new NotFoundException('Projeto não encontrado')
    }
    return this.prisma.accountabilityReport.create({ data: {
      tenant_id: tenantId, created_by: userId, title: dto.title, project_id: dto.project_id,
      period_start: start, period_end: end, type: dto.type, notes: dto.notes,
      total_received: new Prisma.Decimal(0), total_spent: new Prisma.Decimal(0), balance: new Prisma.Decimal(0),
    } })
  }

  async consolidate(tenantId: string, id: string) {
    const report = await this.findOne(tenantId, id)
    if (report.status !== AccountabilityReportStatus.RASCUNHO && report.status !== AccountabilityReportStatus.PENDENTE_CORRECAO) {
      throw new BadRequestException('Somente prestações em rascunho ou correção podem ser recalculadas')
    }
    const endExclusive = new Date(report.period_end)
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1)
    const transactions = await this.prisma.transaction.findMany({
      where: {
        tenant_id: tenantId, status: 'PAGO',
        OR: [{ paid_at: { gte: report.period_start, lt: endExclusive } },
          { paid_at: null, date: { gte: report.period_start, lt: endExclusive } }],
        ...(report.project_id && { project_id: report.project_id }),
      },
      select: { id: true, type: true, description: true, amount: true, category: true },
    })
    const received = transactions.filter((item) => item.type === TransactionType.RECEITA).reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0))
    const spent = transactions.filter((item) => item.type === TransactionType.DESPESA).reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0))
    return this.prisma.$transaction(async (tx) => {
      // Preserva documentos e glosas dos itens existentes ao recalcular.
      const existing = await tx.accountabilityItem.findMany({ where: { report_id: id } })
      for (const item of transactions) {
        const old = existing.find((row) => row.transaction_id === item.id)
        const data = { description: item.description, amount: item.amount, category: item.category, status: 'CONSOLIDADO' }
        if (old) await tx.accountabilityItem.update({ where: { id: old.id }, data })
        else await tx.accountabilityItem.create({ data: { report_id: id, transaction_id: item.id, ...data } })
      }
      const selectedIds = new Set(transactions.map((item) => item.id))
      for (const old of existing.filter((row) => row.transaction_id && !selectedIds.has(row.transaction_id))) {
        const hasEvidence = old.document_ids.length > 0 || await tx.accountabilityGloss.count({ where: { item_id: old.id } }) > 0 ||
          await tx.fiscalNote.count({ where: { report_id: id, transaction_id: old.transaction_id! } }) > 0
        if (hasEvidence) throw new BadRequestException('Uma transação com evidências saiu do período; revise-a antes de recalcular')
        await tx.accountabilityItem.delete({ where: { id: old.id } })
      }
      return tx.accountabilityReport.update({ where: { id }, data: { total_received: received, total_spent: spent, balance: received.minus(spent) } })
    })
  }

  async updateStatus(tenantId: string, id: string, next: AccountabilityReportStatus) {
    const report = await this.findOne(tenantId, id)
    const allowed: Record<AccountabilityReportStatus, AccountabilityReportStatus[]> = {
      RASCUNHO: ['EM_REVISAO'], EM_REVISAO: ['RASCUNHO', 'SUBMETIDO'], SUBMETIDO: ['EM_ANALISE'],
      EM_ANALISE: ['APROVADO', 'REPROVADO', 'PENDENTE_CORRECAO'], APROVADO: [], REPROVADO: [],
      PENDENTE_CORRECAO: ['EM_REVISAO'],
    }
    if (!allowed[report.status].includes(next)) throw new BadRequestException('Transição de situação inválida')
    if (next === 'SUBMETIDO' && report.fiscal_notes.some((note) => note.status !== 'AUTORIZADA' || !note.xml_storage_key)) {
      throw new BadRequestException('Existem NFS-e vinculadas sem autorização ou XML arquivado')
    }
    const changed = await this.prisma.accountabilityReport.updateMany({
      where: { id, tenant_id: tenantId, status: report.status },
      data: {
        status: next,
        ...(next === 'SUBMETIDO' && { submitted_at: new Date() }),
        ...(next === 'APROVADO' && { approved_at: new Date() }),
      },
    })
    if (changed.count !== 1) throw new BadRequestException('A prestação foi alterada por outro usuário; atualize a página')
    return this.findOne(tenantId, id)
  }

  async csv(tenantId: string, id: string) {
    const report = await this.findOne(tenantId, id)
    const escape = csvCell
    const fiscalByTransaction = new Map(report.fiscal_notes.map((note) => [note.transaction_id, note]))
    return [
      ['Transação', 'Data', 'Tipo', 'Descrição', 'Categoria', 'Valor', 'Situação', 'NFS-e', 'Chave NFS-e', 'Situação fiscal', 'Notas de fornecedores'].map(escape).join(','),
      ...report.items.map((item) => {
        const fiscal = fiscalByTransaction.get(item.transaction_id ?? '')
        return [item.transaction_id, item.transaction?.date.toISOString().slice(0, 10), item.transaction?.type,
          item.description, item.category, item.amount.toFixed(2), item.status,
          fiscal?.number, fiscal?.access_key, fiscal?.status,
          item.transaction?.invoices.map((invoice) => `${invoice.number ?? 's/n'} (${invoice.status})`).join('; ')].map(escape).join(',')
      }),
    ].join('\r\n')
  }
}
