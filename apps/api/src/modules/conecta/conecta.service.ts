import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class ConectaService {
  constructor(private prisma: PrismaService) {}

  async studentHome(tenantId: string, userId: string) {
    const matriculas = await this.prisma.matricula.findMany({
      where: {
        tenant_id: tenantId,
        status: 'ATIVA',
        aluno: { user_id: userId },
      },
      select: {
        id: true,
        turma: { select: { id: true, nome: true, horario: true } },
      },
    })

    const turmaIds = matriculas.map((m) => m.turma.id)

    const [proximoEncontro, atividadesPendentes, ultimoAviso] = await Promise.all([
      turmaIds.length
        ? this.prisma.atividade.findFirst({
            where: { tenant_id: tenantId, turma_id: { in: turmaIds }, status: 'PUBLICADA' },
            orderBy: { prazo: 'asc' },
            select: { id: true, titulo: true, prazo: true, turma: { select: { nome: true } } },
          })
        : Promise.resolve(null),
      turmaIds.length
        ? this.prisma.atividade.findMany({
            where: { tenant_id: tenantId, turma_id: { in: turmaIds }, status: 'PUBLICADA' },
            orderBy: { prazo: 'asc' },
            take: 3,
            select: {
              id: true,
              titulo: true,
              prazo: true,
              turma: { select: { nome: true } },
              entregas: { where: { matricula: { aluno: { user_id: userId } } }, select: { status: true } },
            },
          })
        : Promise.resolve([]),
      null,
    ])

    return {
      proximo_encontro: proximoEncontro
        ? {
            id: proximoEncontro.id,
            titulo: proximoEncontro.titulo,
            data_hora: proximoEncontro.prazo?.toISOString() ?? null,
            turma: proximoEncontro.turma.nome,
          }
        : null,
      atividades_pendentes: atividadesPendentes.map((a) => ({
        id: a.id,
        titulo: a.titulo,
        prazo: a.prazo?.toISOString() ?? null,
        turma: a.turma.nome,
        status: a.entregas[0]?.status ?? 'PENDENTE',
      })),
      ultimo_aviso: ultimoAviso,
    }
  }

  async teacherHome(tenantId: string, userId: string) {
    const turmas = await this.prisma.turma.findMany({
      where: { tenant_id: tenantId, professor_id: userId, deleted_at: null },
      select: { id: true, nome: true, horario: true },
    })

    const turmaIds = turmas.map((t) => t.id)
    const hoje = new Date()
    const inicioDoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
    const fimDoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1)

    const [chamadasNaoFeitas, entregasPendentes] = await Promise.all([
      turmaIds.length
        ? this.prisma.turma.count({
            where: {
              id: { in: turmaIds },
              presencas: { none: { data: { gte: inicioDoDia, lt: fimDoDia } } },
            },
          })
        : Promise.resolve(0),
      this.prisma.entregaAtividade.count({
        where: { tenant_id: tenantId, status: 'ENTREGUE', atividade: { turma_id: { in: turmaIds } } },
      }),
    ])

    return {
      aulas_hoje: turmas.map((t) => ({
        id: t.id,
        turma: t.nome,
        horario: t.horario,
      })),
      pendencias: {
        chamadas_nao_feitas: chamadasNaoFeitas,
        entregas_aguardando_correcao: entregasPendentes,
      },
    }
  }
}
