import type { GetServerSideProps } from 'next'
import type { EducaSection } from './EducaLayout'

export function educationRedirect(
  profile: 'aluno' | 'professor',
  section: EducaSection,
): GetServerSideProps {
  return async (ctx) => {
    if (!ctx.req.cookies.refresh_token)
      return { redirect: { destination: '/educa', permanent: false } }
    const tenant = ctx.params?.tenant
    if (typeof tenant !== 'string') return { notFound: true }
    const classQuery =
      typeof ctx.query.turma === 'string' ? `&turma=${encodeURIComponent(ctx.query.turma)}` : ''
    return {
      redirect: {
        destination: `/${encodeURIComponent(tenant)}/${profile}?aba=${section}${classQuery}`,
        permanent: false,
      },
    }
  }
}
