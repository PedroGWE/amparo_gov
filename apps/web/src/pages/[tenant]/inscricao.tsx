import type { GetServerSideProps } from 'next'
import type { InvitationProps, PublicInvitation } from '@/components/courses/invitation-types'
export { default } from '@/components/courses/CourseInvitation'

export const getServerSideProps: GetServerSideProps<InvitationProps> = async (ctx) => {
  const tenant = typeof ctx.params?.tenant === 'string' ? ctx.params.tenant : ''
  const courseId = typeof ctx.query.curso === 'string' ? ctx.query.curso : ''
  const host = ctx.req.headers.host ?? ''
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)
  const publicHost =
    ['app.amparogov.org', 'educa.amparogov.org'].includes(host) || local
      ? host
      : 'app.amparogov.org'
  const shareOrigin = `${local ? 'http' : 'https'}://${publicHost}`
  const configured = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || ''
  const apiUrl = configured.startsWith('http') ? configured : 'http://127.0.0.1:3001/api/v1'
  let initialData: PublicInvitation | null = null
  try {
    const response = await fetch(
      `${apiUrl.replace(/\/$/, '')}/enrollment/${encodeURIComponent(tenant)}/classes${courseId ? `?curso=${encodeURIComponent(courseId)}` : ''}`,
      { signal: AbortSignal.timeout(4000) },
    )
    if (response.ok) initialData = await response.json()
  } catch {
    /* The browser retries through the public API and shows a retry action. */
  }
  return { props: { initialData, initialCourseId: courseId, initialTenant: tenant, shareOrigin } }
}
