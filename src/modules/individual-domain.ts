import type { MasterPessoa } from '../types'

export type AgendaSource = 'tarefas' | 'limpeza' | 'escala' | 'oradores' | 'programacao' | 'servicoCampo'
export type AgendaStatus = 'futuro' | 'confirmacao-pendente' | 'alterado' | 'realizado'

export interface AgendaEvent {
  id: string; source: AgendaSource; date: string; time?: string; title: string
  detail: string; location?: string; note?: string; status: AgendaStatus
}

export interface AnnouncementEvent extends AgendaEvent { people: string[] }

export interface AgendaIcsOptions {
  reminders?: Partial<Record<AgendaSource, string[]>>
  namespace?: string
  calendarName?: string
}

export function sanitizeAgendaPeople(source: Record<string, MasterPessoa>): Record<string, MasterPessoa> {
  return Object.fromEntries(Object.entries(source).map(([id, person]) => [id, {
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
const validDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value)
const TASK_LABELS: Record<string, string> = { presidente:'Presidente', operador1:'Operador', operador2:'Operador 2', leitor:'Leitor', entrada:'Entrada', auditorio:'Auditório', mic1:'Microfone 1', mic2:'Microfone 2', microfone1:'Microfone 1', microfone2:'Microfone 2' }

export function collectAgendaEvents(rootValue: unknown, masterId: string, allowed: Partial<Record<AgendaSource, boolean>> = {}): AgendaEvent[] {
  if (!masterId) return []
  const root = rows(rootValue), tarefas = rows(root['tarefas']), taskPeople = rows(tarefas['people'])
  const taskIds = new Set(Object.entries(taskPeople).filter(([, person]) => text(rows(person)['masterId']) === masterId).map(([id]) => id))
  const result: AgendaEvent[] = []
  const add = (event: AgendaEvent): void => { if (validDate(event.date)) result.push({ ...event, note: text(event.note).slice(0, 250) || undefined }) }

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

  if (allowed.limpeza !== false) Object.entries(rows(rows(root['limpeza'])['periodos'])).forEach(([periodId, periodValue]) => values(rows(periodValue)['semanas']).forEach((weekValue, index) => {
    const week = rows(weekValue), ids = [text(week['superintendenteMid']), ...values(week['ajudantesMid']).map(text), ...values(week['membrosMid']).map(text)]
    if (ids.includes(masterId)) add({ id:`limpeza:${periodId}:${index}`, source:'limpeza', date:text(week['dataMeioSemana']) || text(week['referencia']), title:`Limpeza - ${text(week['grupoNome']) || `Grupo ${Number(week['grupo'])}`}`, detail:'Escala de limpeza do Salão do Reino', status:'futuro' })
  }))

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

  if (allowed.oradores !== false) {
    const discursos = rows(tarefas['discursos']), speakers = rows(discursos['oradores'])
    const speakerIds = new Set(Object.entries(speakers).filter(([, speaker]) => text(rows(speaker)['masterId']) === masterId || taskIds.has(text(rows(speaker)['pessoaId']))).map(([id]) => id))
    Object.entries(rows(discursos['programacao'])).forEach(([id, talkValue]) => {
      const talk = rows(talkValue), selected = text(talk['realizadoPorId']) || text(talk['substitutoId']) || text(talk['oradorId'])
      if (!speakerIds.has(selected) && !speakerIds.has(text(talk['oradorSecundarioId']))) return
      const type = text(talk['tipo']), destination = text(talk['congregacaoDestinoNome']), origin = text(talk['congregacaoOrigemNome']), confirmation = rows(talk['confirmacao'])['status'] === true
      add({ id:`oradores:${id}`, source:'oradores', date:text(talk['data']), time:text(talk['horarioLocal']) || undefined, title:type === 'saida_orador' ? 'Discurso em outra congregação' : 'Discurso público', detail:text(talk['temaTitulo']) || (talk['temaNumero'] ? `Tema ${String(talk['temaNumero'])}` : 'Tema a confirmar'), location:destination || origin || text(talk['localCongregacaoNome']) || undefined, note:text(talk['observacoes']), status:text(talk['status']) === 'realizado' || text(talk['realizadoPorId']) ? 'realizado' : confirmation ? 'futuro' : 'confirmacao-pendente' })
    })
  }

  if (allowed.programacao !== false) {
    const programacao = rows(root['programacao']), profiles = rows(programacao['pessoas'])
    const profileIds = new Set(Object.entries(profiles).filter(([id, profile]) => text(rows(profile)['masterId']) === masterId || id === masterId).map(([id]) => id))
    const rooms = new Map(values(rows(programacao['settings'])['rooms']).map(roomValue => {
      const room = rows(roomValue)
      return [text(room['id']), text(room['name'])] as const
    }))
    const meetingTime = text(rows(programacao['settings'])['meetingTime']) || undefined
    Object.entries(rows(programacao['programs'] ?? programacao['semanas'])).forEach(([programId, programValue]) => {
      const program = rows(programValue), date = text(program['meetingDate']) || programId
      values(program['parts']).forEach((partValue, index) => {
        const part = rows(partValue), assigned = text(part['assignedPersonId']), substitute = text(part['substitutePersonId']), responsible = substitute || assigned, assistant = text(part['assistantPersonId']), realized = text(part['realizedPersonId'])
        const isAssistant = profileIds.has(assistant) && responsible !== assistant
        const isResponsible = profileIds.has(responsible)
        const isRealized = profileIds.has(realized)
        if (!isResponsible && !isAssistant && !isRealized) return
        const roomId = text(part['roomId']) || 'main'
        const status: AgendaStatus = text(part['status']) === 'realizado' || isRealized ? 'realizado' : substitute && isResponsible ? 'alterado' : part['confirmedAt'] ? 'futuro' : 'confirmacao-pendente'
        const role = isAssistant ? 'Ajudante' : substitute && isResponsible ? 'Substituto' : isRealized ? 'Realizou' : ''
        add({ id:`programacao:${programId}:${text(part['id']) || index}:${role || 'principal'}`, source:'programacao', date, time:meetingTime, title:role ? `${role} - ${text(part['title'])}` : text(part['title']) || 'Parte da reunião', detail:'Vida e Ministério', location:rooms.get(roomId) || (roomId === 'main' ? 'Salão principal' : undefined), note:text(part['reference']), status })
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
    if (!name || !validDate(event.date)) return
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
  if (allowed.oradores !== false) {
    const tarefas = rows(root['tarefas']), discursos = rows(tarefas['discursos']), speakers = rows(discursos['oradores']), taskPeople = rows(tarefas['people']), congregations = rows(discursos['congregacoes'])
    Object.entries(rows(discursos['programacao'])).forEach(([id, talkValue]) => {
      const talk = rows(talkValue), speaker = rows(speakers[text(talk['oradorId'])]), taskPerson = rows(taskPeople[text(speaker['pessoaId'])])
      const masterId = text(speaker['masterId']) || text(taskPerson['masterId'])
      const type = text(talk['tipo']), isVisitor = text(speaker['tipo']) === 'visitante' || type === 'discurso_visitante'
      if (masterId && people[masterId]) return
      if (!isVisitor) return
      const name = text(rows(people[masterId])['name']) || text(speaker['nome']) || text(speaker['name']) || text(talk['oradorNome']) || 'Orador a definir'
      const congregationId = type === 'saida_orador' ? text(talk['congregacaoDestinoId']) || text(talk['congregacaoId']) : text(talk['congregacaoOrigemId']) || text(talk['congregacaoId'])
      const congregation = rows(congregations[congregationId]), destination = text(talk['congregacaoDestinoNome']), origin = text(talk['congregacaoOrigemNome']), confirmation = rows(talk['confirmacao'])['status'] === true
      add({ id:`oradores:${id}`, source:'oradores', date:text(talk['data']), time:text(talk['horarioLocal']) || undefined, title:type === 'saida_orador' ? 'Discurso em outra congregação' : 'Discurso público', detail:text(talk['temaTitulo']) || (talk['temaNumero'] ? `Tema ${String(talk['temaNumero'])}` : 'Tema a confirmar'), location:destination || origin || text(congregation['nome']) || text(talk['localCongregacaoNome']) || undefined, status:text(talk['status']) === 'realizado' || text(talk['realizadoPorId']) ? 'realizado' : confirmation ? 'futuro' : 'confirmacao-pendente' }, name)
    })
  }
  return [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '') || a.title.localeCompare(b.title, 'pt-BR'))
}

const icsEscape = (value: string): string => value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
const utcStamp = (value: string): string => value.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const validReminder = (value: string): boolean => /^P(?:\d+D)?(?:T\d+[HM])?$/.test(value) && value !== 'P'
function nextCivilDate(value: string): string {
  const date = new Date(`${value}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10).replace(/-/g, '')
}
export function agendaToIcs(events: AgendaEvent[], generatedAt: string, options: AgendaIcsOptions = {}): string {
  const namespace = options.namespace?.replace(/[^a-zA-Z0-9_-]/g, '') || 'noroeste'
  const body = events.map(event => {
    const date = event.date.replace(/-/g, ''), start = event.time ? `DTSTART;TZID=America/Fortaleza:${date}T${event.time.replace(':', '')}00` : `DTSTART;VALUE=DATE:${date}`, details = [event.detail, event.note, `Origem: ${event.source}`, `Status: ${event.status}`].filter(Boolean).join('\n')
    const end = event.time ? 'DURATION:PT1H' : `DTEND;VALUE=DATE:${nextCivilDate(event.date)}`
    const alarms = [...new Set(options.reminders?.[event.source] ?? [])].filter(validReminder).slice(0, 2).flatMap(offset => ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(`Lembrete: ${event.title}`)}`, `TRIGGER:-${offset}`, 'END:VALARM'])
    return ['BEGIN:VEVENT', `UID:${icsEscape(event.id)}@${namespace}`, `DTSTAMP:${utcStamp(generatedAt)}`, start, end, `SUMMARY:${icsEscape(event.title)}`, `DESCRIPTION:${icsEscape(details)}`, ...(event.location ? [`LOCATION:${icsEscape(event.location)}`] : []), ...alarms, 'END:VEVENT'].join('\r\n')
  }).join('\r\n')
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nPRODID:-//Noroeste//Minha agenda//PT-BR\r\nX-WR-CALNAME:${icsEscape(options.calendarName || 'Minha agenda Noroeste')}\r\nX-WR-TIMEZONE:America/Fortaleza\r\n${body}\r\nEND:VCALENDAR\r\n`
}

export function eventsInFeedWindow(events: AgendaEvent[], today: string): AgendaEvent[] {
  const anchor = new Date(`${today}T12:00:00Z`)
  const start = new Date(anchor); start.setUTCMonth(start.getUTCMonth() - 2)
  const end = new Date(anchor); end.setUTCMonth(end.getUTCMonth() + 12)
  const startDate = start.toISOString().slice(0, 10), endDate = end.toISOString().slice(0, 10)
  return events.filter(event => event.date >= startDate && event.date <= endDate).sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''))
}

export function agendaMessage(events: AgendaEvent[]): string {
  if (!events.length) return 'Minha agenda Noroeste: nenhuma designação registrada neste período.'
  return `Minha agenda Noroeste:\n${events.map(event => `${event.date.split('-').reverse().join('/')} ${event.time || ''} - ${event.title}${event.location ? ` (${event.location})` : ''}`.replace('  ', ' ')).join('\n')}`
}

export function announcementMessage(events: AnnouncementEvent[]): string {
  if (!events.length) return 'Quadro de anúncios Noroeste: nenhuma designação registrada neste período.'
  return `Quadro de anúncios Noroeste:\n${events.map(event => `${event.date.split('-').reverse().join('/')} ${event.time || ''} - ${event.title}\n${event.detail}${event.location ? ` · ${event.location}` : ''}\n${event.people.join(', ')}`.replace('  ', ' ')).join('\n\n')}`
}
