export type Interval = { start_at: Date; end_at: Date | null; kind?: string }

export function monthBounds(value: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new Error('Competência inválida; use AAAA-MM')
  const [year, month] = value.split('-').map(Number)
  return { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)), days: new Date(Date.UTC(year, month, 0)).getUTCDate() }
}

export function inspectIntervals(entries: Interval[]) {
  const issues: string[] = []
  let minutes = 0
  const ordered = [...entries].sort((a, b) => a.start_at.getTime() - b.start_at.getTime())
  for (let i = 0; i < ordered.length; i++) {
    const current = ordered[i]
    if (!current.end_at) { issues.push('Registro incompleto'); continue }
    if (current.end_at <= current.start_at) { issues.push('Saída anterior ou igual à entrada'); continue }
    if (i > 0 && ordered[i - 1].end_at && ordered[i - 1].end_at! > current.start_at) issues.push('Intervalos sobrepostos')
    if (current.kind === 'REALIZADO' || !current.kind) minutes += Math.round((current.end_at.getTime() - current.start_at.getTime()) / 60000)
  }
  return { minutes, issues: [...new Set(issues)] }
}

export function attendanceStatus(educa?: string | null, legacy?: boolean | null) {
  if (educa) return educa
  if (legacy === true) return 'PRESENTE'
  if (legacy === false) return 'AUSENTE'
  return 'PENDENTE'
}

export function csvCell(value: unknown) {
  const raw = String(value ?? '')
  const safe = /^[\s]*[=+\-@\t\r]/.test(raw) && !/^-?\d+(\.\d+)?$/.test(raw) ? `'${raw}` : raw
  return `"${safe.replace(/"/g, '""')}"`
}
