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

describe('EnrollmentService deletion', () => {
  function setup(status: 'ATIVA' | 'EM_ESPERA') {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'class-1' }]),
      turma: { findFirst: jest.fn().mockResolvedValue({ id: 'class-1', nome: 'Turma A', capacidade: 1, project_id: null }) },
      matricula: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({ turma_id: 'class-1' })
          .mockResolvedValueOnce({ status })
          .mockResolvedValueOnce({ id: 'next-1', aluno: { name: 'Próximo aluno' } }),
        delete: jest.fn().mockResolvedValue({ id: 'enrollment-1' }),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue({ id: 'next-1', status: 'ATIVA' }),
      },
    }
    const prisma = { $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)) }
    return { service: new EnrollmentService(prisma as never), tx }
  }

  it('deletes an active enrollment and offers the vacancy to the first waiting student', async () => {
    const { service, tx } = setup('ATIVA')
    const result = await service.deleteEnrollment('tenant-1', 'enrollment-1')
    expect(tx.matricula.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'enrollment-1', tenant_id: 'tenant-1' } }))
    expect(tx.matricula.delete).toHaveBeenCalledWith({ where: { id: 'enrollment-1' } })
    expect(tx.matricula.update).toHaveBeenCalledWith({ where: { id: 'next-1' }, data: { status: 'ATIVA' } })
    expect(result.promoted).toBe('Próximo aluno')
  })

  it('deletes a waiting enrollment without changing active students', async () => {
    const { service, tx } = setup('EM_ESPERA')
    const result = await service.deleteEnrollment('tenant-1', 'enrollment-1')
    expect(tx.matricula.delete).toHaveBeenCalledTimes(1)
    expect(tx.matricula.update).not.toHaveBeenCalled()
    expect(result.promoted).toBeNull()
  })

  it('rejects an enrollment outside the administrator tenant', async () => {
    const { service, tx } = setup('ATIVA')
    tx.matricula.findFirst.mockReset().mockResolvedValue(null)
    await expect(service.deleteEnrollment('tenant-1', 'other-enrollment')).rejects.toThrow('Inscrição não encontrada')
    expect(tx.matricula.delete).not.toHaveBeenCalled()
  })
})
