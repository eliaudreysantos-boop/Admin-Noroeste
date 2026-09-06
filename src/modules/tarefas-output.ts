type TaskRole = 'presidente' | 'operador1' | 'operador2' | 'leitor' | 'entrada' | 'auditorio' | 'mic1' | 'mic2'
type TaskMeetingType = 'midweek' | 'weekend'

const TASK_ROLE_LABELS: Record<TaskRole, string> = {
  presidente: 'Presidente', operador1: 'Operador 1', operador2: 'Operador 2',
  leitor: 'Leitor', entrada: 'Entrada', auditorio: 'Auditório',
  mic1: 'Microfone 1', mic2: 'Microfone 2',
}

export interface PersonMessageEntry {
  date: string
  type: TaskMeetingType
  roles: TaskRole[]
}

export interface DayMessageMeeting {
  type: TaskMeetingType
  assignments: Partial<Record<TaskRole, string>>
}

export function formatTaskDate(value: string | undefined): string {
  if (!value) return 'Sem data'
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

function meetingLabel(type: TaskMeetingType): string {
  return type === 'midweek' ? 'Meio de semana' : 'Fim de semana'
}

function withoutGreeting(prefix: string): string {
  const cleaned = prefix.trim().replace(/^ol[áa][,!\.\s]*/i, '')
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : ''
}

export function buildTaskPersonMessage(name: string, prefix: string, entries: PersonMessageEntry[]): string {
  if (!name.trim() || entries.length === 0) return ''
  const blocks = [...entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(entry => `${formatTaskDate(entry.date)} · ${meetingLabel(entry.type)}\n${entry.roles.map(role => TASK_ROLE_LABELS[role]).join(', ')}`)
  return `Olá, ${name.trim()}! ${withoutGreeting(prefix)}\n\n${blocks.join('\n\n')}`.trim()
}

export function buildTaskDayMessage(prefix: string, date: string, meetings: DayMessageMeeting[]): string {
  if (!date || meetings.length === 0) return ''
  const blocks = meetings.map(meeting => {
    const rows = Object.entries(meeting.assignments)
      .filter((entry): entry is [TaskRole, string] => Boolean(entry[1]))
      .map(([role, name]) => `${TASK_ROLE_LABELS[role]}: ${name}`)
    return `${meetingLabel(meeting.type)}\n${rows.join('\n')}`.trim()
  })
  return `Olá! ${withoutGreeting(prefix)}\n\n${formatTaskDate(date)}\n${blocks.join('\n\n')}\n\nConfira sua designação e avise se precisar de ajuste.`.trim()
}

export function buildTaskConfirmationMessage(name: string, date: string, roles: TaskRole[], request: string): string {
  if (!name.trim() || !date || roles.length === 0) return ''
  return [
    `Olá, ${name.trim()}! Tudo bem?`, '',
    `Você está designado(a) para ${roles.map(role => TASK_ROLE_LABELS[role]).join(' e ')} na reunião de ${formatTaskDate(date)}.`,
    request.trim(), '',
    'Se precisar de substituição ou tiver alguma dúvida, avise por favor.',
  ].join('\n').trim()
}

export function rowsPerPrintPage(pageHeight: number, headerHeight: number, tableHeaderHeight: number, rowHeight: number): number {
  if (![pageHeight, headerHeight, tableHeaderHeight, rowHeight].every(Number.isFinite) || rowHeight <= 0) return 1
  return Math.max(1, Math.floor((pageHeight - headerHeight - tableHeaderHeight - 12) / rowHeight))
}

export function paginateItems<T>(items: T[], pageSize: number): T[][] {
  const size = Math.max(1, Math.floor(pageSize))
  const pages: T[][] = []
  for (let index = 0; index < items.length; index += size) pages.push(items.slice(index, index + size))
  return pages
}
