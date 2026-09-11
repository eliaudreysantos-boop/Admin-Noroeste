export type TalkType = 'discurso_local' | 'discurso_visitante' | 'saida_orador'
export type TalkStatus = 'por_definir' | 'por_confirmar' | 'confirmado'

export interface Speaker {
  nome?: string; name?: string; tipo?: string; telefone?: string
  temaIds?: string[]; pessoaId?: string; congregacaoId?: string
  origemNome?: string; aprovadoParaSaida?: boolean; podePresidir?: boolean
  sentinelaDirigente?: boolean; sentinelaSubstituto?: boolean
  ativo?: boolean
}
export interface Congregation {
  nome?: string; cidade?: string; tipo?: string; contato?: string; telefone?: string
  diaReuniao?: string; horario?: string; localizacao?: string; observacoes?: string
  ativa?: boolean; datasLivresAvisadasEm?: string
}
export interface Theme { numero?: number; titulo?: string; ativo?: boolean }
export interface Confirmation { status?: boolean; confirmadoEm?: string; whatsappAbertoEm?: string }
export interface Talk {
  data?: string; tipo?: string; status?: string; confirmacao?: Confirmation; reconfirmacao?: Confirmation
  oradorId?: string; oradorNome?: string
  temaId?: string; temaNumero?: number; temaTitulo?: string; congregacaoId?: string
  congregacaoOrigemId?: string; congregacaoOrigemNome?: string
  congregacaoDestinoId?: string; congregacaoDestinoNome?: string
  localCongregacaoId?: string; localCongregacaoNome?: string; updatedAt?: string
  horarioLocal?: string; intercambioAvisadoEm?: string
}

export function speakerName(speaker?: Speaker, fallback = ''): string {
  return String(speaker?.nome ?? speaker?.name ?? fallback).trim()
}
export function deriveStatus(talk: Talk): TalkStatus {
  if (talk.confirmacao && typeof talk.confirmacao.status === 'boolean') return talk.confirmacao.status ? 'confirmado' : 'por_confirmar'
  return talk.status === 'confirmado' || talk.status === 'por_confirmar' ? talk.status : 'por_definir'
}
export function confirmationPatch(status: TalkStatus, at: string): Pick<Talk, 'status' | 'confirmacao'> {
  return { status, confirmacao: { status: status === 'confirmado', confirmadoEm: status === 'confirmado' ? at : '' } }
}
export function congregationIdOf(talk: Talk): string {
  if (talk.tipo === 'saida_orador') return talk.congregacaoDestinoId ?? talk.congregacaoId ?? ''
  return talk.congregacaoOrigemId ?? talk.congregacaoId ?? ''
}
export function congregationNameOf(talk: Talk): string {
  if (talk.tipo === 'saida_orador') return talk.congregacaoDestinoNome ?? ''
  return talk.congregacaoOrigemNome ?? ''
}
export function occupiesLocalSlot(talk: Talk): boolean {
  return talk.tipo === 'discurso_local' || talk.tipo === 'discurso_visitante'
}
export function findDuplicate(talks: Record<string, Talk>, candidate: Talk, ignoredId = ''): string {
  return Object.entries(talks).find(([id, talk]) => id !== ignoredId && talk.data === candidate.data && talk.tipo === candidate.tipo)?.[0] ?? ''
}
export function eventBlocksLocal(events: Record<string, { data?: string; tipo?: string }>, date: string): boolean {
  const blocking = new Set(['congresso_assembleia', 'visita_superintendente', 'reuniao_especial', 'celebracao'])
  return Object.values(events).some(event => event.data === date && blocking.has(String(event.tipo)))
}
export function meetingDatesForMonth(month: string, weekendDow: number, excludedDates: string[] = [], events: Record<string, { data?: string; tipo?: string }> = {}): string[] {
  if (!/^\d{4}-\d{2}$/.test(month) || weekendDow < 0 || weekendDow > 6) return []
  const [year, monthNumber] = month.split('-').map(Number)
  const lastDay = new Date(year, monthNumber, 0).getDate()
  const excluded = new Set(excludedDates)
  const dates: string[] = []
  for (let day = 1; day <= lastDay; day += 1) {
    const date = new Date(year, monthNumber - 1, day)
    const iso = `${month}-${String(day).padStart(2, '0')}`
    if (date.getDay() === weekendDow && !excluded.has(iso) && !eventBlocksLocal(events, iso)) dates.push(iso)
  }
  return dates
}
export function missingLocalTalkDates(talks: Record<string, Talk>, dates: string[]): string[] {
  const occupied = new Set(Object.values(talks)
    .filter(talk => occupiesLocalSlot(talk) && Boolean(talk.data))
    .map(talk => talk.data!))
  return dates.filter(date => !occupied.has(date))
}
export function talkConflicts(talkId: string, talk: Talk, talks: Record<string, Talk>, taskMeetings: { date?: string; assignments?: Record<string, unknown> }[], speakers: Record<string, Speaker>): string[] {
  const errors: string[] = []
  if (!talk.data) errors.push('Data não informada')
  if (findDuplicate(talks, talk, talkId)) errors.push('Já existe programação deste tipo na data')
  const ids = [talk.oradorId].filter((id): id is string => Boolean(id))
  for (const other of Object.values(talks)) {
    if (other === talk || other.data !== talk.data) continue
    const otherIds = [other.oradorId]
    if (ids.some(id => otherIds.includes(id))) errors.push('Orador com outro discurso na mesma data')
  }
  for (const id of ids) {
    const personId = speakers[id]?.pessoaId
    if (personId && taskMeetings.some(meeting => meeting.date === talk.data && Object.values(meeting.assignments ?? {}).includes(personId))) errors.push(`${speakerName(speakers[id], id)} está na escala de Tarefas`)
  }
  return [...new Set(errors)]
}
export function allowedTheme(themeId: string, speaker: Speaker | undefined, themes: Record<string, Theme>): boolean {
  return Boolean(themeId && themes[themeId] && speaker?.temaIds?.includes(themeId))
}
export function themeHistory(talks: Record<string, Talk>, today: string): Record<string, { lastPerformed: string; future: string[] }> {
  const result: Record<string, { lastPerformed: string; future: string[] }> = {}
  for (const talk of Object.values(talks)) {
    if (!talk.temaId || !talk.data || talk.tipo === 'saida_orador') continue
    const item = result[talk.temaId] ?? { lastPerformed: '', future: [] }
    if (talk.data < today && deriveStatus(talk) === 'confirmado' && talk.data > item.lastPerformed) item.lastPerformed = talk.data
    if (talk.data >= today) item.future.push(talk.data)
    result[talk.temaId] = item
  }
  return result
}
export function needsReconfirmation(talk: Talk, today: string, days = 7): boolean {
  if (deriveStatus(talk) !== 'confirmado' || !talk.data || talk.data < today || talk.reconfirmacao?.status) return false
  const remaining = Math.round((new Date(`${talk.data}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 86_400_000)
  return remaining <= days
}

export function watchtowerIssues(speakers: Record<string, Speaker>): string[] {
  const eligible = Object.entries(speakers).filter(([, speaker]) => speaker.tipo !== 'visitante')
  const conductors = eligible.filter(([, speaker]) => speaker.sentinelaDirigente)
  const substitutes = eligible.filter(([, speaker]) => speaker.sentinelaSubstituto)
  const issues: string[] = []
  if (conductors.length !== 1) issues.push('Defina exatamente um dirigente local de A Sentinela')
  if (substitutes.length !== 1) issues.push('Defina exatamente um substituto local de A Sentinela')
  if (conductors[0]?.[0] && conductors[0][0] === substitutes[0]?.[0]) issues.push('Dirigente e substituto de A Sentinela devem ser pessoas diferentes')
  return issues
}

export function assignmentsForSpeaker(talks: Record<string, Talk>, speakerId: string, today: string): Array<[string, Talk]> {
  return Object.entries(talks)
    .filter(([, talk]) => Boolean(talk.data && talk.data >= today))
    .filter(([, talk]) => talk.oradorId === speakerId)
    .sort(([, a], [, b]) => String(a.data).localeCompare(String(b.data)))
}
