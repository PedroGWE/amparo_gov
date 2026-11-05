import type { GetServerSideProps } from 'next'
export default function Page() { return null }
export const getServerSideProps: GetServerSideProps = async () => ({ redirect: { destination: '/educa', permanent: false } })
