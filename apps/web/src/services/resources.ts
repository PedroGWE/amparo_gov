import api from '@/lib/api'
export type Resource = Record<string, any> & { id: string; kind: string; title: string | null }
const get = async (url: string, params?: Record<string, unknown>) =>
  (await api.get(url, { params })).data
export const resourcesService = {
  search: (params: Record<string, unknown>) => get('/resources/search', params),
  dashboard: () => get('/resources/dashboard'),
  detail: (id: string): Promise<Resource> => get(`/resources/${id}`),
  profile: () => get('/resources/organization'),
  saveProfile: async (data: unknown) => (await api.put('/resources/organization', data)).data,
  favorites: () => get('/resources/favorites'),
  favorite: async (id: string, stage: string, notes?: string | null) =>
    (
      await api.put(`/resources/favorites/${id}`, {
        stage,
        ...(notes !== undefined ? { notes } : {}),
      })
    ).data,
  unfavorite: (id: string) => api.delete(`/resources/favorites/${id}`),
  manual: async (data: unknown) => (await api.post('/resources/manual', data)).data,
  import: async (data: unknown) => (await api.post('/resources/manual/import', data)).data,
  remove: (id: string) => api.delete(`/resources/manual/${id}`),
  connectors: () => get('/resources/admin/connectors'),
  configure: (id: string, data: unknown) => api.patch(`/resources/admin/connectors/${id}`, data),
  sync: (id: string) => api.post(`/resources/admin/connectors/${id}/sync`),
}
