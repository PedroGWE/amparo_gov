import { EnrollmentService } from './enrollment.service'

describe('EnrollmentService capacity', () => {
  function setup(activeCount: number) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'class-1' }]),
      turma: { findFirst: jest.fn().mockResolvedValue({ id: 'class-1', nome: 'Turma A', capacidade: 1, project_id: null }) },
      beneficiary: { findFirst: jest.fn().mockResolvedValue({ id: 'student-1' }) },
      matricula: {
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(activeCount),
        create: jest.fn().mockResolvedValue({ id: 'enrollment-1' }),
      },
    }
    const prisma = { $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)) }
    return { service: new EnrollmentService(prisma as never), tx }
  }

  it('confirms enrollment while the class has a vacancy', async () => {
    const { service, tx } = setup(0)
    const result = await service.enrollExisting('tenant-1', 'class-1', 'student-1')
    expect(result.status).toBe('ATIVA')
    expect(tx.matricula.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tenant_id: 'tenant-1', turma_id: 'class-1', aluno_id: 'student-1', status: 'ATIVA' }) })
  })

  it('places a student on the waitlist after capacity is reached', async () => {
    const { service, tx } = setup(1)
    const result = await service.enrollExisting('tenant-1', 'class-1', 'student-1')
    expect(result.status).toBe('EM_ESPERA')
    expect(tx.matricula.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: 'EM_ESPERA' }) })
    expect(tx.$queryRaw).toHaveBeenCalled()
  })
})
