import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { createHash, randomBytes } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { CompleteProfileDto } from './dto/complete-profile.dto'

const hash = (token: string) => createHash('sha256').update(token).digest('hex')

@Injectable()
export class ProfileInvitesService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, beneficiaryId: string) {
    const beneficiary = await this.prisma.beneficiary.findFirst({
      where: { id: beneficiaryId, tenant_id: tenantId, deleted_at: null },
      select: { id: true, tenant: { select: { slug: true } } },
    })
    if (!beneficiary) throw new NotFoundException('Beneficiário não encontrado')
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    await this.prisma.$transaction(async (tx) => {
      await tx.beneficiaryProfileInvite.updateMany({
        where: { beneficiary_id: beneficiaryId, tenant_id: tenantId, used_at: null },
        data: { used_at: new Date() },
      })
      await tx.beneficiaryProfileInvite.create({
        data: { beneficiary_id: beneficiaryId, tenant_id: tenantId, token_hash: hash(token), expires_at: expiresAt },
      })
    })
    return { token, slug: beneficiary.tenant.slug, expires_at: expiresAt }
  }

  private async findValid(slug: string, token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new NotFoundException('Link inválido ou expirado')
    const invite = await this.prisma.beneficiaryProfileInvite.findUnique({
      where: { token_hash: hash(token) },
      include: { beneficiary: { include: { tenant: { select: { slug: true } }, responsaveis: { orderBy: { created_at: 'asc' }, take: 1 } } } },
    })
    if (!invite || invite.used_at || invite.expires_at <= new Date() || invite.beneficiary.deleted_at ||
        invite.beneficiary.tenant_id !== invite.tenant_id || invite.beneficiary.tenant.slug !== slug) {
      throw new NotFoundException('Link inválido ou expirado')
    }
    return invite
  }

  async preview(slug: string, token: string) {
    const { beneficiary: b } = await this.findValid(slug, token)
    return {
      name: b.name, cpf: b.cpf, birth_date: b.birth_date, gender: b.gender,
      telefone: b.telefone, email: b.email, rg_certidao: b.rg_certidao,
      cep: b.cep, logradouro: b.logradouro, numero: b.numero, complemento: b.complemento,
      bairro: b.bairro, cidade: b.cidade, uf_endereco: b.uf_endereco,
      escola: b.escola, serie_ano: b.serie_ano,
      necessidades_especiais: b.necessidades_especiais, alergias: b.alergias,
      medicamentos: b.medicamentos, observacoes_gerais: b.observacoes_gerais,
      renda_familiar: b.renda_familiar?.toNumber() ?? null, pessoas_residencia: b.pessoas_residencia,
      responsavel_nome: b.responsaveis[0]?.nome_completo ?? null,
      responsavel_parentesco: b.responsaveis[0]?.parentesco ?? null,
      responsavel_cpf: b.responsaveis[0]?.cpf ?? null,
      responsavel_telefone: b.responsaveis[0]?.telefone ?? null,
      responsavel_email: b.responsaveis[0]?.email ?? null,
      termo_consentimento: b.termo_consentimento,
      autorizacao_uso_imagem: b.autorizacao_uso_imagem,
      project: b.project_id ? await this.prisma.project.findFirst({ where: { id: b.project_id, tenant_id: b.tenant_id }, select: { name: true } }) : null,
    }
  }

  async complete(slug: string, token: string, dto: CompleteProfileDto) {
    const invite = await this.findValid(slug, token)
    if (!dto.termo_consentimento) throw new BadRequestException('Confirme o consentimento para enviar o perfil')
    const hasResponsavel = !!(dto.responsavel_nome || dto.responsavel_parentesco || dto.responsavel_cpf || dto.responsavel_telefone || dto.responsavel_email)
    if (hasResponsavel && (!dto.responsavel_nome?.trim() || !dto.responsavel_parentesco)) {
      throw new BadRequestException('Informe o nome e o parentesco do responsável')
    }
    const cpf = dto.cpf?.replace(/\D/g, '') || null
    try {
      await this.prisma.$transaction(async (tx) => {
        const consumed = await tx.beneficiaryProfileInvite.updateMany({
          where: { id: invite.id, used_at: null, expires_at: { gt: new Date() } },
          data: { used_at: new Date() },
        })
        if (consumed.count !== 1) throw new NotFoundException('Link inválido ou expirado')
        await tx.beneficiary.update({
          where: { id: invite.beneficiary_id },
          data: {
            name: dto.name.trim(), cpf,
            birth_date: dto.birth_date ? new Date(dto.birth_date) : null,
            gender: dto.gender ?? null,
            telefone: dto.telefone?.trim() || null, email: dto.email?.trim() || null,
            rg_certidao: dto.rg_certidao?.trim() || null,
            cep: dto.cep?.replace(/\D/g, '') || null,
            logradouro: dto.logradouro?.trim() || null, numero: dto.numero?.trim() || null,
            complemento: dto.complemento?.trim() || null, bairro: dto.bairro?.trim() || null,
            cidade: dto.cidade?.trim() || null, uf_endereco: dto.uf_endereco?.trim().toUpperCase() || null,
            escola: dto.escola?.trim() || null, serie_ano: dto.serie_ano?.trim() || null,
            necessidades_especiais: dto.necessidades_especiais?.trim() || null,
            alergias: dto.alergias?.trim() || null, medicamentos: dto.medicamentos?.trim() || null,
            observacoes_gerais: dto.observacoes_gerais?.trim() || null,
            renda_familiar: dto.renda_familiar ?? null,
            pessoas_residencia: dto.pessoas_residencia ?? null,
            termo_consentimento: true, data_consentimento: new Date(),
            autorizacao_uso_imagem: dto.autorizacao_uso_imagem,
          },
        })
        if (hasResponsavel) {
          const data = {
            nome_completo: dto.responsavel_nome!.trim(),
            parentesco: dto.responsavel_parentesco!,
            cpf: dto.responsavel_cpf?.replace(/\D/g, '') || null,
            telefone: dto.responsavel_telefone?.trim() || null,
            email: dto.responsavel_email?.trim() || null,
          }
          const existing = invite.beneficiary.responsaveis[0]
          if (existing) await tx.responsavel.update({ where: { id: existing.id }, data })
          else await tx.responsavel.create({ data: { ...data, beneficiary_id: invite.beneficiary_id } })
        }
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('CPF já cadastrado por outro beneficiário')
      }
      throw error
    }
    return { completed: true }
  }
}
