/** Calendar dates are interpreted in the congregation's timezone, never UTC today. */
export function fortalezaToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'America/Fortaleza', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(now)
  const part = (type: string) => parts.find(item => item.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
export const fortalezaCurrentMonth = (now: Date = new Date()): string => fortalezaToday(now).slice(0, 7)
export function isValidCivilDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
export function addCivilDays(value: string, days: number): string {
  if (!isValidCivilDate(value) || !Number.isInteger(days)) throw new Error('Data inválida.')
  const date = new Date(`${value}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
