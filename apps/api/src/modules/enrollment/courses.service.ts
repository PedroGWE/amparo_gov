import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { BatchClassesDto, SaveCourseDto } from './dto/course.dto'

const projectSelect = { id: true, name: true, code: true, status: true, total_budget: true, start_date: true, end_date: true } as const
const emendaSelect = { id: true, number: true, year: true, parlamentar_name: true, value: true, project_id: true } as const
const editalSelect = { id: true, titulo: true, descricao: true, valor_total: true, data_encerramento: true, link_oficial: true, project_id: true } as const

@Injectable()
export class CoursesService {
  constructor(private prisma: PrismaService) {}

  async list(tenantId: string) {
    const courses = await this.prisma.curso.findMany({
      where: { tenant_id: tenantId }, orderBy: [{ tipo: 'asc' }, { nome: 'asc' }],
      include: {
        projetos: { where: { tenant_id: tenantId, deleted_at: null }, select: { ...projectSelect, emendas: { where: { tenant_id: tenantId }, select: emendaSelect }, editais: { where: { tenant_id: tenantId }, select: editalSelect } } },
        emendas: { where: { tenant_id: tenantId }, select: emendaSelect },
        editais: { where: { tenant_id: tenantId }, select: editalSelect },
        turmas: { where: { tenant_id: tenantId, deleted_at: null }, select: { id: true, nome: true, capacidade: true, project_id: true }, orderBy: { nome: 'asc' } },
      },
    })
    const counts = await this.prisma.matricula.groupBy({ by: ['turma_id', 'status'], where: { tenant_id: tenantId, status: { in: ['ATIVA', 'EM_ESPERA'] }, turma: { deleted_at: null, curso_id: { not: null } } }, _count: { _all: true } })
    const totals = new Map(counts.map(item => [`${item.turma_id}:${item.status}`, item._count._all]))
    return courses.map(course => ({ ...course, turmas: course.turmas.map(turma => {
      const inscritos = totals.get(`${turma.id}:ATIVA`) ?? 0
      return { ...turma, inscritos, espera: totals.get(`${turma.id}:EM_ESPERA`) ?? 0, vagas: turma.capacidade === null ? null : Math.max(0, turma.capacidade - inscritos) }
    }) }))
  }

  async options(tenantId: string) {
    const [projects, emendas, editais] = await Promise.all([
      this.prisma.project.findMany({ where: { tenant_id: tenantId, deleted_at: null, legacy_course: { is: null } }, select: projectSelect, orderBy: { name: 'asc' } }),
      this.prisma.emendaParlamentar.findMany({ where: { tenant_id: tenantId }, select: emendaSelect, orderBy: { year: 'desc' } }),
      this.prisma.edital.findMany({ where: { tenant_id: tenantId }, select: editalSelect, orderBy: { created_at: 'desc' } }),
    ])
    return { projects, emendas, editais }
  }

  async save(tenantId: string, dto: SaveCourseDto, id?: string) {
    if (id) await this.find(tenantId, id)
    const name = dto.nome.trim()
    if (name.length < 2) throw new BadRequestException('Informe o nome do curso ou modalidade')
    try {
      return await this.prisma.$transaction(async tx => {
        await this.validateLinks(tx, tenantId, dto)
        const data = {
          nome: name, tipo: dto.tipo, ...(dto.descricao !== undefined && { descricao: dto.descricao.trim() || null }),
          ...(dto.ativo !== undefined && { ativo: dto.ativo }), ...(dto.inscricoes_abertas !== undefined && { inscricoes_abertas: dto.inscricoes_abertas }),
          ...(dto.project_ids !== undefined && { projetos: { set: dto.project_ids.map(id => ({ id })) } }),
          ...(dto.emenda_ids !== undefined && { emendas: { set: dto.emenda_ids.map(id => ({ id })) } }),
          ...(dto.edital_ids !== undefined && { editais: { set: dto.edital_ids.map(id => ({ id })) } }),
        }
        if (id) return tx.curso.update({ where: { id }, data })
        return tx.curso.create({ data: { tenant_id: tenantId, nome: name, tipo: dto.tipo, descricao: dto.descricao?.trim() || null, ativo: dto.ativo ?? true, inscricoes_abertas: dto.inscricoes_abertas ?? true,
          projetos: { connect: (dto.project_ids ?? []).map(id => ({ id })) }, emendas: { connect: (dto.emenda_ids ?? []).map(id => ({ id })) }, editais: { connect: (dto.edital_ids ?? []).map(id => ({ id })) },
        } })
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Já existe um curso ou modalidade com este nome')
      throw error
    }
  }

  async createClasses(tenantId: string, courseId: string, dto: BatchClassesDto) {
    return this.prisma.$transaction(async tx => {
      const course = await tx.curso.findFirst({ where: { id: courseId, tenant_id: tenantId } })
      if (!course) throw new NotFoundException('Curso ou modalidade não encontrado')
      if (dto.project_id) {
        const project = await tx.project.findFirst({ where: { id: dto.project_id, tenant_id: tenantId, deleted_at: null, cursos: { some: { id: courseId } } }, select: { id: true } })
        if (!project) throw new BadRequestException('Selecione um projeto vinculado ao curso ou modalidade')
      }
      const name = dto.nome.trim()
      if (name.length < 2) throw new BadRequestException('Informe o nome das turmas')
      const classes = []
      for (let index = 1; index <= dto.quantidade; index++) {
        classes.push(await tx.turma.create({ data: { tenant_id: tenantId, curso_id: courseId, project_id: dto.project_id || null, nome: dto.quantidade === 1 ? name : `${name} ${index}`, capacidade: dto.capacidade } }))
      }
      return classes
    })
  }

  private async find(tenantId: string, id: string) {
    const course = await this.prisma.curso.findFirst({ where: { id, tenant_id: tenantId } })
    if (!course) throw new NotFoundException('Curso ou modalidade não encontrado')
    return course
  }

  private async validateLinks(tx: Prisma.TransactionClient, tenantId: string, dto: SaveCourseDto) {
    const [projects, emendas, editais] = await Promise.all([
      dto.project_ids ? tx.project.count({ where: { id: { in: dto.project_ids }, tenant_id: tenantId, deleted_at: null, legacy_course: { is: null } } }) : undefined,
      dto.emenda_ids ? tx.emendaParlamentar.count({ where: { id: { in: dto.emenda_ids }, tenant_id: tenantId } }) : undefined,
      dto.edital_ids ? tx.edital.count({ where: { id: { in: dto.edital_ids }, tenant_id: tenantId } }) : undefined,
    ])
    if ((dto.project_ids && projects !== dto.project_ids.length) || (dto.emenda_ids && emendas !== dto.emenda_ids.length) || (dto.edital_ids && editais !== dto.edital_ids.length)) throw new BadRequestException('Um dos vínculos não pertence à organização ou não está disponível')
  }
}
