export interface ClassItem {
  id: string
  nome: string
  professor_id: string
  _count: { matriculas: number; aulas: number }
}
export interface Attendance {
  matricula_id: string
  status: string
  matricula?: { aluno: { name: string } }
}
export interface Lesson {
  id: string
  titulo: string
  inicio: string
  fim: string
  meet_url: string
  chamada_enviada_at: string | null
  versao: number
  presencas: Attendance[]
  turma?: { nome: string }
}
export interface Delivery {
  id: string
  status: string
  conteudo: string
  anexos: string[]
  nota: string | null
  feedback: string | null
  entregue_at: string
  matricula: { aluno: { name: string } }
}
export interface Detail {
  turma: ClassItem
  canTeach: boolean
  aulas: Lesson[]
  matriculas: { id: string; status: string; aluno: { name: string } }[]
  materiais: { id: string; titulo: string; texto: string; anexo_id: string | null }[]
  atividades: {
    id: string
    titulo: string
    descricao: string
    prazo: string | null
    entregas: Delivery[]
  }[]
}
export interface Catalog {
  alunos: {
    id: string
    name: string
    user_id: string | null
    user: { student_code: string } | null
  }[]
  professores: { id: string; nome_completo: string; user_id: string | null }[]
  projects: { id: string; name: string }[]
}

export interface Overview {
  perfil: { nome: string; instituto: string; matricula: string | null; email: string | null } | null
  resumo: {
    turmas: number
    alunos: number
    aulas: number
    materiais: number
    pendentes: number
    avaliadas: number
    chamadas_pendentes: number
    atividades: number
  }
  proximas_aulas: {
    id: string
    titulo: string
    inicio: string
    fim: string
    meet_url: string
    turma: { id: string; nome: string }
  }[]
  atividades: {
    id: string
    titulo: string
    prazo: string | null
    turma: { id: string; nome: string }
    pendentes: number
    status: string
  }[]
  frequencia: { total: number; presentes: number } | null
}
