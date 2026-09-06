import {
  activeDates, availabilityKey, localSlots, participantName,
  type EscalaAvailability, type EscalaLocal, type EscalaParticipant, type EscalaTables,
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

export function assignmentsForDay(date: string, month: string, tables: EscalaTables, locals: Record<string, EscalaLocal>, participants: Record<string, EscalaParticipant>) {
  const result: { local: string; time: string; pair: string; order: number }[] = []
  for (const [localId, byMonth] of Object.entries(tables)) {
    for (const [time, cell] of Object.entries(byMonth[month]?.rows?.[date]?.slots ?? {})) {
      if (!cell.p1 && !cell.p2) continue
      result.push({ local: String(locals[localId]?.name ?? localId), time, pair: [cell.p1, cell.p2].filter(Boolean).map(id => participantName(participants[id], id)).join(' e '), order: Number(locals[localId]?.sortOrder ?? 0) })
    }
  }
  return result.sort((a, b) => a.time.localeCompare(b.time) || a.order - b.order)
}

export function personMessage(prefix: string, person: EscalaParticipant, month: string, assignments: ReturnType<typeof assignmentsForPerson>): string {
  const lines = [`${prefix.trim() || `Olá, ${participantName(person)}! Tudo bem? Aqui estão seus dias no carrinho`} em ${monthLabel(month)}:`, '']
  if (!assignments.length) return [...lines, 'Neste mês você não ficou com nenhum horário.'].join('\n')
  return [...lines, ...assignments.map(item => `${dayLabel(item.date)} · ${item.time} · ${item.local}${item.partner ? ` com ${item.partner}` : ''}`)].join('\n')
}

export function dayMessage(prefix: string, date: string, assignments: ReturnType<typeof assignmentsForDay>): string {
  const lines = [`${prefix.trim() || 'Olá, tudo bem? Segue a designação no carrinho'} — ${dayLabel(date)}:`, '']
  if (!assignments.length) return [...lines, 'Nenhuma dupla marcada para este dia.'].join('\n')
  let local = ''
  for (const item of assignments) {
    if (item.local !== local) { if (local) lines.push(''); lines.push(item.local); local = item.local }
    lines.push(`${item.time} — ${item.pair}`)
  }
  return lines.join('\n')
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
  return activeDates(month, local.daysActive ?? [], exclusions).map(date => ({
    date,
    cells: localSlots(local).map(time => {
      const cell = tables[localId]?.[month]?.rows?.[date]?.slots?.[time]
      return [cell?.p1, cell?.p2].filter(Boolean).map(id => participantName(participants[id], id))
    }),
  }))
}
