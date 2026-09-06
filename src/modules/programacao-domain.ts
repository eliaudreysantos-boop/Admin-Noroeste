export type ProgramSection = 'tesouros' | 'ministerio' | 'vida-crista'
export type WeekType = 'normal' | 'visita' | 'assembleia' | 'celebracao'
export type AssignmentStatus = 'programado' | 'substituido' | 'realizado'

export const ASSIGNMENT_PERMISSIONS = [
  'presidente', 'oracao-inicial', 'discurso', 'joias', 'leitura-biblia',
  'iniciando-conversas', 'cultivando-interesse', 'fazendo-discipulos',
  'explicando-crencas', 'o-que-voce-diria', 'ajudante',
  'necessidades-locais', 'consideracao', 'estudo-biblico', 'leitor',
  'conselheiro-assistente', 'oracao-final',
] as const

export type AssignmentPermission = typeof ASSIGNMENT_PERMISSIONS[number]

export interface ProgramPart {
  id: string
  section: ProgramSection
  title: string
  durationMinutes: number
  reference?: string
  teachingType?: 'conteudo' | 'cenas' | 'videos'
  assignedPersonId?: string
  assistantPersonId?: string
  substitutePersonId?: string
  realizedPersonId?: string
  status?: AssignmentStatus
  absent?: boolean
  roomId?: string
  remindedAt?: string
  assistantRemindedAt?: string
  confirmedAt?: string
  updatedAt?: string
}

export interface MeetingProgram {
  id: string
  meetingDate: string
  bibleReading: string
  sourceUrl?: string
  notes?: string
  type?: WeekType
  counselorPersonId?: string
  parts: ProgramPart[]
  importedAt?: string
  updatedAt?: string
}

export interface ProgramPerson {
  id: string
  masterId: string
  name: string
  whatsapp: string
  sex: 'masculino' | 'feminino' | ''
  role: string
  active: boolean
  permissions: AssignmentPermission[]
}

const MONTHS: Record<string, number> = {
  janeiro: 0, fevereiro: 1, marco: 2, abril: 3, maio: 4, junho: 5,
  julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
}

const normalize = (value: string): string => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

export function isOfficialJwUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'www.jw.org' && url.pathname.startsWith('/pt/')
  } catch { return false }
}

export function bimesters(year: number): Array<{ id: string; year: number; startMonth: number; label: string }> {
  const labels = ['Janeiro/Fevereiro', 'Março/Abril', 'Maio/Junho', 'Julho/Agosto', 'Setembro/Outubro', 'Novembro/Dezembro']
  return labels.map((label, index) => ({ id: `${year}-${String(index * 2 + 1).padStart(2, '0')}`, year, startMonth: index * 2, label: `${label} ${year}` }))
}

function sectionFor(line: string): ProgramSection | null {
  const text = normalize(line)
  if (text.includes('tesouros da palavra de deus')) return 'tesouros'
  if (text.includes('faca seu melhor no ministerio')) return 'ministerio'
  if (text.includes('nossa vida crista')) return 'vida-crista'
  return null
}

export function htmlToText(html: string): string {
  const entities: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&ndash;': '–', '&mdash;': '—', '&rsquo;': "'", '&ldquo;': '"', '&rdquo;': '"' }
  return html
    .replace(/<\/(?:h[1-6]|p|li|div|section|article)>/gi, '\n')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/gi, entity => entities[entity.toLowerCase()] ?? entity)
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)))
}

export function parseOfficialProgram(sourceUrl: string, source: string): MeetingProgram {
  if (!isOfficialJwUrl(sourceUrl)) throw new Error('Use uma página oficial em https://www.jw.org/pt/.')
  const lines = htmlToText(source).split(/\r?\n/).map(line => line.replace(/^#+\s*/, '').trim()).filter(Boolean)
  const joined = lines.join('\n')
  const ordinal = '\\.?[º°o]?'
  const cross = joined.match(new RegExp(`(\\d{1,2})${ordinal}\\s+de\\s+([a-zç]+)\\s*(?:–|-)\\s*\\d{1,2}${ordinal}\\s+de\\s+[a-zç]+\\s+de\\s+(\\d{4})`, 'i'))
  const same = joined.match(new RegExp(`(\\d{1,2})${ordinal}\\s*(?:–|-)\\s*\\d{1,2}${ordinal}\\s+de\\s+([a-zç]+)\\s+de\\s+(\\d{4})`, 'i'))
  const week = cross ?? same
  if (!week) throw new Error('Não foi possível encontrar a semana da reunião.')
  const month = MONTHS[normalize(week[2])]
  if (!Number.isInteger(month)) throw new Error('Não foi possível identificar o mês da reunião.')
  const monday = new Date(Date.UTC(Number(week[3]), month, Number(week[1])))
  monday.setUTCDate(monday.getUTCDate() + 2)
  const meetingDate = monday.toISOString().slice(0, 10)
  const bibleReading = lines.find(line => /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ ]+\s+\d/.test(line))
  if (!bibleReading) throw new Error('Não foi possível encontrar a leitura bíblica.')
  let section: ProgramSection | null = null
  const parts: ProgramPart[] = []
  lines.forEach((line, index) => {
    section = sectionFor(line) ?? section
    const part = line.match(/^(\d+)\.\s+(.+)$/)
    const duration = lines[index + 1]?.match(/^\((\d+)\s+min\.?\)\s*(.*)$/i)
    if (!part || !duration || !section) return
    parts.push({ id: `${meetingDate}-${part[1]}`, section, title: part[2], durationMinutes: Number(duration[1]), ...(duration[2] ? { reference: duration[2] } : {}) })
  })
  if (!parts.length) throw new Error('Não foi possível encontrar as partes da reunião.')
  return { id: meetingDate, meetingDate, bibleReading, sourceUrl, type: 'normal', parts }
}

export function mergeImportedProgram(existing: MeetingProgram | undefined, incoming: MeetingProgram, stamp: string): MeetingProgram {
  if (!existing) return { ...incoming, importedAt: stamp, updatedAt: stamp }
  const oldParts = new Map(existing.parts.map(part => [part.id, part]))
  return {
    ...incoming,
    notes: existing.notes,
    type: existing.type ?? incoming.type,
    importedAt: existing.importedAt ?? stamp,
    updatedAt: stamp,
    parts: incoming.parts.map(part => ({ ...part, ...oldParts.get(part.id), title: part.title, section: part.section, durationMinutes: part.durationMinutes, reference: part.reference })),
  }
}

export function permissionForPart(part: ProgramPart): AssignmentPermission {
  const title = normalize(part.title)
  if (/leitura da biblia/.test(title)) return 'leitura-biblia'
  if (/joias/.test(title)) return 'joias'
  if (/iniciando/.test(title)) return 'iniciando-conversas'
  if (/cultivando/.test(title)) return 'cultivando-interesse'
  if (/fazendo discipulos/.test(title)) return 'fazendo-discipulos'
  if (/explicando.*crencas/.test(title)) return 'explicando-crencas'
  if (/o que voce diria/.test(title)) return 'o-que-voce-diria'
  if (/necessidades locais/.test(title)) return 'necessidades-locais'
  if (/estudo biblico/.test(title)) return 'estudo-biblico'
  if (part.section === 'tesouros') return 'discurso'
  if (part.section === 'vida-crista') return 'consideracao'
  return 'iniciando-conversas'
}

const maleOnly = new Set<AssignmentPermission>(['presidente', 'oracao-inicial', 'discurso', 'joias', 'leitura-biblia', 'necessidades-locais', 'consideracao', 'estudo-biblico', 'leitor', 'conselheiro-assistente', 'oracao-final'])
const autoGranted: Partial<Record<AssignmentPermission, string[]>> = {
  presidente: ['anciao'], 'oracao-inicial': ['anciao'], discurso: ['anciao', 'servo-ministerial'], joias: ['anciao', 'servo-ministerial'],
  'necessidades-locais': ['anciao'], consideracao: ['anciao', 'servo-ministerial'], 'estudo-biblico': ['anciao', 'servo-ministerial'],
  'conselheiro-assistente': ['anciao'], 'oracao-final': ['anciao', 'servo-ministerial'],
}

export function eligible(person: ProgramPerson, permission: AssignmentPermission): boolean {
  if (!person.active || (maleOnly.has(permission) && person.sex !== 'masculino')) return false
  if (permission === 'leitor' && person.role === 'publicador') return false
  return person.permissions.includes(permission) || (autoGranted[permission]?.includes(person.role) ?? false)
}

export function candidates(part: ProgramPart, people: ProgramPerson[], assistant = false): ProgramPerson[] {
  const permission = assistant ? 'ajudante' : permissionForPart(part)
  return people.filter(person => eligible(person, permission)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

function lastUse(personId: string, permission: AssignmentPermission, programs: MeetingProgram[]): string {
  return programs.reduce((latest, program) => program.parts.some(part => permissionForPart(part) === permission && [part.assignedPersonId, part.substitutePersonId, part.realizedPersonId].includes(personId)) && program.meetingDate > latest ? program.meetingDate : latest, '')
}

export function suggestAssignments(program: MeetingProgram, people: ProgramPerson[], history: MeetingProgram[]): MeetingProgram {
  if (program.type === 'assembleia' || program.type === 'celebracao') return { ...program, parts: program.parts.map(part => ({ ...part })) }
  const used = new Set(program.parts.flatMap(part => [part.assignedPersonId, part.assistantPersonId].filter(Boolean) as string[]))
  const parts = program.parts.map(part => {
    const next = { ...part }
    if (!next.assignedPersonId) {
      const permission = permissionForPart(next)
      const available = candidates(next, people).filter(person => !used.has(person.id)).sort((a, b) => lastUse(a.id, permission, history).localeCompare(lastUse(b.id, permission, history)) || a.name.localeCompare(b.name, 'pt-BR'))
      if (available[0]) { next.assignedPersonId = available[0].id; used.add(available[0].id) }
    }
    if (assistantNeedsSameSex(next) && !next.assistantPersonId) {
      const sex = people.find(person => person.id === next.assignedPersonId)?.sex
      const available = candidates(next, people, true).filter(person => !used.has(person.id) && (!sex || person.sex === sex)).sort((a, b) => lastUse(a.id, 'ajudante', history).localeCompare(lastUse(b.id, 'ajudante', history)) || a.name.localeCompare(b.name, 'pt-BR'))
      if (available[0]) { next.assistantPersonId = available[0].id; used.add(available[0].id) }
    }
    return next
  })
  return { ...program, parts }
}

export function assignmentConflicts(program: MeetingProgram, part: ProgramPart): string[] {
  const errors: string[] = []
  const used = (id: string | undefined) => id && program.parts.some(other => other.id !== part.id && [other.assignedPersonId, other.assistantPersonId, other.substitutePersonId].includes(id))
  if (used(part.assignedPersonId)) errors.push('O principal também está designado em outra parte.')
  if (used(part.assistantPersonId)) errors.push('O ajudante também está designado em outra parte.')
  if (part.assignedPersonId && part.assignedPersonId === part.assistantPersonId) errors.push('Principal e ajudante não podem ser a mesma pessoa.')
  return errors
}

export function assistantNeedsSameSex(part: ProgramPart): boolean {
  return part.section === 'ministerio' && !/discurso/i.test(part.title)
}

export function filterPrograms(programs: MeetingProgram[], mode: 'week' | 'month' | 'bimester', anchor: string): MeetingProgram[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) return programs
  const date = new Date(`${anchor}T12:00:00`)
  let start: Date
  let end: Date
  if (mode === 'week') {
    start = new Date(date); start.setDate(date.getDate() - ((date.getDay() + 6) % 7))
    end = new Date(start); end.setDate(start.getDate() + 6)
  } else {
    const month = mode === 'bimester' ? date.getMonth() - (date.getMonth() % 2) : date.getMonth()
    start = new Date(date.getFullYear(), month, 1, 12)
    end = new Date(date.getFullYear(), month + (mode === 'bimester' ? 2 : 1), 0, 12)
  }
  const iso = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  return programs.filter(program => program.meetingDate >= iso(start) && program.meetingDate <= iso(end))
}

export interface ProgramPending { id: string; date: string; message: string }

export function programPendings(programs: MeetingProgram[], people: ProgramPerson[]): ProgramPending[] {
  const byId = new Map(people.map(person => [person.id, person]))
  const result: ProgramPending[] = []
  programs.forEach(program => {
    if (!program.parts.length) result.push({ id: `${program.id}:empty`, date: program.meetingDate, message: 'Semana sem partes cadastradas.' })
    program.parts.forEach(part => {
      if (!part.assignedPersonId) result.push({ id: `${program.id}:${part.id}:principal`, date: program.meetingDate, message: `${part.title}: principal não definido.` })
      else if (!byId.get(part.assignedPersonId)?.active) result.push({ id: `${program.id}:${part.id}:invalid`, date: program.meetingDate, message: `${part.title}: principal ausente ou inativo.` })
      if (assistantNeedsSameSex(part) && part.assistantPersonId) {
        const principal = byId.get(part.assignedPersonId ?? '')
        const assistant = byId.get(part.assistantPersonId)
        if (principal && assistant && principal.sex !== assistant.sex) result.push({ id: `${program.id}:${part.id}:sex`, date: program.meetingDate, message: `${part.title}: principal e ajudante precisam ser do mesmo sexo.` })
      }
      assignmentConflicts(program, part).forEach((message, index) => result.push({ id: `${program.id}:${part.id}:conflict:${index}`, date: program.meetingDate, message: `${part.title}: ${message}` }))
      if (part.assignedPersonId && !part.remindedAt) result.push({ id: `${program.id}:${part.id}:delivery`, date: program.meetingDate, message: `${part.title}: lembrete ainda não aberto.` })
      if (part.assignedPersonId && !part.confirmedAt) result.push({ id: `${program.id}:${part.id}:confirmation`, date: program.meetingDate, message: `${part.title}: confirmação pendente.` })
      if (part.status === 'realizado' && !part.realizedPersonId) result.push({ id: `${program.id}:${part.id}:realized`, date: program.meetingDate, message: `${part.title}: informe quem realizou a parte.` })
    })
  })
  return result.sort((a, b) => a.date.localeCompare(b.date) || a.message.localeCompare(b.message, 'pt-BR'))
}

export function reminderMessage(person: ProgramPerson, program: MeetingProgram, part: ProgramPart, time: string, template?: string): string {
  const [year, month, day] = program.meetingDate.split('-')
  const date = year && month && day ? `${day}/${month}/${year}` : program.meetingDate
  const text = template?.trim() || 'Olá, {nome}!\n\nLembrando sua designação na reunião de {data}, às {horario}:\n\nParte: {parte}\n\nPor favor, confirme o recebimento.'
  return text.replace(/\{nome\}/g, person.name).replace(/\{data\}/g, date).replace(/\{horario\}/g, time).replace(/\{parte\}/g, part.title)
}
