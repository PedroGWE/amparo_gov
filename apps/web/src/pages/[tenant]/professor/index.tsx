import type { GetServerSideProps } from 'next'
import EducaPortal from '@/components/educa/EducaPortal'
export default function Page() { return <EducaPortal  /> }
export const getServerSideProps: GetServerSideProps = async ctx => ctx.req.cookies.refresh_token ? { props: {} } : { redirect: { destination: '/educa', permanent: false } }
