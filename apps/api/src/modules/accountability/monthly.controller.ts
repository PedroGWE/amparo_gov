import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import type { FastifyRequest } from 'fastify'
import '@fastify/multipart'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { MonthlyService } from './monthly.service'
import { MonthlyDocumentsService } from './monthly-documents.service'
import { MonthlyAccessGuard } from './monthly-access.guard'
import { CloseDto, ExecutionDto, InstrumentDto, OpenMonthDto, PointDto, ProtocolDto, RequirementDto, RuleDto, TeamDto } from './monthly.dto'

@Controller('accountability/monthly')
@UseGuards(MonthlyAccessGuard)
export class MonthlyController {
  constructor(private monthly: MonthlyService, private documents: MonthlyDocumentsService) {}
  private requirePersonalData(user: { permissions: string[] }) {
    if (!user.permissions.includes('*') && !user.permissions.includes('beneficiarios:read')) throw new ForbiddenException('Sem acesso a dados nominais e frequência individual')
  }

  @Get('instruments') @RequirePermissions('accountability:read')
  instruments(@CurrentUser('tenantId') tenant: string, @Query('project_id') project?: string) { return this.monthly.listInstruments(tenant, project) }
  @Post('instruments') @RequirePermissions('accountability:write')
  createInstrument(@CurrentUser('tenantId') tenant: string, @CurrentUser('sub') user: string, @Body() dto: InstrumentDto) { return this.monthly.createInstrument(tenant, user, dto) }
  @Patch('instruments/:instrumentId') @RequirePermissions('accountability:review')
  configureInstrument(@CurrentUser('tenantId') tenant: string, @CurrentUser('sub') user: string, @Param('instrumentId') id: string, @Body() data: Record<string, unknown>) { return this.monthly.configureInstrument(tenant, id, user, data) }
  @Post('instruments/:instrumentId/plan-versions') @RequirePermissions('accountability:review')
  addPlanVersion(@CurrentUser('tenantId') tenant: string, @CurrentUser('sub') user: string, @Param('instrumentId') id: string,
    @Body() data: { version: string; status: string; document_id: string; effective_from?: string; comment?: string }) { return this.monthly.addPlanVersion(tenant, id, user, data) }
  @Get('instruments/:instrumentId/expenses') @RequirePermissions('accountability:read')
  expenses(@CurrentUser('tenantId') tenant: string, @Param('instrumentId') id: string) { return this.monthly.expenses(tenant, id) }
  @Patch('instruments/:instrumentId/expenses/:transactionId') @RequirePermissions('accountability:write')
  saveExpense(@CurrentUser('tenantId') tenant: string, @CurrentUser('sub') user: string, @Param('instrumentId') id: string, @Param('transactionId') transactionId: string, @Body() data: Record<string, unknown>) { return this.monthly.saveExpense(tenant, id, user, transactionId, data) }
  @Post('expenses/:expenseId/release') @RequirePermissions('accountability:review')
  releaseExpense(@CurrentUser('tenantId') tenant: string, @CurrentUser('sub') user: string, @Param('expenseId') id: string) { return this.monthly.releaseExpense(tenant, id, user) }
  @Post('expenses/:expenseId/payments') @RequirePermissions('accountability:write')
  registerPayment(@CurrentUser('tenantId') tenant: string, @CurrentUser('sub') user: string, @Param('expenseId') id: string,
    @Body() data: { amount: string; paid_at: string; operation_reference: string; evidence_id: string; occurrence?: boolean; justification?: string }) { return this.monthly.registerPayment(tenant, id, user, data) }
  @Post('payments/:paymentId/reconcile') @RequirePermissions('accountability:review')
  reconcile(@CurrentUser('tenantId') tenant: string, @Param('paymentId') id: string, @Body() data: { statement_id: string }) { return this.monthly.reconcilePayment(tenant, id, data.statement_id) }
  @Get('instruments/:instrumentId/official') @RequirePermissions('accountability:read')
  official(@CurrentUser('tenantId') tenant: string, @Param('instrumentId') id: string) { return this.monthly.officialDeliveries(tenant, id) }
  @Post('instruments/:instrumentId/official') @RequirePermissions('accountability:review')
  saveOfficial(@CurrentUser('tenantId') tenant: string, @Param('instrumentId') id: string,
    @Body() data: { title: string; period: string; due_at?: string; legal_basis?: string; responsible_id?: string; required_documents?: string[] }) { return this.monthly.saveOfficialDelivery(tenant, id, data) }
  @Patch('official/:deliveryId') @RequirePermissions('accountability:review')
  updateOfficial(@CurrentUser('tenantId') tenant: string, @CurrentUser('sub') user: string, @Param('deliveryId') id: string,
    @Body() data: { status: string; protocol_number?: string; protocol_at?: string; protocol_evidence_id?: string; package_version?: number; decision_document_id?: string; comment?: string; diligence_due_at?: string }) { return this.monthly.updateOfficialDelivery(tenant, id, user, data) }
  @Get('instruments/:instrumentId/media') @RequirePermissions('accountability:read')
  media(@CurrentUser() actor: { tenantId: string; permissions: string[] }, @Param('instrumentId') id: string) {
    return this.monthly.media(actor.tenantId, id, !actor.permissions.includes('*') && !actor.permissions.includes('beneficiarios:read'))
  }
  @Post('instruments/:instrumentId/media') @RequirePermissions('accountability:write')
  addMedia(@CurrentUser('tenantId') tenant: string, @CurrentUser('sub') user: string, @Param('instrumentId') id: string,
    @Body() data: { lesson_id?: string; document_id: string; kind: string; recorded_on: string; location: string; scope: string; description: string }) { return this.monthly.addMedia(tenant, id, user, data) }
  @Post('media/:mediaId/release') @RequirePermissions('accountability:review')
  releaseMedia(@CurrentUser() actor: { tenantId: string; sub: string; permissions: string[] }, @Param('mediaId') id: string) {
    this.requirePersonalData(actor)
    return this.monthly.releaseMedia(actor.tenantId, id, actor.sub)
  }
  @Get('templates') @RequirePermissions('accountability:read')
  templates(@CurrentUser('tenantId') tenant: string) { return this.monthly.listTemplates(tenant) }
  @Post('templates/:code/versions') @RequirePermissions('accountability:review')
  templateVersion(@CurrentUser('tenantId') tenant: string, @CurrentUser('sub') user: string, @Param('code') code: string,
    @Body() body: { title: string; layout: object; fields: object; rules?: object; scope?: object }) { return this.monthly.versionTemplate(tenant, user, code, body) }
  @Post('instruments/:instrumentId/requirements') @RequirePermissions('accountability:review')
  rule(@CurrentUser('tenantId') tenant: string, @CurrentUser('sub') user: string, @Param('instrumentId') id: string, @Body() dto: RuleDto) { return this.monthly.addRule(tenant, user, id, dto) }

  @Get() @RequirePermissions('accountability:read')
  list(@CurrentUser('tenantId') tenant: string, @Query('instrument_id') instrument?: string) { return this.monthly.list(tenant, instrument) }
  @Post() @RequirePermissions('accountability:write')
  open(@CurrentUser('tenantId') tenant: string, @CurrentUser('sub') user: string, @Body() dto: OpenMonthDto) { return this.monthly.open(tenant, user, dto) }
  @Get(':id') @RequirePermissions('accountability:read')
  async get(@CurrentUser() user: { tenantId: string; permissions: string[] }, @Param('id') id: string) {
    const view = await this.monthly.overview(user.tenantId, id)
    if (user.permissions.includes('*') || user.permissions.includes('beneficiarios:read')) return view
    return { ...view, attendance: view.attendance.map(t => ({ ...t, beneficiarios: t.beneficiarios.map(b => ({
      present: b.present, applicable: b.applicable, pending: b.pending, percent: b.percent,
    })) })) }
  }
  @Get(':id/results') @RequirePermissions('accountability:read')
  results(@CurrentUser('tenantId') tenant: string, @Param('id') id: string) { return this.monthly.indicatorResults(tenant, id) }
  @Post(':id/results') @RequirePermissions('accountability:write')
  saveResult(@CurrentUser('tenantId') tenant: string, @CurrentUser('sub') user: string, @Param('id') id: string,
    @Body() data: { indicator_id: string; scope?: string; work_plan_version: string; expected: string; actual?: string; method: string; responsible_id: string; evidence_ids?: string[]; justification?: string; source?: string }) { return this.monthly.saveIndicatorResult(tenant, id, user, data) }
  @Patch(':id/requirements/:requirementId') @RequirePermissions('accountability:review')
  requirement(@CurrentUser('tenantId') tenant: string, @CurrentUser('sub') user: string, @Param('id') id: string, @Param('requirementId') requirementId: string, @Body() dto: RequirementDto) {
    return this.monthly.requirement(tenant, user, id, requirementId, dto)
  }
  @Post(':id/requirements/:requirementId/confirm') @RequirePermissions('accountability:review')
  confirmRequirement(@CurrentUser('tenantId') tenant: string, @CurrentUser('sub') user: string, @Param('id') id: string,
    @Param('requirementId') requirementId: string, @Body() body: { source_reference: string; blocks_close: boolean }) {
    return this.monthly.confirmRequirement(tenant, user, id, requirementId, body.source_reference, body.blocks_close)
  }
  @Get(':id/team') @RequirePermissions('accountability:read')
  team(@CurrentUser('tenantId') tenant: string, @Param('id') id: string) { return this.monthly.team(tenant, id) }
  @Post(':id/team') @RequirePermissions('accountability:write')
  addTeam(@CurrentUser('tenantId') tenant: string, @CurrentUser('sub') user: string, @Param('id') id: string, @Body() dto: TeamDto) { return this.monthly.addTeam(tenant, user, id, dto) }
  @Post(':id/point') @RequirePermissions('accountability:write')
  point(@CurrentUser('tenantId') tenant: string, @CurrentUser('sub') user: string, @Param('id') id: string, @Body() dto: PointDto) { return this.monthly.addPoint(tenant, user, id, dto) }
  @Patch(':id/lessons/:lessonId/status') @RequirePermissions('accountability:write')
  lessonStatus(@CurrentUser('tenantId') tenant: string, @CurrentUser('sub') user: string, @Param('id') id: string, @Param('lessonId') lessonId: string,
    @Body() body: { status: string }) { return this.monthly.lessonStatus(tenant, user, id, lessonId, body.status) }
  @Post(':id/no-movement') @RequirePermissions('accountability:review')
  noMovement(@CurrentUser('tenantId') tenant: string, @CurrentUser('sub') user: string, @Param('id') id: string, @Body() body: { reason: string }) {
    return this.monthly.noMovement(tenant, user, id, body.reason)
  }
  @Patch(':id/execution') @RequirePermissions('accountability:write')
  execution(@CurrentUser('tenantId') tenant: string, @CurrentUser('sub') user: string, @Param('id') id: string, @Body() dto: ExecutionDto) {
    return this.monthly.saveExecution(tenant, user, id, dto)
  }
  @Post(':id/documents') @RequirePermissions('accountability:write')
  generate(@CurrentUser('tenantId') tenant: string, @CurrentUser('sub') user: string, @Param('id') id: string,
    @CurrentUser() actor: { permissions: string[] }, @Body() body: { kind: string; format: string; team_id?: string; turma_id?: string }) {
    if (['PRESENCA', 'PONTO', 'SERVICOS'].includes(body.kind)) this.requirePersonalData(actor)
    return this.documents.generate(tenant, user, id, body.kind, body.format, body.team_id, body.turma_id)
  }
  @Patch(':id/documents/:documentId/signed') @RequirePermissions('accountability:review')
  signed(@CurrentUser('tenantId') tenant: string, @CurrentUser('sub') user: string, @Param('id') id: string,
    @Param('documentId') doc: string, @Body() body: { document_id: string; signature_state: string }) {
    return this.documents.attachSigned(tenant, user, id, doc, body.document_id, body.signature_state)
  }
  @Post(':id/documents/:documentId/signed-file') @RequirePermissions('accountability:review')
  async signedFile(@CurrentUser('tenantId') tenant: string, @CurrentUser('sub') user: string, @Param('id') id: string,
    @Param('documentId') doc: string, @Req() req: FastifyRequest) {
    const file = await req.file()
    if (!file) throw new BadRequestException('Selecione um PDF assinado')
    const buffer = await file.toBuffer().catch(() => { throw new BadRequestException('PDF excede o limite permitido') })
    return this.documents.uploadSigned(tenant, user, id, doc, { buffer, mimetype: file.mimetype, filename: file.filename })
  }
  @Get(':id/documents/:documentId/file') @RequirePermissions('accountability:read')
  async file(@CurrentUser('tenantId') tenant: string, @CurrentUser() actor: { permissions: string[] }, @Param('id') id: string, @Param('documentId') doc: string, @Res() reply: FastifyReply) {
    this.requirePersonalData(actor)
    const result = await this.documents.download(tenant, id, doc)
    return reply.header('Content-Disposition', `attachment; filename="${result.filename}"`).send(result.stream)
  }
  @Get(':id/dossier.zip') @RequirePermissions('accountability:read')
  async dossier(@CurrentUser('tenantId') tenant: string, @CurrentUser() actor: { permissions: string[] }, @Param('id') id: string, @Res() reply: FastifyReply) {
    this.requirePersonalData(actor)
    return reply.header('Content-Type', 'application/zip').header('Content-Disposition', `attachment; filename="dossie-${id}.zip"`).send(await this.documents.dossier(tenant, id))
  }
  @Post(':id/close') @RequirePermissions('accountability:review')
  close(@CurrentUser('tenantId') tenant: string, @CurrentUser('sub') user: string, @Param('id') id: string, @Body() dto: CloseDto) { return this.monthly.close(tenant, user, id, dto) }
  @Post(':id/validations')
  validateStage(@CurrentUser() actor: { tenantId: string; sub: string; permissions: string[] }, @Param('id') id: string,
    @Body() data: { stage: string; status: string; role: string; comment?: string }) { return this.monthly.validateStage(actor.tenantId, id, actor, data) }
  @Post(':id/reminders') @RequirePermissions('accountability:review')
  reminders(@CurrentUser('tenantId') tenant: string, @Param('id') id: string) { return this.monthly.remind(tenant, id) }
  @Post(':id/revisions') @RequirePermissions('accountability:review')
  revise(@CurrentUser('tenantId') tenant: string, @CurrentUser('sub') user: string, @Param('id') id: string, @Body() body: { reason: string }) { return this.monthly.revise(tenant, user, id, body.reason) }
  @Post(':id/protocol') @RequirePermissions('accountability:review')
  protocol(@CurrentUser('tenantId') tenant: string, @CurrentUser('sub') user: string, @Param('id') id: string, @Body() dto: ProtocolDto) { return this.monthly.protocol(tenant, user, id, dto) }
}
