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
