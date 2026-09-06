export type AgendaSource = 'tarefas' | 'limpeza' | 'escala' | 'oradores' | 'programacao'
export type AgendaStatus = 'futuro' | 'confirmacao-pendente' | 'alterado' | 'realizado'

export interface AgendaEvent {
  id: string; source: AgendaSource; date: string; time?: string; title: string
  detail: string; location?: string; note?: string; status: AgendaStatus
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

  if (allowed.tarefas !== false) Object.entries(rows(rows(rows(tarefas['scale'])['periods']))).forEach(([periodId, periodValue]) => Object.entries(rows(rows(periodValue)['meetings'])).forEach(([meetingId, meetingValue]) => {
    const meeting = rows(meetingValue), date = text(meeting['date']) || meetingId.split('__')[0]
    Object.entries(rows(meeting['assignments'])).forEach(([role, assignment]) => {
      const personId = text(rows(assignment)['id']) || text(rows(assignment)['personId']) || text(assignment)
      if (taskIds.has(personId)) add({ id:`tarefas:${periodId}:${meetingId}:${role}`, source:'tarefas', date, title:TASK_LABELS[role] || role, detail:text(meeting['type']) === 'midweek' ? 'Reunião do meio de semana' : 'Reunião do fim de semana', status:text(rows(meeting['avisados'])[role]) ? 'futuro' : 'confirmacao-pendente' })
    })
  }))

  if (allowed.limpeza !== false) Object.entries(rows(rows(root['limpeza'])['periodos'])).forEach(([periodId, periodValue]) => values(rows(periodValue)['semanas']).forEach((weekValue, index) => {
    const week = rows(weekValue), ids = [text(week['superintendenteMid']), ...values(week['ajudantesMid']).map(text), ...values(week['membrosMid']).map(text)]
    if (ids.includes(masterId)) add({ id:`limpeza:${periodId}:${index}`, source:'limpeza', date:text(week['dataMeioSemana']) || text(week['referencia']), title:`Limpeza - ${text(week['grupoNome']) || `Grupo ${Number(week['grupo'])}`}`, detail:'Escala de limpeza do Salão do Reino', note:text(week['textoAprovado']), status:'futuro' })
  }))

  if (allowed.escala !== false) {
    const escala = rows(root['escala']), participantIds = new Set(Object.entries(rows(escala['participants'])).filter(([, person]) => text(rows(person)['masterId']) === masterId).map(([id]) => id))
    Object.entries(rows(escala['tables'])).forEach(([localId, monthsValue]) => {
      const local = rows(escala['scales'])[localId], location = text(rows(local)['name']) || localId
      Object.entries(rows(monthsValue)).forEach(([month, tableValue]) => Object.entries(rows(rows(tableValue)['rows'])).forEach(([date, rowValue]) => Object.entries(rows(rows(rowValue)['slots'])).forEach(([time, cellValue]) => {
        const cell = rows(cellValue)
        if ([text(cell['p1']), text(cell['p2'])].some(id => participantIds.has(id))) add({ id:`escala:${localId}:${month}:${date}:${time}`, source:'escala', date, time, title:'Serviço de campo', detail:`Dupla em ${location}`, location, status:'futuro' })
      })))
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
    Object.entries(rows(programacao['programs'] ?? programacao['semanas'])).forEach(([programId, programValue]) => {
      const program = rows(programValue), date = text(program['meetingDate']) || programId
      values(program['parts']).forEach((partValue, index) => {
        const part = rows(partValue), assigned = text(part['substitutePersonId']) || text(part['assignedPersonId']), assistant = text(part['assistantPersonId'])
        if (!profileIds.has(assigned) && !profileIds.has(assistant) && !profileIds.has(text(part['realizedPersonId']))) return
        const helper = profileIds.has(assistant) && assigned !== assistant
        add({ id:`programacao:${programId}:${text(part['id']) || index}`, source:'programacao', date, title:helper ? `Ajudante - ${text(part['title'])}` : text(part['title']) || 'Parte da reunião', detail:'Vida e Ministério', location:text(part['roomId']) || undefined, status:text(part['status']) === 'realizado' || profileIds.has(text(part['realizedPersonId'])) ? 'realizado' : part['confirmedAt'] ? 'futuro' : 'confirmacao-pendente' })
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

const icsEscape = (value: string): string => value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
const utcStamp = (value: string): string => value.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
export function agendaToIcs(events: AgendaEvent[], generatedAt: string): string {
  const body = events.map(event => {
    const date = event.date.replace(/-/g, ''), start = event.time ? `DTSTART;TZID=America/Fortaleza:${date}T${event.time.replace(':', '')}00` : `DTSTART;VALUE=DATE:${date}`, details = [event.detail, event.note].filter(Boolean).join('\n')
    return ['BEGIN:VEVENT', `UID:${icsEscape(event.id)}@noroeste`, `DTSTAMP:${utcStamp(generatedAt)}`, start, `SUMMARY:${icsEscape(event.title)}`, `DESCRIPTION:${icsEscape(details)}`, ...(event.location ? [`LOCATION:${icsEscape(event.location)}`] : []), 'END:VEVENT'].join('\r\n')
  }).join('\r\n')
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nCALSCALE:GREGORIAN\r\nPRODID:-//Noroeste//Minha agenda//PT-BR\r\n${body}\r\nEND:VCALENDAR\r\n`
}

export function agendaMessage(events: AgendaEvent[]): string {
  if (!events.length) return 'Minha agenda Noroeste: nenhuma designação registrada neste período.'
  return `Minha agenda Noroeste:\n${events.map(event => `${event.date.split('-').reverse().join('/')} ${event.time || ''} - ${event.title}${event.location ? ` (${event.location})` : ''}`.replace('  ', ' ')).join('\n')}`
}
