import api from '@/lib/api'
import type { BeneficiaryStatus, Gender, ParentescoType, VinculoStatus } from '@cidadao/shared'

export interface Beneficiario {
  id: string
  name: string
  cpf: string | null
  birth_date: string | null
  gender: Gender | null
  status: BeneficiaryStatus
  telefone: string | null
  email: string | null
  turma: string | null
  turno: string | null
  escola: string | null
  serie_ano: string | null
  termo_consentimento: boolean
  autorizacao_uso_imagem: boolean
  project: { id: string; name: string } | null
  cursos?: { id: string; nome: string; tipo: 'CURSO' | 'MODALIDADE' }[]
  _count: { responsaveis: number; vinculos_projetos: number }
  created_at: string
  updated_at: string
}

export interface BeneficiarioDetail extends Omit<Beneficiario, '_count'> {
  foto_url: string | null
  race: string | null
  rg_certidao: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf_endereco: string | null
  escola: string | null
  serie_ano: string | null
  renda_familiar: number | null
  pessoas_residencia: number | null
  necessidades_especiais: string | null
  alergias: string | null
  medicamentos: string | null
  observacoes_gerais: string | null
  data_consentimento: string | null
  documento_consentimento_url: string | null
  responsaveis: Responsavel[]
  vinculos_projetos: VinculoProjeto[]
  documents: { id: string; name: string; mime_type: string | null; created_at: string }[]
}

export interface Responsavel {
  id: string
  beneficiary_id: string
  nome_completo: string
  parentesco: ParentescoType
  cpf: string | null
  telefone: string | null
  email: string | null
}

export interface VinculoProjeto {
  id: string
  beneficiary_id: string
  project_id: string
  data_ingresso: string
  data_desligamento: string | null
  status: VinculoStatus
  turma: string | null
  turno: string | null
  project: { id: string; name: string; status: string }
}

export interface BeneficiariosPage {
  data: Beneficiario[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export const beneficiariosService = {
  downloadDocument: (id: string, documentId: string) =>
    api.get(`/beneficiarios/${id}/documents/${documentId}/download`, { responseType: 'blob' }).then((r) => r.data as Blob),
  list: (params?: Record<string, string | number>): Promise<BeneficiariosPage> =>
    api.get('/beneficiarios', { params }).then((r) => r.data),

  get: (id: string): Promise<BeneficiarioDetail> =>
    api.get(`/beneficiarios/${id}`).then((r) => r.data),

  create: (dto: Record<string, unknown>): Promise<Beneficiario> =>
    api.post('/beneficiarios', dto).then((r) => r.data),

  update: (id: string, dto: Record<string, unknown>): Promise<Beneficiario> =>
    api.patch(`/beneficiarios/${id}`, dto).then((r) => r.data),

  remove: (id: string): Promise<void> =>
    api.delete(`/beneficiarios/${id}`),

  // Responsáveis
  listResponsaveis: (id: string): Promise<Responsavel[]> =>
    api.get(`/beneficiarios/${id}/responsaveis`).then((r) => r.data),

  addResponsavel: (id: string, dto: Record<string, unknown>): Promise<Responsavel> =>
    api.post(`/beneficiarios/${id}/responsaveis`, dto).then((r) => r.data),

  removeResponsavel: (id: string, rId: string): Promise<void> =>
    api.delete(`/beneficiarios/${id}/responsaveis/${rId}`),

  // Vínculos
  listVinculos: (id: string): Promise<VinculoProjeto[]> =>
    api.get(`/beneficiarios/${id}/vinculos`).then((r) => r.data),

  addVinculo: (id: string, dto: Record<string, unknown>): Promise<VinculoProjeto> =>
    api.post(`/beneficiarios/${id}/vinculos`, dto).then((r) => r.data),

  removeVinculo: (id: string, vId: string): Promise<void> =>
    api.delete(`/beneficiarios/${id}/vinculos/${vId}`),
}
