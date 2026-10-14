import { mutate } from 'swr'
import { useRouter } from 'next/router'
import Cookies from 'js-cookie'
import api, { setAccessToken } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'

export function useAuth() {
  const router = useRouter()
  const { user, tenantSlug, setAuth, clear } = useAuthStore()

  async function login(
    email: string,
    password: string,
    slug: string,
    portal?: 'aluno' | 'professor',
  ) {
    const { data } = await api.post('/auth/login', {
      ...(portal === 'aluno'
        ? { matricula: email.trim().toUpperCase() }
        : { email: email.trim().toLowerCase() }),
      ...(portal ? { portal } : {}),
      password,
      tenantSlug: slug.trim().toLowerCase(),
    })

    await mutate(() => true, undefined, { revalidate: false })
    setAccessToken(data.accessToken)
    Cookies.set('refresh_token', data.refreshToken, { expires: 7, sameSite: 'strict' })
    Cookies.set('tenant_slug', slug, { expires: 7, sameSite: 'strict' })
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_user', JSON.stringify(data.user))
    }
    setAuth(data.user, slug)
    const perms: string[] = data.user.permissions ?? []
    const destination =
      portal ??
      (perms.includes('*') || perms.includes('educa:manage')
        ? null
        : perms.includes('conecta:teacher')
          ? 'professor'
          : perms.includes('conecta:student')
            ? 'aluno'
            : null)
    await router.push(`/${slug}/${destination ? destination : 'dashboard'}`)
  }

  async function logout() {
    const refreshToken = Cookies.get('refresh_token')
    if (refreshToken) {
      await api.post('/auth/logout', { refreshToken }).catch(() => null)
    }
    setAccessToken(null)
    Cookies.remove('refresh_token')
    Cookies.remove('tenant_slug')
    if (typeof window !== 'undefined') localStorage.removeItem('auth_user')
    clear()
    await mutate(() => true, undefined, { revalidate: false })
    const educationRoute = /\/(educa|professor|aluno)(\/|$)/.test(router.asPath)
    await router.push(educationRoute ? '/educa' : '/login')
  }

  return { user, tenantSlug, login, logout, isAuthenticated: !!user }
}
