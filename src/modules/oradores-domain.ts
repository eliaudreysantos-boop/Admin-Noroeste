export type TalkType = 'discurso_local' | 'discurso_visitante' | 'saida_orador'
export type TalkStatus = 'por_definir' | 'por_confirmar' | 'confirmado' | 'desistencia'

export interface Speaker {
  nome?: string; name?: string; tipo?: string; funcao?: string; telefone?: string
  ativo?: boolean; temaIds?: string[]; pessoaId?: string; congregacaoId?: string
  origemNome?: string; aprovadoParaSaida?: boolean; podePresidir?: boolean
  sentinelaDirigente?: boolean; sentinelaSubstituto?: boolean
}
export interface Congregation {
  nome?: string; cidade?: string; tipo?: string; contato?: string; telefone?: string
  ativa?: boolean; diaReuniao?: string; horario?: string; localizacao?: string; observacoes?: string
}
export interface Theme { numero?: number; titulo?: string; ativo?: boolean }
export interface Confirmation { status?: boolean; confirmadoEm?: string }
export interface Talk {
  data?: string; tipo?: string; status?: string; confirmacao?: Confirmation; reconfirmacao?: Confirmation
  oradorId?: string; oradorNome?: string; oradorOriginalId?: string; oradorOriginalNome?: string
  substitutoId?: string; substitutoNome?: string; realizadoPorId?: string; realizadoPorNome?: string
  desistiu?: boolean; oradorSecundarioId?: string; oradorSecundarioNome?: string
  temaId?: string; temaNumero?: number; temaTitulo?: string; congregacaoId?: string
  congregacaoOrigemId?: string; congregacaoOrigemNome?: string
  congregacaoDestinoId?: string; congregacaoDestinoNome?: string
  localCongregacaoId?: string; localCongregacaoNome?: string; horarioLocal?: string
  avisadoEm?: string; observacoes?: string; updatedAt?: string
}

export function speakerName(speaker?: Speaker, fallback = ''): string {
  return String(speaker?.nome ?? speaker?.name ?? fallback).trim()
}
export function deriveStatus(talk: Talk): TalkStatus {
  if ((talk.desistiu || talk.status === 'desistencia') && !talk.substitutoId) return 'desistencia'
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
export function talkConflicts(talkId: string, talk: Talk, talks: Record<string, Talk>, taskMeetings: { date?: string; assignments?: Record<string, unknown> }[], speakers: Record<string, Speaker>): string[] {
  const errors: string[] = []
  if (!talk.data) errors.push('Data não informada')
  if (findDuplicate(talks, talk, talkId)) errors.push('Já existe programação deste tipo na data')
  const ids = [talk.oradorId, talk.oradorSecundarioId, talk.substitutoId].filter((id): id is string => Boolean(id))
  if (new Set(ids).size !== ids.length) errors.push('A mesma pessoa ocupa mais de uma posição')
  for (const other of Object.values(talks)) {
    if (other === talk || other.data !== talk.data) continue
    const otherIds = [other.oradorId, other.oradorSecundarioId, other.substitutoId]
    if (ids.some(id => otherIds.includes(id))) errors.push('Orador com outro discurso na mesma data')
  }
  for (const id of ids) {
    const personId = speakers[id]?.pessoaId
    if (personId && taskMeetings.some(meeting => meeting.date === talk.data && Object.values(meeting.assignments ?? {}).includes(personId))) errors.push(`${speakerName(speakers[id], id)} está na escala de Tarefas`)
  }
  return [...new Set(errors)]
}
export function allowedTheme(themeId: string, speaker: Speaker | undefined, themes: Record<string, Theme>): boolean {
  return Boolean(themeId && themes[themeId]?.ativo !== false && speaker?.temaIds?.includes(themeId))
}
export function themeHistory(talks: Record<string, Talk>, today: string): Record<string, { lastPerformed: string; future: string[] }> {
  const result: Record<string, { lastPerformed: string; future: string[] }> = {}
  for (const talk of Object.values(talks)) {
    if (!talk.temaId || !talk.data || talk.tipo === 'saida_orador' || deriveStatus(talk) === 'desistencia') continue
    const item = result[talk.temaId] ?? { lastPerformed: '', future: [] }
    if (talk.data < today && (talk.realizadoPorId || deriveStatus(talk) === 'confirmado') && talk.data > item.lastPerformed) item.lastPerformed = talk.data
    if (talk.data >= today) item.future.push(talk.data)
    result[talk.temaId] = item
  }
  return result
}
export function realizedSpeakerId(talk: Talk): string {
  if (deriveStatus(talk) === 'desistencia') return ''
  return talk.realizadoPorId ?? talk.substitutoId ?? talk.oradorId ?? ''
}
export function needsReconfirmation(talk: Talk, today: string, days = 7): boolean {
  if (deriveStatus(talk) !== 'confirmado' || !talk.data || talk.data < today || talk.reconfirmacao?.status) return false
  const remaining = Math.round((new Date(`${talk.data}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 86_400_000)
  return remaining <= days
}

export interface EmergencyCandidate { speakerId: string; themeIds: string[] }

export function emergencyCandidates(
  talkId: string,
  talk: Talk,
  talks: Record<string, Talk>,
  taskMeetings: { date?: string; assignments?: Record<string, unknown> }[],
  speakers: Record<string, Speaker>,
  themes: Record<string, Theme>,
  today: string,
  recentMonths = 6,
): EmergencyCandidate[] {
  const cutoffDate = new Date(`${today}T12:00:00`)
  cutoffDate.setMonth(cutoffDate.getMonth() - recentMonths)
  const cutoff = cutoffDate.toISOString().slice(0, 10)
  const history = themeHistory(talks, today)
  const otherTalks = Object.fromEntries(Object.entries(talks).filter(([id]) => id !== talkId))

  return Object.entries(speakers).flatMap(([speakerId, speaker]) => {
    if (speaker.ativo === false || speakerId === talk.oradorId) return []
    if (talk.tipo === 'discurso_visitante' && speaker.tipo !== 'visitante') return []
    if (talk.tipo !== 'discurso_visitante' && speaker.tipo === 'visitante') return []
    if (talk.tipo === 'saida_orador' && speaker.aprovadoParaSaida === false) return []
    const candidate = talk.oradorId
      ? { ...talk, substitutoId: speakerId, substitutoNome: speakerName(speaker, speakerId) }
      : { ...talk, oradorId: speakerId, oradorNome: speakerName(speaker, speakerId) }
    if (talkConflicts(talkId, candidate, otherTalks, taskMeetings, speakers).length) return []
    const themeIds = (speaker.temaIds ?? []).filter(themeId => {
      if (!allowedTheme(themeId, speaker, themes)) return false
      const usage = history[themeId]
      return !usage?.future.length && (!usage?.lastPerformed || usage.lastPerformed < cutoff)
    })
    return themeIds.length ? [{ speakerId, themeIds }] : []
  })
}
