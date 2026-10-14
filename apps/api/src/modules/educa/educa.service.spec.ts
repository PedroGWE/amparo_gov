import { EducaService } from './educa.service'
import { PrismaService } from '../prisma/prisma.service'
import { JwtPayload } from '../auth/types/jwt-payload'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { LessonDto } from './educa.dto'
const teacher: JwtPayload = {
  sub: 'teacher',
  tenantId: 'org',
  email: 'teacher@example.test',
  permissions: ['conecta:teacher'],
}
const student: JwtPayload = { ...teacher, sub: 'student', permissions: ['conecta:student'] }
const manager: JwtPayload = { ...teacher, sub: 'manager', permissions: ['*'] }
function setup() {
  const db = {
    turma: { findFirst: jest.fn().mockResolvedValue({ id: 'class', professor_id: 'teacher' }) },
    matricula: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([{ id: 'm1' }, { id: 'm2' }]),
    },
    educaAula: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'lesson', turma_id: 'class', chamada_enviada_at: null }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn(),
    },
    educaPresenca: { upsert: jest.fn() },
    educaArquivo: { count: jest.fn().mockResolvedValue(0) },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  }
  db.$transaction.mockImplementation(async (fn) => fn(db))
  return { db, service: new EducaService(db as unknown as PrismaService) }
}
describe('Educa: autorização e chamada por aula', () => {
  it('não concede acesso ao criador do cadastro do aluno', async () => {
    const { db, service } = setup()
    await expect(service.classAccess(student, 'class')).rejects.toThrow()
    expect(db.matricula.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ aluno: { user_id: 'student', status: 'ATIVO' } }),
      }),
    )
  })
  it('restringe consulta à organização autenticada', async () => {
    const { db, service } = setup()
    db.turma.findFirst.mockResolvedValue(null)
    await expect(service.classAccess(teacher, 'foreign')).rejects.toThrow()
    expect(db.turma.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign', tenant_id: 'org', deleted_at: null },
    })
  })
  it('impede professor de alterar turma de outro professor', async () => {
    const { db, service } = setup()
    db.turma.findFirst.mockResolvedValue({ id: 'class', professor_id: 'other' })
    await expect(service.classAccess(teacher, 'class', true)).rejects.toThrow()
  })
  it('impede aluno de enviar chamada', async () => {
    const { service } = setup()
    await expect(
      service.attendance(student, 'lesson', { versao: 0, itens: [] }, false),
    ).rejects.toThrow()
  })
  it('aceita rascunho incompleto, mas exige todos os alunos para envio', async () => {
    const { service, db } = setup()
    const dto = { versao: 0, itens: [{ matricula_id: 'm1', status: 'PRESENTE' }] }
    await expect(service.attendance(teacher, 'lesson', dto, true)).rejects.toThrow('Marque todos')
    await expect(service.attendance(teacher, 'lesson', dto, false)).resolves.toEqual({
      enviada: false,
    })
    expect(db.auditLog.create).toHaveBeenCalled()
  })
  it('recusa alunos fora da turma e duplicados', async () => {
    const { service } = setup()
    await expect(
      service.attendance(
        teacher,
        'lesson',
        { versao: 0, itens: [{ matricula_id: 'foreign', status: 'PRESENTE' }] },
        false,
      ),
    ).rejects.toThrow()
    await expect(
      service.attendance(
        teacher,
        'lesson',
        {
          versao: 0,
          itens: [
            { matricula_id: 'm1', status: 'PRESENTE' },
            { matricula_id: 'm1', status: 'AUSENTE' },
          ],
        },
        false,
      ),
    ).rejects.toThrow()
  })
  it('persiste por aula e publica atomicamente para o gestor', async () => {
    const { service, db } = setup()
    const itens = [
      { matricula_id: 'm1', status: 'PRESENTE' },
      { matricula_id: 'm2', status: 'JUSTIFICADA' },
    ]
    await service.attendance(teacher, 'lesson', { versao: 0, itens }, true)
    expect(db.educaPresenca.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { aula_id_matricula_id: { aula_id: 'lesson', matricula_id: 'm1' } },
      }),
    )
    expect(db.educaAula.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          enviada_por: 'teacher',
          chamada_enviada_at: expect.any(Date),
        }),
      }),
    )
  })
  it('recusa versão desatualizada sem escrever presenças', async () => {
    const { service, db } = setup()
    db.educaAula.updateMany.mockResolvedValue({ count: 0 })
    await expect(
      service.attendance(teacher, 'lesson', { versao: 0, itens: [] }, false),
    ).rejects.toThrow('A chamada mudou')
    expect(db.educaPresenca.upsert).not.toHaveBeenCalled()
  })
  it('somente gestor reabre uma chamada enviada', async () => {
    const { service } = setup()
    await expect(service.reopen(teacher, 'lesson')).rejects.toThrow()
    await expect(service.reopen(manager, 'lesson')).resolves.toEqual({ count: 1 })
  })
  it('recusa anexos pertencentes a outro aluno', async () => {
    const { service, db } = setup()
    await expect(service.ownedFiles(student, 'class', ['other-file'])).rejects.toThrow()
    expect(db.educaArquivo.count).toHaveBeenCalledWith({
      where: {
        id: { in: ['other-file'] },
        tenant_id: 'org',
        turma_id: 'class',
        user_id: 'student',
      },
    })
  })
  it('recusa reunião fora do domínio Meet e fim anterior ao início', async () => {
    const { service } = setup()
    const dto = {
      titulo: 'Aula',
      inicio: '2026-10-08T12:00:00Z',
      fim: '2026-10-08T11:00:00Z',
      meet_url: 'https://meet.google.com/abc-defg-hij',
    }
    await expect(service.lesson(teacher, 'class', dto)).rejects.toThrow('O fim')
    const invalid = plainToInstance(LessonDto, {
      ...dto,
      meet_url: 'https://meet.google.com.evil.test/abc-defg-hij',
    })
    expect((await validate(invalid)).some((e) => e.property === 'meet_url')).toBe(true)
  })
})
