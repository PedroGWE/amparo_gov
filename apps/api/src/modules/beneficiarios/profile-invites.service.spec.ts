import { NotFoundException } from '@nestjs/common'
import { ProfileInvitesService } from './profile-invites.service'

const beneficiary = {
  id: 'student-1', tenant_id: 'tenant-1', deleted_at: null,
  tenant: { slug: 'instituto' }, project_id: null, name: 'Ana Silva',
  cpf: null, birth_date: null, gender: null, telefone: null, email: null, rg_certidao: null,
  cep: null, logradouro: null, numero: null, complemento: null, bairro: null, cidade: null,
  uf_endereco: null, escola: null, serie_ano: null, necessidades_especiais: null,
  alergias: null, medicamentos: null, observacoes_gerais: null,
  termo_consentimento: false, autorizacao_uso_imagem: false, responsaveis: [],
}

describe('ProfileInvitesService', () => {
  it('creates a distinct bearer link and invalidates earlier links for the same beneficiary', async () => {
    const tx = {
      beneficiaryProfileInvite: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), create: jest.fn() },
    }
    const prisma = {
      beneficiary: { findFirst: jest.fn().mockResolvedValue({ id: beneficiary.id, tenant: beneficiary.tenant }) },
      $transaction: (callback: (client: any) => Promise<void>) => callback(tx),
    }
    const result = await new ProfileInvitesService(prisma as never).create('tenant-1', 'student-1')
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(result.id).toBe('student-1')
    expect(tx.beneficiaryProfileInvite.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { beneficiary_id: 'student-1', tenant_id: 'tenant-1', used_at: null } }))
    expect(tx.beneficiaryProfileInvite.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ beneficiary_id: 'student-1', tenant_id: 'tenant-1' }) }))
    expect(JSON.stringify(tx.beneficiaryProfileInvite.create.mock.calls)).not.toContain(result.token)
  })

  it('rejects a link for another organization or a deleted beneficiary', async () => {
    const prisma = { beneficiaryProfileInvite: { findUnique: jest.fn().mockResolvedValue({ id: 'invite-1', tenant_id: 'tenant-1', used_at: null, expires_at: new Date(Date.now() + 60_000), beneficiary }) } }
    const service = new ProfileInvitesService(prisma as never)
    await expect(service.preview('other', 'a'.repeat(43))).rejects.toBeInstanceOf(NotFoundException)
    prisma.beneficiaryProfileInvite.findUnique.mockResolvedValueOnce({ id: 'invite-1', tenant_id: 'tenant-1', used_at: null, expires_at: new Date(Date.now() + 60_000), beneficiary: { ...beneficiary, deleted_at: new Date() } })
    await expect(service.preview('instituto', 'a'.repeat(43))).rejects.toBeInstanceOf(NotFoundException)
  })

  it('binds a link with an ID to its beneficiary while keeping legacy links valid', async () => {
    const prisma = { beneficiaryProfileInvite: { findUnique: jest.fn().mockResolvedValue({ id: 'invite-1', beneficiary_id: beneficiary.id, tenant_id: beneficiary.tenant_id, used_at: null, expires_at: new Date(Date.now() + 60_000), beneficiary }) } }
    const service = new ProfileInvitesService(prisma as never)
    await expect(service.preview('instituto', 'a'.repeat(43), 'another-student')).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.complete('instituto', 'a'.repeat(43), { name: 'Ana Silva', termo_consentimento: true, autorizacao_uso_imagem: false }, 'another-student')).rejects.toBeInstanceOf(NotFoundException)
    expect((await service.preview('instituto', 'a'.repeat(43), 'student-1')).id).toBe('student-1')
    expect((await service.preview('instituto', 'a'.repeat(43))).id).toBe('student-1')
  })

  it('consumes the link once and does not allow a second write', async () => {
    const tx = { beneficiaryProfileInvite: { updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }) }, beneficiary: { update: jest.fn() } }
    const prisma = {
      beneficiaryProfileInvite: { findUnique: jest.fn().mockResolvedValue({ id: 'invite-1', beneficiary_id: beneficiary.id, tenant_id: beneficiary.tenant_id, used_at: null, expires_at: new Date(Date.now() + 60_000), beneficiary }) },
      $transaction: (callback: (client: any) => Promise<void>) => callback(tx),
    }
    const service = new ProfileInvitesService(prisma as never)
    const dto = { name: 'Ana Silva', termo_consentimento: true, autorizacao_uso_imagem: false }
    await service.complete('instituto', 'a'.repeat(43), dto)
    expect(tx.beneficiary.update).toHaveBeenCalledTimes(1)
    await expect(service.complete('instituto', 'a'.repeat(43), dto)).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.beneficiary.update).toHaveBeenCalledTimes(1)
  })

  it('saves family data and the beneficiary’s responsible person', async () => {
    const tx = {
      beneficiaryProfileInvite: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      beneficiary: { update: jest.fn() }, responsavel: { create: jest.fn() },
    }
    const prisma = {
      beneficiaryProfileInvite: { findUnique: jest.fn().mockResolvedValue({ id: 'invite-1', beneficiary_id: beneficiary.id, tenant_id: beneficiary.tenant_id, used_at: null, expires_at: new Date(Date.now() + 60_000), beneficiary }) },
      $transaction: (callback: (client: any) => Promise<void>) => callback(tx),
    }
    await new ProfileInvitesService(prisma as never).complete('instituto', 'a'.repeat(43), {
      name: 'Ana Silva', termo_consentimento: true, autorizacao_uso_imagem: false,
      renda_familiar: 1200, pessoas_residencia: 3,
      responsavel_nome: 'Maria Silva', responsavel_parentesco: 'MAE', responsavel_telefone: '11999999999',
    })
    expect(tx.beneficiary.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ renda_familiar: 1200, pessoas_residencia: 3 }) }))
    expect(tx.responsavel.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ beneficiary_id: 'student-1', nome_completo: 'Maria Silva', parentesco: 'MAE' }) }))
  })
})
