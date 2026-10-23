import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { CreateProjectDto } from './dto/create-project.dto'
import type { UpdateProjectDto } from './dto/update-project.dto'
import type { QueryProjectsDto } from './dto/query-projects.dto'
import type { CreatePhaseDto } from './dto/create-phase.dto'
import type { CreateTaskDto } from './dto/create-task.dto'
import type { UpdateTaskDto } from './dto/update-task.dto'
import type { AddMemberDto } from './dto/add-member.dto'
import type { CreateProjectIndicatorDto } from './dto/create-project-indicator.dto'
import type { UpdateProjectIndicatorDto } from './dto/update-project-indicator.dto'

const PROJECT_SELECT = {
  id: true,
  code: true,
  name: true,
  description: true,
  type: true,
  status: true,
  start_date: true,
  end_date: true,
  total_budget: true,
  approved_budget: true,
  tags: true,
  cursos: { select: { id: true, nome: true, tipo: true } },
  created_at: true,
  updated_at: true,
  manager: { select: { id: true, name: true, email: true, avatar_url: true } },
  _count: { select: { members: true, tasks: true, phases: true, beneficiario_vinculos: { where: { status: 'ATIVO' } } } },
} satisfies Prisma.ProjectSelect

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async overview(tenantId: string) {
    const projectWhere: Prisma.ProjectWhereInput = { tenant_id: tenantId, deleted_at: null, legacy_course: { is: null } }
    const taskWhere: Prisma.ProjectTaskWhereInput = { project: { tenant_id: tenantId, deleted_at: null } }
    const today = new Date()
    const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
    const tomorrow = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
    const [total, executing, completed, planning, budget, taskGroups, overdueTasks, students, classes, attendanceToday] = await Promise.all([
      this.prisma.project.count({ where: projectWhere }),
      this.prisma.project.count({ where: { ...projectWhere, status: 'EM_EXECUCAO' } }),
      this.prisma.project.count({ where: { ...projectWhere, status: 'CONCLUIDO' } }),
      this.prisma.project.count({ where: { ...projectWhere, status: { in: ['RASCUNHO', 'CAPTACAO', 'APROVADO'] } } }),
      this.prisma.project.aggregate({ where: projectWhere, _sum: { total_budget: true, approved_budget: true } }),
      this.prisma.projectTask.groupBy({ by: ['status'], where: taskWhere, _count: { _all: true } }),
      this.prisma.projectTask.count({
        where: {
          ...taskWhere,
          due_date: { lt: new Date() },
          status: { notIn: ['CONCLUIDA', 'CANCELADA'] },
        },
      }),
      this.prisma.beneficiary.count({ where: { tenant_id: tenantId, deleted_at: null, vinculos_projetos: { some: { status: 'ATIVO', project: { deleted_at: null } } } } }),
      this.prisma.turma.count({ where: { tenant_id: tenantId, deleted_at: null, project: { deleted_at: null } } }),
      this.prisma.presenca.groupBy({ by: ['presente'], where: { tenant_id: tenantId, turma: { deleted_at: null, project: { deleted_at: null } }, data: { gte: todayStart, lt: tomorrow } }, _count: { _all: true } }),
    ])
    const taskCounts = Object.fromEntries(taskGroups.map((group) => [group.status, group._count._all]))
    const totalTasks = Object.values(taskCounts).reduce((sum, count) => sum + count, 0)
    const completedTasks = taskCounts.CONCLUIDA ?? 0
    return {
      projects: { total, executing, completed, planning },
      budget: { planned: Number(budget._sum.total_budget ?? 0), approved: Number(budget._sum.approved_budget ?? 0) },
      tasks: {
        total: totalTasks,
        completed: completedTasks,
        open: totalTasks - completedTasks - (taskCounts.CANCELADA ?? 0),
        overdue: overdueTasks,
      },
      operations: { students, classes, presentToday: attendanceToday.find((row) => row.presente)?._count._all ?? 0, absentToday: attendanceToday.find((row) => !row.presente)?._count._all ?? 0 },
    }
  }

  async findAll(tenantId: string, q: QueryProjectsDto) {
    const page = q.page ?? 1
    const limit = q.limit ?? 20
    const where: Prisma.ProjectWhereInput = {
      tenant_id: tenantId,
      ...(!q.include_legacy && { legacy_course: { is: null } }),
      deleted_at: null,
      ...(q.status && { status: q.status }),
      ...(q.type && { type: q.type }),
      ...(q.search && {
        OR: [
          { name: { contains: q.search, mode: 'insensitive' } },
          { code: { contains: q.search, mode: 'insensitive' } },
        ],
      }),
    }

    const [projects, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        select: PROJECT_SELECT,
        orderBy: { updated_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.project.count({ where }),
    ])

    const taskGroups = projects.length ? await this.prisma.projectTask.groupBy({
      by: ['project_id', 'status'],
      where: { project_id: { in: projects.map((project) => project.id) } },
      _count: { _all: true },
    }) : []
    const taskCounts = new Map<string, { total: number; completed: number; overdue: number }>()
    for (const group of taskGroups) {
      const stats = taskCounts.get(group.project_id) ?? { total: 0, completed: 0, overdue: 0 }
      if (group.status !== 'CANCELADA') stats.total += group._count._all
      if (group.status === 'CONCLUIDA') stats.completed += group._count._all
      taskCounts.set(group.project_id, stats)
    }
    const overdueByProject = projects.length ? await this.prisma.projectTask.groupBy({
      by: ['project_id'],
      where: {
        project_id: { in: projects.map((project) => project.id) },
        due_date: { lt: new Date() },
        status: { notIn: ['CONCLUIDA', 'CANCELADA'] },
      },
      _count: { _all: true },
    }) : []
    for (const group of overdueByProject) {
      const stats = taskCounts.get(group.project_id)
      if (stats) stats.overdue = group._count._all
    }

    const data = projects.map((project) => ({
      ...project,
      task_progress: taskCounts.get(project.id) ?? { total: 0, completed: 0, overdue: 0 },
    }))
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
  }

  async findOne(tenantId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, tenant_id: tenantId, deleted_at: null },
      include: {
        manager: { select: { id: true, name: true, email: true, avatar_url: true } },
        members: {
          include: { user: { select: { id: true, name: true, email: true, avatar_url: true } } },
        },
        phases: { orderBy: { order: 'asc' } },
        cursos: { where: { tenant_id: tenantId }, select: { id: true, nome: true, tipo: true } },
        emendas: { where: { tenant_id: tenantId }, select: { id: true, number: true, year: true, parlamentar_name: true, value: true } },
        editais: { where: { tenant_id: tenantId }, select: { id: true, titulo: true, link_oficial: true } },
        _count: { select: { tasks: true, risks: true, documents: true, beneficiaries: true } },
      },
    })
    if (!project) throw new NotFoundException('Projeto não encontrado')
    return project
  }

  async create(tenantId: string, userId: string, dto: CreateProjectDto) {
    if (dto.manager_id) await this.assertUserBelongsToTenant(dto.manager_id, tenantId)
    return this.prisma.project.create({
      data: {
        tenant_id: tenantId,
        created_by: userId,
        name: dto.name,
        description: dto.description,
        type: dto.type,
        code: dto.code,
        start_date: dto.start_date ? new Date(dto.start_date) : undefined,
        end_date: dto.end_date ? new Date(dto.end_date) : undefined,
        total_budget: dto.total_budget,
        manager_id: dto.manager_id,
        tags: dto.tags ?? [],
        members: {
          create: { user_id: userId, role: 'GESTOR' },
        },
      },
      select: PROJECT_SELECT,
    })
  }

  async update(tenantId: string, id: string, dto: UpdateProjectDto) {
    await this.assertBelongsToTenant(id, tenantId)
    if (dto.manager_id) await this.assertUserBelongsToTenant(dto.manager_id, tenantId)
    return this.prisma.project.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.type && { type: dto.type }),
        ...(dto.status && { status: dto.status }),
        ...(dto.code !== undefined && { code: dto.code }),
        ...(dto.start_date && { start_date: new Date(dto.start_date) }),
        ...(dto.end_date && { end_date: new Date(dto.end_date) }),
        ...(dto.total_budget !== undefined && { total_budget: dto.total_budget }),
        ...(dto.manager_id !== undefined && { manager_id: dto.manager_id }),
        ...(dto.tags && { tags: dto.tags }),
      },
      select: PROJECT_SELECT,
    })
  }

  async remove(tenantId: string, id: string) {
    await this.assertBelongsToTenant(id, tenantId)
    await this.prisma.project.update({
      where: { id },
      data: { deleted_at: new Date() },
    })
  }

  // ── Phases ────────────────────────────────────────────────────

  async findPhases(tenantId: string, projectId: string) {
    await this.assertBelongsToTenant(projectId, tenantId)
    return this.prisma.projectPhase.findMany({
      where: { project_id: projectId },
      include: { _count: { select: { tasks: true } } },
      orderBy: { order: 'asc' },
    })
  }

  async createPhase(tenantId: string, projectId: string, dto: CreatePhaseDto) {
    await this.assertBelongsToTenant(projectId, tenantId)
    return this.prisma.projectPhase.create({
      data: {
        project_id: projectId,
        name: dto.name,
        description: dto.description,
        order: dto.order,
        start_date: dto.start_date ? new Date(dto.start_date) : undefined,
        end_date: dto.end_date ? new Date(dto.end_date) : undefined,
      },
    })
  }

  async updatePhase(
    tenantId: string,
    projectId: string,
    phaseId: string,
    dto: Partial<CreatePhaseDto> & { status?: string },
  ) {
    await this.assertBelongsToTenant(projectId, tenantId)
    await this.assertPhaseBelongsToProject(phaseId, projectId)
    return this.prisma.projectPhase.update({
      where: { id: phaseId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.order !== undefined && { order: dto.order }),
        ...(dto.start_date && { start_date: new Date(dto.start_date) }),
        ...(dto.end_date && { end_date: new Date(dto.end_date) }),
      },
    })
  }

  async removePhase(tenantId: string, projectId: string, phaseId: string) {
    await this.assertBelongsToTenant(projectId, tenantId)
    await this.assertPhaseBelongsToProject(phaseId, projectId)
    await this.prisma.projectPhase.delete({ where: { id: phaseId } })
  }

  // ── Tasks ─────────────────────────────────────────────────────

  async findTasks(tenantId: string, projectId: string, filters: { phaseId?: string; status?: string }) {
    await this.assertBelongsToTenant(projectId, tenantId)
    return this.prisma.projectTask.findMany({
      where: {
        project_id: projectId,
        ...(filters.phaseId && { phase_id: filters.phaseId }),
        ...(filters.status && { status: filters.status as never }),
      },
      include: {
        assignee: { select: { id: true, name: true, avatar_url: true } },
        phase: { select: { id: true, name: true } },
      },
      orderBy: [{ priority: 'desc' }, { due_date: 'asc' }],
    })
  }

  async createTask(tenantId: string, projectId: string, dto: CreateTaskDto) {
    await this.assertBelongsToTenant(projectId, tenantId)
    if (dto.phase_id) await this.assertPhaseBelongsToProject(dto.phase_id, projectId)
    if (dto.assigned_to) await this.assertUserBelongsToTenant(dto.assigned_to, tenantId)
    return this.prisma.projectTask.create({
      data: {
        project_id: projectId,
        title: dto.title,
        description: dto.description,
        phase_id: dto.phase_id,
        assigned_to: dto.assigned_to,
        due_date: dto.due_date ? new Date(dto.due_date) : undefined,
        priority: dto.priority ?? 'MEDIA',
      },
      include: { assignee: { select: { id: true, name: true, avatar_url: true } } },
    })
  }

  async updateTask(tenantId: string, projectId: string, taskId: string, dto: UpdateTaskDto) {
    await this.assertBelongsToTenant(projectId, tenantId)
    await this.assertTaskBelongsToProject(taskId, projectId)
    if (dto.phase_id) await this.assertPhaseBelongsToProject(dto.phase_id, projectId)
    if (dto.assigned_to) await this.assertUserBelongsToTenant(dto.assigned_to, tenantId)
    return this.prisma.projectTask.update({
      where: { id: taskId },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.phase_id !== undefined && { phase_id: dto.phase_id }),
        ...(dto.assigned_to !== undefined && { assigned_to: dto.assigned_to }),
        ...(dto.due_date && { due_date: new Date(dto.due_date) }),
        ...(dto.priority && { priority: dto.priority }),
        ...(dto.status && { status: dto.status }),
      },
      include: { assignee: { select: { id: true, name: true, avatar_url: true } } },
    })
  }

  // ── Members ───────────────────────────────────────────────────

  async findMembers(tenantId: string, projectId: string) {
    await this.assertBelongsToTenant(projectId, tenantId)
    return this.prisma.projectMember.findMany({
      where: { project_id: projectId },
      include: { user: { select: { id: true, name: true, email: true, avatar_url: true } } },
      orderBy: { role: 'asc' },
    })
  }

  async addMember(tenantId: string, projectId: string, dto: AddMemberDto) {
    await this.assertBelongsToTenant(projectId, tenantId)
    const userInTenant = await this.prisma.user.findFirst({
      where: { id: dto.user_id, tenant_id: tenantId },
    })
    if (!userInTenant) throw new ForbiddenException('Usuário não pertence ao tenant')

    const existing = await this.prisma.projectMember.findUnique({
      where: { project_id_user_id: { project_id: projectId, user_id: dto.user_id } },
    })
    if (existing) throw new ConflictException('Usuário já é membro do projeto')

    return this.prisma.projectMember.create({
      data: {
        project_id: projectId,
        user_id: dto.user_id,
        role: dto.role ?? 'COLABORADOR',
        start_date: dto.start_date ? new Date(dto.start_date) : undefined,
        end_date: dto.end_date ? new Date(dto.end_date) : undefined,
      },
      include: { user: { select: { id: true, name: true, email: true, avatar_url: true } } },
    })
  }

  async removeMember(tenantId: string, projectId: string, userId: string) {
    await this.assertBelongsToTenant(projectId, tenantId)
    await this.prisma.projectMember.deleteMany({
      where: { project_id: projectId, user_id: userId },
    })
  }

  async findIndicators(tenantId: string, projectId: string) {
    await this.assertBelongsToTenant(projectId, tenantId)
    return this.prisma.projectIndicator.findMany({ where: { project_id: projectId }, orderBy: { created_at: 'asc' } })
  }

  async createIndicator(tenantId: string, projectId: string, dto: CreateProjectIndicatorDto) {
    await this.assertBelongsToTenant(projectId, tenantId)
    return this.prisma.projectIndicator.create({
      data: { project_id: projectId, ...dto, last_updated: dto.current_value !== undefined ? new Date() : null },
    })
  }

  async updateIndicator(tenantId: string, projectId: string, indicatorId: string, dto: UpdateProjectIndicatorDto) {
    await this.assertBelongsToTenant(projectId, tenantId)
    const indicator = await this.prisma.projectIndicator.findFirst({ where: { id: indicatorId, project_id: projectId }, select: { id: true } })
    if (!indicator) throw new NotFoundException('Indicador não encontrado neste projeto')
    return this.prisma.projectIndicator.update({
      where: { id: indicatorId },
      data: { current_value: dto.current_value, ...(dto.current_value !== undefined && { last_updated: new Date() }) },
    })
  }

  // ── Private ───────────────────────────────────────────────────

  private async assertBelongsToTenant(projectId: string, tenantId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenant_id: tenantId, deleted_at: null },
      select: { id: true },
    })
    if (!project) throw new NotFoundException('Projeto não encontrado')
  }

  private async assertPhaseBelongsToProject(phaseId: string, projectId: string) {
    const phase = await this.prisma.projectPhase.findFirst({
      where: { id: phaseId, project_id: projectId },
      select: { id: true },
    })
    if (!phase) throw new NotFoundException('Fase não encontrada neste projeto')
  }

  private async assertTaskBelongsToProject(taskId: string, projectId: string) {
    const task = await this.prisma.projectTask.findFirst({
      where: { id: taskId, project_id: projectId },
      select: { id: true },
    })
    if (!task) throw new NotFoundException('Tarefa não encontrada neste projeto')
  }

  private async assertUserBelongsToTenant(userId: string, tenantId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenant_id: tenantId, deleted_at: null },
      select: { id: true },
    })
    if (!user) throw new ForbiddenException('Usuário não pertence à organização')
  }
}
