import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { CreateProjectClassDto, CreateProjectRoutineDto, SaveProjectAttendanceDto } from './dto/project-management.dto'

@Injectable()
export class ProjectManagementService {
  constructor(private prisma: PrismaService) {}

  private async project(tenantId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, tenant_id: tenantId, deleted_at: null }, select: { id: true } })
    if (!project) throw new NotFoundException('Projeto não encontrado')
    return project
  }

  private async projectClass(tenantId: string, projectId: string, classId: string) {
    await this.project(tenantId, projectId)
    const turma = await this.prisma.turma.findFirst({ where: { id: classId, tenant_id: tenantId, project_id: projectId, deleted_at: null } })
    if (!turma) throw new NotFoundException('Turma não encontrada neste projeto')
    return turma
  }

  async dashboard(tenantId: string, projectId: string) {
    await this.project(tenantId, projectId)
    const [students, classes] = await Promise.all([
      this.prisma.beneficiary.findMany({
        where: { tenant_id: tenantId, deleted_at: null, OR: [
          { vinculos_projetos: { some: { project_id: projectId, status: 'ATIVO' } } },
          { project_id: projectId },
          { matriculas: { some: { status: 'ATIVA', turma: { project_id: projectId, deleted_at: null } } } },
        ] },
        select: { id: true, name: true, status: true, turma: true, vinculos_projetos: { where: { status: 'ATIVO' }, select: { id: true, project_id: true, project: { select: { name: true } } } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.turma.findMany({
        where: { tenant_id: tenantId, project_id: projectId, deleted_at: null },
        select: {
          id: true, nome: true, capacidade: true, horario: true,
          _count: { select: { atividades: true } },
          matriculas: { where: { status: { in: ['ATIVA', 'EM_ESPERA'] } }, select: { id: true, status: true, aluno: { select: { id: true, name: true } } }, orderBy: { aluno: { name: 'asc' } } },
          atividades: { select: { id: true, titulo: true, descricao: true, prazo: true, status: true }, orderBy: { created_at: 'desc' }, take: 20 },
        },
        orderBy: { nome: 'asc' },
      }),
    ])
    const classIds = classes.map((item) => item.id)
    const since = new Date()
    since.setUTCDate(since.getUTCDate() - 30)
    const attendance = classIds.length ? await this.prisma.presenca.groupBy({
      by: ['turma_id', 'presente'],
      where: { tenant_id: tenantId, turma_id: { in: classIds }, data: { gte: since } },
      _count: { _all: true },
    }) : []
    const attendanceByClass = new Map<string, { present: number; absent: number }>()
    for (const row of attendance) {
      const current = attendanceByClass.get(row.turma_id) ?? { present: 0, absent: 0 }
      current[row.presente ? 'present' : 'absent'] += row._count._all
      attendanceByClass.set(row.turma_id, current)
    }
    return {
      students,
      classes: classes.map((item) => ({ ...item, attendance30d: attendanceByClass.get(item.id) ?? { present: 0, absent: 0 } })),
      summary: { students: students.length, classes: classes.length, routines: classes.reduce((sum, item) => sum + item._count.atividades, 0) },
    }
  }

  async searchStudents(tenantId: string, projectId: string, search: string) {
    await this.project(tenantId, projectId)
    if (search.trim().length < 2) return []
    return this.prisma.beneficiary.findMany({
      where: { tenant_id: tenantId, deleted_at: null, name: { contains: search.trim(), mode: 'insensitive' },
        NOT: { vinculos_projetos: { some: { project_id: projectId, status: 'ATIVO' } } },
      },
      select: { id: true, name: true, turma: true }, orderBy: { name: 'asc' }, take: 20,
    })
  }

  async linkStudent(tenantId: string, projectId: string, studentId: string) {
    await this.project(tenantId, projectId)
    const student = await this.prisma.beneficiary.findFirst({ where: { id: studentId, tenant_id: tenantId, deleted_at: null }, select: { id: true } })
    if (!student) throw new NotFoundException('Aluno não encontrado na organização')
    const existing = await this.prisma.beneficiarioProjeto.findUnique({ where: { beneficiary_id_project_id: { beneficiary_id: studentId, project_id: projectId } } })
    if (existing?.status === 'ATIVO') throw new ConflictException('Aluno já vinculado a este projeto')
    return this.prisma.beneficiarioProjeto.upsert({
      where: { beneficiary_id_project_id: { beneficiary_id: studentId, project_id: projectId } },
      create: { beneficiary_id: studentId, project_id: projectId, data_ingresso: new Date(), status: 'ATIVO' },
      update: { data_ingresso: new Date(), data_desligamento: null, status: 'ATIVO' },
    })
  }

  async unlinkStudent(tenantId: string, projectId: string, studentId: string) {
    await this.project(tenantId, projectId)
    const student = await this.prisma.beneficiary.findFirst({ where: { id: studentId, tenant_id: tenantId, deleted_at: null }, select: { id: true, project_id: true } })
    if (!student) throw new NotFoundException('Aluno não encontrado na organização')
    const enrolled = await this.prisma.matricula.count({ where: { tenant_id: tenantId, aluno_id: studentId, status: 'ATIVA', turma: { project_id: projectId, deleted_at: null } } })
    if (enrolled) throw new BadRequestException('Encerre a matrícula ativa antes de desvincular o aluno do projeto')
    const result = await this.prisma.beneficiarioProjeto.updateMany({
      where: { project_id: projectId, beneficiary_id: studentId, status: 'ATIVO' },
      data: { status: 'DESLIGADO', data_desligamento: new Date() },
    })
    if (student.project_id === projectId) await this.prisma.beneficiary.update({ where: { id: studentId }, data: { project_id: null } })
    if (!result.count && student.project_id !== projectId) throw new NotFoundException('Vínculo ativo não encontrado')
    return { unlinked: true }
  }

  async createClass(tenantId: string, projectId: string, dto: CreateProjectClassDto) {
    await this.project(tenantId, projectId)
    return this.prisma.turma.create({ data: { tenant_id: tenantId, project_id: projectId, nome: dto.nome.trim(), capacidade: dto.capacidade, horario: dto.horario?.trim() || Prisma.JsonNull } })
  }

  async enrollStudent(tenantId: string, projectId: string, classId: string, studentId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "turmas" WHERE id = ${classId} AND tenant_id = ${tenantId} AND project_id = ${projectId} AND deleted_at IS NULL FOR UPDATE`
      const turma = await tx.turma.findFirst({ where: { id: classId, tenant_id: tenantId, project_id: projectId, deleted_at: null }, select: { capacidade: true } })
      if (!turma) throw new NotFoundException('Turma não encontrada neste projeto')
      const student = await tx.beneficiary.findFirst({ where: { id: studentId, tenant_id: tenantId, deleted_at: null }, select: { id: true } })
      if (!student) throw new NotFoundException('Aluno não encontrado na organização')
      const linked = await tx.beneficiarioProjeto.findFirst({ where: { project_id: projectId, beneficiary_id: studentId, status: 'ATIVO' }, select: { id: true } })
      if (!linked) throw new BadRequestException('Vincule o aluno ao projeto antes de matriculá-lo na turma')
      const existing = await tx.matricula.findUnique({ where: { turma_id_aluno_id: { turma_id: classId, aluno_id: studentId } }, select: { id: true } })
      if (existing) throw new ConflictException('Aluno já matriculado nesta turma')
      const active = await tx.matricula.count({ where: { turma_id: classId, status: 'ATIVA' } })
      return tx.matricula.create({ data: { tenant_id: tenantId, turma_id: classId, aluno_id: studentId, status: active >= (turma.capacidade ?? 0) ? 'EM_ESPERA' : 'ATIVA', solicitante_tipo: 'ADMIN' } })
    })
  }

  async attendance(tenantId: string, projectId: string, classId: string, date: string) {
    await this.projectClass(tenantId, projectId, classId)
    const day = this.parseDate(date)
    const [enrollments, saved] = await Promise.all([
      this.prisma.matricula.findMany({ where: { tenant_id: tenantId, turma_id: classId, status: 'ATIVA', aluno: { deleted_at: null } }, select: { id: true, aluno: { select: { id: true, name: true } } }, orderBy: { aluno: { name: 'asc' } } }),
      this.prisma.presenca.findMany({ where: { tenant_id: tenantId, turma_id: classId, data: day }, select: { matricula_id: true, presente: true } }),
    ])
    const byEnrollment = new Map(saved.map((item) => [item.matricula_id, item.presente]))
    return enrollments.map((item) => ({ ...item, presente: byEnrollment.get(item.id) ?? null }))
  }

  async saveAttendance(tenantId: string, projectId: string, classId: string, dto: SaveProjectAttendanceDto) {
    await this.projectClass(tenantId, projectId, classId)
    const day = this.parseDate(dto.data)
    const ids = dto.presencas.map((item) => item.matricula_id)
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Matrícula repetida na chamada')
    const valid = await this.prisma.matricula.count({ where: { id: { in: ids }, tenant_id: tenantId, turma_id: classId, status: 'ATIVA' } })
    if (valid !== ids.length) throw new BadRequestException('A chamada contém alunos fora da turma')
    await this.prisma.$transaction(dto.presencas.map((item) => this.prisma.presenca.upsert({
      where: { matricula_id_data: { matricula_id: item.matricula_id, data: day } },
      create: { tenant_id: tenantId, turma_id: classId, matricula_id: item.matricula_id, data: day, presente: item.presente },
      update: { presente: item.presente },
    })))
    return this.attendance(tenantId, projectId, classId, dto.data)
  }

  async createRoutine(tenantId: string, projectId: string, classId: string, dto: CreateProjectRoutineDto) {
    await this.projectClass(tenantId, projectId, classId)
    return this.prisma.atividade.create({ data: { tenant_id: tenantId, turma_id: classId, titulo: dto.titulo.trim(), descricao: dto.descricao?.trim() || null, prazo: dto.prazo ? new Date(dto.prazo) : null, status: 'PUBLICADA' } })
  }

  private parseDate(raw: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new BadRequestException('Data da chamada inválida')
    const date = new Date(`${raw}T00:00:00.000Z`)
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) throw new BadRequestException('Data da chamada inválida')
    return date
  }
}
