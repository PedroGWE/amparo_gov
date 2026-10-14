import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { JwtPayload } from '../auth/types/jwt-payload'
import {
  AccountDto,
  ActivityDto,
  AttendanceDto,
  ClassDto,
  GradeDto,
  LessonDto,
  MaterialDto,
  SubmissionDto,
} from './educa.dto'
import * as bcrypt from 'bcryptjs'
import { createReadStream } from 'fs'
import { mkdir, writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { Prisma } from '@prisma/client'

@Injectable()
export class EducaService {
  constructor(private db: PrismaService) {}
  manager(u: JwtPayload) {
    return u.permissions.includes('*') || u.permissions.includes('educa:manage')
  }
  requireManager(u: JwtPayload) {
    if (!this.manager(u)) throw new ForbiddenException('Acesso exclusivo do gestor.')
  }
  async classAccess(u: JwtPayload, id: string, write = false) {
    const turma = await this.db.turma.findFirst({
      where: { id, tenant_id: u.tenantId, deleted_at: null },
    })
    if (!turma) throw new NotFoundException('Turma não encontrada.')
    if (this.manager(u)) return turma
    if (u.permissions.includes('conecta:teacher') && turma.professor_id === u.sub) return turma
    if (!write && u.permissions.includes('conecta:student')) {
      const enrolled = await this.db.matricula.count({
        where: {
          tenant_id: u.tenantId,
          turma_id: id,
          status: 'ATIVA',
          aluno: { user_id: u.sub, status: 'ATIVO' },
        },
      })
      if (enrolled) return turma
    }
    throw new ForbiddenException('Você não possui acesso a esta turma.')
  }
  async classes(u: JwtPayload) {
    const scope: Prisma.TurmaWhereInput = this.manager(u)
      ? {}
      : {
          OR: [
            ...(u.permissions.includes('conecta:teacher') ? [{ professor_id: u.sub }] : []),
            ...(u.permissions.includes('conecta:student')
              ? [
                  {
                    matriculas: {
                      some: {
                        status: 'ATIVA' as const,
                        aluno: { user_id: u.sub, status: 'ATIVO' as const },
                      },
                    },
                  },
                ]
              : []),
          ],
        }
    return this.db.turma.findMany({
      where: { tenant_id: u.tenantId, deleted_at: null, ...scope },
      select: {
        id: true,
        nome: true,
        professor_id: true,
        _count: { select: { matriculas: true, aulas: true } },
      },
      orderBy: { nome: 'asc' },
    })
  }
  async catalog(u: JwtPayload) {
    this.requireManager(u)
    const [alunos, professores, projects] = await Promise.all([
      this.db.beneficiary.findMany({
        where: { tenant_id: u.tenantId, status: 'ATIVO' },
        select: { id: true, name: true, user_id: true, user: { select: { student_code: true } } },
        orderBy: { name: 'asc' },
      }),
      this.db.professor.findMany({
        where: { tenant_id: u.tenantId, status: 'ATIVO' },
        select: { id: true, nome_completo: true, user_id: true },
        orderBy: { nome_completo: 'asc' },
      }),
      this.db.project.findMany({
        where: { tenant_id: u.tenantId, deleted_at: null },
        select: { id: true, name: true },
      }),
    ])
    return { alunos, professores, projects }
  }
  async account(u: JwtPayload, dto: AccountDto) {
    this.requireManager(u)
    const student = dto.perfil === 'aluno'
    if (student ? !dto.matricula : !dto.email)
      throw new BadRequestException('Informe matrícula do aluno ou e-mail do professor.')
    const password_hash = await bcrypt.hash(dto.senha, 12)
    return this.db.$transaction(async (tx) => {
      const record = student
        ? await tx.beneficiary.findFirst({
            where: { id: dto.registro_id, tenant_id: u.tenantId, status: 'ATIVO' },
          })
        : await tx.professor.findFirst({
            where: { id: dto.registro_id, tenant_id: u.tenantId, status: 'ATIVO' },
          })
      if (!record) throw new NotFoundException('Cadastro ativo não encontrado.')
      const code = student ? dto.matricula!.toUpperCase() : null
      const email = student ? `aluno-${record.id}@educa.invalid` : dto.email!.trim().toLowerCase()
      if (
        await tx.user.findFirst({
          where: {
            tenant_id: u.tenantId,
            id: { not: record.user_id ?? '' },
            OR: [{ email }, ...(code ? [{ student_code: code }] : [])],
          },
        })
      )
        throw new ConflictException(
          'E-mail ou matrícula já possui acesso. Utilize outro identificador.',
        )
      const role = await tx.role.upsert({
        where: {
          tenant_id_name: {
            tenant_id: u.tenantId,
            name: student ? 'EDUCA_ALUNO' : 'EDUCA_PROFESSOR',
          },
        },
        update: {},
        create: {
          tenant_id: u.tenantId,
          name: student ? 'EDUCA_ALUNO' : 'EDUCA_PROFESSOR',
          permissions: [student ? 'conecta:student' : 'conecta:teacher'],
        },
      })
      const name = 'name' in record ? record.name : record.nome_completo
      const user = record.user_id
        ? await tx.user.update({
            where: { id: record.user_id },
            data: { password_hash, student_code: code, email },
          })
        : await tx.user.create({
            data: {
              tenant_id: u.tenantId,
              name,
              email,
              student_code: code,
              password_hash,
              user_roles: { create: { role_id: role.id } },
            },
          })
      if (student)
        await tx.beneficiary.update({ where: { id: record.id }, data: { user_id: user.id } })
      else await tx.professor.update({ where: { id: record.id }, data: { user_id: user.id } })
      await tx.refreshToken.updateMany({
        where: { user_id: user.id, revoked_at: null },
        data: { revoked_at: new Date() },
      })
      return { id: user.id, matricula: code, email: student ? null : email }
    })
  }
  async createClass(u: JwtPayload, dto: ClassDto) {
    this.requireManager(u)
    if (
      !(await this.db.professor.count({
        where: { tenant_id: u.tenantId, user_id: dto.professor_id, status: 'ATIVO' },
      }))
    )
      throw new BadRequestException('Selecione um professor com acesso cadastrado.')
    if (
      dto.project_id &&
      !(await this.db.project.count({
        where: { id: dto.project_id, tenant_id: u.tenantId, deleted_at: null },
      }))
    )
      throw new BadRequestException('Projeto inválido.')
    return this.db.turma.create({ data: { ...dto, tenant_id: u.tenantId } })
  }
  async enroll(u: JwtPayload, turma_id: string, aluno_id: string) {
    this.requireManager(u)
    await this.classAccess(u, turma_id, true)
    if (
      !(await this.db.beneficiary.count({
        where: { id: aluno_id, tenant_id: u.tenantId, status: 'ATIVO' },
      }))
    )
      throw new BadRequestException('Beneficiário inválido.')
    return this.db.matricula.upsert({
      where: { turma_id_aluno_id: { turma_id, aluno_id } },
      update: { status: 'ATIVA' },
      create: { tenant_id: u.tenantId, turma_id, aluno_id },
    })
  }
  async detail(u: JwtPayload, id: string) {
    const turma = await this.classAccess(u, id)
    const canTeach =
      this.manager(u) || (u.permissions.includes('conecta:teacher') && turma.professor_id === u.sub)
    const [aulas, materiais, atividades, matriculas] = await Promise.all([
      this.db.educaAula.findMany({
        where: { turma_id: id, tenant_id: u.tenantId },
        include: {
          presencas: { where: canTeach ? {} : { matricula: { aluno: { user_id: u.sub } } } },
        },
        orderBy: { inicio: 'desc' },
      }),
      this.db.educaMaterial.findMany({
        where: { turma_id: id, tenant_id: u.tenantId },
        orderBy: { created_at: 'desc' },
      }),
      this.db.atividade.findMany({
        where: { turma_id: id, tenant_id: u.tenantId, status: { not: 'RASCUNHO' } },
        include: {
          entregas: {
            where: canTeach ? {} : { matricula: { aluno: { user_id: u.sub } } },
            include: { matricula: { select: { aluno: { select: { name: true } } } } },
          },
        },
        orderBy: { created_at: 'desc' },
      }),
      this.db.matricula.findMany({
        where: {
          turma_id: id,
          tenant_id: u.tenantId,
          ...(canTeach ? {} : { aluno: { user_id: u.sub } }),
        },
        select: { id: true, status: true, aluno: { select: { name: true } } },
      }),
    ])
    return { turma, canTeach, aulas, materiais, atividades, matriculas }
  }
  async lesson(u: JwtPayload, turma_id: string, dto: LessonDto) {
    await this.classAccess(u, turma_id, true)
    if (new Date(dto.fim) <= new Date(dto.inicio))
      throw new BadRequestException('O fim deve ser posterior ao início.')
    return this.db.educaAula.create({
      data: {
        ...dto,
        inicio: new Date(dto.inicio),
        fim: new Date(dto.fim),
        tenant_id: u.tenantId,
        turma_id,
      },
    })
  }
  async attendance(u: JwtPayload, id: string, dto: AttendanceDto, send: boolean) {
    const aula = await this.db.educaAula.findFirst({ where: { id, tenant_id: u.tenantId } })
    if (!aula) throw new NotFoundException()
    await this.classAccess(u, aula.turma_id, true)
    if (aula.chamada_enviada_at)
      throw new ConflictException('Chamada já enviada. O gestor pode reabrir para correção.')
    const roster = await this.db.matricula.findMany({
      where: { turma_id: aula.turma_id, tenant_id: u.tenantId, status: 'ATIVA' },
      select: { id: true },
    })
    const ids = new Set(roster.map((x) => x.id))
    if (
      new Set(dto.itens.map((x) => x.matricula_id)).size !== dto.itens.length ||
      dto.itens.some((x) => !ids.has(x.matricula_id))
    )
      throw new BadRequestException('Lista de alunos inválida.')
    if (send && (dto.itens.length !== roster.length || !roster.length))
      throw new BadRequestException('Marque todos os alunos antes de enviar.')
    return this.db.$transaction(async (tx) => {
      const claimed = await tx.educaAula.updateMany({
        where: { id, versao: dto.versao, chamada_enviada_at: null },
        data: {
          versao: { increment: 1 },
          ...(send ? { chamada_enviada_at: new Date(), enviada_por: u.sub } : {}),
        },
      })
      if (!claimed.count) throw new ConflictException('A chamada mudou. Atualize a página.')
      for (const item of dto.itens)
        await tx.educaPresenca.upsert({
          where: { aula_id_matricula_id: { aula_id: id, matricula_id: item.matricula_id } },
          update: { status: item.status },
          create: { aula_id: id, ...item },
        })
      await tx.auditLog.create({
        data: {
          tenant_id: u.tenantId,
          user_id: u.sub,
          action: send ? 'EDUCA_CHAMADA_ENVIADA' : 'EDUCA_CHAMADA_RASCUNHO',
          resource: 'EducaAula',
          resource_id: id,
          new_value: { itens: dto.itens.map((x) => ({ ...x })) },
        },
      })
      return { enviada: send }
    })
  }
  async reopen(u: JwtPayload, id: string) {
    this.requireManager(u)
    return this.db.$transaction(async (tx) => {
      const result = await tx.educaAula.updateMany({
        where: { id, tenant_id: u.tenantId, chamada_enviada_at: { not: null } },
        data: { chamada_enviada_at: null, enviada_por: null, versao: { increment: 1 } },
      })
      if (!result.count) throw new NotFoundException()
      await tx.auditLog.create({
        data: {
          tenant_id: u.tenantId,
          user_id: u.sub,
          action: 'EDUCA_CHAMADA_REABERTA',
          resource: 'EducaAula',
          resource_id: id,
        },
      })
      return result
    })
  }
  async report(u: JwtPayload) {
    this.requireManager(u)
    return this.db.educaAula.findMany({
      where: { tenant_id: u.tenantId },
      include: {
        turma: { select: { nome: true } },
        presencas: { include: { matricula: { select: { aluno: { select: { name: true } } } } } },
      },
      orderBy: { inicio: 'desc' },
    })
  }
  async material(u: JwtPayload, turma_id: string, dto: MaterialDto) {
    await this.classAccess(u, turma_id, true)
    if (dto.anexo_id) await this.ownedFiles(u, turma_id, [dto.anexo_id])
    return this.db.educaMaterial.create({ data: { ...dto, tenant_id: u.tenantId, turma_id } })
  }
  async activity(u: JwtPayload, turma_id: string, dto: ActivityDto) {
    await this.classAccess(u, turma_id, true)
    return this.db.atividade.create({
      data: {
        ...dto,
        prazo: dto.prazo ? new Date(dto.prazo) : undefined,
        turma_id,
        tenant_id: u.tenantId,
        status: 'PUBLICADA',
      },
    })
  }
  async ownedFiles(u: JwtPayload, turma_id: string, ids: string[]) {
    if (
      (await this.db.educaArquivo.count({
        where: { id: { in: ids }, tenant_id: u.tenantId, turma_id, user_id: u.sub },
      })) !== new Set(ids).size
    )
      throw new BadRequestException('Anexo inválido.')
  }
  async submit(u: JwtPayload, id: string, dto: SubmissionDto) {
    const activity = await this.db.atividade.findFirst({
      where: { id, tenant_id: u.tenantId, status: 'PUBLICADA' },
    })
    if (!activity) throw new NotFoundException()
    await this.classAccess(u, activity.turma_id)
    const m = await this.db.matricula.findFirst({
      where: {
        tenant_id: u.tenantId,
        turma_id: activity.turma_id,
        status: 'ATIVA',
        aluno: { user_id: u.sub },
      },
    })
    if (!m) throw new ForbiddenException()
    if (!dto.conteudo.trim() && !dto.anexos.length)
      throw new BadRequestException('Envie texto ou anexo.')
    await this.ownedFiles(u, activity.turma_id, dto.anexos)
    return this.db.$transaction(
      async (tx) => {
        const existing = await tx.entregaAtividade.findUnique({
          where: { atividade_id_matricula_id: { atividade_id: id, matricula_id: m.id } },
        })
        if (existing?.status === 'AVALIADA') throw new ConflictException('Entrega já avaliada.')
        return tx.entregaAtividade.upsert({
          where: { atividade_id_matricula_id: { atividade_id: id, matricula_id: m.id } },
          create: {
            tenant_id: u.tenantId,
            atividade_id: id,
            matricula_id: m.id,
            ...dto,
            entregue_at: new Date(),
            status: 'ENTREGUE',
          },
          update: { ...dto, entregue_at: new Date(), status: 'ENTREGUE' },
        })
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
  }
  async grade(u: JwtPayload, id: string, dto: GradeDto) {
    const e = await this.db.entregaAtividade.findFirst({
      where: { id, tenant_id: u.tenantId },
      include: { atividade: true },
    })
    if (!e) throw new NotFoundException()
    await this.classAccess(u, e.atividade.turma_id, true)
    return this.db.entregaAtividade.update({
      where: { id },
      data: { nota: dto.nota ?? null, feedback: dto.feedback, status: 'AVALIADA' },
    })
  }
  async upload(u: JwtPayload, turma_id: string, buffer: Buffer, nome: string, mime: string) {
    await this.classAccess(u, turma_id)
    const valid =
      (mime === 'application/pdf' && buffer.subarray(0, 5).toString() === '%PDF-') ||
      (mime === 'image/png' &&
        buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
      (mime === 'image/jpeg' && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255)
    if (!valid || buffer.length > 10 * 1024 * 1024)
      throw new BadRequestException('Envie PDF, PNG ou JPG de até 10 MB.')
    const dir = join(process.env.STORAGE_DIR ?? './storage', 'educa')
    await mkdir(dir, { recursive: true })
    const caminho = join(dir, randomUUID())
    await writeFile(caminho, buffer)
    try {
      return await this.db.educaArquivo.create({
        data: {
          tenant_id: u.tenantId,
          turma_id,
          user_id: u.sub,
          nome: nome.slice(0, 200),
          mime,
          caminho,
        },
        select: { id: true, nome: true },
      })
    } catch (e) {
      await unlink(caminho)
      throw e
    }
  }
  async download(u: JwtPayload, id: string) {
    const f = await this.db.educaArquivo.findFirst({ where: { id, tenant_id: u.tenantId } })
    if (!f) throw new NotFoundException()
    const turma = await this.classAccess(u, f.turma_id)
    const staff =
      this.manager(u) || (u.permissions.includes('conecta:teacher') && turma.professor_id === u.sub)
    const material = await this.db.educaMaterial.count({
      where: { anexo_id: id, tenant_id: u.tenantId, turma_id: f.turma_id },
    })
    if (!staff && f.user_id !== u.sub && !material) throw new ForbiddenException()
    return { ...f, stream: createReadStream(f.caminho) }
  }
}
