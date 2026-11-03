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
    professor: { count: jest.fn().mockResolvedValue(1), findFirst: jest.fn(), update: jest.fn() },
    user: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'teacher-user' }), update: jest.fn().mockResolvedValue({ id: 'teacher-user' }) },
    userRole: { upsert: jest.fn() },
    role: { upsert: jest.fn().mockResolvedValue({ id: 'teacher-role' }) },
    refreshToken: { updateMany: jest.fn() },
    matricula: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([{ id: 'm1' }, { id: 'm2' }]),
    },
    educaAula: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'lesson', turma_id: 'class', chamada_enviada_at: null, actual_started_at: new Date('2026-10-08T12:00:00Z') }),
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
  it('impede professor inativo de acessar a turma', async () => {
    const { db, service } = setup()
    db.professor.count.mockResolvedValue(0)
    await expect(service.classAccess(teacher, 'class', true)).rejects.toThrow()
  })
  it('cria acesso de professor com permissão Educa e vínculo ao cadastro', async () => {
    const { db, service } = setup()
    db.professor.findFirst.mockResolvedValue({ id: 'professor-1', nome_completo: 'Professora Teste', user_id: null })
    await service.account(manager, { perfil: 'professor', registro_id: 'professor-1', email: 'professora@example.test', senha: 'senha-segura-123' })
    expect(db.role.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ permissions: ['conecta:teacher'] }),
    }))
    expect(db.userRole.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { user_id: 'teacher-user', role_id: 'teacher-role' } }))
    expect(db.professor.update).toHaveBeenCalledWith(expect.objectContaining({ data: { user_id: 'teacher-user' } }))
  })
  it('atribui o papel Educa quando o professor já possui usuário do instituto', async () => {
    const { db, service } = setup()
    db.professor.findFirst.mockResolvedValue({ id: 'professor-1', nome_completo: 'Professora Teste', user_id: 'teacher-user' })
    db.user.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'teacher-user', tenant_id: 'org' })
    await service.account(manager, { perfil: 'professor', registro_id: 'professor-1', email: 'professora@example.test', senha: 'senha-segura-123' })
    expect(db.user.create).not.toHaveBeenCalled()
    expect(db.userRole.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { user_id: 'teacher-user', role_id: 'teacher-role' } }))
  })
  it('registra o início real uma única vez e rejeita horário futuro', async () => {
    const { db, service } = setup()
    db.educaAula.findFirst.mockResolvedValueOnce({ id: 'lesson', turma_id: 'class', chamada_enviada_at: null, actual_started_at: null })
    db.educaAula.findFirst.mockResolvedValueOnce({ id: 'lesson', turma_id: 'class', actual_started_at: new Date('2026-10-08T12:00:00Z') })
    await service.startLesson(teacher, 'lesson', { versao: 0, inicio_real: '2026-10-08T12:00:00Z' })
    await service.startLesson(teacher, 'lesson', { versao: 0, inicio_real: '2026-10-08T12:00:00Z' })
    expect(db.educaAula.updateMany).toHaveBeenCalledTimes(1)
    expect(db.educaAula.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenant_id: 'org', versao: 0, actual_started_at: null }),
      data: expect.objectContaining({ started_by: 'teacher', actual_started_at: new Date('2026-10-08T12:00:00Z') }),
    }))
    await expect(service.startLesson(teacher, 'lesson', { versao: 0, inicio_real: '2099-01-01T00:00:00Z' })).rejects.toThrow()
  })
  it('não envia chamada sem início confirmado', async () => {
    const { db, service } = setup()
    db.educaAula.findFirst.mockResolvedValue({ id: 'lesson', turma_id: 'class', chamada_enviada_at: null, actual_started_at: null })
    await expect(service.attendance(teacher, 'lesson', { versao: 0, itens: [] }, true)).rejects.toThrow('horário de início')
    expect(db.educaPresenca.upsert).not.toHaveBeenCalled()
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
