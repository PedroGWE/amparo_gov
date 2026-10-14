import type { GetServerSideProps } from 'next'
export default function Page() { return null }
export const getServerSideProps: GetServerSideProps = async ctx => ({ redirect: { destination: `/${encodeURIComponent(String(ctx.params?.tenant))}/professor`, permanent: false } })
