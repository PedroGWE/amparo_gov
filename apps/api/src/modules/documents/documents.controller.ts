import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import '@fastify/multipart' // augmenta FastifyRequest com req.file()
import {
  DOCUMENT_MAX_SIZE_MB,
  createInstitutionalDocTypeSchema,
  queryInstitutionalDocsSchema,
  uploadInstitutionalDocSchema,
} from '@cidadao/shared'
import { DocumentsService } from './documents.service'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { JwtPayload } from '../auth/types/jwt-payload'

@Controller('documents')
export class DocumentsController {
  constructor(private documents: DocumentsService) {}

  @Get('summary')
  summary(@CurrentUser('tenantId') tenantId: string) {
    return this.documents.summary(tenantId)
  }

  @Get()
  list(@CurrentUser('tenantId') tenantId: string, @Query() query: Record<string, string>) {
    const parsed = queryInstitutionalDocsSchema.safeParse(query)
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors)
    return this.documents.list(tenantId, parsed.data)
  }

  @Post('types')
  createType(@CurrentUser('tenantId') tenantId: string, @Body() body: unknown) {
    const parsed = createInstitutionalDocTypeSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0].message)
    return this.documents.createType(tenantId, parsed.data)
  }

  @Post(':documentTypeId/upload')
  async upload(
    @CurrentUser() user: JwtPayload,
    @Param('documentTypeId') documentTypeId: string,
    @Req() req: FastifyRequest,
  ) {
    const file = await req.file()
    if (!file) throw new BadRequestException('Nenhum arquivo enviado')

    const buffer = await file.toBuffer().catch(() => {
      throw new BadRequestException(`Arquivo excede o tamanho máximo de ${DOCUMENT_MAX_SIZE_MB} MB.`)
    })

    const fields: Record<string, string> = {}
    for (const [name, field] of Object.entries(file.fields)) {
      const f = Array.isArray(field) ? field[0] : field
      if (f && f.type === 'field' && typeof f.value === 'string') fields[name] = f.value
    }
    const parsed = uploadInstitutionalDocSchema.safeParse(fields)
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors)

    return this.documents.upload(
      user.tenantId,
      user.sub,
      documentTypeId,
      { buffer, mimetype: file.mimetype, filename: file.filename },
      parsed.data.valid_until,
    )
  }

  @Get(':id/download')
  async download(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Res() reply: FastifyReply,
  ) {
    const { stream, filename, mimeType } = await this.documents.getDownload(tenantId, id)
    reply
      .header('Content-Type', mimeType)
      .header('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
    return reply.send(stream)
  }

  @Delete(':id')
  remove(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.documents.remove(tenantId, id)
  }
}
