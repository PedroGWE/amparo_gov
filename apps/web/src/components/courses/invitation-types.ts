export type ClassOption = {
  id: string
  nome: string
  capacidade: number
  vagas: number
  curso?: { id: string; nome: string } | null
  project: { name: string } | null
}
export type PublicInvitation = {
  organization: string
  course: {
    id: string
    nome: string
    tipo?: string
    descricao?: string | null
    tema_visual?: string | null
  } | null
  classes: ClassOption[]
}
export type InvitationProps = {
  initialData?: PublicInvitation | null
  initialCourseId?: string
  initialTenant?: string
  shareOrigin?: string
}
