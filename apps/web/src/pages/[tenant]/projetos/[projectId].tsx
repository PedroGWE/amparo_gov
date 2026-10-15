import type { GetServerSideProps } from 'next'
import DashboardLayout from '@/components/layout/DashboardLayout'
import ProjectWorkspace from '@/components/projects/ProjectWorkspace'

export default function ProjectPage({ tenant, projectId }: { tenant: string; projectId: string }) {
  return (
    <DashboardLayout>
      <ProjectWorkspace key={`${tenant}:${projectId}`} tenant={tenant} projectId={projectId} />
    </DashboardLayout>
  )
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  if (!ctx.req.cookies.refresh_token) {
    return { redirect: { destination: '/login', permanent: false } }
  }
  const { tenant, projectId } = ctx.params ?? {}
  if (typeof tenant !== 'string' || typeof projectId !== 'string') return { notFound: true }
  return { props: { tenant, projectId } }
}
