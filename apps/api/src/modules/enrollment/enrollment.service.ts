import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { ApplyEnrollmentDto, SaveClassDto, UpdateClassDto } from './dto/enrollment.dto'

@Injectable()
export class EnrollmentService {
  constructor(private prisma: PrismaService) {}

  async publicClasses(slug: string, courseId?: string) {
    const tenant = await this.activeTenant(slug)
    const course = courseId ? await this.prisma.curso.findFirst({ where: { id: courseId, tenant_id: tenant.id, ativo: true, inscricoes_abertas: true }, select: { id: true, nome: true, tipo: true } }) : null
    if (courseId && !course) throw new NotFoundException('Curso ou modalidade indisponível para matrícula')
    const classes = await this.prisma.turma.findMany({
      where: { tenant_id: tenant.id, deleted_at: null, capacidade: { not: null }, ...(courseId ? { curso_id: courseId } : { OR: [{ curso_id: null }, { curso: { ativo: true, inscricoes_abertas: true } }] }) },
      select: { id: true, nome: true, capacidade: true, curso: { select: { id: true, nome: true, tipo: true } }, project: { select: { name: true } }, _count: { select: { matriculas: { where: { status: 'ATIVA' } } } } },
      orderBy: { nome: 'asc' },
    })
    return { organization: tenant.name, course, classes: classes.map(({ _count, ...turma }) => ({ ...turma, vagas: Math.max(0, (turma.capacidade ?? 0) - _count.matriculas) })) }
  }

  async adminClasses(tenantId: string) {
    const classes = await this.prisma.turma.findMany({
      where: { tenant_id: tenantId, deleted_at: null },
      select: { id: true, nome: true, capacidade: true, curso_id: true, curso: { select: { id: true, nome: true } }, project: { select: { name: true } }, _count: { select: { matriculas: { where: { status: 'ATIVA' } } } } },
      orderBy: { nome: 'asc' },
    })
    const waiting = await this.prisma.matricula.groupBy({
      by: ['turma_id'], where: { tenant_id: tenantId, status: 'EM_ESPERA' }, _count: { _all: true },
    })
    const waitingByClass = new Map(waiting.map((group) => [group.turma_id, group._count._all]))
    return classes.map(({ _count, ...turma }) => ({ ...turma, inscritos: _count.matriculas, espera: waitingByClass.get(turma.id) ?? 0, vagas: turma.capacidade === null ? null : Math.max(0, turma.capacidade - _count.matriculas) }))
  }

  async createClass(tenantId: string, dto: SaveClassDto) {
    if (dto.project_id) await this.assertProject(tenantId, dto.project_id)
    if (dto.curso_id) await this.assertCourse(tenantId, dto.curso_id)
    return this.prisma.turma.create({ data: { tenant_id: tenantId, nome: dto.nome.trim(), capacidade: dto.capacidade, project_id: dto.project_id || null, curso_id: dto.curso_id || null } })
  }

  async updateClass(tenantId: string, classId: string, dto: UpdateClassDto) {
    if (dto.curso_id) await this.assertCourse(tenantId, dto.curso_id)
    return this.prisma.$transaction(async (tx) => {
      await this.lockClass(tx, tenantId, classId)
      const turma = await tx.turma.update({ where: { id: classId }, data: { ...(dto.nome !== undefined && { nome: dto.nome.trim() }), ...(dto.capacidade !== undefined && { capacidade: dto.capacidade }), ...(dto.curso_id !== undefined && { curso_id: dto.curso_id || null }) } })
      if (dto.curso_id) {
        const students = await tx.matricula.findMany({ where: { tenant_id: tenantId, turma_id: classId, status: 'ATIVA' }, select: { aluno_id: true } })
        if (students.length) await tx.curso.update({ where: { id: dto.curso_id }, data: { alunos: { connect: students.map(item => ({ id: item.aluno_id })) } } })
      }
      let promoted = 0
      if (dto.capacidade !== undefined) {
        const active = await tx.matricula.count({ where: { turma_id: classId, status: 'ATIVA' } })
        const vacancies = Math.max(0, dto.capacidade - active)
        if (vacancies > 0) {
          const waiting = await tx.matricula.findMany({ where: { turma_id: classId, status: 'EM_ESPERA' }, orderBy: [{ created_at: 'asc' }, { id: 'asc' }], take: vacancies, select: { id: true, aluno_id: true } })
          if (waiting.length) {
            const result = await tx.matricula.updateMany({ where: { id: { in: waiting.map((item) => item.id) }, status: 'EM_ESPERA' }, data: { status: 'ATIVA' } })
            promoted = result.count
            for (const item of waiting) await this.linkCourseStudent(tx, turma.curso_id, item.aluno_id)
          }
        }
      }
      return { turma, promoted }
    })
  }

  async classEnrollments(tenantId: string, classId: string) {
    await this.assertClass(tenantId, classId)
    return this.prisma.matricula.findMany({
      where: { tenant_id: tenantId, turma_id: classId },
      select: { id: true, status: true, created_at: true, solicitante_tipo: true, solicitante_nome: true, solicitante_contato: true, aluno: { select: { id: true, name: true, birth_date: true, cpf: true, responsaveis: { select: { nome_completo: true, telefone: true } } } } },
      orderBy: [{ status: 'asc' }, { created_at: 'asc' }],
    })
  }

  async apply(slug: string, dto: ApplyEnrollmentDto, userId?: string) {
    if (!dto.consentimento) throw new BadRequestException('É necessário confirmar o consentimento para cadastrar o aluno')
    const birthDate = new Date(dto.aluno_nascimento)
    if (birthDate > new Date()) throw new BadRequestException('A data de nascimento não pode ser futura')
    const adultCutoff = new Date()
    adultCutoff.setFullYear(adultCutoff.getFullYear() - 18)
    const hasPersonalConsent = dto.solicitante_tipo === 'RESPONSAVEL' || (dto.solicitante_tipo === 'ALUNO' && birthDate <= adultCutoff)
    const tenant = await this.activeTenant(slug)
    const cpf = dto.aluno_cpf?.replace(/\D/g, '') || null
    if (cpf && cpf.length !== 11) throw new BadRequestException('CPF do aluno deve conter 11 dígitos')
    try {
      return await this.prisma.$transaction(async (tx) => {
        const turma = await this.lockClass(tx, tenant.id, dto.turma_id)
        if (dto.curso_id && turma.curso_id !== dto.curso_id) throw new BadRequestException('A turma não pertence ao curso ou modalidade deste link')
        if (turma.curso && (!turma.curso.ativo || !turma.curso.inscricoes_abertas)) throw new BadRequestException('As inscrições deste curso ou modalidade estão encerradas')
        if (cpf) {
          const existing = await tx.beneficiary.findUnique({ where: { tenant_id_cpf: { tenant_id: tenant.id, cpf } }, select: { id: true, name: true, birth_date: true, deleted_at: true } })
          if (existing) {
            const normalizeName = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR')
            if (existing.deleted_at || normalizeName(existing.name) !== normalizeName(dto.aluno_nome) || existing.birth_date?.toISOString().slice(0, 10) !== birthDate.toISOString().slice(0, 10)) {
              throw new ConflictException('Já existe um cadastro para este aluno. Procure a organização para conferir os dados e realizar a matrícula.')
            }
            return this.enrollLocked(tx, tenant.id, turma, existing.id, dto.solicitante_tipo, dto.solicitante_nome, dto.solicitante_contato)
          }
        }
        const sameEnrollment = await tx.beneficiary.findFirst({
          where: { tenant_id: tenant.id, name: { equals: dto.aluno_nome.trim(), mode: 'insensitive' }, birth_date: birthDate, matriculas: { some: { turma_id: turma.id, status: { in: ['ATIVA', 'EM_ESPERA'] } } } },
          select: { id: true },
        })
        if (sameEnrollment) throw new ConflictException('Este aluno já está inscrito nesta turma. Procure a organização se precisar alterar os dados.')
        const student = await tx.beneficiary.create({
          data: {
            tenant_id: tenant.id,
            name: dto.aluno_nome.trim(),
            birth_date: birthDate,
            cpf,
            telefone: dto.aluno_telefone?.trim() || null,
            email: dto.aluno_email?.trim() || null,
            termo_consentimento: hasPersonalConsent,
            data_consentimento: hasPersonalConsent ? new Date() : null,
            created_by: userId || null,
            turma: turma.nome,
            project_id: turma.project_id,
            ...(dto.solicitante_tipo === 'RESPONSAVEL' && {
              responsaveis: { create: { nome_completo: dto.solicitante_nome.trim(), parentesco: dto.parentesco ?? 'OUTRO', telefone: dto.solicitante_contato.trim() } },
            }),
          },
        })
        return this.enrollLocked(tx, tenant.id, turma, student.id, dto.solicitante_tipo, dto.solicitante_nome, dto.solicitante_contato)
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Este aluno já possui cadastro. Procure a organização para realizar a matrícula.')
      }
      throw error
    }
  }

  async enrollExisting(tenantId: string, classId: string, studentId: string) {
    return this.prisma.$transaction(async (tx) => {
      const turma = await this.lockClass(tx, tenantId, classId)
      const student = await tx.beneficiary.findFirst({ where: { id: studentId, tenant_id: tenantId, deleted_at: null }, select: { id: true } })
      if (!student) throw new NotFoundException('Aluno não encontrado')
      return this.enrollLocked(tx, tenantId, turma, studentId, 'ADMIN', null, null)
    })
  }

  async closeEnrollment(tenantId: string, enrollmentId: string) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.matricula.findFirst({ where: { id: enrollmentId, tenant_id: tenantId }, select: { turma_id: true } })
      if (!current) throw new NotFoundException('Matrícula não encontrada')
      const turma = await this.lockClass(tx, tenantId, current.turma_id)
      const enrollment = await tx.matricula.findUniqueOrThrow({ where: { id: enrollmentId }, select: { status: true } })
      if (enrollment.status === 'CONCLUIDA') throw new BadRequestException('Matrícula já encerrada')
      await tx.matricula.update({ where: { id: enrollmentId }, data: { status: 'CONCLUIDA' } })
      let promoted = null
      if (enrollment.status === 'ATIVA') {
        const active = await tx.matricula.count({ where: { turma_id: turma.id, status: 'ATIVA' } })
        if (turma.capacidade === null || active < turma.capacidade) {
          const next = await tx.matricula.findFirst({ where: { turma_id: turma.id, status: 'EM_ESPERA' }, orderBy: [{ created_at: 'asc' }, { id: 'asc' }], select: { id: true, aluno_id: true, aluno: { select: { name: true } } } })
          if (next) {
            await tx.matricula.update({ where: { id: next.id }, data: { status: 'ATIVA' } })
            promoted = next.aluno.name
            await this.linkCourseStudent(tx, turma.curso_id, next.aluno_id)
          }
        }
      }
      return { closed: enrollmentId, promoted }
    })
  }

  async deleteEnrollment(tenantId: string, enrollmentId: string) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.matricula.findFirst({ where: { id: enrollmentId, tenant_id: tenantId }, select: { turma_id: true } })
      if (!current) throw new NotFoundException('Inscrição não encontrada')
      const turma = await this.lockClass(tx, tenantId, current.turma_id)
      const enrollment = await tx.matricula.findFirst({ where: { id: enrollmentId, tenant_id: tenantId, turma_id: turma.id }, select: { status: true } })
      if (!enrollment) throw new NotFoundException('Inscrição não encontrada')
      await tx.matricula.delete({ where: { id: enrollmentId } })

      let promoted = null
      if (enrollment.status === 'ATIVA') {
        const active = await tx.matricula.count({ where: { turma_id: turma.id, status: 'ATIVA' } })
        if (turma.capacidade === null || active < turma.capacidade) {
          const next = await tx.matricula.findFirst({ where: { turma_id: turma.id, status: 'EM_ESPERA' }, orderBy: [{ created_at: 'asc' }, { id: 'asc' }], select: { id: true, aluno_id: true, aluno: { select: { name: true } } } })
          if (next) {
            await tx.matricula.update({ where: { id: next.id }, data: { status: 'ATIVA' } })
            promoted = next.aluno.name
            await this.linkCourseStudent(tx, turma.curso_id, next.aluno_id)
          }
        }
      }
      return { deleted: enrollmentId, promoted }
    })
  }

  private async enrollLocked(tx: Prisma.TransactionClient, tenantId: string, turma: { id: string; nome: string; capacidade: number | null; curso_id?: string | null }, studentId: string, role: string, applicantName: string | null, applicantContact: string | null) {
    if (turma.capacidade === null) throw new BadRequestException('Defina a capacidade da turma antes de inscrever alunos')
    const existing = await tx.matricula.findUnique({ where: { turma_id_aluno_id: { turma_id: turma.id, aluno_id: studentId } }, select: { id: true } })
    if (existing) throw new ConflictException('Aluno já inscrito nesta turma')
    const active = await tx.matricula.count({ where: { turma_id: turma.id, status: 'ATIVA' } })
    const status = turma.capacidade !== null && active >= turma.capacidade ? 'EM_ESPERA' : 'ATIVA'
    const enrollment = await tx.matricula.create({ data: { tenant_id: tenantId, turma_id: turma.id, aluno_id: studentId, status, solicitante_tipo: role, solicitante_nome: applicantName, solicitante_contato: applicantContact } })
    if (status === 'ATIVA') await this.linkCourseStudent(tx, turma.curso_id, studentId)
    const position = status === 'EM_ESPERA' ? await tx.matricula.count({ where: { turma_id: turma.id, status: 'EM_ESPERA' } }) : null
    return { id: enrollment.id, turma: turma.nome, status, posicao_espera: position }
  }

  private async linkCourseStudent(tx: Prisma.TransactionClient, courseId: string | null | undefined, studentId: string) {
    if (courseId) await tx.curso.update({ where: { id: courseId }, data: { alunos: { connect: { id: studentId } } } })
  }

  private async lockClass(tx: Prisma.TransactionClient, tenantId: string, classId: string) {
    await tx.$queryRaw`SELECT id FROM "turmas" WHERE id = ${classId} AND tenant_id = ${tenantId} AND deleted_at IS NULL FOR UPDATE`
    const turma = await tx.turma.findFirst({ where: { id: classId, tenant_id: tenantId, deleted_at: null }, select: { id: true, nome: true, capacidade: true, project_id: true, curso_id: true, curso: { select: { ativo: true, inscricoes_abertas: true } } } })
    if (!turma) throw new NotFoundException('Turma não encontrada')
    return turma
  }

  private async assertClass(tenantId: string, classId: string) {
    const turma = await this.prisma.turma.findFirst({ where: { id: classId, tenant_id: tenantId, deleted_at: null }, select: { id: true } })
    if (!turma) throw new NotFoundException('Turma não encontrada')
  }

  private async assertProject(tenantId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, tenant_id: tenantId, deleted_at: null }, select: { id: true } })
    if (!project) throw new NotFoundException('Projeto não encontrado')
  }

  private async assertCourse(tenantId: string, id: string) {
    const course = await this.prisma.curso.findFirst({ where: { id, tenant_id: tenantId }, select: { id: true } })
    if (!course) throw new NotFoundException('Curso ou modalidade não encontrado')
  }

  private async activeTenant(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug }, select: { id: true, name: true, status: true, deleted_at: true } })
    if (!tenant || tenant.deleted_at || !['ACTIVE', 'TRIAL'].includes(tenant.status)) throw new NotFoundException('Organização não encontrada')
    return tenant
  }
}
