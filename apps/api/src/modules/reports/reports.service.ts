import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { QueryReportDto } from './dto/query-report.dto'

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  private async filters(tenantId: string, query: QueryReportDto) {
    if (query.project_id) {
      const project = await this.prisma.project.findFirst({
        where: { id: query.project_id, tenant_id: tenantId, deleted_at: null },
        select: { id: true },
      })
      if (!project) throw new NotFoundException('Projeto não encontrado')
    }
    const date = query.date_from || query.date_to
      ? {
          ...(query.date_from && { gte: new Date(query.date_from) }),
          ...(query.date_to && { lte: new Date(query.date_to) }),
        }
      : undefined
    return { project_id: query.project_id, date }
  }

  async summary(tenantId: string, query: QueryReportDto) {
    const filter = await this.filters(tenantId, query)
    const txWhere: Prisma.TransactionWhereInput = {
      tenant_id: tenantId,
      status: { in: ['APROVADO', 'PAGO'] },
      ...(filter.project_id && { project_id: filter.project_id }),
      ...(filter.date && { date: filter.date }),
    }
    const [projects, beneficiaries, revenues, expenses, documents, pendingDocuments] = await Promise.all([
      this.prisma.project.count({
        where: { tenant_id: tenantId, deleted_at: null, ...(filter.project_id && { id: filter.project_id }) },
      }),
      this.prisma.beneficiary.count({
        where: {
          tenant_id: tenantId,
          deleted_at: null,
          ...(filter.project_id && {
            OR: [{ project_id: filter.project_id }, { vinculos_projetos: { some: { project_id: filter.project_id } } }],
          }),
        },
      }),
      this.prisma.transaction.aggregate({ where: { ...txWhere, type: 'RECEITA' }, _sum: { amount: true } }),
      this.prisma.transaction.aggregate({ where: { ...txWhere, type: 'DESPESA' }, _sum: { amount: true } }),
      this.prisma.institutionalDocument.count({ where: { tenant_id: tenantId } }),
      this.prisma.institutionalDocument.count({
        where: { tenant_id: tenantId, OR: [{ status: 'PENDENTE' }, { status: 'VENCIDO' }] },
      }),
    ])
    const receitas = Number(revenues._sum.amount ?? 0)
    const despesas = Number(expenses._sum.amount ?? 0)
    return { projects, beneficiaries, receitas, despesas, saldo: receitas - despesas, documents, pendingDocuments }
  }

  async csv(tenantId: string, query: QueryReportDto) {
    const filter = await this.filters(tenantId, query)
    const transactions = await this.prisma.transaction.findMany({
      where: {
        tenant_id: tenantId,
        ...(filter.project_id && { project_id: filter.project_id }),
        ...(filter.date && { date: filter.date }),
      },
      select: { date: true, type: true, status: true, description: true, amount: true, category: true, project: { select: { name: true } } },
      orderBy: { date: 'asc' },
    })
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
    return [
      ['Data', 'Tipo', 'Situação', 'Descrição', 'Valor', 'Categoria', 'Projeto'].map(escape).join(','),
      ...transactions.map((item) => [
        item.date.toISOString().slice(0, 10), item.type, item.status, item.description,
        item.amount.toFixed(2), item.category, item.project?.name,
      ].map(escape).join(',')),
    ].join('\r\n')
  }
}
