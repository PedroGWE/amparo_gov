import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import { StorageService } from '../documents/storage/storage.service'
import { BeneficiariosService } from './beneficiarios.service'
import { CreateBeneficiarioDto } from './dto/create-beneficiario.dto'
import { UpdateBeneficiarioDto } from './dto/update-beneficiario.dto'
import { QueryBeneficiariosDto } from './dto/query-beneficiarios.dto'
import { CreateResponsavelDto } from './dto/create-responsavel.dto'
import { CreateVinculoDto } from './dto/create-vinculo.dto'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import type { JwtPayload } from '../auth/types/jwt-payload'

@Controller('beneficiarios')
export class BeneficiariosController {
  constructor(private beneficiarios: BeneficiariosService, private storage: StorageService) {}

  // ── CRUD principal ────────────────────────────────────────────

  @Get()
  findAll(@CurrentUser('tenantId') tid: string, @Query() q: QueryBeneficiariosDto) {
    return this.beneficiarios.findAll(tid, q)
  }

  @Post()
  @RequirePermissions('beneficiarios:create')
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateBeneficiarioDto) {
    return this.beneficiarios.create(user.tenantId, user.sub, dto)
  }

  @Get(':id')
  findOne(@CurrentUser('tenantId') tid: string, @Param('id') id: string) {
    return this.beneficiarios.findOne(tid, id)
  }

  @Get(':id/documents/:documentId/download')
  async downloadDocument(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Res() reply: FastifyReply,
  ) {
    const document = await this.beneficiarios.getDocument(tenantId, id, documentId)
    reply.header('Content-Type', document.mime_type || 'application/pdf')
      .header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(document.name)}`)
      .header('Cache-Control', 'private, no-store')
      .header('X-Content-Type-Options', 'nosniff')
    return reply.send(this.storage.readStream(document.file_url!))
  }

  @Patch(':id')
  @RequirePermissions('beneficiarios:update')
  update(
    @CurrentUser('tenantId') tid: string,
    @Param('id') id: string,
    @Body() dto: UpdateBeneficiarioDto,
  ) {
    return this.beneficiarios.update(tid, id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('beneficiarios:delete')
  remove(@CurrentUser('tenantId') tid: string, @Param('id') id: string) {
    return this.beneficiarios.remove(tid, id)
  }

  // ── Responsáveis ─────────────────────────────────────────────

  @Get(':id/responsaveis')
  listResponsaveis(@CurrentUser('tenantId') tid: string, @Param('id') id: string) {
    return this.beneficiarios.listResponsaveis(tid, id)
  }

  @Post(':id/responsaveis')
  @RequirePermissions('beneficiarios:update')
  addResponsavel(
    @CurrentUser('tenantId') tid: string,
    @Param('id') id: string,
    @Body() dto: CreateResponsavelDto,
  ) {
    return this.beneficiarios.addResponsavel(tid, id, dto)
  }

  @Patch(':id/responsaveis/:rId')
  @RequirePermissions('beneficiarios:update')
  updateResponsavel(
    @CurrentUser('tenantId') tid: string,
    @Param('id') id: string,
    @Param('rId') rId: string,
    @Body() dto: Partial<CreateResponsavelDto>,
  ) {
    return this.beneficiarios.updateResponsavel(tid, id, rId, dto)
  }

  @Delete(':id/responsaveis/:rId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('beneficiarios:update')
  removeResponsavel(
    @CurrentUser('tenantId') tid: string,
    @Param('id') id: string,
    @Param('rId') rId: string,
  ) {
    return this.beneficiarios.removeResponsavel(tid, id, rId)
  }

  // ── Vínculos com projetos ─────────────────────────────────────

  @Get(':id/vinculos')
  listVinculos(@CurrentUser('tenantId') tid: string, @Param('id') id: string) {
    return this.beneficiarios.listVinculos(tid, id)
  }

  @Post(':id/vinculos')
  @RequirePermissions('beneficiarios:update')
  addVinculo(
    @CurrentUser('tenantId') tid: string,
    @Param('id') id: string,
    @Body() dto: CreateVinculoDto,
  ) {
    return this.beneficiarios.addVinculo(tid, id, dto)
  }

  @Patch(':id/vinculos/:vId')
  @RequirePermissions('beneficiarios:update')
  updateVinculo(
    @CurrentUser('tenantId') tid: string,
    @Param('id') id: string,
    @Param('vId') vId: string,
    @Body() dto: Partial<CreateVinculoDto>,
  ) {
    return this.beneficiarios.updateVinculo(tid, id, vId, dto)
  }

  @Delete(':id/vinculos/:vId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('beneficiarios:update')
  removeVinculo(
    @CurrentUser('tenantId') tid: string,
    @Param('id') id: string,
    @Param('vId') vId: string,
  ) {
    return this.beneficiarios.removeVinculo(tid, id, vId)
  }
}
