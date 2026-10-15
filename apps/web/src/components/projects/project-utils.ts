import axios from 'axios'
import type { ProjectStatus, ProjectTask, ProjectType } from '@/services/projects'

export const TYPE_LABELS: Record<ProjectType, string> = {
  CULTURAL: 'Cultural',
  ESPORTIVO: 'Esportivo',
  EDUCACIONAL: 'Educacional',
  ASSISTENCIA_SOCIAL: 'Assistência social',
  SAUDE: 'Saúde',
  AMBIENTAL: 'Ambiental',
  OUTROS: 'Outros',
}
export const STATUS_LABELS: Record<ProjectStatus, string> = {
  RASCUNHO: 'Rascunho',
  CAPTACAO: 'Captação',
  APROVADO: 'Aprovado',
  EM_EXECUCAO: 'Em execução',
  CONCLUIDO: 'Concluído',
  SUSPENSO: 'Suspenso',
  CANCELADO: 'Cancelado',
}
export const TASK_STATUS_LABELS: Record<ProjectTask['status'], string> = {
  PENDENTE: 'Pendente',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
  BLOQUEADA: 'Bloqueada',
}
export const PRIORITY_LABELS: Record<ProjectTask['priority'], string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
  URGENTE: 'Urgente',
}
export function formatCurrency(value?: number | string | null) {
  if (value == null || !Number.isFinite(Number(value))) return 'Não informado'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number(value),
  )
}
export function formatDate(value?: string | null) {
  if (!value) return 'Não definido'
  const date = new Date(`${value.slice(0, 10)}T12:00:00`)
  return Number.isNaN(date.getTime()) ? 'Não definido' : date.toLocaleDateString('pt-BR')
}
export function isOverdue(task: ProjectTask) {
  if (!task.due_date || ['CONCLUIDA', 'CANCELADA'].includes(task.status)) return false
  const endOfDay = new Date(`${task.due_date.slice(0, 10)}T23:59:59`)
  return endOfDay.getTime() < Date.now()
}
export function projectError(
  error: unknown,
  fallback = 'Não foi possível concluir a ação. Tente novamente.',
) {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message
    if (Array.isArray(message)) return message.join('. ')
    if (typeof message === 'string') return message
    if (error.response?.status === 403) return 'Seu perfil não tem permissão para esta ação.'
    return fallback
  }
  return error instanceof Error ? error.message : fallback
}
