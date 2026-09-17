import type { MasterPessoa } from '../types'

export type AgendaSource = 'tarefas' | 'limpeza' | 'escala' | 'servicoCampo'
export type AgendaStatus = 'futuro' | 'confirmacao-pendente' | 'alterado' | 'realizado'

export interface AgendaEvent {
  id: string; source: AgendaSource; date: string; time?: string; title: string
  detail: string; location?: string; note?: string; status: AgendaStatus
}

export interface AnnouncementEvent extends AgendaEvent { people: string[] }

export type BoardMeetingKind = 'midweek' | 'weekend'
export interface BoardMeetingDate { date: string; kind: BoardMeetingKind }

export interface AgendaIcsOptions {
  reminders?: Partial<Record<AgendaSource, string[]>>
  namespace?: string
  calendarName?: string
}

export function normalizeAgendaPeople(source: unknown): Record<string, MasterPessoa> {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {}
  return Object.fromEntries(Object.entries(source).filter((entry): entry is [string, MasterPessoa] => {
    const [id, person] = entry
    return Boolean(id && person && typeof person === 'object' && typeof (person as MasterPessoa).name === 'string' && (person as MasterPessoa).name.trim())
  }))
}

export function sanitizeAgendaPeople(source: Record<string, MasterPessoa>): Record<string, MasterPessoa> {
  return Object.fromEntries(Object.entries(normalizeAgendaPeople(source)).map(([id, person]) => [id, {
    name:person.name,
    active:person.active,
    sex:person.sex,
    role:person.role,
    whatsapp:'',
    limpeza:{ grupo:null },
  } satisfies MasterPessoa]))
}

export function upcomingAgendaEvents(events: AgendaEvent[], today: string): AgendaEvent[] {
  return events.filter(event => event.date >= today && event.status !== 'realizado')
}

type Row = Record<string, unknown>
const rows = (value: unknown): Row => value && typeof value === 'object' ? value as Row : {}
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : ''
const values = (value: unknown): unknown[] => Array.isArray(value) ? value : Object.values(rows(value))
export function validAgendaDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function validAgendaTime(value: string | undefined): boolean {
  return value === undefined || /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}
const TASK_LABELS: Record<string, string> = { presidente:'Presidente', operador1:'Operador', operador2:'Operador 2', leitor:'Leitor', entrada:'Entrada', auditorio:'Auditório', mic1:'Microfone 1', mic2:'Microfone 2', microfone1:'Microfone 1', microfone2:'Microfone 2' }

export function collectAgendaEvents(rootValue: unknown, masterId: string, allowed: Partial<Record<AgendaSource, boolean>> = {}): AgendaEvent[] {
  if (!masterId) return []
  const root = rows(rootValue), tarefas = rows(root['tarefas']), taskPeople = rows(tarefas['people'])
  const taskIds = new Set(Object.entries(taskPeople).filter(([, person]) => text(rows(person)['masterId']) === masterId).map(([id]) => id))
  const result: AgendaEvent[] = []
  const add = (event: AgendaEvent): void => { if (validAgendaDate(event.date) && validAgendaTime(event.time)) result.push({ ...event, note: text(event.note).slice(0, 250) || undefined }) }

  if (allowed.tarefas !== false) Object.entries(rows(rows(rows(tarefas['scale'])['periods']))).forEach(([periodId, periodValue]) => {
    const period = rows(periodValue)
    if (period['locked'] !== true) return
    Object.entries(rows(period['meetings'])).forEach(([meetingId, meetingValue]) => {
    const meeting = rows(meetingValue), date = text(meeting['date']) || meetingId.split('__')[0]
    Object.entries(rows(meeting['assignments'])).forEach(([role, assignment]) => {
      const personId = text(rows(assignment)['id']) || text(rows(assignment)['personId']) || text(assignment)
      if (taskIds.has(personId)) add({ id:`tarefas:${periodId}:${meetingId}:${role}`, source:'tarefas', date, title:TASK_LABELS[role] || role, detail:text(meeting['type']) === 'midweek' ? 'Reunião do meio de semana' : 'Reunião do fim de semana', status:'futuro' })
    })
    })
  })

  if (allowed.limpeza !== false) Object.entries(rows(rows(root['limpeza'])['periodos'])).forEach(([periodId, periodValue]) => {
    if (rows(periodValue)['publicado'] !== true) return
    values(rows(periodValue)['semanas']).forEach((weekValue, index) => {
    const week = rows(weekValue), ids = [text(week['superintendenteMid']), ...values(week['ajudantesMid']).map(text), ...values(week['membrosMid']).map(text)]
    if (!ids.includes(masterId)) return
    const title = `Limpeza - ${text(week['grupoNome']) || `Grupo ${Number(week['grupo'])}`}`
    add({ id:`limpeza:${periodId}:${index}:midweek`, source:'limpeza', date:text(week['dataMeioSemana']) || text(week['referencia']), title, detail:'Limpeza após a reunião do meio de semana', status:'futuro' })
    if (text(week['dataFimSemana'])) add({ id:`limpeza:${periodId}:${index}:weekend`, source:'limpeza', date:text(week['dataFimSemana']), title, detail:'Limpeza semanal do Salão do Reino', status:'futuro' })
    })
  })

  if (allowed.escala !== false) {
    const escala = rows(root['escala']), participantIds = new Set(Object.entries(rows(escala['participants'])).filter(([, person]) => text(rows(person)['masterId']) === masterId).map(([id]) => id))
    const publishedMonths = rows(escala['publishedMonths']), snapshots = rows(escala['publishedSnapshots']), currentPublished = text(escala['publishedMonth'])
    const participantName = (id: string): string => {
      const participant = rows(rows(escala['participants'])[id]), participantMasterId = text(participant['masterId'])
      return text(rows(rows(rows(root['master'])['pessoas'])[participantMasterId])['name']) || text(participant['name'])
    }
    Object.entries(rows(escala['tables'])).forEach(([localId, monthsValue]) => {
      const local = rows(escala['scales'])[localId] ?? rows(rows(escala['settings'])['locals'])[localId], location = text(rows(local)['name']) || localId
      Object.entries(rows(monthsValue)).forEach(([month, tableValue]) => {
        if (currentPublished !== month && publishedMonths[month] !== true && !(month in snapshots)) return
        Object.entries(rows(rows(tableValue)['rows'])).forEach(([date, rowValue]) => Object.entries(rows(rows(rowValue)['slots'])).forEach(([time, cellValue]) => {
        const cell = rows(cellValue)
        const ids = [text(cell['p1']), text(cell['p2'])]
        if (ids.some(id => participantIds.has(id))) {
          const partner = ids.find(id => id && !participantIds.has(id))
          add({ id:`escala:${localId}:${month}:${date}:${time}`, source:'escala', date, time, title:'Escala TPL', detail:partner ? `Carrinho com ${participantName(partner) || 'parceiro definido'}` : 'Carrinho de testemunho público', location, status:'futuro' })
        }
      }))
      })
    })
  }

  if (allowed.servicoCampo !== false) {
    const service = rows(root['servicoCampo'])
    Object.entries(rows(service['periods'])).forEach(([periodId, periodValue]) => {
      const period = rows(periodValue)
      if (period['published'] !== true) return
      Object.entries(rows(period['assignments'])).forEach(([assignmentId, assignmentValue]) => {
        const assignment = rows(assignmentValue)
        if (text(assignment['leaderId']) !== masterId) return
        add({ id:`servicoCampo:${periodId}:${assignmentId}`, source:'servicoCampo', date:text(assignment['date']), time:text(assignment['time']) || undefined, title:`Dirigente - ${text(assignment['label']) || 'Saída de campo'}`, detail:'Dirigente da saída de campo', location:text(assignment['location']) || undefined, status:'futuro' })
      })
    })
  }

  const seen = new Set<string>()
  return result.sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '') || a.title.localeCompare(b.title, 'pt-BR')).filter(event => {
    const key = `${event.source}|${event.id}|${event.date}|${event.time || ''}`
    if (seen.has(key)) return false
    seen.add(key); return true
  })
}

export function collectAnnouncementEvents(rootValue: unknown, allowed: Partial<Record<AgendaSource, boolean>> = {}): AnnouncementEvent[] {
  const root = rows(rootValue), people = rows(rows(root['master'])['pessoas'])
  const grouped = new Map<string, AnnouncementEvent>()
  const add = (event: AgendaEvent, name: string): void => {
    if (!name || !validAgendaDate(event.date) || !validAgendaTime(event.time)) return
    const key = `${event.source}|${event.id}|${event.date}|${event.time || ''}`
    const current = grouped.get(key)
    if (current) { if (!current.people.includes(name)) current.people.push(name); return }
    grouped.set(key, { ...event, note: undefined, people: [name] })
  }
  Object.entries(people).forEach(([masterId, personValue]) => {
    const person = rows(personValue), name = text(person['name'])
    if (!name || person['active'] === false) return
    collectAgendaEvents(rootValue, masterId, allowed).forEach(event => {
      add(event, name)
    })
  })
  return [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '') || a.title.localeCompare(b.title, 'pt-BR'))
}

const icsEscape = (value: string): string => value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
const utcStamp = (value: string): string => value.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const validReminder = (value: string): boolean => /^P(?:\d+D)?(?:T\d+[HM])?$/.test(value) && value !== 'P'
function foldIcsLine(line: string): string {
  const encoder = new TextEncoder()
  let result = '', length = 0
  for (const character of line) {
    const size = encoder.encode(character).length
    if (length + size > 75) { result += '\r\n '; length = 1 }
    result += character
    length += size
  }
  return result
}
function nextCivilDate(value: string): string {
  const date = new Date(`${value}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10).replace(/-/g, '')
}
export function agendaToIcs(events: AgendaEvent[], generatedAt: string, options: AgendaIcsOptions = {}): string {
  const namespace = options.namespace?.replace(/[^a-zA-Z0-9_-]/g, '') || 'noroeste'
  const body = events.filter(event => validAgendaDate(event.date) && validAgendaTime(event.time)).map(event => {
    const date = event.date.replace(/-/g, ''), start = event.time ? `DTSTART;TZID=America/Fortaleza:${date}T${event.time.replace(':', '')}00` : `DTSTART;VALUE=DATE:${date}`, details = [event.detail, event.note, `Origem: ${event.source}`, `Status: ${event.status}`].filter(Boolean).join('\n')
    const end = event.time ? 'DURATION:PT1H' : `DTEND;VALUE=DATE:${nextCivilDate(event.date)}`
    const alarms = [...new Set(options.reminders?.[event.source] ?? [])].filter(validReminder).slice(0, 2).flatMap(offset => ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(`Lembrete: ${event.title}`)}`, `TRIGGER:-${offset}`, 'END:VALARM'])
    return ['BEGIN:VEVENT', `UID:${icsEscape(event.id)}@${namespace}`, `DTSTAMP:${utcStamp(generatedAt)}`, start, end, `SUMMARY:${icsEscape(event.title)}`, `DESCRIPTION:${icsEscape(details)}`, ...(event.location ? [`LOCATION:${icsEscape(event.location)}`] : []), ...alarms, 'END:VEVENT'].join('\r\n')
  }).join('\r\n')
  const timezone = ['BEGIN:VTIMEZONE', 'TZID:America/Fortaleza', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:-0300', 'TZOFFSETTO:-0300', 'TZNAME:BRT', 'END:STANDARD', 'END:VTIMEZONE']
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'PRODID:-//Noroeste//Minha agenda//PT-BR', `X-WR-CALNAME:${icsEscape(options.calendarName || 'Minha agenda Noroeste')}`, 'X-WR-TIMEZONE:America/Fortaleza', ...timezone, ...(body ? body.split('\r\n') : []), 'END:VCALENDAR'].map(foldIcsLine).join('\r\n') + '\r\n'
}

export function eventsInFeedWindow<T extends AgendaEvent>(events: T[], today: string): T[] {
  if (!validAgendaDate(today)) return []
  const anchor = new Date(`${today}T12:00:00Z`)
  const start = new Date(anchor); start.setUTCMonth(start.getUTCMonth() - 2)
  const end = new Date(anchor); end.setUTCMonth(end.getUTCMonth() + 12)
  const startDate = start.toISOString().slice(0, 10), endDate = end.toISOString().slice(0, 10)
  return events.filter(event => validAgendaDate(event.date) && validAgendaTime(event.time) && event.date >= startDate && event.date <= endDate).sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''))
}

export function agendaMessage(events: AgendaEvent[]): string {
  if (!events.length) return 'Minha agenda Noroeste: nenhuma designação registrada neste período.'
  return `Minha agenda Noroeste:\n${events.map(event => `${event.date.split('-').reverse().join('/')} ${event.time || ''} - ${event.title}${event.location ? ` (${event.location})` : ''}`.replace('  ', ' ')).join('\n')}`
}

export function announcementMessage(events: AnnouncementEvent[]): string {
  if (!events.length) return 'Quadro de anúncios Noroeste: nenhuma designação registrada neste período.'
  return `Quadro de anúncios Noroeste:\n${events.map(event => `${event.date.split('-').reverse().join('/')} ${event.time || ''} - ${event.title}\n${event.detail}${event.location ? ` · ${event.location}` : ''}\n${event.people.join(', ')}`.replace('  ', ' ')).join('\n\n')}`
}

function eventMeetingKind(event: AnnouncementEvent): BoardMeetingKind | null {
  if (event.source === 'tarefas') return /meio de semana/i.test(event.detail) ? 'midweek' : /fim de semana/i.test(event.detail) ? 'weekend' : null
  if (/meio de semana/i.test(event.detail)) return 'midweek'
  if (/fim de semana|limpeza semanal/i.test(event.detail)) return 'weekend'
  return null
}

export function boardMeetingDates(events: AnnouncementEvent[], today: string): BoardMeetingDate[] {
  const dates = new Map<string, BoardMeetingKind>()
  events.forEach(event => {
    if (event.date < today) return
    const kind = eventMeetingKind(event)
    if (!kind || dates.has(event.date)) return
    dates.set(event.date, kind)
  })
  return [...dates].map(([date, kind]) => ({ date, kind })).sort((a, b) => a.date.localeCompare(b.date))
}

export function boardMeetingEvents(events: AnnouncementEvent[], selected: BoardMeetingDate | undefined): AnnouncementEvent[] {
  if (!selected) return []
  const sources = selected.kind === 'midweek'
    ? new Set<AgendaSource>(['tarefas', 'limpeza'])
    : new Set<AgendaSource>(['tarefas', 'limpeza'])
  return events.filter(event => event.date === selected.date && sources.has(event.source))
}

function boardMeetingText(events: AnnouncementEvent[], selected: BoardMeetingDate | undefined, includeCleaning: boolean): string {
  if (!selected) return 'Quadro de anúncios Noroeste: nenhuma reunião futura selecionada.'
  const groups: Array<[string, AgendaSource]> = selected.kind === 'midweek'
    ? [['TAREFAS', 'tarefas']]
    : [['TAREFAS', 'tarefas']]
  if (includeCleaning) groups.push(['LIMPEZA', 'limpeza'])
  return groups.map(([title, source]) => {
    const rows = events.filter(event => event.source === source)
    return `${title}\n${rows.length ? rows.map(eventText).join('\n') : '- Nenhuma designação publicada.'}`
  }).join('\n\n')
}

function eventText(event: AnnouncementEvent): string {
  const line = `${event.time ? `${event.time} · ` : ''}${event.title}`
  const detail = [event.detail, event.location].filter(Boolean).join(' · ')
  return `- ${line}${detail ? `\n  ${detail}` : ''}${event.people.length ? `\n  ${event.people.join(', ')}` : ''}`
}

export function boardMeetingMessage(events: AnnouncementEvent[], selected: BoardMeetingDate | undefined): string {
  return boardMeetingText(events, selected, true)
}

export function boardMeetingWhatsappMessage(events: AnnouncementEvent[], selected: BoardMeetingDate | undefined): string {
  return boardMeetingText(events, selected, false)
}

export function boardCleaningMessage(events: AnnouncementEvent[]): string {
  const cleaning = events.filter(event => event.source === 'limpeza')
  if (!cleaning.length) return 'Limpeza: nenhuma designação publicada para esta reunião.'
  return `LIMPEZA\n${cleaning.map(eventText).join('\n')}`
}
