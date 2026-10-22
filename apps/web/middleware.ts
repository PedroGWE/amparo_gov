import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/register', '/educa', '/_next', '/favicon.ico', '/api']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (request.headers.get('host')?.split(':')[0] === 'educa.amparogov.org' && pathname === '/') {
    const educaUrl = request.nextUrl.clone()
    educaUrl.pathname = '/educa'
    return NextResponse.redirect(educaUrl)
  }
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || pathname === '/' || /^\/[^/]+\/inscricao\/?$/.test(pathname)

  if (!isPublic && !request.cookies.get('refresh_token')) {
    // Usa nextUrl para construir o redirect respeitando o protocolo real (HTTPS atrás de proxy)
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
