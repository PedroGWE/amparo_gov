import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { CreateBeneficiarioDto } from './dto/create-beneficiario.dto'
import type { UpdateBeneficiarioDto } from './dto/update-beneficiario.dto'
import type { QueryBeneficiariosDto } from './dto/query-beneficiarios.dto'
import type { CreateResponsavelDto } from './dto/create-responsavel.dto'
import type { CreateVinculoDto } from './dto/create-vinculo.dto'

function normalizeCpf(cpf?: string | null) {
  const digits = cpf?.replace(/\D/g, '') ?? ''
  return digits || null
}

const BENEFICIARIO_SELECT = {
  id: true,
  name: true,
  cpf: true,
  birth_date: true,
  gender: true,
  race: true,
  status: true,
  telefone: true,
  email: true,
  turma: true,
  turno: true,
  escola: true,
  serie_ano: true,
  termo_consentimento: true,
  autorizacao_uso_imagem: true,
  project: { select: { id: true, name: true } },
  _count: { select: { responsaveis: true, vinculos_projetos: true } },
  created_at: true,
  updated_at: true,
} satisfies Prisma.BeneficiarySelect

@Injectable()
export class BeneficiariosService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string, q: QueryBeneficiariosDto) {
    const page = q.page ?? 1
    const limit = q.limit ?? 20
    const where: Prisma.BeneficiaryWhereInput = {
      tenant_id: tenantId,
      ...(q.status && { status: q.status }),
      ...(q.turma && { turma: { contains: q.turma, mode: 'insensitive' } }),
      ...(q.project_id && {
        OR: [
          { project_id: q.project_id },
          { vinculos_projetos: { some: { project_id: q.project_id } } },
        ],
      }),
      ...(q.search && {
        OR: [
          { name: { contains: q.search, mode: 'insensitive' } },
          { cpf: { contains: q.search } },
          { email: { contains: q.search, mode: 'insensitive' } },
        ],
      }),
    }

    const [data, total] = await Promise.all([
      this.prisma.beneficiary.findMany({
        where,
        select: BENEFICIARIO_SELECT,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.beneficiary.count({ where }),
    ])

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
  }

  async findOne(tenantId: string, id: string) {
    const b = await this.prisma.beneficiary.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        project: { select: { id: true, name: true } },
        responsaveis: { orderBy: { created_at: 'asc' } },
        vinculos_projetos: {
          include: { project: { select: { id: true, name: true } } },
          orderBy: { data_ingresso: 'desc' },
        },
      },
    })
    if (!b) throw new NotFoundException('Beneficiário não encontrado')
    return b
  }

  async create(tenantId: string, userId: string, dto: CreateBeneficiarioDto) {
    const cpf = normalizeCpf(dto.cpf)
    if (cpf) {
      const existing = await this.prisma.beneficiary.findUnique({
        where: { tenant_id_cpf: { tenant_id: tenantId, cpf } },
        select: { id: true },
      })
      if (existing) throw new ConflictException('CPF já cadastrado neste tenant')
    }

    if (dto.project_id) {
      await this.assertProjectBelongsToTenant(dto.project_id, tenantId)
    }

    return this.prisma.beneficiary.create({
      data: {
        tenant_id: tenantId,
        created_by: userId,
        name: dto.name,
        cpf,
        birth_date: dto.birth_date ? new Date(dto.birth_date) : undefined,
        gender: dto.gender,
        race: dto.race,
        telefone: dto.telefone ?? null,
        email: dto.email ?? null,
        foto_url: dto.foto_url ?? null,
        rg_certidao: dto.rg_certidao ?? null,
        cep: dto.cep ?? null,
        logradouro: dto.logradouro ?? null,
        numero: dto.numero ?? null,
        complemento: dto.complemento ?? null,
        bairro: dto.bairro ?? null,
        cidade: dto.cidade ?? null,
        uf_endereco: dto.uf_endereco ?? null,
        turma: dto.turma ?? null,
        turno: dto.turno ?? null,
        escola: dto.escola ?? null,
        serie_ano: dto.serie_ano ?? null,
        renda_familiar: dto.renda_familiar ?? null,
        pessoas_residencia: dto.pessoas_residencia ?? null,
        necessidades_especiais: dto.necessidades_especiais ?? null,
        alergias: dto.alergias ?? null,
        medicamentos: dto.medicamentos ?? null,
        observacoes_gerais: dto.observacoes_gerais ?? null,
        termo_consentimento: dto.termo_consentimento ?? false,
        data_consentimento: dto.data_consentimento ? new Date(dto.data_consentimento) : null,
        autorizacao_uso_imagem: dto.autorizacao_uso_imagem ?? false,
        documento_consentimento_url: dto.documento_consentimento_url ?? null,
        status: dto.status ?? 'ATIVO',
        project_id: dto.project_id || null,
      },
      select: BENEFICIARIO_SELECT,
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(cpf ? 'CPF já cadastrado neste tenant' : 'Já existe um cadastro com esses dados únicos.')
      }
      throw error
    })
  }

  async update(tenantId: string, id: string, dto: UpdateBeneficiarioDto) {
    await this.assertBelongsToTenant(id, tenantId)

    const cpf = dto.cpf !== undefined ? normalizeCpf(dto.cpf) : undefined
    if (cpf) {
      const existing = await this.prisma.beneficiary.findFirst({
        where: { tenant_id: tenantId, cpf, NOT: { id } },
        select: { id: true },
      })
      if (existing) throw new ConflictException('CPF já cadastrado por outro beneficiário')
    }

    if (dto.project_id) {
      await this.assertProjectBelongsToTenant(dto.project_id, tenantId)
    }

    return this.prisma.beneficiary.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.cpf !== undefined && { cpf }),
        ...(dto.birth_date !== undefined && { birth_date: dto.birth_date ? new Date(dto.birth_date) : null }),
        ...(dto.gender !== undefined && { gender: dto.gender }),
        ...(dto.race !== undefined && { race: dto.race }),
        ...(dto.telefone !== undefined && { telefone: dto.telefone ?? null }),
        ...(dto.email !== undefined && { email: dto.email ?? null }),
        ...(dto.foto_url !== undefined && { foto_url: dto.foto_url ?? null }),
        ...(dto.rg_certidao !== undefined && { rg_certidao: dto.rg_certidao ?? null }),
        ...(dto.cep !== undefined && { cep: dto.cep ?? null }),
        ...(dto.logradouro !== undefined && { logradouro: dto.logradouro ?? null }),
        ...(dto.numero !== undefined && { numero: dto.numero ?? null }),
        ...(dto.complemento !== undefined && { complemento: dto.complemento ?? null }),
        ...(dto.bairro !== undefined && { bairro: dto.bairro ?? null }),
        ...(dto.cidade !== undefined && { cidade: dto.cidade ?? null }),
        ...(dto.uf_endereco !== undefined && { uf_endereco: dto.uf_endereco ?? null }),
        ...(dto.turma !== undefined && { turma: dto.turma ?? null }),
        ...(dto.turno !== undefined && { turno: dto.turno ?? null }),
        ...(dto.escola !== undefined && { escola: dto.escola ?? null }),
        ...(dto.serie_ano !== undefined && { serie_ano: dto.serie_ano ?? null }),
        ...(dto.renda_familiar !== undefined && { renda_familiar: dto.renda_familiar ?? null }),
        ...(dto.pessoas_residencia !== undefined && { pessoas_residencia: dto.pessoas_residencia ?? null }),
        ...(dto.necessidades_especiais !== undefined && { necessidades_especiais: dto.necessidades_especiais ?? null }),
        ...(dto.alergias !== undefined && { alergias: dto.alergias ?? null }),
        ...(dto.medicamentos !== undefined && { medicamentos: dto.medicamentos ?? null }),
        ...(dto.observacoes_gerais !== undefined && { observacoes_gerais: dto.observacoes_gerais ?? null }),
        ...(dto.termo_consentimento !== undefined && { termo_consentimento: dto.termo_consentimento }),
        ...(dto.data_consentimento !== undefined && { data_consentimento: dto.data_consentimento ? new Date(dto.data_consentimento) : null }),
        ...(dto.autorizacao_uso_imagem !== undefined && { autorizacao_uso_imagem: dto.autorizacao_uso_imagem }),
        ...(dto.documento_consentimento_url !== undefined && { documento_consentimento_url: dto.documento_consentimento_url ?? null }),
        ...(dto.status && { status: dto.status }),
        ...(dto.project_id !== undefined && { project_id: dto.project_id || null }),
      },
      select: BENEFICIARIO_SELECT,
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(cpf ? 'CPF já cadastrado por outro beneficiário' : 'Já existe um cadastro com esses dados únicos.')
      }
      throw error
    })
  }

  async remove(tenantId: string, id: string) {
    await this.assertBelongsToTenant(id, tenantId)
    const activeVinculos = await this.prisma.beneficiarioProjeto.count({
      where: { beneficiary_id: id, status: 'ATIVO' },
    })
    if (activeVinculos > 0) {
      throw new ConflictException(
        'Beneficiário possui vínculos ativos com projetos. Desvincule-o primeiro.',
      )
    }
    await this.prisma.beneficiary.update({
      where: { id },
      data: { status: 'INATIVO' },
    })
  }

  // ── Responsáveis ─────────────────────────────────────────────

  async listResponsaveis(tenantId: string, beneficiaryId: string) {
    await this.assertBelongsToTenant(beneficiaryId, tenantId)
    return this.prisma.responsavel.findMany({
      where: { beneficiary_id: beneficiaryId },
      orderBy: { created_at: 'asc' },
    })
  }

  async addResponsavel(tenantId: string, beneficiaryId: string, dto: CreateResponsavelDto) {
    await this.assertBelongsToTenant(beneficiaryId, tenantId)
    return this.prisma.responsavel.create({
      data: {
        beneficiary_id: beneficiaryId,
        nome_completo: dto.nome_completo,
        parentesco: dto.parentesco,
        cpf: dto.cpf ?? null,
        telefone: dto.telefone ?? null,
        email: dto.email ?? null,
        endereco: (dto.endereco ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    })
  }

  async updateResponsavel(
    tenantId: string,
    beneficiaryId: string,
    responsavelId: string,
    dto: Partial<CreateResponsavelDto>,
  ) {
    await this.assertBelongsToTenant(beneficiaryId, tenantId)
    const responsavel = await this.prisma.responsavel.findFirst({
      where: { id: responsavelId, beneficiary_id: beneficiaryId },
      select: { id: true },
    })
    if (!responsavel) throw new NotFoundException('Responsável não encontrado')
    return this.prisma.responsavel.update({
      where: { id: responsavelId },
      data: {
        ...(dto.nome_completo && { nome_completo: dto.nome_completo }),
        ...(dto.parentesco && { parentesco: dto.parentesco }),
        ...(dto.cpf !== undefined && { cpf: dto.cpf ?? null }),
        ...(dto.telefone !== undefined && { telefone: dto.telefone ?? null }),
        ...(dto.email !== undefined && { email: dto.email ?? null }),
        ...(dto.endereco !== undefined && {
          endereco: (dto.endereco ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        }),
      },
    })
  }

  async removeResponsavel(tenantId: string, beneficiaryId: string, responsavelId: string) {
    await this.assertBelongsToTenant(beneficiaryId, tenantId)
    await this.prisma.responsavel.deleteMany({
      where: { id: responsavelId, beneficiary_id: beneficiaryId },
    })
  }

  // ── Vínculos com projetos ─────────────────────────────────────

  async listVinculos(tenantId: string, beneficiaryId: string) {
    await this.assertBelongsToTenant(beneficiaryId, tenantId)
    return this.prisma.beneficiarioProjeto.findMany({
      where: { beneficiary_id: beneficiaryId },
      include: { project: { select: { id: true, name: true, status: true } } },
      orderBy: { data_ingresso: 'desc' },
    })
  }

  async addVinculo(tenantId: string, beneficiaryId: string, dto: CreateVinculoDto) {
    await this.assertBelongsToTenant(beneficiaryId, tenantId)
    await this.assertProjectBelongsToTenant(dto.project_id, tenantId)

    const existing = await this.prisma.beneficiarioProjeto.findUnique({
      where: {
        beneficiary_id_project_id: {
          beneficiary_id: beneficiaryId,
          project_id: dto.project_id,
        },
      },
      select: { id: true },
    })
    if (existing) throw new ConflictException('Beneficiário já vinculado a este projeto')

    return this.prisma.beneficiarioProjeto.create({
      data: {
        beneficiary_id: beneficiaryId,
        project_id: dto.project_id,
        data_ingresso: new Date(dto.data_ingresso),
        data_desligamento: dto.data_desligamento ? new Date(dto.data_desligamento) : null,
        status: dto.status ?? 'ATIVO',
        turma: dto.turma ?? null,
        turno: dto.turno ?? null,
      },
      include: { project: { select: { id: true, name: true } } },
    })
  }

  async updateVinculo(
    tenantId: string,
    beneficiaryId: string,
    vinculoId: string,
    dto: Partial<CreateVinculoDto>,
  ) {
    await this.assertBelongsToTenant(beneficiaryId, tenantId)
    const vinculo = await this.prisma.beneficiarioProjeto.findFirst({
      where: { id: vinculoId, beneficiary_id: beneficiaryId },
      select: { id: true },
    })
    if (!vinculo) throw new NotFoundException('Vínculo não encontrado')
    return this.prisma.beneficiarioProjeto.update({
      where: { id: vinculoId },
      data: {
        ...(dto.data_ingresso && { data_ingresso: new Date(dto.data_ingresso) }),
        ...(dto.data_desligamento !== undefined && {
          data_desligamento: dto.data_desligamento ? new Date(dto.data_desligamento) : null,
        }),
        ...(dto.status && { status: dto.status }),
        ...(dto.turma !== undefined && { turma: dto.turma ?? null }),
        ...(dto.turno !== undefined && { turno: dto.turno ?? null }),
      },
      include: { project: { select: { id: true, name: true } } },
    })
  }

  async removeVinculo(tenantId: string, beneficiaryId: string, vinculoId: string) {
    await this.assertBelongsToTenant(beneficiaryId, tenantId)
    await this.prisma.beneficiarioProjeto.deleteMany({
      where: { id: vinculoId, beneficiary_id: beneficiaryId },
    })
  }

  // ── Private ───────────────────────────────────────────────────

  private async assertBelongsToTenant(id: string, tenantId: string) {
    const b = await this.prisma.beneficiary.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    })
    if (!b) throw new NotFoundException('Beneficiário não encontrado')
  }

  private async assertProjectBelongsToTenant(projectId: string, tenantId: string) {
    const p = await this.prisma.project.findFirst({
      where: { id: projectId, tenant_id: tenantId, deleted_at: null },
      select: { id: true },
    })
    if (!p) throw new ForbiddenException('Projeto não pertence ao tenant')
  }
}
