import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { CoursesService } from './courses.service'
import { BatchClassesDto, SaveCourseDto } from './dto/course.dto'

describe('CoursesService links and classes', () => {
  function setup() {
    const tx = {
      curso: { findFirst: jest.fn().mockResolvedValue({ id: 'course-1' }), create: jest.fn().mockResolvedValue({ id: 'course-1' }), update: jest.fn() },
      project: { count: jest.fn().mockResolvedValue(1), findFirst: jest.fn().mockResolvedValue({ id: 'project-1' }) },
      emendaParlamentar: { count: jest.fn().mockResolvedValue(0) },
      edital: { count: jest.fn().mockResolvedValue(0) },
      turma: { create: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)) },
      beneficiary: { findFirst: jest.fn().mockResolvedValue({ id: 'student-1' }), findMany: jest.fn().mockResolvedValue([]) },
    }
    const db = { ...tx, $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)) }
    return { tx, service: new CoursesService(db as never) }
  }

  it('lists only linked students from the current organization', async () => {
    const { tx, service } = setup()
    await service.students('tenant-1', 'course-1')
    expect(tx.beneficiary.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenant_id: 'tenant-1', deleted_at: null, cursos: { some: { id: 'course-1', tenant_id: 'tenant-1' } } } }))
  })

  it('does not disclose a roster for a foreign course', async () => {
    const { tx, service } = setup()
    tx.curso.findFirst.mockResolvedValue(null)
    await expect(service.students('tenant-1', 'other-course')).rejects.toThrow('não encontrado')
    expect(tx.beneficiary.findMany).not.toHaveBeenCalled()
  })

  it('connects an existing student without changing class enrollments or capacity', async () => {
    const { tx, service } = setup()
    await expect(service.linkStudent('tenant-1', 'course-1', 'student-1')).resolves.toEqual({ linked: 'student-1', curso_id: 'course-1' })
    expect(tx.beneficiary.findFirst).toHaveBeenCalledWith({ where: { id: 'student-1', tenant_id: 'tenant-1', deleted_at: null }, select: { id: true } })
    expect(tx.curso.update).toHaveBeenCalledWith({ where: { id: 'course-1' }, data: { alunos: { connect: { id: 'student-1' } } } })
    expect(tx.turma.create).not.toHaveBeenCalled()
  })

  it('rejects linking a student from another organization', async () => {
    const { tx, service } = setup()
    tx.beneficiary.findFirst.mockResolvedValue(null)
    await expect(service.linkStudent('tenant-1', 'course-1', 'foreign-student')).rejects.toThrow('Aluno não encontrado')
    expect(tx.curso.update).not.toHaveBeenCalled()
  })

  it('rejects project links outside the current organization', async () => {
    const { tx, service } = setup()
    tx.project.count.mockResolvedValue(0)
    await expect(service.save('tenant-1', { nome: 'Judô', tipo: 'MODALIDADE', project_ids: ['foreign-project'] })).rejects.toThrow('vínculos')
    expect(tx.curso.create).not.toHaveBeenCalled()
    expect(tx.project.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenant_id: 'tenant-1', deleted_at: null }) }))
  })

  it.each(['emenda_ids', 'edital_ids'] as const)('rejects a foreign %s link before creating the course', async field => {
    const { tx, service } = setup()
    await expect(service.save('tenant-1', { nome: 'Dança', tipo: 'MODALIDADE', [field]: ['foreign'] })).rejects.toThrow('vínculos')
    expect(tx.curso.create).not.toHaveBeenCalled()
  })

  it('creates the requested class count and assigns capacity to each class', async () => {
    const { tx, service } = setup()
    const classes = await service.createClasses('tenant-1', 'course-1', { nome: 'Judô manhã', quantidade: 3, capacidade: 20, project_id: 'project-1' })
    expect(classes).toHaveLength(3)
    expect(tx.turma.create.mock.calls.map(([call]) => call.data)).toEqual([1, 2, 3].map(n => ({ tenant_id: 'tenant-1', curso_id: 'course-1', project_id: 'project-1', nome: `Judô manhã ${n}`, capacidade: 20 })))
    expect(tx.project.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenant_id: 'tenant-1', cursos: { some: { id: 'course-1' } } }) }))
  })

  it('rejects classes for another tenant course', async () => {
    const { tx, service } = setup()
    tx.curso.findFirst.mockResolvedValue(null)
    await expect(service.createClasses('tenant-1', 'other-course', { nome: 'Turma', quantidade: 1, capacidade: 20 })).rejects.toThrow('não encontrado')
    expect(tx.turma.create).not.toHaveBeenCalled()
  })

  it('rejects a class project that is not linked to the course', async () => {
    const { tx, service } = setup()
    tx.project.findFirst.mockResolvedValue(null)
    await expect(service.createClasses('tenant-1', 'course-1', { nome: 'Turma', quantidade: 1, capacidade: 20, project_id: 'other-project' })).rejects.toThrow('vinculado')
    expect(tx.turma.create).not.toHaveBeenCalled()
  })

  it.each([{ quantidade: 0, capacidade: 20 }, { quantidade: 51, capacidade: 20 }, { quantidade: 1.5, capacidade: 20 }, { quantidade: 1, capacidade: 0 }, { quantidade: 1, capacidade: 10001 }])('validates batch limits %o', async values => {
    const errors = await validate(plainToInstance(BatchClassesDto, { nome: 'Turma', ...values }))
    expect(errors.length).toBeGreaterThan(0)
  })

  it('accepts clearing all links and rejects duplicate link IDs', async () => {
    expect(await validate(plainToInstance(SaveCourseDto, { nome: 'Inglês', tipo: 'CURSO', project_ids: [] }))).toHaveLength(0)
    expect((await validate(plainToInstance(SaveCourseDto, { nome: 'Inglês', tipo: 'CURSO', project_ids: ['same', 'same'] }))).length).toBeGreaterThan(0)
  })
})
