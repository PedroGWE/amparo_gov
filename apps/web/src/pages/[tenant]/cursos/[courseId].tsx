import type { GetServerSideProps } from 'next'
import DashboardLayout from '@/components/layout/DashboardLayout'
import CoursesManager from '@/components/courses/CoursesManager'

export default function CoursePage({ courseId }: { courseId: string }) {
  return <DashboardLayout><CoursesManager key={courseId} courseId={courseId} /></DashboardLayout>
}

export const getServerSideProps: GetServerSideProps = async ctx => {
  if (!ctx.req.cookies.refresh_token) return { redirect: { destination: '/login', permanent: false } }
  const { tenant, courseId } = ctx.params ?? {}
  if (typeof tenant !== 'string' || typeof courseId !== 'string') return { notFound: true }
  return { props: { courseId } }
}
