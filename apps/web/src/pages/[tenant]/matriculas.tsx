import type { GetServerSideProps } from 'next'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { EnrollmentManagement } from '@/components/courses/EnrollmentManagement'

export default function MatriculasPage() {
  return <DashboardLayout><EnrollmentManagement /></DashboardLayout>
}

export const getServerSideProps: GetServerSideProps = async ctx => {
  if (!ctx.req.cookies.refresh_token) return { redirect: { destination: '/login', permanent: false } }
  return { props: {} }
}
