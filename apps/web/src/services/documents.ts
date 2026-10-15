import api from '@/lib/api'
import type { CreateInstitutionalDocTypeInput } from '@cidadao/shared'

export type DocStatus = 'PENDENTE' | 'VALIDO' | 'VENCIDO'

export interface DocumentSummary {
  validos: number
  vencidos: number
  pendentes: number
}

export interface InstitutionalDocument {
  id: string
  file_name: string
  mime_type: string
  size_bytes: number
  sent_at: string
  valid_until: string | null
  status: DocStatus
  doc_type_id: string
  uploader?: { id: string; name: string } | null
}

export interface DocumentTypeRow {
  id: string
  name: string
  required: boolean
  default_validity_days: number | null
  status: DocStatus
  document: InstitutionalDocument | null
}

export interface DocumentCategoryGroup {
  id: string
  name: string
  order: number
  types: DocumentTypeRow[]
}

export const documentsService = {
  summary: (): Promise<DocumentSummary> => api.get('/documents/summary').then((r) => r.data),

  createType: (
    input: CreateInstitutionalDocTypeInput,
  ): Promise<DocumentTypeRow & { category: Omit<DocumentCategoryGroup, 'types'> }> =>
    api.post('/documents/types', input).then((r) => r.data),

  list: (params?: { status?: DocStatus; category_id?: string }): Promise<DocumentCategoryGroup[]> =>
    api.get('/documents', { params }).then((r) => r.data),

  upload: (
    documentTypeId: string,
    file: File,
    validUntil?: string,
  ): Promise<InstitutionalDocument> => {
    const form = new FormData()
    if (validUntil) form.append('valid_until', validUntil)
    form.append('file', file)
    return api
      .post(`/documents/${documentTypeId}/upload`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data)
  },

  remove: (id: string) => api.delete(`/documents/${id}`),

  download: async (doc: InstitutionalDocument) => {
    const res = await api.get(`/documents/${doc.id}/download`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = doc.file_name
    a.click()
    URL.revokeObjectURL(url)
  },
}
