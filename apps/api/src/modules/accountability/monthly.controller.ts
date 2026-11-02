import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req, Res } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import type { FastifyRequest } from 'fastify'
import '@fastify/multipart'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { MonthlyService } from './monthly.service'
import { MonthlyDocumentsService } from './monthly-documents.service'
import { CloseDto, ExecutionDto, InstrumentDto, OpenMonthDto, PointDto, ProtocolDto, RequirementDto, RuleDto, TeamDto } from './monthly.dto'

@Controller('accountability/monthly')
export class MonthlyController {
  constructor(private monthly: MonthlyService, private documents: MonthlyDocumentsService) {}

  @Get('instruments') @RequirePermissions('accountability:read')
  instruments(@CurrentUser('tenantId') tenant: string, @Query('project_id') project?: string) { return this.monthly.listInstruments(tenant, project) }
  @Post('instruments') @RequirePermissions('accountability:write')
  createInstrument(@CurrentUser('tenantId') tenant: string, @CurrentUser('sub') user: string, @Body() dto: InstrumentDto) { return this.monthly.createInstrument(tenant, user, dto) }
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
  get(@CurrentUser('tenantId') tenant: string, @Param('id') id: string) { return this.monthly.overview(tenant, id) }
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
    @Body() body: { kind: string; format: string; team_id?: string; turma_id?: string }) { return this.documents.generate(tenant, user, id, body.kind, body.format, body.team_id, body.turma_id) }
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
  async file(@CurrentUser('tenantId') tenant: string, @Param('id') id: string, @Param('documentId') doc: string, @Res() reply: FastifyReply) {
    const result = await this.documents.download(tenant, id, doc)
    return reply.header('Content-Disposition', `attachment; filename="${result.filename}"`).send(result.stream)
  }
  @Get(':id/dossier.zip') @RequirePermissions('accountability:read')
  async dossier(@CurrentUser('tenantId') tenant: string, @Param('id') id: string, @Res() reply: FastifyReply) {
    return reply.header('Content-Type', 'application/zip').header('Content-Disposition', `attachment; filename="dossie-${id}.zip"`).send(await this.documents.dossier(tenant, id))
  }
  @Post(':id/close') @RequirePermissions('accountability:review')
  close(@CurrentUser('tenantId') tenant: string, @CurrentUser('sub') user: string, @Param('id') id: string, @Body() dto: CloseDto) { return this.monthly.close(tenant, user, id, dto) }
  @Post(':id/revisions') @RequirePermissions('accountability:review')
  revise(@CurrentUser('tenantId') tenant: string, @CurrentUser('sub') user: string, @Param('id') id: string, @Body() body: { reason: string }) { return this.monthly.revise(tenant, user, id, body.reason) }
  @Post(':id/protocol') @RequirePermissions('accountability:review')
  protocol(@CurrentUser('tenantId') tenant: string, @CurrentUser('sub') user: string, @Param('id') id: string, @Body() dto: ProtocolDto) { return this.monthly.protocol(tenant, user, id, dto) }
}
