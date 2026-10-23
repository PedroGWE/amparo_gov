import { BadRequestException, Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common'
import { FastifyReply, FastifyRequest } from 'fastify'
import '@fastify/multipart'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtPayload } from '../auth/types/jwt-payload'
import { EducaService } from './educa.service'
import {
  AccountDto,
  ActivityDto,
  AttendanceDto,
  ClassDto,
  EnrollmentDto,
  GradeDto,
  LessonDto,
  MaterialDto,
  SubmissionDto,
} from './educa.dto'
@Controller('educa')
export class EducaController {
  constructor(private service: EducaService) {}
  @Get('resumo') overview(@CurrentUser() u: JwtPayload) {
    return this.service.overview(u)
  }
  @Get('turmas') classes(@CurrentUser() u: JwtPayload) {
    return this.service.classes(u)
  }
  @Get('cadastros') catalog(@CurrentUser() u: JwtPayload) {
    return this.service.catalog(u)
  }
  @Post('acessos') account(@CurrentUser() u: JwtPayload, @Body() dto: AccountDto) {
    return this.service.account(u, dto)
  }
  @Post('turmas') createClass(@CurrentUser() u: JwtPayload, @Body() dto: ClassDto) {
    return this.service.createClass(u, dto)
  }
  @Get('turmas/:id') detail(@CurrentUser() u: JwtPayload, @Param('id') id: string) {
    return this.service.detail(u, id)
  }
  @Post('turmas/:id/matriculas') enroll(
    @CurrentUser() u: JwtPayload,
    @Param('id') id: string,
    @Body() dto: EnrollmentDto,
  ) {
    return this.service.enroll(u, id, dto.aluno_id)
  }
  @Post('turmas/:id/aulas') lesson(
    @CurrentUser() u: JwtPayload,
    @Param('id') id: string,
    @Body() dto: LessonDto,
  ) {
    return this.service.lesson(u, id, dto)
  }
  @Post('aulas/:id/rascunho') draft(
    @CurrentUser() u: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AttendanceDto,
  ) {
    return this.service.attendance(u, id, dto, false)
  }
  @Post('aulas/:id/enviar') send(
    @CurrentUser() u: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AttendanceDto,
  ) {
    return this.service.attendance(u, id, dto, true)
  }
  @Post('aulas/:id/reabrir') reopen(@CurrentUser() u: JwtPayload, @Param('id') id: string) {
    return this.service.reopen(u, id)
  }
  @Get('chamadas') report(@CurrentUser() u: JwtPayload) {
    return this.service.report(u)
  }
  @Post('turmas/:id/materiais') material(
    @CurrentUser() u: JwtPayload,
    @Param('id') id: string,
    @Body() dto: MaterialDto,
  ) {
    return this.service.material(u, id, dto)
  }
  @Post('turmas/:id/atividades') activity(
    @CurrentUser() u: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ActivityDto,
  ) {
    return this.service.activity(u, id, dto)
  }
  @Post('atividades/:id/entrega') submit(
    @CurrentUser() u: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SubmissionDto,
  ) {
    return this.service.submit(u, id, dto)
  }
  @Post('entregas/:id/avaliar') grade(
    @CurrentUser() u: JwtPayload,
    @Param('id') id: string,
    @Body() dto: GradeDto,
  ) {
    return this.service.grade(u, id, dto)
  }
  @Post('turmas/:id/arquivos') async upload(
    @CurrentUser() u: JwtPayload,
    @Param('id') id: string,
    @Req() req: FastifyRequest,
  ) {
    await this.service.classAccess(u, id)
    const file = await req.file()
    if (!file) throw new BadRequestException('Selecione um arquivo.')
    const buffer = await file.toBuffer().catch(() => {
      throw new BadRequestException('Limite de 10 MB excedido.')
    })
    return this.service.upload(u, id, buffer, file.filename, file.mimetype)
  }
  @Get('arquivos/:id') async download(
    @CurrentUser() u: JwtPayload,
    @Param('id') id: string,
    @Res() reply: FastifyReply,
  ) {
    const f = await this.service.download(u, id)
    return reply
      .header('Content-Type', f.mime)
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.nome)}`)
      .send(f.stream)
  }
}
