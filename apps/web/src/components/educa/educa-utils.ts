export const dateTime = (value: string) =>
  new Date(value).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  })
export const shortDate = (value: string) =>
  new Date(value).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: 'short',
  })
export const time = (value: string) =>
  new Date(value).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  })
export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
export function errorText(error: unknown) {
  const message = (error as { response?: { data?: { message?: string | string[] } } })?.response
    ?.data?.message
  return Array.isArray(message)
    ? message.join('. ')
    : message || 'Não foi possível concluir. Tente novamente.'
}
export function safeMeetUrl(value: string) {
  return /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(value) ? value : undefined
}
export function studentActivityStatus(deliveries: { status: string }[], deadline: string | null) {
  if (deliveries[0]?.status === 'AVALIADA') return { label: 'Avaliada', tone: 'green' }
  if (deliveries.length) return { label: 'Entregue', tone: 'blue' }
  if (deadline && new Date(deadline) < new Date()) return { label: 'Prazo encerrado', tone: 'red' }
  return { label: 'Para fazer', tone: 'yellow' }
}
