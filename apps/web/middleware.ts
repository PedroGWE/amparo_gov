import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/register', '/educa', '/_next', '/favicon', '/api']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isEducaHost = request.headers.get('host')?.split(':')[0] === 'educa.amparogov.org'
  const educaAssets: Record<string, string> = {
    '/favicon.ico': '/brand/educa/favicon.ico',
    '/apple-touch-icon.png': '/brand/educa/apple-touch-icon.png',
    '/site.webmanifest': '/brand/educa/site.webmanifest',
  }
  if (isEducaHost && educaAssets[pathname]) {
    const assetUrl = request.nextUrl.clone()
    assetUrl.pathname = educaAssets[pathname]
    return NextResponse.rewrite(assetUrl)
  }
  if (isEducaHost && pathname === '/') {
    const educaUrl = request.nextUrl.clone()
    educaUrl.pathname = '/educa'
    return NextResponse.redirect(educaUrl)
  }
  const isPublic =
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname === '/' ||
    pathname.startsWith('/brand/') ||
    pathname.startsWith('/fonts/') ||
    pathname.startsWith('/amparo/') ||
    pathname === '/site.webmanifest' ||
    pathname === '/apple-touch-icon.png' ||
    /^\/[^/]+\/inscricao\/?$/.test(pathname)

  if (!isPublic && !request.cookies.get('refresh_token')) {
    // Usa nextUrl para construir o redirect respeitando o protocolo real (HTTPS atrás de proxy)
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = isEducaHost ? '/educa' : '/login'
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
