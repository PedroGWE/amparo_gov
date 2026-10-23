import api from '@/lib/api'

export type ProjectStatus =
  | 'RASCUNHO'
  | 'CAPTACAO'
  | 'APROVADO'
  | 'EM_EXECUCAO'
  | 'CONCLUIDO'
  | 'SUSPENSO'
  | 'CANCELADO'

export type ProjectType =
  | 'CULTURAL'
  | 'ESPORTIVO'
  | 'EDUCACIONAL'
  | 'ASSISTENCIA_SOCIAL'
  | 'SAUDE'
  | 'AMBIENTAL'
  | 'OUTROS'

export interface Project {
  id: string
  code: string
  name: string
  description?: string
  type: ProjectType
  status: ProjectStatus
  start_date?: string
  end_date?: string
  total_budget?: number | string
  approved_budget?: number | string
  tags: string[]
  created_at: string
  updated_at: string
  manager?: { id: string; name: string; email: string }
  _count: { members: number; tasks: number; phases: number; beneficiario_vinculos: number }
  task_progress?: { total: number; completed: number; overdue: number }
}

export interface ProjectTask {
  id: string
  title: string
  description?: string
  phase_id?: string
  assigned_to?: string | null
  due_date?: string
  status: 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA' | 'BLOQUEADA'
  priority: 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE'
  phase?: { id: string; name: string }
  assignee?: { id: string; name: string }
}

export interface ProjectMember {
  id: string
  user_id: string
  role: 'GESTOR' | 'COORDENADOR' | 'COLABORADOR' | 'VOLUNTARIO'
  user: { id: string; name: string; email: string }
}

export interface ProjectDetails extends Omit<Project, '_count'> {
  cursos?: { id: string; nome: string; tipo: string }[]
  emendas?: { id: string; number: string | null; year: number; parlamentar_name: string; value: string | number }[]
  editais?: { id: string; titulo: string; link_oficial: string | null }[]
  funding_sources?: { source?: string; instrument?: string; proposal?: string; process?: string; official_status?: string; released_amount?: number; counterpart_amount?: number; reference_date?: string; official_url?: string; document_urls?: { title: string; url: string }[] }[]
  manager_id?: string | null
  members: ProjectMember[]
  phases: ProjectPhase[]
  _count: { tasks: number; risks: number; documents: number; beneficiaries: number }
}

export interface ProjectTaskInput {
  title: string
  description?: string
  phase_id?: string | null
  assigned_to?: string | null
  due_date?: string
  priority?: ProjectTask['priority']
}

export interface ProjectPhase {
  id: string
  name: string
  order: number
  start_date?: string
  end_date?: string
  status: 'NAO_INICIADA' | 'EM_ANDAMENTO' | 'CONCLUIDA'
  _count?: { tasks: number }
}

export interface ProjectIndicator {
  id: string
  name: string
  description?: string
  unit?: string
  baseline?: number | string
  target?: number | string
  current_value?: number | string
  frequency?: 'DIARIO' | 'SEMANAL' | 'MENSAL' | 'TRIMESTRAL' | 'ANUAL'
  last_updated?: string
}

export interface ProjectOverview {
  projects: { total: number; executing: number; completed: number; planning: number }
  budget: { planned: number; approved: number }
  tasks: { total: number; completed: number; open: number; overdue: number }
  operations: { students: number; classes: number; presentToday: number; absentToday: number }
}

export interface ProjectStudent {
  id: string
  name: string
  status: string
  turma: string | null
  vinculos_projetos: { id: string; project_id: string; project: { name: string } }[]
}

export interface ProjectClass {
  id: string
  nome: string
  capacidade: number | null
  horario: unknown
  matriculas: { id: string; status: 'ATIVA' | 'EM_ESPERA'; aluno: { id: string; name: string } }[]
  atividades: {
    id: string
    titulo: string
    descricao: string | null
    prazo: string | null
    status: string
  }[]
  attendance30d: { present: number; absent: number }
}

export interface ProjectManagement {
  students: ProjectStudent[]
  classes: ProjectClass[]
  summary: { students: number; classes: number; routines: number }
}

export interface AttendanceRow {
  id: string
  aluno: { id: string; name: string }
  presente: boolean | null
}

export interface ProjectsPage {
  data: Project[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface CreateProjectInput {
  name: string
  description?: string
  type: ProjectType
  code?: string
  start_date?: string
  end_date?: string
  total_budget?: number
}

export const projectsService = {
  overview: (): Promise<ProjectOverview> => api.get('/projects/overview').then((r) => r.data),

  list: (params?: Record<string, string | number>): Promise<ProjectsPage> =>
    api.get('/projects', { params }).then((r) => r.data),

  get: (id: string): Promise<ProjectDetails> => api.get(`/projects/${id}`).then((r) => r.data),

  create: (dto: CreateProjectInput) => api.post('/projects', dto).then((r) => r.data),

  update: (id: string, dto: Partial<CreateProjectInput> & { status?: ProjectStatus }) =>
    api.patch(`/projects/${id}`, dto).then((r) => r.data),

  remove: (id: string) => api.delete(`/projects/${id}`),

  phases: (id: string): Promise<ProjectPhase[]> =>
    api.get(`/projects/${id}/phases`).then((r) => r.data),

  createPhase: (
    id: string,
    dto: { name: string; order: number; start_date?: string; end_date?: string },
  ) => api.post(`/projects/${id}/phases`, dto).then((r) => r.data),

  indicators: (id: string): Promise<ProjectIndicator[]> =>
    api.get(`/projects/${id}/indicators`).then((r) => r.data),

  createIndicator: (
    id: string,
    dto: {
      name: string
      description?: string
      unit?: string
      baseline?: number
      target?: number
      current_value?: number
      frequency?: ProjectIndicator['frequency']
    },
  ) => api.post(`/projects/${id}/indicators`, dto).then((r) => r.data),

  updateIndicator: (id: string, indicatorId: string, current_value: number) =>
    api.patch(`/projects/${id}/indicators/${indicatorId}`, { current_value }).then((r) => r.data),

  tasks: (id: string, params?: Record<string, string>): Promise<ProjectTask[]> =>
    api.get(`/projects/${id}/tasks`, { params }).then((r) => r.data),

  createTask: (id: string, dto: ProjectTaskInput) =>
    api.post(`/projects/${id}/tasks`, dto).then((r) => r.data),

  updateTask: (
    id: string,
    taskId: string,
    dto: Partial<ProjectTaskInput> & { status?: ProjectTask['status'] },
  ) => api.patch(`/projects/${id}/tasks/${taskId}`, dto).then((r) => r.data),

  members: (id: string): Promise<ProjectMember[]> =>
    api.get(`/projects/${id}/members`).then((r) => r.data),

  addMember: (id: string, user_id: string, role: ProjectMember['role']) =>
    api.post(`/projects/${id}/members`, { user_id, role }).then((r) => r.data),

  removeMember: (id: string, userId: string) => api.delete(`/projects/${id}/members/${userId}`),

  management: (id: string): Promise<ProjectManagement> =>
    api.get(`/projects/${id}/management`).then((r) => r.data),
  searchStudents: (
    id: string,
    q: string,
  ): Promise<{ id: string; name: string; turma: string | null }[]> =>
    api.get(`/projects/${id}/students/search`, { params: { q } }).then((r) => r.data),
  linkStudent: (id: string, beneficiary_id: string) =>
    api.post(`/projects/${id}/students`, { beneficiary_id }).then((r) => r.data),
  unlinkStudent: (id: string, studentId: string) =>
    api.delete(`/projects/${id}/students/${studentId}`),
  createClass: (id: string, dto: { nome: string; capacidade: number; horario?: string }) =>
    api.post(`/projects/${id}/classes`, dto).then((r) => r.data),
  enrollStudent: (id: string, classId: string, studentId: string) =>
    api.post(`/projects/${id}/classes/${classId}/students/${studentId}`).then((r) => r.data),
  attendance: (id: string, classId: string, date: string): Promise<AttendanceRow[]> =>
    api
      .get(`/projects/${id}/classes/${classId}/attendance`, { params: { date } })
      .then((r) => r.data),
  saveAttendance: (
    id: string,
    classId: string,
    data: string,
    presencas: { matricula_id: string; presente: boolean }[],
  ) =>
    api
      .post(`/projects/${id}/classes/${classId}/attendance`, { data, presencas })
      .then((r) => r.data),
  createRoutine: (
    id: string,
    classId: string,
    dto: { titulo: string; descricao?: string; prazo?: string },
  ) => api.post(`/projects/${id}/classes/${classId}/routine`, dto).then((r) => r.data),
}
