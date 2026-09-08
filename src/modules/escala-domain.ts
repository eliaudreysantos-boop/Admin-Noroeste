export type EscalaRule =
  | 'inativo' | 'teto' | 'antes_de_iniciar' | 'folga'
  | 'sem_disponibilidade' | 'ja_no_dia' | 'horario_vizinho' | 'outro_local'
  | 'mesma_pessoa' | 'duas_criancas' | 'mesmo_sexo' | 'so_com'

export const ESCALA_RULE_LABELS: Record<EscalaRule, string> = {
  inativo: 'Pessoa inativa',
  teto: 'Atingiu o limite do mês',
  antes_de_iniciar: 'Participação ainda não iniciada',
  folga: 'Folga nesta data',
  sem_disponibilidade: 'Sem disponibilidade neste local e horário',
  ja_no_dia: 'Já está escalada neste dia',
  horario_vizinho: 'Está no horário vizinho',
  outro_local: 'Está em outro local neste horário ou em horário vizinho',
  mesma_pessoa: 'A mesma pessoa não pode ocupar as duas vagas',
  duas_criancas: 'Duas pessoas acompanhando criança não formam dupla',
  mesmo_sexo: 'A dupla precisa ser do mesmo sexo',
  so_com: 'Só participa com a pessoa definida',
}

export interface EscalaParticipant {
  name?: string
  sex?: 'M' | 'F' | string
  phone?: string
  active?: boolean
  pioneer?: boolean
  withChild?: boolean
  sameSexOnly?: boolean
  onlyWithId?: string
  capPerMonth?: number
  startFromDate?: string
  refFolgaDate?: string
  obs?: string
  masterId?: string
  availabilityUpdatedAt?: string | number | null
  updatedAt?: string | number | null
  [key: string]: unknown
}

export interface EscalaLocal {
  name?: string
  daysActive?: number[]
  slots?: string[]
  stepMinutes?: number
  intervalMin?: number
  startTime?: string
  start?: string
  endTime?: string
  end?: string
  sortOrder?: number
  [key: string]: unknown
}

export interface EscalaCell { p1: string; p2: string }
export interface EscalaRow { dow: number; slots: Record<string, EscalaCell> }
export interface EscalaTable { slots: string[]; rows: Record<string, EscalaRow> }
export type EscalaTables = Record<string, Record<string, EscalaTable>>
export type EscalaAvailability = Record<string, Record<string, Record<string, boolean>>>
export type EscalaBlocks = Record<string, Record<string, string[]>>

export interface EscalaGenerationInput {
  month: string
  localId: string
  local: EscalaLocal
  participants: Record<string, EscalaParticipant>
  availability: EscalaAvailability
  tables: EscalaTables
  blocks: EscalaBlocks
  exclusions: string[]
}

export interface EscalaPublishedSnapshot {
  participants?: Record<string, EscalaParticipant>
  [key: string]: unknown
}

export function participantDirectoryForHistory(
  current: Record<string, EscalaParticipant>,
  snapshots: Record<string, EscalaPublishedSnapshot> = {},
): Record<string, EscalaParticipant> {
  const historical: Record<string, EscalaParticipant> = {}
  for (const snapshot of Object.values(snapshots)) {
    for (const [id, participant] of Object.entries(snapshot.participants ?? {})) {
      historical[id] = participant
    }
  }
  return { ...historical, ...current }
}

export interface EmptySlot {
  date: string
  time: string
  reason: 'bloqueado' | 'sem_candidatos' | 'sem_par_valido'
  candidates: string[]
}

export interface GenerationResult {
  table: EscalaTable
  emptySlots: EmptySlot[]
  summary: { total: number; filled: number; preserved: number; blocked: number; empty: number }
}

export function availabilityKey(dow: number, time: string): string {
  return `${dow}|${time}`
}

export function dateAtNoon(iso: string): Date {
  return new Date(`${iso}T12:00:00`)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((dateAtNoon(b).getTime() - dateAtNoon(a).getTime()) / 86_400_000)
}

export function activeDates(month: string, daysActive: number[], exclusions: string[] = []): string[] {
  if (!/^\d{4}-\d{2}$/.test(month)) return []
  const [year, monthNumber] = month.split('-').map(Number)
  const last = new Date(year, monthNumber, 0).getDate()
  const ignored = new Set(exclusions)
  const dates: string[] = []
  for (let day = 1; day <= last; day += 1) {
    const date = `${year}-${String(monthNumber).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (daysActive.includes(new Date(year, monthNumber - 1, day).getDay()) && !ignored.has(date)) dates.push(date)
  }
  return dates
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

function minutesToTime(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String((value % 60 + 60) % 60).padStart(2, '0')}`
}

export function localSlots(local: EscalaLocal): string[] {
  if (Array.isArray(local.slots) && local.slots.length) return [...local.slots]
  const start = String(local.startTime ?? local.start ?? '06:00')
  const end = String(local.endTime ?? local.end ?? '20:00')
  const step = Number(local.stepMinutes ?? local.intervalMin ?? 120) || 120
  const startMinutes = timeToMinutes(start)
  const endMinutes = timeToMinutes(end)
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || step < 15 || endMinutes <= startMinutes) return []
  const slots: string[] = []
  for (let value = startMinutes; value < endMinutes; value += step) slots.push(minutesToTime(value))
  return slots
}

export function participantName(person: EscalaParticipant | undefined, fallback = ''): string {
  return String(person?.name ?? fallback).trim()
}

export function isBlocked(blocks: EscalaBlocks, month: string, localId: string, dow: number, time: string): boolean {
  const key = availabilityKey(dow, time)
  const has = (layer?: Record<string, string[]>): boolean => {
    const local = layer?.[localId] ?? []
    const all = layer?.['__all__'] ?? []
    return (Array.isArray(local) && local.includes(key)) || (Array.isArray(all) && all.includes(key))
  }
  return has(blocks['__persist__']) || has(blocks[month])
}

function addCellCount(counts: Record<string, number>, cell?: EscalaCell): void {
  if (cell?.p1 && counts[cell.p1] !== undefined) counts[cell.p1] += 1
  if (cell?.p2 && counts[cell.p2] !== undefined) counts[cell.p2] += 1
}

export function monthlyCounts(tables: EscalaTables, month: string, participants: Record<string, EscalaParticipant>, excludedLocalId = ''): Record<string, number> {
  const counts = Object.fromEntries(Object.keys(participants).map(id => [id, 0])) as Record<string, number>
  for (const [localId, byMonth] of Object.entries(tables)) {
    if (localId === excludedLocalId) continue
    for (const row of Object.values(byMonth[month]?.rows ?? {})) {
      for (const cell of Object.values(row.slots ?? {})) addCellCount(counts, cell)
    }
  }
  return counts
}

interface DayState { used: Set<string>; slots: Record<string, EscalaCell> }

export function personRule(
  participantId: string,
  person: EscalaParticipant,
  context: { date: string; dow: number; time: string; month: string; localId: string; step: number },
  input: Pick<EscalaGenerationInput, 'availability' | 'tables' | 'local'>,
  counts: Record<string, number>,
  day: DayState,
): EscalaRule | null {
  if (person.active === false) return 'inativo'
  const cap = Math.max(0, Number(person.capPerMonth ?? 0))
  if (cap > 0 && (counts[participantId] ?? 0) >= cap) return 'teto'
  if (person.startFromDate && context.date < person.startFromDate) return 'antes_de_iniciar'
  if (person.refFolgaDate && Math.abs(daysBetween(person.refFolgaDate, context.date)) % 2 !== 0) return 'folga'
  if (!input.availability[context.localId]?.[participantId]?.[availabilityKey(context.dow, context.time)]) return 'sem_disponibilidade'
  if (day.used.has(participantId)) return 'ja_no_dia'

  const minute = timeToMinutes(context.time)
  for (const neighbor of [minutesToTime(minute - context.step), minutesToTime(minute + context.step)]) {
    const cell = day.slots[neighbor]
    if (cell && (cell.p1 === participantId || cell.p2 === participantId)) return 'horario_vizinho'
  }

  const slots = localSlots(input.local)
  const index = slots.indexOf(context.time)
  const targets = new Set([context.time, slots[index - 1], slots[index + 1]].filter(Boolean))
  for (const [otherLocalId, byMonth] of Object.entries(input.tables)) {
    if (otherLocalId === context.localId) continue
    const row = byMonth[context.month]?.rows?.[context.date]
    for (const target of targets) {
      const cell = row?.slots?.[target]
      if (cell && (cell.p1 === participantId || cell.p2 === participantId)) return 'outro_local'
    }
  }
  return null
}

export function pairRule(aId: string, a: EscalaParticipant, bId: string, b: EscalaParticipant): EscalaRule | null {
  if (aId === bId) return 'mesma_pessoa'
  if (a.withChild && b.withChild) return 'duas_criancas'
  if ((a.sameSexOnly || b.sameSexOnly) && a.sex !== b.sex) return 'mesmo_sexo'
  if (a.onlyWithId && a.onlyWithId !== bId) return 'so_com'
  if (b.onlyWithId && b.onlyWithId !== aId) return 'so_com'
  return null
}

interface Candidate { id: string; person: EscalaParticipant }

export function choosePair(candidates: Candidate[], counts: Record<string, number>): [Candidate, Candidate] | null {
  // Array.sort é estável: em empate, mantém a ordem do cadastro como o app legado.
  const ordered = [...candidates].sort((a, b) => (counts[a.id] ?? 0) - (counts[b.id] ?? 0))

  for (const first of ordered.filter(candidate => candidate.person.pioneer)) {
    for (const second of ordered) if (!pairRule(first.id, first.person, second.id, second.person)) return [first, second]
  }
  for (const first of candidates.filter(candidate => candidate.person.onlyWithId)) {
    const second = candidates.find(candidate => candidate.id === first.person.onlyWithId)
    if (second && !pairRule(first.id, first.person, second.id, second.person)) return [first, second]
  }
  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length; j += 1) {
      if (!pairRule(ordered[i].id, ordered[i].person, ordered[j].id, ordered[j].person)) return [ordered[i], ordered[j]]
    }
  }
  return null
}

export function analyzeCell(input: EscalaGenerationInput, date: string, time: string): { eligible: string[]; blocked: { id: string; rule: EscalaRule }[] } {
  const table = input.tables[input.localId]?.[input.month]
  const counts = monthlyCounts(input.tables, input.month, input.participants, input.localId)
  const day: DayState = { used: new Set(), slots: {} }
  for (const [rowDate, row] of Object.entries(table?.rows ?? {})) {
    for (const [slotTime, cell] of Object.entries(row.slots ?? {})) {
      if (rowDate === date && slotTime === time) continue
      addCellCount(counts, cell)
      if (rowDate !== date || (!cell.p1 && !cell.p2)) continue
      day.slots[slotTime] = cell
      if (cell.p1) day.used.add(cell.p1)
      if (cell.p2) day.used.add(cell.p2)
    }
  }
  const context = { date, dow: dateAtNoon(date).getDay(), time, month: input.month, localId: input.localId, step: Number(input.local.stepMinutes ?? input.local.intervalMin ?? 120) || 120 }
  const eligible: string[] = []
  const blocked: { id: string; rule: EscalaRule }[] = []
  for (const [id, person] of Object.entries(input.participants)) {
    const rule = personRule(id, person, context, input, counts, day)
    if (rule) blocked.push({ id, rule }); else eligible.push(id)
  }
  const byName = (a: string, b: string) => participantName(input.participants[a], a).localeCompare(participantName(input.participants[b], b), 'pt-BR')
  eligible.sort(byName)
  blocked.sort((a, b) => byName(a.id, b.id))
  return { eligible, blocked }
}

export function generateLocal(input: EscalaGenerationInput): GenerationResult {
  const slots = localSlots(input.local)
  const dates = activeDates(input.month, input.local.daysActive ?? [], input.exclusions)
  const counts = monthlyCounts(input.tables, input.month, input.participants, input.localId)
  const existing = input.tables[input.localId]?.[input.month]?.rows ?? {}
  for (const row of Object.values(existing)) for (const cell of Object.values(row.slots ?? {})) addCellCount(counts, cell)

  const rows: Record<string, EscalaRow> = {}
  const emptySlots: EmptySlot[] = []
  const summary = { total: 0, filled: 0, preserved: 0, blocked: 0, empty: 0 }
  for (const date of dates) {
    const dow = dateAtNoon(date).getDay()
    const existingSlots = existing[date]?.slots ?? {}
    const day: DayState = { used: new Set(), slots: {} }
    for (const [time, cell] of Object.entries(existingSlots)) {
      if (!cell.p1 && !cell.p2) continue
      day.slots[time] = { p1: cell.p1 || '', p2: cell.p2 || '' }
      if (cell.p1) day.used.add(cell.p1)
      if (cell.p2) day.used.add(cell.p2)
    }
    const rowSlots: Record<string, EscalaCell> = {}
    for (const time of slots) {
      summary.total += 1
      const previous = existingSlots[time]
      if (previous?.p1 || previous?.p2) {
        rowSlots[time] = { p1: previous.p1 || '', p2: previous.p2 || '' }
        summary.preserved += 1
        continue
      }
      if (isBlocked(input.blocks, input.month, input.localId, dow, time)) {
        rowSlots[time] = { p1: '', p2: '' }
        summary.blocked += 1
        emptySlots.push({ date, time, reason: 'bloqueado', candidates: [] })
        continue
      }
      const context = { date, dow, time, month: input.month, localId: input.localId, step: Number(input.local.stepMinutes ?? input.local.intervalMin ?? 120) || 120 }
      const candidates = Object.entries(input.participants)
        .filter(([id, person]) => personRule(id, person, context, input, counts, day) === null)
        .map(([id, person]) => ({ id, person }))
      const pair = choosePair(candidates, counts)
      if (!pair) {
        rowSlots[time] = { p1: '', p2: '' }
        summary.empty += 1
        emptySlots.push({ date, time, reason: candidates.length ? 'sem_par_valido' : 'sem_candidatos', candidates: candidates.map(candidate => candidate.id) })
        continue
      }
      rowSlots[time] = { p1: pair[0].id, p2: pair[1].id }
      counts[pair[0].id] = (counts[pair[0].id] ?? 0) + 1
      counts[pair[1].id] = (counts[pair[1].id] ?? 0) + 1
      day.used.add(pair[0].id); day.used.add(pair[1].id)
      day.slots[time] = rowSlots[time]
      summary.filled += 1
    }
    rows[date] = { dow, slots: rowSlots }
  }
  return { table: { slots, rows }, emptySlots, summary }
}

export function generateAll(input: Omit<EscalaGenerationInput, 'localId' | 'local'> & { locals: Record<string, EscalaLocal>; onlyLocalId?: string }): { tables: EscalaTables; results: Record<string, GenerationResult>; errors: string[] } {
  const errors: string[] = []
  if (!/^\d{4}-\d{2}$/.test(input.month)) errors.push('Período inválido')
  if (Object.keys(input.participants).filter(id => input.participants[id].active !== false).length < 2) errors.push('São necessárias pelo menos duas pessoas ativas')
  const ordered = Object.entries(input.locals)
    .filter(([id]) => !input.onlyLocalId || id === input.onlyLocalId)
    .sort((a, b) => Number(a[1].sortOrder ?? 0) - Number(b[1].sortOrder ?? 0))
  if (!ordered.length) errors.push('Nenhum local disponível para gerar')
  if (errors.length) return { tables: input.tables, results: {}, errors }

  let tables: EscalaTables = structuredClone(input.tables)
  const results: Record<string, GenerationResult> = {}
  for (const [localId, local] of ordered) {
    const result = generateLocal({ ...input, localId, local, tables })
    tables = { ...tables, [localId]: { ...(tables[localId] ?? {}), [input.month]: result.table } }
    results[localId] = result
  }
  return { tables, results, errors }
}

export function validatePair(input: EscalaGenerationInput, date: string, time: string, p1: string, p2: string): string[] {
  const errors: string[] = []
  if (Boolean(p1) !== Boolean(p2)) errors.push('A dupla está incompleta')
  if (p1 && !input.participants[p1]) errors.push('Primeira pessoa não encontrada')
  if (p2 && !input.participants[p2]) errors.push('Segunda pessoa não encontrada')
  if (p1 && p2) {
    const pairError = pairRule(p1, input.participants[p1], p2, input.participants[p2])
    if (pairError) errors.push(ESCALA_RULE_LABELS[pairError])
  }
  const analysis = analyzeCell(input, date, time)
  for (const id of [p1, p2].filter(Boolean)) {
    const blocked = analysis.blocked.find(item => item.id === id)
    if (blocked) errors.push(`${participantName(input.participants[id], id)}: ${ESCALA_RULE_LABELS[blocked.rule]}`)
  }
  return [...new Set(errors)]
}
