import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { JwtPayload } from '../auth/types/jwt-payload'

@Injectable()
export class MonthlyAccessGuard implements CanActivate {
  constructor(private readonly db: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user: JwtPayload; params: Record<string, string>; query: Record<string, string>; body?: Record<string, string>; method: string; url: string
    }>()
    const user = request.user
    if (!user) throw new ForbiddenException()
    if (user.permissions.includes('*')) return true
    const { params, query, body } = request
    let projectId = query.project_id || body?.project_id
    if (params.instrumentId) {
      const instrument = await this.db.accountabilityInstrument.findFirst({ where: { id: params.instrumentId, tenant_id: user.tenantId } })
      if (!instrument) throw new NotFoundException('Instrumento não encontrado')
      projectId = instrument.project_id
    } else if (params.expenseId) {
      const expense = await this.db.accountabilityExpense.findFirst({ where: { id: params.expenseId, tenant_id: user.tenantId }, include: { instrument: true } })
      if (!expense) throw new NotFoundException('Despesa não encontrada')
      projectId = expense.instrument.project_id
    } else if (params.paymentId) {
      const payment = await this.db.accountabilityPayment.findFirst({ where: { id: params.paymentId, expense: { tenant_id: user.tenantId } }, include: { expense: { include: { instrument: true } } } })
      if (!payment) throw new NotFoundException('Pagamento não encontrado')
      projectId = payment.expense.instrument.project_id
    } else if (params.deliveryId) {
      const delivery = await this.db.officialDelivery.findFirst({ where: { id: params.deliveryId, instrument: { tenant_id: user.tenantId } }, include: { instrument: true } })
      if (!delivery) throw new NotFoundException('Entrega não encontrada')
      projectId = delivery.instrument.project_id
    } else if (params.mediaId) {
      const media = await this.db.accountabilityMedia.findFirst({ where: { id: params.mediaId, tenant_id: user.tenantId }, include: { instrument: true } })
      if (!media) throw new NotFoundException('Mídia não encontrada')
      projectId = media.instrument.project_id
    } else if (params.id) {
      const month = await this.db.monthlyCompetence.findFirst({ where: { id: params.id, tenant_id: user.tenantId } })
      if (!month) throw new NotFoundException('Competência não encontrada')
      projectId = month.project_id
    } else if (query.instrument_id || body?.instrument_id) {
      const instrument = await this.db.accountabilityInstrument.findFirst({ where: { id: query.instrument_id || body?.instrument_id, tenant_id: user.tenantId } })
      if (!instrument) throw new NotFoundException('Instrumento não encontrado')
      projectId = instrument.project_id
    }
    if (!projectId) {
      if (request.url.includes('/templates')) return true
      throw new ForbiddenException('Selecione um projeto autorizado')
    }
    const project = await this.db.project.findFirst({ where: { id: projectId, tenant_id: user.tenantId, deleted_at: null } })
    if (!project) throw new NotFoundException('Projeto não encontrado')
    if (project.manager_id === user.sub || project.created_by === user.sub) return true
    const membership = await this.db.projectMember.findFirst({ where: { project_id: projectId, user_id: user.sub, OR: [{ end_date: null }, { end_date: { gte: new Date() } }] } })
    if (!membership) {
      const teacher = await this.db.professorProjeto.findFirst({ where: { project_id: projectId, professor: { tenant_id: user.tenantId, user_id: user.sub }, status: 'ATIVO',
        OR: [{ data_fim: null }, { data_fim: { gte: new Date() } }] } })
      if (!teacher) throw new ForbiddenException('Sem acesso a este projeto')
      if (!request.url.includes('/validations') || request.body?.stage !== 'PROFESSOR') throw new ForbiddenException('Acesso do professor limitado à sua confirmação')
    }
    return true
  }
}
