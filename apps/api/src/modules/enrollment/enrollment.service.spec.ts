import { EnrollmentService } from './enrollment.service'
import type { ApplyEnrollmentDto } from './dto/enrollment.dto'

describe('EnrollmentService course registration', () => {
  const dto: ApplyEnrollmentDto = { curso_id: 'course-1', turma_id: 'class-1', aluno_nome: 'José Silva', aluno_nascimento: '2000-01-01', aluno_cpf: '12345678901', solicitante_tipo: 'ALUNO', solicitante_nome: 'José Silva', solicitante_contato: '61999999999', consentimento: true }
  function setup() {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      turma: { findFirst: jest.fn().mockResolvedValue({ id: 'class-1', nome: 'Judô A', capacidade: 1, curso_id: 'course-1', project_id: 'project-1', curso: { ativo: true, inscricoes_abertas: true } }), findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({ id: 'class-1', curso_id: 'course-1' }) },
      curso: { update: jest.fn().mockResolvedValue({ id: 'course-1' }) },
      beneficiary: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'new-student' }) },
      matricula: { findUnique: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(1), create: jest.fn().mockResolvedValue({ id: 'enrollment-1' }), findMany: jest.fn().mockResolvedValue([{ id: 'first-waiting', aluno_id: 'waiting-student' }]), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    }
    const prisma = { ...tx, tenant: { findUnique: jest.fn().mockResolvedValue({ id: 'tenant-1', name: 'OSC', status: 'ACTIVE', deleted_at: null }) }, curso: { findFirst: jest.fn().mockResolvedValue({ id: 'course-1', nome: 'Judô' }) }, $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)) }
    return { tx, prisma, service: new EnrollmentService(prisma as never) }
  }

  it('filters public classes by an open course within the tenant', async () => {
    const { prisma, service } = setup()
    await service.publicClasses('osc', 'course-1')
    expect(prisma.curso.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'course-1', tenant_id: 'tenant-1', ativo: true, inscricoes_abertas: true } }))
    expect(prisma.turma.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenant_id: 'tenant-1', curso_id: 'course-1', deleted_at: null }) }))
  })

  it('rejects invalid or closed course links instead of displaying unrelated classes', async () => {
    const { prisma, service } = setup()
    prisma.curso.findFirst.mockResolvedValue(null)
    await expect(service.publicClasses('osc', 'closed-course')).rejects.toThrow('indisponível')
    expect(prisma.turma.findMany).not.toHaveBeenCalled()
  })

  it('rejects submitting a class from a different course before creating a student', async () => {
    const { tx, service } = setup()
    await expect(service.apply('osc', { ...dto, curso_id: 'other-course' })).rejects.toThrow('não pertence')
    expect(tx.beneficiary.create).not.toHaveBeenCalled()
  })

  it('rejects direct submissions to a closed course', async () => {
    const { tx, service } = setup()
    tx.turma.findFirst.mockResolvedValue({ id: 'class-1', capacidade: 1, curso_id: 'course-1', curso: { ativo: true, inscricoes_abertas: false } })
    await expect(service.apply('osc', dto)).rejects.toThrow('encerradas')
    expect(tx.beneficiary.create).not.toHaveBeenCalled()
  })

  it('puts an existing student in another course on the reserve without duplicating their profile', async () => {
    const { tx, service } = setup()
    tx.beneficiary.findUnique.mockResolvedValue({ id: 'existing-student', name: 'Jose Silva', birth_date: new Date('2000-01-01'), deleted_at: null })
    const result = await service.apply('osc', dto)
    expect(result).toMatchObject({ status: 'EM_ESPERA', posicao_espera: 1 })
    expect(tx.curso.update).not.toHaveBeenCalled()
    expect(tx.beneficiary.create).not.toHaveBeenCalled()
    expect(tx.matricula.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ aluno_id: 'existing-student' }) }))
  })

  it('rejects mismatched identity for an existing CPF without changing any student', async () => {
    const { tx, service } = setup()
    tx.beneficiary.findUnique.mockResolvedValue({ id: 'existing-student', name: 'Another student', birth_date: new Date('2000-01-01'), deleted_at: null })
    await expect(service.apply('osc', dto)).rejects.toThrow('conferir os dados')
    expect(tx.beneficiary.create).not.toHaveBeenCalled()
    expect(tx.matricula.create).not.toHaveBeenCalled()
  })

  it('promotes the oldest reserve registrations when capacity grows', async () => {
    const { tx, service } = setup()
    const result = await service.updateClass('tenant-1', 'class-1', { capacidade: 2 })
    expect(result.promoted).toBe(1)
    expect(tx.matricula.findMany).toHaveBeenCalledWith({ where: { turma_id: 'class-1', status: 'EM_ESPERA' }, orderBy: [{ created_at: 'asc' }, { id: 'asc' }], take: 1, select: { id: true, aluno_id: true } })
    expect(tx.curso.update).toHaveBeenCalledWith({ where: { id: 'course-1' }, data: { alunos: { connect: { id: 'waiting-student' } } } })
    expect(tx.$queryRaw).toHaveBeenCalled()
  })

  it('links a newly confirmed student to the course in the same transaction', async () => {
    const { tx, service } = setup()
    tx.matricula.count.mockResolvedValue(0)
    await expect(service.apply('osc', dto)).resolves.toMatchObject({ status: 'ATIVA' })
    expect(tx.curso.update).toHaveBeenCalledWith({ where: { id: 'course-1' }, data: { alunos: { connect: { id: 'new-student' } } } })
  })

  it('links active students when their existing class is assigned to a course', async () => {
    const { tx, service, prisma } = setup()
    prisma.curso.findFirst.mockResolvedValue({ id: 'course-1', nome: 'Judô' })
    await service.updateClass('tenant-1', 'class-1', { curso_id: 'course-1' })
    expect(tx.matricula.findMany).toHaveBeenCalledWith({ where: { tenant_id: 'tenant-1', turma_id: 'class-1', status: 'ATIVA' }, select: { aluno_id: true } })
    expect(tx.curso.update).toHaveBeenCalledWith({ where: { id: 'course-1' }, data: { alunos: { connect: [{ id: 'waiting-student' }] } } })
  })
})

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
