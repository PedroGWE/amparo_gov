import { BeneficiariosService } from './beneficiarios.service'

describe('BeneficiariosService project selection', () => {
  const tenantId = 'tenant-1'

  it('saves a new beneficiary without a project when the form sends an empty selection', async () => {
    const prisma = {
      beneficiary: { create: jest.fn().mockResolvedValue({ id: 'beneficiary-1' }) },
    }
    const service = new BeneficiariosService(prisma as never)

    await service.create(tenantId, 'user-1', { name: 'Maria Silva', project_id: '' })

    expect(prisma.beneficiary.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ project_id: null }),
    }))
  })

  it('clears the current project when editing to no project', async () => {
    const prisma = {
      beneficiary: {
        findFirst: jest.fn().mockResolvedValue({ id: 'beneficiary-1' }),
        update: jest.fn().mockResolvedValue({ id: 'beneficiary-1', project_id: null }),
      },
    }
    const service = new BeneficiariosService(prisma as never)

    await service.update(tenantId, 'beneficiary-1', { project_id: '' })

    expect(prisma.beneficiary.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ project_id: null }),
    }))
  })
})

describe('BeneficiariosService removal', () => {
  it('hides inactive beneficiaries from the list', async () => {
    const prisma = {
      beneficiary: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    }
    await new BeneficiariosService(prisma as never).findAll('tenant-1', {})
    expect(prisma.beneficiary.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenant_id: 'tenant-1', deleted_at: null }),
    }))
  })

  it('removes an inactive registration and frees its CPF for a new registration', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'student-1' }]),
      beneficiary: {
        findFirst: jest.fn().mockResolvedValue({ id: 'student-1' }),
        update: jest.fn().mockResolvedValue({ id: 'student-1' }),
      },
      matricula: { findMany: jest.fn().mockResolvedValue([]) },
      beneficiarioProjeto: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    }
    const prisma = { $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)) }
    const result = await new BeneficiariosService(prisma as never).remove('tenant-1', 'student-1')
    expect(result).toEqual({ id: 'student-1', removed: true })
    expect(tx.beneficiarioProjeto.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'DESLIGADO' }) }))
    expect(tx.beneficiary.update).toHaveBeenCalledWith({
      where: { id: 'student-1' },
      data: expect.objectContaining({ status: 'INATIVO', cpf: null, deleted_at: expect.any(Date) }),
    })
  })

  it('closes an active enrollment and promotes the next student when removing a beneficiary', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'student-1' }]),
      beneficiary: {
        findFirst: jest.fn().mockResolvedValue({ id: 'student-1' }),
        update: jest.fn().mockResolvedValue({ id: 'student-1' }),
      },
      turma: { findFirst: jest.fn().mockResolvedValue({ capacidade: 1 }) },
      matricula: {
        findMany: jest.fn().mockResolvedValue([{ id: 'enrollment-1', turma_id: 'class-1', status: 'ATIVA' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue({ id: 'next-1' }),
        update: jest.fn().mockResolvedValue({ id: 'next-1' }),
      },
      beneficiarioProjeto: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    }
    const prisma = { $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)) }
    await new BeneficiariosService(prisma as never).remove('tenant-1', 'student-1')
    expect(tx.matricula.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'CONCLUIDA' } }))
    expect(tx.matricula.update).toHaveBeenCalledWith({ where: { id: 'next-1' }, data: { status: 'ATIVA' } })
  })
})
