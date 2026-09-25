import {
  activeDates, availabilityKey, localSlots, participantName,
  type EscalaAvailability, type EscalaLocal, type EscalaParticipant, type EscalaTable, type EscalaTables,
} from './escala-domain.ts'

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const DAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const SHORT_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export function monthLabel(month: string): string {
  const [year, value] = month.split('-').map(Number)
  return `${MONTHS[value - 1] ?? month} de ${year}`
}

export function dayLabel(date: string): string {
  const parsed = new Date(`${date}T12:00:00`)
  return `${SHORT_DAYS[parsed.getDay()]} ${date.slice(8, 10)}/${date.slice(5, 7)}`
}

export function hasScaleAssignments(table?: EscalaTable): boolean {
  return Object.values(table?.rows ?? {}).some(row =>
    Object.values(row.slots ?? {}).some(cell => Boolean(cell.p1 || cell.p2)))
}

export function assignmentsForPerson(personId: string, month: string, tables: EscalaTables, locals: Record<string, EscalaLocal>, participants: Record<string, EscalaParticipant>) {
  const result: { date: string; time: string; local: string; partner: string }[] = []
  for (const [localId, byMonth] of Object.entries(tables)) for (const [date, row] of Object.entries(byMonth[month]?.rows ?? {})) {
    for (const [time, cell] of Object.entries(row.slots ?? {})) {
      if (cell.p1 !== personId && cell.p2 !== personId) continue
      const partnerId = cell.p1 === personId ? cell.p2 : cell.p1
      result.push({ date, time, local: String(locals[localId]?.name ?? localId), partner: partnerId ? participantName(participants[partnerId], partnerId) : '' })
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
}

export function personMessage(prefix: string, person: EscalaParticipant, month: string, assignments: ReturnType<typeof assignmentsForPerson>): string {
  const lines = [`${prefix.trim() || `Olá, ${participantName(person)}! Tudo bem? Aqui estão seus dias no carrinho`} em ${monthLabel(month)}:`, '']
  if (!assignments.length) return [...lines, 'Neste mês você não ficou com nenhum horário.'].join('\n')
  return [...lines, ...assignments.map(item => `${dayLabel(item.date)} · ${item.time} · ${item.local}${item.partner ? ` com ${item.partner}` : ''}`)].join('\n')
}

export function confirmationMessage(prefix: string, personId: string, person: EscalaParticipant, locals: Record<string, EscalaLocal>, availability: EscalaAvailability): string {
  const lines = [prefix.trim() || `Olá, ${participantName(person)}! Tudo bem?`, '', 'Pode confirmar se sua disponibilidade para o carrinho continua assim?']
  for (const [localId, local] of Object.entries(locals).sort((a, b) => Number(a[1].sortOrder ?? 0) - Number(b[1].sortOrder ?? 0))) {
    const marked = availability[localId]?.[personId] ?? {}
    const dayLines = (local.daysActive ?? []).map(dow => {
      const times = localSlots(local).filter(time => marked[availabilityKey(dow, time)])
      return times.length ? `  ${DAYS[dow]}: ${times.join(', ')}` : ''
    }).filter(Boolean)
    if (dayLines.length) lines.push('', String(local.name ?? localId), ...dayLines)
  }
  return lines.join('\n')
}

export function printRowsForLocal(localId: string, month: string, local: EscalaLocal, tables: EscalaTables, participants: Record<string, EscalaParticipant>, exclusions: string[]) {
  const table = tables[localId]?.[month]
  const dates = table ? Object.keys(table.rows ?? {}).sort() : activeDates(month, local.daysActive ?? [], exclusions)
  return dates.map(date => ({
    date,
    cells: (table?.slots ?? localSlots(local)).map(time => {
      const cell = tables[localId]?.[month]?.rows?.[date]?.slots?.[time]
      return [cell?.p1, cell?.p2].filter(Boolean).map(id => participantName(participants[id], id))
    }),
  }))
}
