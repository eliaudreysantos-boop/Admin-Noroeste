export type SpeakerSection = 's1' | 's2'
export type SpeakerKind = 'local' | 'visitante'
export type SpeakerRole = 'anciao' | 'servo_ministerial' | 'publicador'
export type TalkStatus = 'por_definir' | 'por_confirmar' | 'confirmado'
export type TalkKind = 'discurso_local' | 'discurso_visitante' | 'saida_orador'
export type SpeakerEventKind = 'informativo' | 'congresso_assembleia' | 'visita_superintendente' | 'reuniao_especial' | 'celebracao'

export interface Speaker {
  nome: string
  tipo: SpeakerKind
  funcao: SpeakerRole
  telefone: string
  ativo: boolean
  temaIds: string[]
  pessoaId?: string
  congregacaoId?: string
  origemNome?: string
  aprovadoParaSaida?: boolean
  podePresidir?: boolean
  sentinelaDirigente?: boolean
  sentinelaSubstituto?: boolean
  secao?: SpeakerSection
}

export interface TalkTheme { numero:number; titulo:string; ativo:boolean }

export interface SpeakerCongregation {
  nome: string
  cidade: string
  tipo: 'local' | 'visitante'
  ativa: boolean
  contato: string
  telefone: string
  diaReuniao: string
  horario: string
  localizacao: string
  observacoes: string
  secao?: SpeakerSection
}

export interface TalkSchedule {
  data: string
  tipo: TalkKind
  status: TalkStatus
  oradorId?: string
  oradorNome?: string
  oradorSecundarioId?: string
  oradorSecundarioNome?: string
  oradorSecundarioTipo?: string
  temaId?: string
  temaNumero?: number
  temaTitulo?: string
  congregacaoOrigemId?: string
  congregacaoOrigemNome?: string
  congregacaoDestinoId?: string
  congregacaoDestinoNome?: string
  localCongregacaoId?: string
  localCongregacaoNome?: string
  horarioLocal?: string
  confirmacao?: { status:boolean; confirmadoEm:string }
  reconfirmacao?: { status:boolean; confirmadoEm:string }
  avisadoEm?: string
  historicoCompartilhado?: boolean
  sentinelaAvisado?: boolean
  local?: string
  observacoes?: string
  updatedAt?: string
  secao?: SpeakerSection
}

export interface ThemeHistory { temaId:string; data:string; oradorId?:string; secao?:string; historicoCompartilhado?:boolean }
export function scheduleBaseForEdit(previous?:TalkSchedule):Partial<TalkSchedule> {
  const result={...previous}
  for(const key of ['oradorId','oradorNome','temaId','temaNumero','temaTitulo','oradorSecundarioId','oradorSecundarioNome','oradorSecundarioTipo','congregacaoDestinoId','congregacaoDestinoNome','congregacaoOrigemId','congregacaoOrigemNome','horarioLocal','observacoes'] as const) delete result[key]
  return result
}

export function isDuplicateSchedule(item:TalkSchedule, date:string, kind:TalkKind, speakerId:string, congregationId:string):boolean {
  if(item.data!==date || item.secao==='s1') return false
  if(kind==='saida_orador') return item.tipo===kind && item.oradorId===speakerId && scheduleCongregationId(item)===congregationId
  return item.tipo!=='saida_orador'
}

export function speakerLinkOptions(people:Record<string,{name?:string;active?:boolean;masterId?:string}>,selected:string):{value:string;label:string}[] {
  const options=Object.entries(people).filter(([id,p])=>p.active!==false||id===selected||p.masterId===selected).map(([id,p])=>({value:id,label:p.name||id}))
  if(selected&&!options.some(o=>o.value===selected)) options.unshift({value:selected,label:Object.values(people).find(p=>p.masterId===selected)?.name||'Vínculo atual (preservado)'})
  return options.sort((a,b)=>a.label.localeCompare(b.label,'pt-BR'))
}
export interface SpeakerEvent { data:string; titulo:string; descricao?:string; tipo:SpeakerEventKind; impactoTarefas?:{ bloqueiaReuniao?:boolean; tiposReuniao?:string[] } }

export interface SpeakersRoot {
  oradores?: Record<string, Speaker>
  temas?: Record<string, TalkTheme>
  congregacoes?: Record<string, SpeakerCongregation>
  programacao?: Record<string, TalkSchedule>
  historicoTemas?: Record<string, ThemeHistory>
}

export const TALK_KIND_LABEL: Record<TalkKind, string> = {
  discurso_local:'Discurso local', discurso_visitante:'Discurso visitante', saida_orador:'Saída de orador',
}
export const TALK_STATUS_LABEL: Record<TalkStatus, string> = {
  por_definir:'Por definir', por_confirmar:'A confirmar', confirmado:'Confirmado',
}
export const SPEAKER_ROLE_LABEL: Record<SpeakerRole, string> = {
  anciao:'Ancião', servo_ministerial:'Servo ministerial', publicador:'Publicador',
}
export const EVENT_KIND_LABEL: Record<SpeakerEventKind, string> = {
  informativo:'Informativo', congresso_assembleia:'Congresso / Assembleia', visita_superintendente:'Visita do superintendente', reuniao_especial:'Reunião especial', celebracao:'Celebração',
}

const row = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const text = (value: unknown): string => typeof value === 'string' ? value : ''
const bool = (value: unknown, fallback = false): boolean => typeof value === 'boolean' ? value : fallback
const stringArray = (value: unknown): string[] => Array.isArray(value) ? value.filter(item => typeof item === 'string') : Object.entries(row(value)).filter(([, enabled]) => enabled === true).map(([id]) => id)
const section = (value: unknown): SpeakerSection | undefined => value === 's1' || value === 's2' ? value : undefined

export function normalizeSpeakersRoot(value: unknown): SpeakersRoot {
  const source = row(value)
  const speakers = Object.fromEntries(Object.entries(row(source['oradores'])).map(([id, raw]) => {
    const item = row(raw), tipo = item['tipo'] === 'visitante' ? 'visitante' : 'local'
    const funcao = ['anciao','servo_ministerial','publicador'].includes(text(item['funcao'])) ? text(item['funcao']) as SpeakerRole : 'publicador'
    return [id, {
      nome:text(item['nome']), tipo, funcao, telefone:text(item['telefone']), ativo:bool(item['ativo'], true), temaIds:stringArray(item['temaIds']),
      ...(text(item['pessoaId']) ? { pessoaId:text(item['pessoaId']) } : {}), ...(text(item['congregacaoId']) ? { congregacaoId:text(item['congregacaoId']) } : {}),
      ...(text(item['origemNome']) ? { origemNome:text(item['origemNome']) } : {}), aprovadoParaSaida:bool(item['aprovadoParaSaida']), podePresidir:bool(item['podePresidir']),
      sentinelaDirigente:bool(item['sentinelaDirigente']), sentinelaSubstituto:bool(item['sentinelaSubstituto']), ...(section(item['secao']) ? { secao:section(item['secao']) } : {}),
    } satisfies Speaker]
  }))
  const themes = Object.fromEntries(Object.entries(row(source['temas'])).map(([id, raw]) => { const item=row(raw); return [id, { numero:Number(item['numero']) || 0, titulo:text(item['titulo']), ativo:bool(item['ativo'], true) } satisfies TalkTheme] }))
  const congregations = Object.fromEntries(Object.entries(row(source['congregacoes'])).map(([id, raw]) => { const item=row(raw); return [id, {
    nome:text(item['nome']), cidade:text(item['cidade']), tipo:item['tipo'] === 'local' ? 'local' : 'visitante', ativa:bool(item['ativa'], true), contato:text(item['contato']), telefone:text(item['telefone']), diaReuniao:text(item['diaReuniao']), horario:text(item['horario']), localizacao:text(item['localizacao']), observacoes:text(item['observacoes']), ...(section(item['secao']) ? { secao:section(item['secao']) } : {}),
  } satisfies SpeakerCongregation] }))
  const schedule = Object.fromEntries(Object.entries(row(source['programacao'])).map(([id, raw]) => { const item=row(raw), confirmation=row(item['confirmacao']), reconfirmation=row(item['reconfirmacao']); const kind = ['discurso_local','discurso_visitante','saida_orador'].includes(text(item['tipo'])) ? text(item['tipo']) as TalkKind : 'discurso_local'; const explicit = text(item['status']); const confirmed = confirmation['status'] === true || explicit === 'confirmado'; const status:TalkStatus = confirmed ? 'confirmado' : explicit === 'por_confirmar' ? 'por_confirmar' : 'por_definir'; return [id, {
    ...item, data:text(item['data']), tipo:kind, status, ...(section(item['secao']) ? { secao:section(item['secao']) } : {}),
    ...(Object.keys(confirmation).length ? { confirmacao:{ status:confirmation['status'] === true, confirmadoEm:text(confirmation['confirmadoEm']) } } : {}),
    ...(Object.keys(reconfirmation).length ? { reconfirmacao:{ status:reconfirmation['status'] === true, confirmadoEm:text(reconfirmation['confirmadoEm']) } } : {}),
  } as TalkSchedule] }))
  const history = Object.fromEntries(Object.entries(row(source['historicoTemas'])).map(([id, raw]) => { const item=row(raw); return [id, { temaId:text(item['temaId']), data:text(item['data']), ...(text(item['oradorId']) ? { oradorId:text(item['oradorId']) } : {}), ...(text(item['secao']) ? { secao:text(item['secao']) } : {}), historicoCompartilhado:bool(item['historicoCompartilhado']) } satisfies ThemeHistory] }))
  return { oradores:speakers, temas:themes, congregacoes:congregations, programacao:schedule, historicoTemas:history }
}

// Keep legacy records in storage; the single-section app operates on S2 only.
export function selectSecondSection(root: SpeakersRoot): SpeakersRoot {
  return {
    ...root,
    programacao:Object.fromEntries(Object.entries(root.programacao ?? {}).filter(([, item]) => item.secao !== 's1')),
  }
}

export function normalizeSpeakerEvents(value: unknown): Record<string, SpeakerEvent> {
  return Object.fromEntries(Object.entries(row(value)).map(([id, raw]) => { const item=row(raw), impact=row(item['impactoTarefas']); const kind = Object.prototype.hasOwnProperty.call(EVENT_KIND_LABEL, text(item['tipo'])) ? text(item['tipo']) as SpeakerEventKind : 'informativo'; return [id, { data:text(item['data']), titulo:text(item['titulo']), descricao:text(item['descricao']), tipo:kind, impactoTarefas:{ bloqueiaReuniao:bool(impact['bloqueiaReuniao']), tiposReuniao:stringArray(impact['tiposReuniao']) } } satisfies SpeakerEvent] }))
}

export function scheduleCongregationId(item: TalkSchedule): string { return item.tipo === 'saida_orador' ? item.congregacaoDestinoId ?? '' : item.congregacaoOrigemId ?? '' }
export function scheduleCongregationName(item: TalkSchedule): string { return item.tipo === 'saida_orador' ? item.congregacaoDestinoNome ?? '' : item.congregacaoOrigemNome ?? '' }
export function scheduleStatus(item: TalkSchedule): TalkStatus {
  if (item.confirmacao?.status || item.status === 'confirmado') return 'confirmado'
  if (!item.oradorId && !item.oradorNome) return 'por_definir'
  return item.status === 'por_definir' ? 'por_confirmar' : item.status
}

export function validIsoDate(value: string): boolean { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) }
export function phoneDigits(value: string): string { return value.replace(/\D/g, '').slice(0, 13) }
export function newSpeakerId(prefix: string): string { return `${prefix}-${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(1))[0]!.toString(36)}` }
export function monthBounds(month: string): { start:string; end:string } { const [year, number]=month.split('-').map(Number); return { start:`${month}-01`, end:new Date(Date.UTC(year!, number!, 0)).toISOString().slice(0,10) } }
export function formatSpeakerDate(value: string): string { if (!validIsoDate(value)) return value || 'Sem data'; return new Intl.DateTimeFormat('pt-BR', { weekday:'short', day:'2-digit', month:'2-digit', year:'numeric', timeZone:'UTC' }).format(new Date(`${value}T12:00:00Z`)).replace('.', '') }
export function sameMonth(value: string, month: string): boolean { return value.startsWith(`${month}-`) }

export interface SpeakerPendingItem { id:string; severity:'alta'|'media'|'baixa'; title:string; detail:string; screen:'programacao'|'oradores'|'congregacoes'|'temas'; recordId:string }
export function speakerPendingItems(root: SpeakersRoot, today = new Date().toISOString().slice(0,10)): SpeakerPendingItem[] {
  const limit = new Date(`${today}T12:00:00Z`); limit.setUTCDate(limit.getUTCDate()+90); const horizon=limit.toISOString().slice(0,10)
  const items:SpeakerPendingItem[]=[]
  Object.entries(root.programacao ?? {}).filter(([,item]) => item.data >= today && item.data <= horizon).forEach(([id,item]) => {
    const prefix = formatSpeakerDate(item.data)
    if (!item.oradorId && !item.oradorNome) items.push({ id:`schedule-speaker-${id}`, severity:'alta', title:'Sem orador', detail:prefix, screen:'programacao', recordId:id })
    if (!item.temaId && !item.temaTitulo) items.push({ id:`schedule-theme-${id}`, severity:'media', title:'Sem tema', detail:prefix, screen:'programacao', recordId:id })
    if (item.tipo !== 'discurso_local' && !scheduleCongregationId(item) && !scheduleCongregationName(item)) items.push({ id:`schedule-congregation-${id}`, severity:'media', title:'Sem congregação', detail:prefix, screen:'programacao', recordId:id })
    if (scheduleStatus(item) === 'por_confirmar') items.push({ id:`schedule-confirm-${id}`, severity:'media', title:'Aguardando confirmação', detail:`${prefix} · ${item.oradorNome ?? root.oradores?.[item.oradorId ?? '']?.nome ?? 'Orador'}`, screen:'programacao', recordId:id })
    const days=Math.ceil((Date.parse(`${item.data}T12:00:00Z`)-Date.parse(`${today}T12:00:00Z`))/86400000)
    if (days >= 0 && days <= 7 && scheduleStatus(item)==='confirmado' && !item.reconfirmacao?.status) items.push({ id:`schedule-reconfirm-${id}`, severity:'alta', title:'Reconfirmar — está perto', detail:`${prefix} · ${item.oradorNome ?? root.oradores?.[item.oradorId ?? '']?.nome ?? 'Orador'}`, screen:'programacao', recordId:id })
  })
  Object.entries(root.oradores ?? {}).filter(([,speaker]) => speaker.ativo).forEach(([id,speaker]) => {
    if(speaker.tipo==='local'&&!speaker.pessoaId) items.push({id:`speaker-link-${id}`,severity:'media',title:'Orador sem vínculo com Tarefas',detail:`${speaker.nome} · proteção contra conflitos indisponível`,screen:'oradores',recordId:id})
    if (!speaker.telefone || !speaker.temaIds.length) items.push({ id:`speaker-${id}`, severity:'baixa', title:'Cadastro incompleto', detail:`${speaker.nome} · ${!speaker.telefone ? 'sem telefone' : 'sem temas'}`, screen:'oradores', recordId:id })
  })
  Object.entries(root.congregacoes ?? {}).filter(([,congregation]) => congregation.ativa).forEach(([id,congregation]) => {
    if (!congregation.telefone || !congregation.horario || !congregation.diaReuniao) items.push({ id:`congregation-${id}`, severity:'baixa', title:'Congregação sem dados', detail:congregation.nome, screen:'congregacoes', recordId:id })
  })
  const severityOrder: Record<SpeakerPendingItem['severity'], number> = { alta:0, media:1, baixa:2 }
  return items.sort((a,b) => severityOrder[a.severity] - severityOrder[b.severity] || a.detail.localeCompare(b.detail,'pt-BR'))
}
