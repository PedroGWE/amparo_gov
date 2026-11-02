import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CloseDto, ExecutionDto, InstrumentDto, OpenMonthDto, PointDto, ProtocolDto, RequirementDto, RuleDto, TeamDto } from './monthly.dto'
import { attendanceStatus, inspectIntervals, monthBounds } from './monthly-rules'

const starterRules = [
  ['presenca', 'Lista mensal de presença por turma', 'ANEXO_OBSERVADO', 'LISTA DE PRESENÇA.xlsx'],
  ['ponto', 'Folha de ponto por profissional aplicável', 'ANEXO_OBSERVADO', 'MONITOR - FOLHA DE PONTO.xlsx'],
  ['servicos', 'Relação de serviços utilizados no mês', 'ANEXO_OBSERVADO', 'DESCRIÇÃO DE CADA SERVIÇO.docx'],
  ['financeiro', 'Demonstrativo financeiro mensal', 'ANEXO_OBSERVADO', 'prestacao-*.csv'],
  ['objeto', 'Relatório de execução do objeto e metas', 'NAO_CONFIRMADO', 'Confirmar no instrumento'],
  ['comprovantes', 'Notas, recibos e comprovantes de pagamento', 'NAO_CONFIRMADO', 'Confirmar no instrumento'],
  ['extratos', 'Extratos e conciliação', 'NAO_CONFIRMADO', 'Confirmar no instrumento'],
  ['contratos', 'Contratos, atestos e entrega', 'NAO_CONFIRMADO', 'Confirmar no instrumento'],
  ['fotos', 'Registros fotográficos e distribuição', 'NAO_CONFIRMADO', 'Confirmar no instrumento'],
] as const
const templateKinds = ['PRESENCA', 'PONTO', 'SERVICOS', 'OBJETO', 'FINANCEIRO', 'CHECKLIST'] as const
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

@Injectable()
export class MonthlyService {
  constructor(private readonly db: PrismaService) {}

  private async instrument(tenantId: string, id: string) {
    const item = await this.db.accountabilityInstrument.findFirst({ where: { id, tenant_id: tenantId } })
    if (!item) throw new NotFoundException('Instrumento não encontrado')
    return item
  }

  async createInstrument(tenantId: string, userId: string, dto: InstrumentDto) {
    const project = await this.db.project.findFirst({ where: { id: dto.project_id, tenant_id: tenantId, deleted_at: null } })
    if (!project) throw new NotFoundException('Projeto não encontrado')
    if (dto.work_plan_document_id && (await this.document(tenantId, dto.work_plan_document_id)).project_id !== dto.project_id) throw new BadRequestException('Plano de trabalho de outro projeto')
    const existing = await this.db.accountabilityInstrument.findFirst({ where: { tenant_id: tenantId, project_id: dto.project_id, number: dto.number } })
    if (existing) return existing
    return this.db.$transaction(async tx => {
      const instrument = await tx.accountabilityInstrument.create({ data: { tenant_id: tenantId, ...dto } })
      await tx.monthlyRequirementRule.createMany({ data: starterRules.map(([code, title, origin, source_reference]) => ({
        instrument_id: instrument.id, code, kind: code.toUpperCase(), title, origin, source_reference, applies: false, blocks_close: false,
      })) })
      for (const code of templateKinds) {
        await tx.accountabilityTemplate.upsert({ where: { tenant_id_code_version: { tenant_id: tenantId, code, version: 1 } },
          update: {}, create: { tenant_id: tenantId, code, version: 1, title: code, layout: { orientation: code === 'PRESENCA' ? 'landscape' : 'portrait' },
            fields: { source: 'confirmed_records', signature: 'blank' }, created_by: userId } })
      }
      return instrument
    })
  }

  listInstruments(tenantId: string, projectId?: string) {
    return this.db.accountabilityInstrument.findMany({ where: { tenant_id: tenantId, ...(projectId && { project_id: projectId }) }, orderBy: { created_at: 'desc' } })
  }
  listTemplates(tenantId: string) { return this.db.accountabilityTemplate.findMany({ where: { tenant_id: tenantId }, orderBy: [{ code: 'asc' }, { version: 'desc' }] }) }

  async versionTemplate(tenantId: string, userId: string, code: string, body: { title: string; layout: object; fields: object; rules?: object; scope?: object }) {
    if (!templateKinds.includes(code as typeof templateKinds[number]) || !body.title?.trim() || !body.layout || !body.fields) throw new BadRequestException('Template inválido')
    const latest = await this.db.accountabilityTemplate.findFirst({ where: { tenant_id: tenantId, code }, orderBy: { version: 'desc' } })
    return this.db.accountabilityTemplate.create({ data: { tenant_id: tenantId, code, version: (latest?.version ?? 0) + 1,
      title: body.title, layout: body.layout, fields: body.fields, rules: body.rules ?? {}, scope: body.scope ?? {}, created_by: userId } })
  }

  async addRule(tenantId: string, userId: string, instrumentId: string, dto: RuleDto) {
    await this.instrument(tenantId, instrumentId)
    if (dto.applies && dto.origin === 'INSTRUMENTO_CONFIRMADO' && !dto.source_reference) throw new BadRequestException('Informe a fonte da exigência confirmada')
    const latest = await this.db.monthlyRequirementRule.findFirst({ where: { instrument_id: instrumentId, code: dto.code }, orderBy: { version: 'desc' } })
    return this.db.monthlyRequirementRule.create({ data: { instrument_id: instrumentId, ...dto, version: (latest?.version ?? 0) + 1,
      confirmed_at: dto.origin === 'INSTRUMENTO_CONFIRMADO' && dto.applies ? new Date() : null } })
  }

  async open(tenantId: string, userId: string, dto: OpenMonthDto) {
    const instrument = await this.instrument(tenantId, dto.instrument_id)
    const { start } = monthBounds(dto.month)
    const current = await this.db.monthlyCompetence.findFirst({ where: { tenant_id: tenantId, instrument_id: instrument.id, month: start }, orderBy: { revision: 'desc' } })
    if (current) return this.get(tenantId, current.id)
    const rules = await this.db.monthlyRequirementRule.findMany({ where: { instrument_id: instrument.id }, orderBy: { version: 'desc' } })
    const latest = [...new Map(rules.reverse().map(r => [r.code, r])).values()]
    try {
      const created = await this.db.$transaction(async tx => {
        const competence = await tx.monthlyCompetence.create({ data: { tenant_id: tenantId, project_id: instrument.project_id,
          instrument_id: instrument.id, month: start, created_by: userId } })
        await tx.monthlyRequirement.createMany({ data: latest.map(rule => ({ competence_id: competence.id, rule_id: rule.id, applies: rule.applies })) })
        await tx.monthlyEvent.create({ data: { competence_id: competence.id, actor_id: userId, action: 'ABERTURA' } })
        return competence
      })
      return this.get(tenantId, created.id)
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const winner = await this.db.monthlyCompetence.findFirst({ where: { tenant_id: tenantId, instrument_id: instrument.id, month: start }, orderBy: { revision: 'desc' } })
        if (winner) return this.get(tenantId, winner.id)
      }
      throw e
    }
  }

  list(tenantId: string, instrumentId?: string) { return this.db.monthlyCompetence.findMany({ where: { tenant_id: tenantId, ...(instrumentId && { instrument_id: instrumentId }) }, orderBy: [{ month: 'desc' }, { revision: 'desc' }] }) }

  async get(tenantId: string, id: string) {
    const value = await this.db.monthlyCompetence.findFirst({ where: { id, tenant_id: tenantId }, include: {
      instrument: true, requirements: { include: { rule: true } }, documents: { orderBy: { created_at: 'desc' } },
      point_entries: { orderBy: { start_at: 'asc' } }, events: { orderBy: { created_at: 'desc' } },
    } })
    if (!value) throw new NotFoundException('Competência não encontrada')
    return value
  }
  private async editable(tenantId: string, id: string) {
    const month = await this.get(tenantId, id)
    if (month.status !== 'ABERTA') throw new ConflictException('Competência fechada; abra uma revisão com justificativa')
    return month
  }
  private async document(tenantId: string, id: string) {
    const doc = await this.db.document.findFirst({ where: { id, tenant_id: tenantId, deleted_at: null } })
    if (!doc) throw new NotFoundException('Documento não encontrado neste instituto')
    return doc
  }
  async requirement(tenantId: string, userId: string, monthId: string, id: string, dto: RequirementDto) {
    const month = await this.editable(tenantId, monthId)
    const current = month.requirements.find(r => r.id === id)
    if (!current) throw new NotFoundException('Requisito não encontrado')
    if (dto.status === 'DISPENSADO' && !dto.justification?.trim()) throw new BadRequestException('Dispensa exige justificativa')
    for (const evidenceId of dto.evidence_ids ?? []) {
      const doc = await this.document(tenantId, evidenceId)
      if (doc.project_id !== month.project_id) throw new BadRequestException('Evidência de outro projeto')
    }
    const updated = await this.db.monthlyRequirement.update({ where: { id }, data: { status: dto.status, applies: dto.applies ?? current.applies,
      justification: dto.justification, evidence_ids: dto.evidence_ids, ...(dto.status === 'VALIDADO' || dto.status === 'DISPENSADO' ? { reviewer_id: userId, reviewed_at: new Date() } : {}) } })
    await this.db.monthlyEvent.create({ data: { competence_id: monthId, actor_id: userId, action: 'REQUISITO', details: { id, from: current.status, to: dto.status } } })
    return updated
  }

  async confirmRequirement(tenantId: string, userId: string, monthId: string, id: string, source: string, blocksClose: boolean) {
    const month = await this.editable(tenantId, monthId)
    const current = month.requirements.find(r => r.id === id)
    if (!current || !source?.trim()) throw new BadRequestException('Requisito e fonte do instrumento são obrigatórios')
    const rule = await this.addRule(tenantId, userId, month.instrument_id, { code: current.rule.code, kind: current.rule.kind,
      title: current.rule.title, description: current.rule.description ?? undefined, origin: 'INSTRUMENTO_CONFIRMADO',
      source_reference: source, applies: true, blocks_close: blocksClose, due_day: current.rule.due_day ?? undefined })
    await this.db.monthlyRequirement.update({ where: { id }, data: { rule_id: rule.id, applies: true, status: 'PENDENTE' } })
    await this.db.monthlyEvent.create({ data: { competence_id: monthId, actor_id: userId, action: 'EXIGENCIA_CONFIRMADA', details: { requirement_id: id, rule_id: rule.id, source } } })
    return this.get(tenantId, monthId)
  }

  async team(tenantId: string, monthId: string) {
    const month = await this.get(tenantId, monthId)
    return this.db.monthlyTeamLink.findMany({ where: { tenant_id: tenantId, project_id: month.project_id, instrument_id: month.instrument_id,
      valid_from: { lt: monthBounds(month.month.toISOString().slice(0, 7)).end }, OR: [{ valid_until: null }, { valid_until: { gte: month.month } }] } })
  }
  async addTeam(tenantId: string, userId: string, monthId: string, dto: TeamDto) {
    const month = await this.editable(tenantId, monthId)
    if (dto.instrument_id !== month.instrument_id) throw new BadRequestException('Instrumento diferente da competência')
    if (dto.valid_until && new Date(dto.valid_until) < new Date(dto.valid_from)) throw new BadRequestException('Vigência final anterior ao início')
    if (dto.cpf && !/^\d{11}$/.test(dto.cpf.replace(/\D/g, ''))) throw new BadRequestException('CPF inválido')
    if (dto.cnpj && !/^\d{14}$/.test(dto.cnpj.replace(/\D/g, ''))) throw new BadRequestException('CNPJ inválido')
    if (dto.quantity && !/^\d+(\.\d{1,3})?$/.test(dto.quantity)) throw new BadRequestException('Quantidade inválida')
    if (dto.amount && !/^\d+(\.\d{1,2})?$/.test(dto.amount)) throw new BadRequestException('Valor inválido')
    if (dto.professor_id && !await this.db.professor.findFirst({ where: { id: dto.professor_id, tenant_id: tenantId } })) throw new NotFoundException('Professor não encontrado')
    if (dto.contract_document_id && (await this.document(tenantId, dto.contract_document_id)).project_id !== month.project_id) throw new BadRequestException('Contrato de outro projeto')
    const link = await this.db.monthlyTeamLink.create({ data: { tenant_id: tenantId, project_id: month.project_id, created_by: userId, ...dto,
      valid_from: new Date(dto.valid_from), valid_until: dto.valid_until ? new Date(dto.valid_until) : null,
      quantity: dto.quantity ? new Prisma.Decimal(dto.quantity) : null, amount: dto.amount ? new Prisma.Decimal(dto.amount) : null } })
    await this.db.monthlyEvent.create({ data: { competence_id: monthId, actor_id: userId, action: 'VINCULO_EQUIPE', details: { team_link_id: link.id } } })
    return link
  }
  async addPoint(tenantId: string, userId: string, monthId: string, dto: PointDto) {
    const month = await this.editable(tenantId, monthId)
    const link = (await this.team(tenantId, monthId)).find(x => x.id === dto.team_link_id)
    if (!link) throw new NotFoundException('Vínculo não encontrado')
    const { start, end } = monthBounds(month.month.toISOString().slice(0, 7))
    const from = new Date(dto.start_at), to = dto.end_at ? new Date(dto.end_at) : null
    const allowedEnd = new Date(end.getTime() + 24 * 60 * 60 * 1000)
    if (from < start || from >= end || (to && (to <= from || to > allowedEnd))) throw new BadRequestException('Intervalo fora da competência ou inválido')
    if (dto.kind === 'PLANEJADO') throw new BadRequestException('Escala planejada deve ser confirmada antes de lançar trabalho realizado')
    const entry = await this.db.monthlyPointEntry.create({ data: { competence_id: monthId, team_link_id: link.id, start_at: from, end_at: to,
      kind: dto.kind, justification: dto.justification, created_by: userId } })
    await this.db.monthlyEvent.create({ data: { competence_id: monthId, actor_id: userId, action: 'PONTO', details: { entry_id: entry.id } } })
    return entry
  }

  async attendance(tenantId: string, monthId: string) {
    const month = await this.get(tenantId, monthId)
    const { start, end } = monthBounds(month.month.toISOString().slice(0, 7))
    const classes = await this.db.turma.findMany({ where: { tenant_id: tenantId, project_id: month.project_id, deleted_at: null },
      include: { curso: { select: { nome: true } }, matriculas: { include: { aluno: { select: { id: true, name: true } } } },
        aulas: { where: { tenant_id: tenantId, inicio: { gte: start, lt: end } }, include: { presencas: true }, orderBy: { inicio: 'asc' } },
        presencas: { where: { tenant_id: tenantId, data: { gte: start, lt: end } } } } })
    return classes.map(turma => ({ id: turma.id, nome: turma.nome, modalidade: turma.curso?.nome ?? null, horario: turma.horario,
      aulas: turma.aulas.map(a => ({ id: a.id, titulo: a.titulo, inicio: a.inicio, fim: a.fim, status: a.execution_status === 'PREVISTA' && a.chamada_enviada_at ? 'REALIZADA' : a.execution_status })),
      beneficiarios: turma.matriculas.filter(m => m.created_at < end).map(m => {
        const applicable = turma.aulas.filter(a => a.inicio >= m.created_at && (a.execution_status === 'REALIZADA' || a.execution_status === 'PREVISTA' && Boolean(a.chamada_enviada_at)))
        const records = applicable.map(a => {
          const educa = a.presencas.find(p => p.matricula_id === m.id)?.status
          const sameDay = turma.aulas.filter(x => x.inicio.toISOString().slice(0, 10) === a.inicio.toISOString().slice(0, 10))
          const legacy = sameDay.length === 1 ? turma.presencas.find(p => p.matricula_id === m.id && p.data.toISOString().slice(0, 10) === a.inicio.toISOString().slice(0, 10)) : undefined
          return { aula_id: a.id, status: attendanceStatus(educa, legacy?.presente) }
        })
        const present = records.filter(r => r.status === 'PRESENTE').length
        const marked = records.filter(r => r.status !== 'PENDENTE').length
        return { matricula_id: m.id, beneficiary_id: m.aluno.id, nome: m.aluno.name, desde: m.created_at, records, present, applicable: records.length,
          percent: marked === records.length && records.length ? Math.round(10000 * present / records.length) / 100 : null,
          pending: records.length - marked }
      }) }))
  }

  async lessonStatus(tenantId: string, userId: string, monthId: string, lessonId: string, status: string) {
    if (!['PREVISTA', 'REALIZADA', 'CANCELADA', 'REMARCADA'].includes(status)) throw new BadRequestException('Situação da aula inválida')
    const month = await this.editable(tenantId, monthId)
    const lesson = await this.db.educaAula.findFirst({ where: { id: lessonId, tenant_id: tenantId, turma: { project_id: month.project_id, tenant_id: tenantId } } })
    if (!lesson) throw new NotFoundException('Aula não encontrada no projeto')
    const changed = await this.db.educaAula.updateMany({ where: { id: lessonId, tenant_id: tenantId, versao: lesson.versao },
      data: { execution_status: status, versao: { increment: 1 } } })
    if (changed.count !== 1) throw new ConflictException('Aula alterada por outro usuário')
    await this.db.monthlyEvent.create({ data: { competence_id: monthId, actor_id: userId, action: 'SITUACAO_AULA', details: { lessonId, from: lesson.execution_status, to: status } } })
    return { id: lessonId, status }
  }

  async noMovement(tenantId: string, userId: string, monthId: string, reason: string) {
    const month = await this.editable(tenantId, monthId)
    if (!reason?.trim()) throw new BadRequestException('Declaração sem movimento exige justificativa')
    const [attendance, financial] = await Promise.all([this.attendance(tenantId, monthId), this.financial(tenantId, monthId)])
    if (attendance.some(t => t.aulas.some(a => a.status === 'REALIZADA')) || financial.entries.some(e => !e.paid_in_period.isZero()) || month.point_entries.length) {
      throw new BadRequestException('Há execução registrada; revise os dados antes de declarar sem movimento')
    }
    await this.db.monthlyCompetence.update({ where: { id: month.id }, data: { no_movement: true, no_movement_reason: reason } })
    await this.db.monthlyEvent.create({ data: { competence_id: monthId, actor_id: userId, action: 'SEM_MOVIMENTO', reason } })
    return this.get(tenantId, monthId)
  }

  async saveExecution(tenantId: string, userId: string, monthId: string, dto: ExecutionDto) {
    const month = await this.editable(tenantId, monthId)
    for (const id of dto.source_ids) if ((await this.document(tenantId, id)).project_id !== month.project_id) throw new BadRequestException('Fonte de outro projeto')
    const result = await this.db.monthlyCompetence.update({ where: { id: monthId }, data: { execution_data: { ...dto } } })
    await this.db.monthlyEvent.create({ data: { competence_id: monthId, actor_id: userId, action: 'EXECUCAO_OBJETO', details: { source_ids: dto.source_ids } } })
    return result
  }

  async financial(tenantId: string, monthId: string) {
    const month = await this.get(tenantId, monthId)
    const { start, end } = monthBounds(month.month.toISOString().slice(0, 7))
    const entries = await this.db.transaction.findMany({ where: { tenant_id: tenantId, project_id: month.project_id,
      OR: [{ date: { gte: start, lt: end } }, { paid_at: { gte: start, lt: end } }, { payment_orders: { some: { tenant_id: tenantId, paid_at: { gte: start, lt: end } } } }] },
      include: { invoices: { where: { tenant_id: tenantId } }, payment_orders: { where: { tenant_id: tenantId } }, matched_statements: true }, orderBy: { date: 'asc' } })
    const sum = (items: typeof entries) => items.reduce((n, item) => n.plus(item.amount), new Prisma.Decimal(0))
    const isInMonth = (date: Date | null) => Boolean(date && date >= start && date < end)
    const paidAmount = (item: typeof entries[number]) => {
      const orders = item.payment_orders.filter(p => p.paid_at && isInMonth(p.paid_at))
      if (item.payment_orders.some(p => p.paid_at)) return orders.reduce((n, p) => n.plus(p.amount), new Prisma.Decimal(0))
      return item.status === 'PAGO' && isInMonth(item.paid_at ?? item.date) ? item.amount : new Prisma.Decimal(0)
    }
    const received = entries.filter(x => x.type === 'RECEITA').reduce((n, x) => n.plus(paidAmount(x)), new Prisma.Decimal(0))
    const spent = entries.filter(x => x.type === 'DESPESA').reduce((n, x) => n.plus(paidAmount(x)), new Prisma.Decimal(0))
    return { entries: entries.map(e => ({ ...e, paid_in_period: paidAmount(e) })), approved_unpaid: sum(entries.filter(x => x.status === 'APROVADO' && x.type === 'DESPESA' && x.date >= start && x.date < end)),
      received, spent, period_balance: received.minus(spent), bank_balance: null, reconciled: false,
      reconciliation_message: 'Saldo inicial ou extrato conciliado não informado; saldo bancário não conciliado.' }
  }

  async overview(tenantId: string, monthId: string) {
    const month = await this.get(tenantId, monthId)
    const [attendance, team, financial] = await Promise.all([this.attendance(tenantId, monthId), this.team(tenantId, monthId), this.financial(tenantId, monthId)])
    const point = inspectIntervals(month.point_entries.map(e => ({ start_at: e.start_at, end_at: e.end_at, kind: e.kind })))
    const blockers = month.requirements.filter(r => r.applies && r.rule.blocks_close && !['VALIDADO', 'DISPENSADO'].includes(r.status))
    const attendancePending = attendance.reduce((n, t) => n + t.beneficiarios.reduce((a, b) => a + b.pending, 0), 0)
    const sourceHash = hash({ attendance, point: month.point_entries, financial, execution: month.execution_data,
      requirements: month.requirements.map(r => ({ rule_id: r.rule_id, status: r.status, applies: r.applies, evidence_ids: r.evidence_ids })) })
    const previousHash = (month.snapshot as { source_hash?: string } | null)?.source_hash
    return { month, attendance, team, financial, point, blockers, attendance_pending: attendancePending,
      source_hash: sourceHash, source_changed: Boolean(previousHash && previousHash !== sourceHash) }
  }

  async close(tenantId: string, userId: string, monthId: string, dto: CloseDto) {
    const view = await this.overview(tenantId, monthId)
    if (view.month.status !== 'ABERTA') throw new ConflictException('Competência já fechada')
    if (view.blockers.length || view.point.issues.length || view.attendance_pending) throw new BadRequestException('Resolva as pendências críticas de requisitos, presença e ponto antes de fechar')
    const snapshot = JSON.parse(JSON.stringify({ ...view, closed_by: userId, closed_at: new Date().toISOString() }))
    const snapshotHash = hash(snapshot)
    const changed = await this.db.monthlyCompetence.updateMany({ where: { id: monthId, tenant_id: tenantId, status: 'ABERTA', updated_at: view.month.updated_at },
      data: { status: 'FECHADA', snapshot, snapshot_hash: snapshotHash, closed_by: userId, closed_at: new Date() } })
    if (changed.count !== 1) throw new ConflictException('A competência foi alterada; atualize antes de fechar')
    await this.db.monthlyEvent.create({ data: { competence_id: monthId, actor_id: userId, action: 'FECHAMENTO', reason: dto.reason } })
    return this.get(tenantId, monthId)
  }
  async revise(tenantId: string, userId: string, monthId: string, reason: string) {
    if (!reason?.trim()) throw new BadRequestException('Informe a justificativa da revisão')
    const old = await this.get(tenantId, monthId)
    if (old.status !== 'FECHADA') throw new BadRequestException('Somente competência fechada pode ser revisada')
    const created = await this.db.$transaction(async tx => {
      const next = await tx.monthlyCompetence.create({ data: { tenant_id: tenantId, project_id: old.project_id, instrument_id: old.instrument_id,
        month: old.month, revision: old.revision + 1, created_by: userId, report_id: null } })
      await tx.monthlyRequirement.createMany({ data: old.requirements.map(r => ({ competence_id: next.id, rule_id: r.rule_id,
        applies: r.applies, status: 'PENDENTE' })) })
      await tx.monthlyEvent.create({ data: { competence_id: next.id, actor_id: userId, action: 'REVISAO', reason, details: { previous_id: old.id } } })
      return next
    })
    return this.get(tenantId, created.id)
  }
  async protocol(tenantId: string, userId: string, monthId: string, dto: ProtocolDto) {
    const month = await this.get(tenantId, monthId)
    if (month.status !== 'FECHADA') throw new BadRequestException('Feche a competência antes de registrar protocolo externo')
    if (dto.evidence_id && (await this.document(tenantId, dto.evidence_id)).project_id !== month.project_id) throw new BadRequestException('Protocolo de outro projeto')
    return this.db.monthlyEvent.create({ data: { competence_id: monthId, actor_id: userId, action: 'PROTOCOLO_EXTERNO', details: { ...dto } } })
  }
}
