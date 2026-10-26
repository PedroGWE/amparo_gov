export const courseVisuals = {
  JIU_JITSU: {
    label: 'Jiu-jítsu',
    image: 'jiu-jitsu.png',
    alt: 'Prática de jiu-jítsu no tatame',
    color: '#087f8c',
    deep: '#102d46',
    pale: '#eaf7f8',
    headline: 'Uma nova jornada começa no tatame.',
    detail: 'Movimento, disciplina e parceria a cada treino.',
  },
  KARATE: {
    label: 'Karatê',
    image: 'karate.png',
    alt: 'Prática de karatê no dojo',
    color: '#b74229',
    deep: '#54271e',
    pale: '#fff1e9',
    headline: 'Foco para aprender. Energia para crescer.',
    detail: 'Um espaço para desenvolver técnica, disciplina e confiança.',
  },
  JUDO: {
    label: 'Judô',
    image: 'judo.png',
    alt: 'Prática de judô com kimonos no tatame',
    color: '#424cad',
    deep: '#22294d',
    pale: '#eef0ff',
    headline: 'Aprender juntos. Evoluir com respeito.',
    detail: 'Uma jornada de movimento, cooperação e novas descobertas.',
  },
  DANCA: {
    label: 'Dança',
    image: 'danca.png',
    alt: 'Grupo participando de uma aula de dança',
    color: '#a12f72',
    deep: '#49263f',
    pale: '#fff0f7',
    headline: 'Encontre seu ritmo. Faça parte.',
    detail: 'Expressão, movimento e novas conexões em cada encontro.',
  },
  PILATES: {
    label: 'Pilates',
    image: 'pilates.png',
    alt: 'Aula de pilates em grupo com instrutora',
    color: '#347453',
    deep: '#24443b',
    pale: '#eef7ef',
    headline: 'Um novo espaço para se movimentar.',
    detail: 'Conheça a atividade e encontre a turma para o seu próximo passo.',
  },
  INGLES: {
    label: 'Inglês',
    image: 'ingles.png',
    alt: 'Professora e alunos participando de uma aula de inglês',
    color: '#2465af',
    deep: '#203e61',
    pale: '#ecf5ff',
    headline: 'Abra espaço para novas conversas.',
    detail: 'Aprendizado, troca e novas possibilidades para a sua jornada.',
  },
  INFORMATICA: {
    label: 'Informática',
    image: 'informatica.png',
    alt: 'Alunos aprendendo a utilizar computadores com um professor',
    color: '#6943b3',
    deep: '#30264d',
    pale: '#f3efff',
    headline: 'Conecte-se a novas possibilidades.',
    detail: 'Dê o próximo passo no aprendizado da tecnologia.',
  },
  GERAL: {
    label: 'Educação e outras atividades',
    image: 'geral.png',
    alt: 'Alunos e professor aprendendo juntos',
    color: '#2364b0',
    deep: '#193b5c',
    pale: '#edf4fc',
    headline: 'Seu próximo passo começa aqui.',
    detail: 'Aprenda, participe e construa novas conexões.',
  },
} as const

export type CourseVisualKey = keyof typeof courseVisuals
export type CourseVisual = (typeof courseVisuals)[CourseVisualKey]
export type InvitationRole = 'ALUNO' | 'RESPONSAVEL'

export function courseVisualKey(name: string, selected?: string | null): CourseVisualKey {
  if (selected && Object.hasOwn(courseVisuals, selected)) return selected as CourseVisualKey
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
  if (/jiuj|bjj|jujitsu/.test(normalized)) return 'JIU_JITSU'
  if (normalized.includes('karat')) return 'KARATE'
  if (normalized.includes('judo')) return 'JUDO'
  if (/danca|ballet|bale|ritmos/.test(normalized)) return 'DANCA'
  if (normalized.includes('pilates')) return 'PILATES'
  if (/ingles|english/.test(normalized)) return 'INGLES'
  if (/informatica|computacao|computador|programacao|tecnologia/.test(normalized))
    return 'INFORMATICA'
  return 'GERAL'
}

export function getCourseVisual(name = '', selected?: string | null) {
  const key = courseVisualKey(name, selected)
  return { key, ...courseVisuals[key], src: `/courses/${courseVisuals[key].image}` }
}

export function invitationPath(
  tenant: string,
  courseId: string,
  options: { classId?: string; role?: InvitationRole } = {},
) {
  return `/${encodeURIComponent(tenant)}/inscricao?curso=${encodeURIComponent(courseId)}${options.classId ? `&turma=${encodeURIComponent(options.classId)}` : ''}${options.role ? `&perfil=${options.role.toLowerCase()}` : ''}#invite-form`
}

export function invitationRole(value: unknown): InvitationRole | '' {
  return value === 'aluno'
    ? 'ALUNO'
    : value === 'responsavel'
      ? 'RESPONSAVEL'
      : ''
}
