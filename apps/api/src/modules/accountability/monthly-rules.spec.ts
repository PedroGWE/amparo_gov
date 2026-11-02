import { attendanceStatus, csvCell, inspectIntervals, monthBounds } from './monthly-rules'

describe('calendário mensal', () => {
  it('não inventa 31 de setembro e considera fevereiro bissexto', () => {
    expect(monthBounds('2026-09').days).toBe(30)
    expect(monthBounds('2026-09').start.getUTCDay()).toBe(2)
    expect(new Date(Date.UTC(2026, 8, 30)).getUTCDay()).toBe(3)
    expect(monthBounds('2024-02').days).toBe(29)
    expect(monthBounds('2025-02').days).toBe(28)
  })
  it('soma apenas intervalos realizados e sinaliza sobreposição e incompletude', () => {
    const at = (hour: number) => new Date(Date.UTC(2026, 8, 10, hour))
    expect(inspectIntervals([{ start_at: at(9), end_at: at(12) }, { start_at: at(19), end_at: at(22) }])).toEqual({ minutes: 360, issues: [] })
    expect(inspectIntervals([{ start_at: at(9), end_at: at(12) }, { start_at: at(11), end_at: at(13) }, { start_at: at(19), end_at: null }]).issues).toEqual(expect.arrayContaining(['Intervalos sobrepostos', 'Registro incompleto']))
  })
  it('preserva chamada ausente como pendência e prioriza a fonte por aula', () => {
    expect(attendanceStatus()).toBe('PENDENTE')
    expect(attendanceStatus('PRESENTE', false)).toBe('PRESENTE')
  })
  it('neutraliza fórmulas em campos textuais do CSV', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"')
  })
})
