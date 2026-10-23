import '@/styles/globals.css'
import '@/styles/educa.css'
import type { AppProps } from 'next/app'
import Head from 'next/head'
import { useEffect } from 'react'
import { useRouter } from 'next/router'
import Cookies from 'js-cookie'
import { refreshSession } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter()
  const isEduca =
    router.pathname === '/educa' ||
    ['educa', 'professor', 'aluno'].includes(router.pathname.split('/')[2] ?? '')
  const { user, setAuth } = useAuthStore()

  useEffect(() => {
    const refreshToken = Cookies.get('refresh_token')
    const tenantSlug = Cookies.get('tenant_slug')
    const storedUser = typeof window !== 'undefined' ? localStorage.getItem('auth_user') : null

    if (refreshToken && storedUser && !user) {
      refreshSession()
        .then(() => {
          setAuth(JSON.parse(storedUser), tenantSlug || '')
        })
        .catch(() => {
          Cookies.remove('refresh_token')
          Cookies.remove('tenant_slug')
          localStorage.removeItem('auth_user')
        })
    }
  }, [setAuth, user])

  return (
    <>
      <Head>
        <title>
          {isEduca
            ? 'Educa Amparo GOV | Ensinar e aprender, juntos'
            : 'Amparo GOV | Gestão para organizações sociais'}
        </title>
        <meta
          name="description"
          content={
            isEduca
              ? 'Seu espaço para ensinar e aprender. Aulas, atividades, materiais e acompanhamento em um só lugar.'
              : 'Gestão clara e segura para organizações sociais.'
          }
        />
        <link
          key="app-icon"
          rel="icon"
          type={isEduca ? 'image/svg+xml' : 'image/png'}
          href={isEduca ? '/brand/educa/favicon.svg?v=2' : '/amparo/icone-app.png'}
        />
        {isEduca && (
          <link
            key="app-icon-png"
            rel="icon"
            type="image/png"
            sizes="32x32"
            href="/brand/educa/icon-32.png?v=2"
          />
        )}
        <link
          key="app-apple-icon"
          rel="apple-touch-icon"
          href={isEduca ? '/brand/educa/apple-touch-icon.png?v=2' : '/amparo/icone-app.png'}
        />
        <link
          key="app-manifest"
          rel="manifest"
          href={isEduca ? '/brand/educa/site.webmanifest?v=2' : '/site.webmanifest'}
        />
        <meta key="app-theme" name="theme-color" content={isEduca ? '#0C65ED' : '#2364B0'} />
      </Head>
      <Component {...pageProps} />
    </>
  )
}
