import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/register', '/educa', '/_next', '/favicon', '/api']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isEducaHost = request.headers.get('host')?.split(':')[0] === 'educa.amparogov.org'
  // Next runs behind the HTTPS proxy; redirects must use the public origin.
  const publicUrl = request.nextUrl.clone()
  const host = request.headers.get('host')?.split(':')[0]
  if (host === 'educa.amparogov.org' || host === 'app.amparogov.org') {
    publicUrl.hostname = host
    publicUrl.port = ''
    publicUrl.protocol = 'https:'
  }
  if (isEducaHost && pathname === '/') {
    const educaUrl = publicUrl
    educaUrl.pathname = '/educa'
    return NextResponse.redirect(educaUrl)
  }
  const isPublic =
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname === '/' ||
    pathname.startsWith('/brand/') ||
    pathname.startsWith('/courses/') ||
    pathname.startsWith('/fonts/') ||
    pathname.startsWith('/amparo/') ||
    pathname === '/logo.png' ||
    /^\/android-chrome-\d+x\d+\.png$/.test(pathname) ||
    pathname === '/site.webmanifest' ||
    pathname === '/apple-touch-icon.png' ||
    /^\/[^/]+\/inscricao\/?$/.test(pathname)

  if (!isPublic && !request.cookies.get('refresh_token')) {
    const loginUrl = publicUrl
    loginUrl.pathname = isEducaHost ? '/educa' : '/login'
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
