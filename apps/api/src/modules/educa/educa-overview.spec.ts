import { EducaService } from './educa.service'
import { PrismaService } from '../prisma/prisma.service'
import { JwtPayload } from '../auth/types/jwt-payload'

const teacher: JwtPayload = {
  sub: 'teacher',
  tenantId: 'org',
  email: 'teacher@example.test',
  permissions: ['conecta:teacher'],
}
const student: JwtPayload = { ...teacher, sub: 'student', permissions: ['conecta:student'] }

function setup() {
  const db = {
    turma: { findMany: jest.fn().mockResolvedValue([{ id: 'own-class', _count: { aulas: 3 } }]) },
    educaAula: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(2) },
    atividade: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'pending',
          titulo: 'Pending',
          prazo: null,
          turma: { id: 'own-class', nome: 'Class' },
          entregas: [],
        },
        {
          id: 'graded',
          titulo: 'Graded',
          prazo: null,
          turma: { id: 'own-class', nome: 'Class' },
          entregas: [{ id: 'delivery', status: 'AVALIADA' }],
        },
      ]),
    },
    matricula: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ aluno_id: 'a' }, { aluno_id: 'a' }, { aluno_id: 'b' }]),
    },
    educaMaterial: { count: jest.fn().mockResolvedValue(4) },
    user: {
      findFirst: jest
        .fn()
        .mockResolvedValue({
          name: 'Student',
          student_code: '123',
          email: 'student@educa.invalid',
          tenant: { name: 'Institute' },
        }),
    },
    educaPresenca: {
      findMany: jest.fn().mockResolvedValue([{ status: 'PRESENTE' }, { status: 'AUSENTE' }]),
    },
  }
  return { db, service: new EducaService(db as unknown as PrismaService) }
}

describe('Educa: resumo do portal', () => {
  it('limita resumo do aluno às suas turmas, entregas e presenças', async () => {
    const { db, service } = setup()
    const result = await service.overview(student)
    expect(db.turma.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_id: 'org',
          deleted_at: null,
          OR: [
            {
              matriculas: {
                some: { status: 'ATIVA', aluno: { user_id: 'student', status: 'ATIVO' } },
              },
            },
          ],
        }),
      }),
    )
    expect(db.atividade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenant_id: 'org', turma_id: { in: ['own-class'] }, status: { not: 'RASCUNHO' } },
        select: expect.objectContaining({
          entregas: {
            where: { matricula: { aluno: { user_id: 'student' } } },
            select: { id: true, status: true },
          },
        }),
      }),
    )
    expect(db.matricula.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_id: 'org',
          aluno: { deleted_at: null, user_id: 'student' },
        }),
      }),
    )
    expect(db.educaPresenca.findMany).toHaveBeenCalledWith({
      where: {
        aula: {
          tenant_id: 'org',
          turma_id: { in: ['own-class'] },
          chamada_enviada_at: { not: null },
        },
        matricula: { tenant_id: 'org', aluno: { user_id: 'student' } },
      },
      select: { status: true },
    })
    expect(result.resumo).toMatchObject({ pendentes: 1, avaliadas: 1, chamadas_pendentes: 0 })
    expect(result.frequencia).toEqual({ total: 2, presentes: 1 })
    expect(result.perfil).toMatchObject({ matricula: '123', email: null })
  })

  it('conta alunos distintos e somente entregas aguardando correção nas turmas do professor', async () => {
    const { db, service } = setup()
    db.atividade.findMany.mockResolvedValue([
      {
        id: 'activity',
        titulo: 'Task',
        prazo: null,
        turma: { id: 'own-class', nome: 'Class' },
        entregas: [
          { id: 'd1', status: 'ENTREGUE' },
          { id: 'd2', status: 'AVALIADA' },
        ],
      },
    ])
    const result = await service.overview(teacher)
    expect(db.turma.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenant_id: 'org', deleted_at: null, OR: [{ professor_id: 'teacher' }] },
      }),
    )
    expect(db.educaAula.count).toHaveBeenCalledWith({
      where: {
        tenant_id: 'org',
        turma_id: { in: ['own-class'] },
        fim: { lte: expect.any(Date) },
        chamada_enviada_at: null,
      },
    })
    expect(result.resumo).toMatchObject({
      turmas: 1,
      alunos: 2,
      aulas: 3,
      pendentes: 1,
      avaliadas: 1,
      chamadas_pendentes: 2,
    })
    expect(result.frequencia).toBeNull()
    expect(db.educaPresenca.findMany).not.toHaveBeenCalled()
  })

  it('mantém o escopo vazio quando não há turmas autorizadas', async () => {
    const { db, service } = setup()
    db.turma.findMany.mockResolvedValue([])
    await service.overview(student)
    for (const query of [
      db.educaAula.findMany,
      db.atividade.findMany,
      db.matricula.findMany,
      db.educaMaterial.count,
    ]) {
      expect(query).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenant_id: 'org', turma_id: { in: [] } }),
        }),
      )
    }
  })
})
