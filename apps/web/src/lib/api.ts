import axios from 'axios'
import Cookies from 'js-cookie'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1'

const api = axios.create({ baseURL: BASE_URL })
// Public forms must work even when this browser has an expired staff session.
export const publicApi = axios.create({ baseURL: BASE_URL })

let _accessToken: string | null = null

export const setAccessToken = (token: string | null) => {
  _accessToken = token
}

let refreshPending: Promise<{ accessToken: string; refreshToken: string }> | null = null
export function refreshSession() {
  if (!refreshPending) {
    const token = Cookies.get('refresh_token')
    refreshPending = axios
      .post(`${BASE_URL}/auth/refresh`, { refreshToken: token })
      .then(({ data }) => {
        _accessToken = data.accessToken
        Cookies.set('refresh_token', data.refreshToken, { expires: 7, sameSite: 'strict' })
        return data
      })
      .finally(() => {
        refreshPending = null
      })
  }
  return refreshPending
}

api.interceptors.request.use(async (config) => {
  if (!_accessToken && Cookies.get('refresh_token') && !config.url?.startsWith('/auth/'))
    await refreshSession()
  if (_accessToken) config.headers.Authorization = `Bearer ${_accessToken}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !original.url?.startsWith('/auth/')
    ) {
      original._retry = true
      const refreshToken = Cookies.get('refresh_token')
      if (!refreshToken) {
        clearAuthCookies()
        redirectToLogin()
        return Promise.reject(error)
      }
      try {
        const data = await refreshSession()
        _accessToken = data.accessToken
        Cookies.set('refresh_token', data.refreshToken, { expires: 7, sameSite: 'strict' })
        original.headers.Authorization = `Bearer ${_accessToken}`
        return api(original)
      } catch {
        clearAuthCookies()
        redirectToLogin()
      }
    }
    return Promise.reject(error)
  },
)

function clearAuthCookies() {
  _accessToken = null
  Cookies.remove('refresh_token')
  Cookies.remove('tenant_slug')
}

function redirectToLogin() {
  if (typeof window !== 'undefined') window.location.href = '/login'
}

export default api
