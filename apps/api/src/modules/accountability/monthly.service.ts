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
  async configureInstrument(tenantId: string, id: string, userId: string, data: Record<string, unknown>) {
    const item = await this.instrument(tenantId, id)
    const allowed = ['kind', 'grantor', 'grantor_sphere', 'work_plan_document_id']
    const kind = data.kind
    if (kind !== undefined && !['A confirmar', 'Termo de Fomento', 'Termo de Colaboração', 'Convênio', 'Outro'].includes(String(kind))) throw new BadRequestException('Tipo inválido')
    if (data.internal_due_day !== undefined && (!Number.isInteger(data.internal_due_day) || Number(data.internal_due_day) < 1 || Number(data.internal_due_day) > 28)) throw new BadRequestException('Dia do prazo interno inválido')
    if (data.approved_budget_lines !== undefined && (!Array.isArray(data.approved_budget_lines) || !data.approved_budget_lines.every(x => typeof x === 'string' && x.trim()))) throw new BadRequestException('Rubricas aprovadas inválidas')
    if (data.budget_line_limits !== undefined && (typeof data.budget_line_limits !== 'object' || !data.budget_line_limits || Object.values(data.budget_line_limits).some(x => !Number.isFinite(x) || Number(x) < 0))) throw new BadRequestException('Limites de rubrica inválidos')
    for (const key of ['valid_from', 'valid_until']) if (data[key] && Number.isNaN(Date.parse(String(data[key])))) throw new BadRequestException('Vigência inválida')
    if (data.valid_from && data.valid_until && String(data.valid_until) < String(data.valid_from)) throw new BadRequestException('Fim da vigência anterior ao início')
    if (data.official_url && !/^https:\/\//.test(String(data.official_url))) throw new BadRequestException('Link oficial deve usar HTTPS')
    if (data.agreed_amount && (!/^\d+(\.\d{1,2})?$/.test(String(data.agreed_amount)) || Number(data.agreed_amount) <= 0)) throw new BadRequestException('Valor pactuado inválido')
    if (data.retention_years !== undefined && (!Number.isInteger(data.retention_years) || Number(data.retention_years) < 1)) throw new BadRequestException('Prazo de guarda inválido')
    if (data.work_plan_document_id && (await this.document(tenantId, String(data.work_plan_document_id))).project_id !== item.project_id) throw new BadRequestException('Plano de outro projeto')
    const config = (item.configuration ?? {}) as Record<string, unknown>
    if (data.signed_document_id && (await this.document(tenantId, String(data.signed_document_id))).project_id !== item.project_id) throw new BadRequestException('Termo assinado de outro projeto')
    const next = { ...config, ...Object.fromEntries(Object.entries(data).filter(([key]) => !allowed.includes(key))), confirmed_by: userId }
    return this.db.accountabilityInstrument.update({ where: { id }, data: {
      ...(kind !== undefined && { kind: String(kind) }),
      ...(data.grantor !== undefined && { grantor: String(data.grantor) }),
      ...(data.grantor_sphere !== undefined && { grantor_sphere: String(data.grantor_sphere) }),
      ...(data.work_plan_document_id !== undefined && { work_plan_document_id: String(data.work_plan_document_id) }),
      configuration: next as Prisma.InputJsonValue,
    } })
  }
  async addPlanVersion(tenantId: string, id: string, userId: string, data: { version: string; status: string; document_id: string; effective_from?: string; comment?: string }) {
    const item = await this.instrument(tenantId, id)
    if (!data.version?.trim() || !['EM_ANALISE', 'APROVADO', 'REJEITADO'].includes(data.status) || !data.document_id) throw new BadRequestException('Versão, situação e documento são obrigatórios')
    if ((await this.document(tenantId, data.document_id)).project_id !== item.project_id) throw new BadRequestException('Plano de outro projeto')
    if (data.status === 'APROVADO' && (!data.effective_from || Number.isNaN(Date.parse(data.effective_from)))) throw new BadRequestException('Versão aprovada exige data de efeito')
    const config = (item.configuration ?? {}) as { plan_versions?: object[] }
    const versions = [...(config.plan_versions ?? []), { ...data, confirmed_by: userId, recorded_at: new Date().toISOString() }]
    return this.db.accountabilityInstrument.update({ where: { id }, data: { configuration: { ...config, plan_versions: versions } as Prisma.InputJsonValue } })
  }

  private async expense(tenantId: string, id: string) {
    const expense = await this.db.accountabilityExpense.findFirst({ where: { id, tenant_id: tenantId }, include: { payments: true } })
    if (!expense) throw new NotFoundException('Despesa não encontrada')
    return expense
  }
  async expenses(tenantId: string, instrumentId: string) {
    const instrument = await this.instrument(tenantId, instrumentId)
    const transactions = await this.db.transaction.findMany({ where: { tenant_id: tenantId, project_id: instrument.project_id, type: 'DESPESA' }, orderBy: { date: 'desc' } })
    const controls = await this.db.accountabilityExpense.findMany({ where: { tenant_id: tenantId, instrument_id: instrumentId }, include: { payments: true } })
    return transactions.map(transaction => ({ transaction, control: controls.find(c => c.transaction_id === transaction.id) ?? null }))
  }
  async saveExpense(tenantId: string, instrumentId: string, userId: string, transactionId: string, data: Record<string, unknown>) {
    const instrument = await this.instrument(tenantId, instrumentId)
    const transaction = await this.db.transaction.findFirst({ where: { id: transactionId, tenant_id: tenantId, project_id: instrument.project_id, type: 'DESPESA' } })
    if (!transaction) throw new NotFoundException('Lançamento não encontrado no projeto')
    const fields = ['budget_line', 'work_plan_version', 'funding_source', 'account_reference', 'scope', 'classification', 'classification_basis']
    const values = Object.fromEntries(fields.filter(k => data[k] !== undefined).map(k => [k, String(data[k])]))
    if (values.classification && !['OBJETO', 'LIMITE_25', 'REVISAO'].includes(values.classification)) throw new BadRequestException('Classificação inválida')
    if (values.classification && values.classification !== 'REVISAO' && !values.classification_basis?.trim()) throw new BadRequestException('Classificação exige fundamento na atividade e rubrica')
    if (values.funding_source && !['PARCERIA', 'PROPRIOS', 'OUTROS'].includes(values.funding_source)) throw new BadRequestException('Fonte do recurso inválida')
    const documents = data.documents as Record<string, { status: string; evidence_id?: string; justification?: string }> | undefined
    if (documents) for (const entry of Object.values(documents)) {
      if (!['PENDENTE', 'ANEXADO', 'VALIDADO', 'NAO_SE_APLICA'].includes(entry.status)) throw new BadRequestException('Estado documental inválido')
      if (entry.status === 'NAO_SE_APLICA' && !entry.justification?.trim()) throw new BadRequestException('Dispensa exige justificativa')
      if (['ANEXADO', 'VALIDADO'].includes(entry.status) && !entry.evidence_id) throw new BadRequestException('Documento anexado ou validado exige evidência')
      if (entry.evidence_id && (await this.document(tenantId, entry.evidence_id)).project_id !== instrument.project_id) throw new BadRequestException('Evidência de outro projeto')
    }
    const existing = await this.db.accountabilityExpense.findUnique({ where: { instrument_id_transaction_id: { instrument_id: instrumentId, transaction_id: transactionId } }, include: { payments: true } })
    const coreChanged = existing && Object.entries(values).some(([key, value]) => String((existing as unknown as Record<string, unknown>)[key] ?? '') !== value)
    const docsChanged = existing && documents && JSON.stringify(existing.documents) !== JSON.stringify(documents)
    if (existing?.payments.length && coreChanged) throw new ConflictException('Despesa com pagamento registrado exige revisão formal antes de alterar rubrica, conta ou fonte')
    const changed = coreChanged || docsChanged && !existing?.payments.length
    return this.db.accountabilityExpense.upsert({ where: { instrument_id_transaction_id: { instrument_id: instrumentId, transaction_id: transactionId } },
      create: { tenant_id: tenantId, instrument_id: instrumentId, transaction_id: transactionId, ...values, documents: (documents ?? {}) as Prisma.InputJsonValue },
      update: { ...values, ...(documents && { documents: documents as Prisma.InputJsonValue }), ...(changed && { release_status: 'PREPARACAO', released_at: null, released_by: null }) } })
  }
  async releaseExpense(tenantId: string, id: string, userId: string) {
    const expense = await this.expense(tenantId, id)
    const required = ['NOTA_FISCAL', 'CONTRATO', 'PESQUISA_PRECOS', 'RECIBO_ENTREGA', 'FOLHA_ENCARGOS', 'RELATORIO_FORNECEDOR']
    const docs = expense.documents as Record<string, { status?: string }>
    const configured = required.filter(k => docs[k] && docs[k].status !== 'NAO_SE_APLICA')
    if (expense.classification === 'REVISAO') throw new BadRequestException('Classificação orçamentária pendente de revisão')
    if (!expense.budget_line || !expense.work_plan_version || !expense.account_reference || !configured.length || configured.some(k => docs[k].status !== 'VALIDADO')) throw new BadRequestException('Confirme rubrica, plano aprovado, conta específica e documentos exigidos')
    const instrument = await this.instrument(tenantId, expense.instrument_id)
    const config = (instrument.configuration ?? {}) as { approved_budget_lines?: string[]; account_reference?: string; approved_plan_version?: string; budget_line_limits?: Record<string, number>; plan_versions?: { version: string; status: string; effective_from?: string }[] }
    const transaction = await this.db.transaction.findFirst({ where: { id: expense.transaction_id, tenant_id: tenantId } })
    if (!transaction || transaction.status !== 'APROVADO') throw new BadRequestException('Lançamento financeiro precisa estar aprovado')
    const latestVersions = [...new Map((config.plan_versions ?? []).map(p => [p.version, p])).values()]
    const approved = latestVersions.filter(p => p.status === 'APROVADO' && p.effective_from && new Date(p.effective_from) <= transaction.date)
      .sort((a, b) => String(b.effective_from).localeCompare(String(a.effective_from)))[0]?.version ?? (latestVersions.length ? undefined : config.approved_plan_version)
    if (!config.approved_budget_lines?.includes(expense.budget_line) || config.account_reference !== expense.account_reference || approved !== expense.work_plan_version) throw new BadRequestException('Rubrica, conta e versão aplicável precisam corresponder à configuração aprovada do instrumento')
    const limit = config.budget_line_limits?.[expense.budget_line]
    if (limit === undefined) throw new BadRequestException('Saldo aprovado da rubrica ainda não foi confirmado')
    const paid = expense.payments.reduce((n, p) => n.plus(p.amount), new Prisma.Decimal(0))
    if (paid.gte(transaction.amount)) throw new BadRequestException('Sem saldo em aberto')
    return this.db.$transaction(async tx => {
      const committed = await tx.accountabilityExpense.findMany({ where: { instrument_id: expense.instrument_id, budget_line: expense.budget_line, release_status: 'LIBERADA', id: { not: id } } })
      const transactions = await tx.transaction.findMany({ where: { id: { in: committed.map(x => x.transaction_id) }, tenant_id: tenantId }, select: { amount: true } })
      const used = transactions.reduce((n, t) => n.plus(t.amount), new Prisma.Decimal(0))
      if (used.plus(transaction.amount).gt(limit)) throw new BadRequestException('Saldo disponível da rubrica insuficiente')
      const result = await tx.accountabilityExpense.updateMany({ where: { id, tenant_id: tenantId, release_status: 'PREPARACAO', updated_at: expense.updated_at },
        data: { release_status: 'LIBERADA', released_by: userId, released_at: new Date() } })
      if (result.count !== 1) throw new ConflictException('Despesa já liberada ou alterada por outro usuário')
      return tx.accountabilityExpense.findUniqueOrThrow({ where: { id } })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }
  async registerPayment(tenantId: string, id: string, userId: string, data: { amount: string; paid_at: string; operation_reference: string; evidence_id: string; occurrence?: boolean; justification?: string }) {
    const expense = await this.expense(tenantId, id)
    const instrument = await this.instrument(tenantId, expense.instrument_id)
    if (!data.operation_reference?.trim() || !data.evidence_id || !data.paid_at || Number.isNaN(Date.parse(data.paid_at)) || !/^\d+(\.\d{1,2})?$/.test(data.amount)) throw new BadRequestException('Informe valor, data, referência e comprovante')
    if ((await this.document(tenantId, data.evidence_id)).project_id !== instrument.project_id) throw new BadRequestException('Comprovante de outro projeto')
    if (!data.occurrence && expense.release_status !== 'LIBERADA') throw new BadRequestException('Liberação interna pendente')
    if (data.occurrence && !data.justification?.trim()) throw new BadRequestException('Ocorrência exige justificativa')
    const amount = new Prisma.Decimal(data.amount)
    return this.db.$transaction(async tx => {
      const [transaction, payments] = await Promise.all([
        tx.transaction.findFirst({ where: { id: expense.transaction_id, tenant_id: tenantId } }),
        tx.accountabilityPayment.findMany({ where: { expense_id: id } }),
      ])
      const paid = payments.reduce((n, p) => n.plus(p.amount), new Prisma.Decimal(0))
      if (!transaction || amount.lte(0) || paid.plus(amount).gt(transaction.amount)) throw new BadRequestException('Valor excede o saldo em aberto')
      const duplicate = await tx.accountabilityPayment.findFirst({ where: { operation_reference: data.operation_reference,
        expense: { instrument_id: expense.instrument_id, account_reference: expense.account_reference } } })
      if (duplicate) throw new ConflictException('Referência da operação já registrada nesta conta')
      return tx.accountabilityPayment.create({ data: { expense_id: id, amount, paid_at: new Date(data.paid_at), operation_reference: data.operation_reference,
        evidence_id: data.evidence_id, occurrence: Boolean(data.occurrence), justification: data.justification, created_by: userId } })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }
  async reconcilePayment(tenantId: string, paymentId: string, statementId: string) {
    const payment = await this.db.accountabilityPayment.findFirst({ where: { id: paymentId, expense: { tenant_id: tenantId } }, include: { expense: true } })
    if (!payment) throw new NotFoundException('Pagamento não encontrado')
    const statement = await this.db.accountStatement.findFirst({ where: { id: statementId, reconciliation: { tenant_id: tenantId } }, include: { reconciliation: true } })
    if (!statement) throw new NotFoundException('Movimento de extrato não encontrado')
    if (!new Prisma.Decimal(statement.amount).abs().equals(payment.amount)) throw new BadRequestException('Valor do extrato difere do pagamento')
    if (payment.expense.account_reference !== statement.reconciliation.account_id) throw new BadRequestException('Conta do extrato difere da conta da despesa')
    if (statement.matched_transaction_id && statement.matched_transaction_id !== payment.expense.transaction_id) throw new ConflictException('Movimento já vinculado a outro lançamento financeiro')
    const siblings = await this.db.accountabilityPayment.findMany({ where: { statement_id: statementId } })
    if (siblings.some(p => p.id !== paymentId)) throw new ConflictException('Movimento já conciliado com outro pagamento')
    return this.db.accountabilityPayment.update({ where: { id: paymentId }, data: { statement_id: statementId, reconciled_at: new Date() } })
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
    const [attendance, team, financial, indicatorResults] = await Promise.all([this.attendance(tenantId, monthId), this.team(tenantId, monthId), this.financial(tenantId, monthId), this.indicatorResults(tenantId, monthId)])
    const point = inspectIntervals(month.point_entries.map(e => ({ start_at: e.start_at, end_at: e.end_at, kind: e.kind })))
    const blockers = month.requirements.filter(r => r.applies && r.rule.blocks_close && !['VALIDADO', 'DISPENSADO'].includes(r.status))
    const attendancePending = attendance.reduce((n, t) => n + t.beneficiarios.reduce((a, b) => a + b.pending, 0), 0)
    const attendanceSummary = { enrollments: attendance.reduce((n, t) => n + t.beneficiarios.length, 0),
      presences: attendance.reduce((n, t) => n + t.beneficiarios.reduce((m, b) => m + b.present, 0), 0),
      unique_participants: new Set(attendance.flatMap(t => t.beneficiarios.filter(b => b.present > 0).map(b => b.beneficiary_id))).size }
    const sourceHash = hash({ attendance, point: month.point_entries, financial, indicatorResults, execution: month.execution_data,
      requirements: month.requirements.map(r => ({ rule_id: r.rule_id, status: r.status, applies: r.applies, evidence_ids: r.evidence_ids })) })
    const previousHash = (month.snapshot as { source_hash?: string } | null)?.source_hash
    const validations = await this.db.monthlyValidation.findMany({ where: { competence_id: monthId }, orderBy: { created_at: 'asc' } })
    return { month, attendance, attendance_summary: attendanceSummary, team, financial, indicatorResults, point, blockers, attendance_pending: attendancePending, validations,
      source_hash: sourceHash, source_changed: Boolean(previousHash && previousHash !== sourceHash) }
  }

  async validateStage(tenantId: string, monthId: string, actor: { sub: string; permissions: string[] }, data: { stage: string; status: string; role: string; comment?: string }) {
    const month = await this.editable(tenantId, monthId)
    if (!['PROFESSOR', 'ATIVIDADES', 'FINANCEIRO', 'INSTITUCIONAL'].includes(data.stage) || !['APROVADO', 'DEVOLVIDO'].includes(data.status)) throw new BadRequestException('Etapa ou decisão inválida')
    if (!data.role?.trim() || data.status === 'DEVOLVIDO' && !data.comment?.trim()) throw new BadRequestException('Informe papel e motivo da devolução')
    const allowed: Record<string, string[]> = { PROFESSOR: ['conecta:teacher', 'educa:manage'], ATIVIDADES: ['projects:update', 'accountability:review'],
      FINANCEIRO: ['financial:approve'], INSTITUCIONAL: ['accountability:review'] }
    if (!actor.permissions.includes('*') && !allowed[data.stage].some(p => actor.permissions.includes(p))) throw new BadRequestException('Perfil sem permissão para validar esta etapa')
    const validation = await this.db.monthlyValidation.create({ data: { competence_id: monthId, stage: data.stage, status: data.status, actor_id: actor.sub,
      role: data.role, comment: data.comment, revision: month.revision } })
    if (data.status === 'DEVOLVIDO') {
      const project = await this.db.project.findFirst({ where: { id: month.project_id, tenant_id: tenantId } })
      if (project?.manager_id) await this.db.notification.create({ data: { tenant_id: tenantId, user_id: project.manager_id, type: 'ACCOUNTABILITY_RETURN',
        title: 'Prestação mensal devolvida', body: data.comment!, data: { competence_id: monthId, stage: data.stage } } })
    }
    return validation
  }

  async remind(tenantId: string, monthId: string) {
    const month = await this.get(tenantId, monthId)
    if (month.status === 'FECHADA') return { sent: 0 }
    const project = await this.db.project.findFirst({ where: { id: month.project_id, tenant_id: tenantId } })
    const recipients = [...new Set([project?.manager_id, ...month.requirements.filter(r => r.applies && r.status !== 'VALIDADO').map(r => r.rule.responsible_id)].filter((x): x is string => Boolean(x)))]
    const config = (month.instrument.configuration ?? {}) as { internal_due_day?: number }
    const due = new Date(Date.UTC(month.month.getUTCFullYear(), month.month.getUTCMonth() + 1, config.internal_due_day || 9, 3))
    let sent = 0
    for (const recipient of recipients) {
      const exists = await this.db.notification.findFirst({ where: { tenant_id: tenantId, user_id: recipient, type: 'ACCOUNTABILITY_DUE',
        data: { path: ['competence_id'], equals: monthId } } })
      if (exists) continue
      await this.db.notification.create({ data: { tenant_id: tenantId, user_id: recipient, type: 'ACCOUNTABILITY_DUE',
        title: 'Entrega interna da prestação mensal', body: `Confira as pendências da competência até ${due.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.`,
        data: { competence_id: monthId, due_at: due.toISOString() } } })
      sent++
    }
    return { sent, due_at: due.toISOString() }
  }

  async officialDeliveries(tenantId: string, instrumentId: string) {
    await this.instrument(tenantId, instrumentId)
    return this.db.officialDelivery.findMany({ where: { instrument_id: instrumentId }, orderBy: { created_at: 'desc' } })
  }
  async indicatorResults(tenantId: string, monthId: string) {
    const month = await this.get(tenantId, monthId)
    const indicators = await this.db.projectIndicator.findMany({ where: { project_id: month.project_id }, orderBy: { name: 'asc' } })
    const results = await this.db.accountabilityIndicatorResult.findMany({ where: { tenant_id: tenantId, instrument_id: month.instrument_id, month: month.month } })
    return indicators.map(indicator => ({ indicator, results: results.filter(r => r.indicator_id === indicator.id) }))
  }
  async media(tenantId: string, instrumentId: string, publicOnly: boolean) {
    await this.instrument(tenantId, instrumentId)
    return this.db.accountabilityMedia.findMany({ where: { tenant_id: tenantId, instrument_id: instrumentId, ...(publicOnly && { public_release: true }) }, orderBy: { recorded_on: 'desc' } })
  }
  async addMedia(tenantId: string, instrumentId: string, userId: string, data: { lesson_id?: string; document_id: string; kind: string; recorded_on: string; location: string; scope: string; description: string }) {
    const instrument = await this.instrument(tenantId, instrumentId)
    if (!['FOTO', 'VIDEO'].includes(data.kind) || !data.recorded_on || Number.isNaN(Date.parse(data.recorded_on)) || !data.location?.trim() || !data.scope?.trim() || !data.description?.trim()) throw new BadRequestException('Informe tipo, data, local, modalidade e descrição')
    const doc = await this.document(tenantId, data.document_id)
    if (doc.project_id !== instrument.project_id || !doc.mime_type?.startsWith(data.kind === 'FOTO' ? 'image/' : 'video/')) throw new BadRequestException('Mídia inválida ou de outro projeto')
    if (data.lesson_id && !await this.db.educaAula.findFirst({ where: { id: data.lesson_id, tenant_id: tenantId, turma: { project_id: instrument.project_id } } })) throw new NotFoundException('Aula não encontrada no projeto')
    return this.db.accountabilityMedia.create({ data: { tenant_id: tenantId, instrument_id: instrumentId, lesson_id: data.lesson_id,
      document_id: data.document_id, kind: data.kind, recorded_on: new Date(data.recorded_on), location: data.location,
      scope: data.scope, description: data.description, recorded_by: userId } })
  }
  async releaseMedia(tenantId: string, id: string, userId: string) {
    const media = await this.db.accountabilityMedia.findFirst({ where: { id, tenant_id: tenantId } })
    if (!media) throw new NotFoundException('Mídia não encontrada')
    const doc = await this.document(tenantId, media.document_id)
    if ((doc.metadata as { public_release_approved?: boolean } | null)?.public_release_approved !== true) throw new BadRequestException('Confirme a autorização de divulgação no documento antes de liberar a mídia')
    const result = await this.db.accountabilityMedia.update({ where: { id }, data: { public_release: true } })
    await this.db.notification.create({ data: { tenant_id: tenantId, user_id: userId, type: 'ACCOUNTABILITY_MEDIA_RELEASE',
      title: 'Mídia liberada para divulgação', body: media.description, data: { media_id: id } } })
    return result
  }
  async saveIndicatorResult(tenantId: string, monthId: string, userId: string, data: { indicator_id: string; scope?: string; work_plan_version: string; expected: string; actual?: string; method: string; responsible_id: string; evidence_ids?: string[]; justification?: string; source?: string }) {
    const month = await this.editable(tenantId, monthId)
    const indicator = await this.db.projectIndicator.findFirst({ where: { id: data.indicator_id, project: { id: month.project_id, tenant_id: tenantId } } })
    if (!indicator) throw new NotFoundException('Indicador não encontrado no projeto')
    if (!data.work_plan_version?.trim() || !data.method?.trim() || !data.responsible_id?.trim() || !/^\d+(\.\d{1,4})?$/.test(data.expected) || data.actual !== undefined && !/^\d+(\.\d{1,4})?$/.test(data.actual)) throw new BadRequestException('Valor, plano, método e responsável são obrigatórios')
    if (!await this.db.user.findFirst({ where: { id: data.responsible_id, tenant_id: tenantId } })) throw new BadRequestException('Responsável não pertence à organização')
    const instrument = await this.instrument(tenantId, month.instrument_id)
    const config = (instrument.configuration ?? {}) as { approved_plan_version?: string; plan_versions?: { version: string; status: string }[] }
    if (config.approved_plan_version !== data.work_plan_version && !config.plan_versions?.some(p => p.version === data.work_plan_version && p.status === 'APROVADO')) throw new BadRequestException('Versão do Plano de Trabalho não aprovada')
    for (const id of data.evidence_ids ?? []) if ((await this.document(tenantId, id)).project_id !== month.project_id) throw new BadRequestException('Evidência de outro projeto')
    const scope = data.scope?.trim() || 'GERAL'
    const value = await this.db.accountabilityIndicatorResult.upsert({ where: { instrument_id_indicator_id_month_scope: { instrument_id: month.instrument_id, indicator_id: indicator.id, month: month.month, scope } },
      create: { tenant_id: tenantId, instrument_id: month.instrument_id, indicator_id: indicator.id, month: month.month, scope,
        work_plan_version: data.work_plan_version, expected: new Prisma.Decimal(data.expected), actual: data.actual === undefined ? null : new Prisma.Decimal(data.actual),
        method: data.method, responsible_id: data.responsible_id, evidence_ids: data.evidence_ids ?? [], justification: data.justification, source: data.source },
      update: { work_plan_version: data.work_plan_version, expected: new Prisma.Decimal(data.expected), actual: data.actual === undefined ? null : new Prisma.Decimal(data.actual),
        method: data.method, responsible_id: data.responsible_id, evidence_ids: data.evidence_ids ?? [], justification: data.justification, source: data.source } })
    await this.db.monthlyEvent.create({ data: { competence_id: monthId, actor_id: userId, action: 'RESULTADO_INDICADOR', details: { indicator_id: indicator.id, result_id: value.id, scope } } })
    return value
  }
  async saveOfficialDelivery(tenantId: string, instrumentId: string, data: { title: string; period: string; due_at?: string; legal_basis?: string; responsible_id?: string; required_documents?: string[] }) {
    await this.instrument(tenantId, instrumentId)
    if (!data.title?.trim() || !data.period?.trim()) throw new BadRequestException('Informe entrega e período')
    if (data.due_at && (Number.isNaN(Date.parse(data.due_at)) || !data.legal_basis?.trim())) throw new BadRequestException('Prazo oficial exige data válida e fundamento')
    if (data.responsible_id && !await this.db.user.findFirst({ where: { id: data.responsible_id, tenant_id: tenantId } })) throw new BadRequestException('Responsável de outra organização')
    if (data.required_documents && (!Array.isArray(data.required_documents) || !data.required_documents.every(x => typeof x === 'string' && x.trim()))) throw new BadRequestException('Lista de documentos inválida')
    return this.db.officialDelivery.upsert({ where: { instrument_id_period_title: { instrument_id: instrumentId, period: data.period, title: data.title } },
      create: { instrument_id: instrumentId, title: data.title, period: data.period, due_at: data.due_at ? new Date(data.due_at) : null,
        legal_basis: data.legal_basis, responsible_id: data.responsible_id, required_documents: data.required_documents ?? [] },
      update: { due_at: data.due_at ? new Date(data.due_at) : null, legal_basis: data.legal_basis, responsible_id: data.responsible_id,
        required_documents: data.required_documents ?? [] } })
  }
  async updateOfficialDelivery(tenantId: string, id: string, userId: string, data: { status: string; protocol_number?: string; protocol_at?: string; protocol_evidence_id?: string; package_version?: number; decision_document_id?: string; comment?: string; diligence_due_at?: string }) {
    const delivery = await this.db.officialDelivery.findFirst({ where: { id, instrument: { tenant_id: tenantId } } })
    if (!delivery) throw new NotFoundException('Entrega não encontrada')
    if (!['EM_PREPARACAO', 'PRONTO_PARA_ENVIO', 'PROTOCOLADO', 'EM_DILIGENCIA', 'CONCLUIDO'].includes(data.status)) throw new BadRequestException('Estado inválido')
    const next: Record<string, string[]> = { EM_PREPARACAO: ['PRONTO_PARA_ENVIO'], PRONTO_PARA_ENVIO: ['EM_PREPARACAO', 'PROTOCOLADO'],
      PROTOCOLADO: ['EM_DILIGENCIA', 'CONCLUIDO'], EM_DILIGENCIA: ['PROTOCOLADO', 'CONCLUIDO'], CONCLUIDO: [] }
    if (!next[delivery.status]?.includes(data.status)) throw new BadRequestException('Transição oficial inválida')
    if (data.status === 'EM_DILIGENCIA' && (!data.comment?.trim() || !data.diligence_due_at || Number.isNaN(Date.parse(data.diligence_due_at)))) throw new BadRequestException('Diligência exige descrição e prazo')
    const instrument = await this.instrument(tenantId, delivery.instrument_id)
    for (const docId of [data.protocol_evidence_id, data.decision_document_id].filter(Boolean) as string[]) {
      if ((await this.document(tenantId, docId)).project_id !== instrument.project_id) throw new BadRequestException('Documento de outro projeto')
    }
    if (data.status === 'PROTOCOLADO' && (!data.protocol_number || !data.protocol_at || !data.protocol_evidence_id || !data.package_version)) throw new BadRequestException('Protocolo, data, comprovante e versão do pacote são obrigatórios')
    if (data.status === 'CONCLUIDO' && !data.decision_document_id) throw new BadRequestException('Vincule a decisão oficial')
    const history = Array.isArray(delivery.history) ? delivery.history : []
    return this.db.officialDelivery.update({ where: { id }, data: { status: data.status, protocol_number: data.protocol_number ?? delivery.protocol_number,
      protocol_at: data.protocol_at ? new Date(data.protocol_at) : delivery.protocol_at, protocol_evidence_id: data.protocol_evidence_id ?? delivery.protocol_evidence_id,
      package_version: data.package_version ?? delivery.package_version, decision_document_id: data.decision_document_id ?? delivery.decision_document_id,
      history: [...history, { actor_id: userId, at: new Date().toISOString(), status: data.status, comment: data.comment ?? null,
        diligence_due_at: data.diligence_due_at ?? null, protocol_number: data.protocol_number ?? null }] as Prisma.InputJsonValue } })
  }

  async close(tenantId: string, userId: string, monthId: string, dto: CloseDto) {
    const view = await this.overview(tenantId, monthId)
    if (view.month.status !== 'ABERTA') throw new ConflictException('Competência já fechada')
    if (view.blockers.length || view.point.issues.length || view.attendance_pending) throw new BadRequestException('Resolva as pendências críticas de requisitos, presença e ponto antes de fechar')
    const latest = new Map(view.validations.map(v => [v.stage, v]))
    for (const stage of ['ATIVIDADES', 'FINANCEIRO', 'INSTITUCIONAL']) if (latest.get(stage)?.status !== 'APROVADO') throw new BadRequestException(`Validação pendente: ${stage}`)
    if (view.attendance.some(t => t.aulas.some(a => a.status === 'REALIZADA'))) {
      if (latest.get('PROFESSOR')?.status !== 'APROVADO') throw new BadRequestException('Confirmação do professor pendente')
      if (!view.month.documents.some(d => d.kind === 'PONTO' && d.signed_document_id)) throw new BadRequestException('Folha de ponto assinada pendente')
    }
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
