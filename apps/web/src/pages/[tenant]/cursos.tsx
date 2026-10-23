import type { GetServerSideProps } from 'next'
import DashboardLayout from '@/components/layout/DashboardLayout'
import CoursesManager from '@/components/courses/CoursesManager'

export default function CursosPage() {
  return <DashboardLayout><CoursesManager /></DashboardLayout>
}

export const getServerSideProps: GetServerSideProps = async ctx => {
  if (!ctx.req.cookies.refresh_token) return { redirect: { destination: '/login', permanent: false } }
  const { tenant } = ctx.params ?? {}
  if (typeof tenant !== 'string') return { notFound: true }
  if (typeof ctx.query.curso === 'string' && ctx.query.curso) {
    const section = typeof ctx.query.aba === 'string' ? `?aba=${encodeURIComponent(ctx.query.aba)}` : ''
    return { redirect: { destination: `/${encodeURIComponent(tenant)}/cursos/${encodeURIComponent(ctx.query.curso)}${section}`, permanent: false } }
  }
  return { props: {} }
}
