import { educationRedirect } from '@/components/educa/educa-route'
export default function Page() { return null }
export const getServerSideProps = educationRedirect('aluno', 'frequencia')
