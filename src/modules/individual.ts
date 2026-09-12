import type { AppContext, RawRoot } from '../types'
import { agendaConfigRef, agendaDocumentsRef, escalaParticipantsRef, escalaPublishedMonthRef, escalaPublishedMonthsRef, escalaPubSnapshotsRef, escalaScalesRef, escalaTablesRef, get, limpezaPeriodosRef, pessoasRef, programacaoRef, runTransaction, secretarioRef, servicoCampoRef, tarefasCongregacoesRef, tarefasOradoresRef, tarefasPeopleRef, tarefasProgramacaoOradoresRef, tarefasScaleRef } from '../firebase'
import { moduleTitle } from '../ui/module-header'
import { agendaMessage, agendaToIcs, announcementMessage, boardMeetingDates, boardMeetingEvents, collectAgendaEvents, collectAnnouncementEvents, upcomingAgendaEvents, type AgendaEvent, type AgendaSource, type AgendaStatus, type AnnouncementEvent } from './individual-domain'
import { canonicalReportId, CATEGORY_LABELS, isClosedMonth, matchingReports, normalizePersonalReport, preparePersonalReportCommit, records, reportCreatedBy, reportLastEditedBy, serviceYearStart, type SecretaryPublisher, type SecretaryReport } from './secretario-domain'
import type { AgendaConfig, AgendaPublicDocument, AgendaSubscription, MasterPessoa } from '../types'

let ctx: AppContext | null = null
let data: RawRoot = {}
let month = new Date().toISOString().slice(0, 7)
let screen: 'agenda' | 'geral' | 'relatorio' | 'quadro' = 'agenda'
let agendaSource: AgendaSource | 'todas' = 'todas'
let agendaStatus: AgendaStatus | 'todos' = 'todos'
let generalSelectedDate = ''
let boardDocumentPeriod = month
let boardMeetingDate = ''
const boardSubscriptionModules = new Set<AgendaSource>(['tarefas', 'escala', 'oradores', 'programacao', 'servicoCampo'])
let subscriptionPersonId = ''
let loadingAssignments = true
let offlinePersonalEvents: AgendaEvent[] | null = null
let offlineAnnouncementEvents: AnnouncementEvent[] | null = null

const OFFLINE_CACHE_KEY = 'noroeste_agenda_offline_v2'
const REPORT_DRAFT_KEY = 'noroeste_relatorio_rascunho_v1'
const INSTALLATION_KEY = 'noroeste_agenda_installation_v1'
const SUBSCRIPTIONS_KEY = 'noroeste_agenda_subscriptions_v2'
const DAILY_SYNC_MS = 24 * 60 * 60 * 1000

interface PersonalReportDraft {
  competencia: string
  participou: boolean
  estudos: number
  horasCampo: number
  observacoes: string
}

interface OfflineAgendaCache {
  masterId: string
  savedAt: number
  person?: MasterPessoa
  events: AgendaEvent[]
  announcements: AnnouncementEvent[]
  secretary: Record<string, unknown>
  agenda: Record<string, unknown>
}

const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char] ?? char))
const labelDate = (date: string): string => date.split('-').reverse().join('/')
const sourceLabels: Record<AgendaSource, string> = { tarefas:'Tarefas', limpeza:'Limpeza', escala:'Escala TPL', oradores:'Oradores', programacao:'Vida e Ministério', servicoCampo:'Serviço de Campo' }
const documentSourceLabels: Record<AgendaPublicDocument['modulo'], string> = { limpeza:'Limpeza', oradores:'Oradores', programacao:'Vida e Ministério', servicoCampo:'Serviço de Campo', admin:'Admin' }
const fortalezaDate = (): string => new Intl.DateTimeFormat('en-CA', { timeZone:'America/Fortaleza', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date()).replace(/\//g, '-')

export default function mount(context: AppContext): void {
  ctx = context
  loadingAssignments = true
  offlinePersonalEvents = null
  offlineAnnouncementEvents = null
  const root = document.getElementById('appContent')
  if (!root) return
  root.innerHTML = '<div id="individualRoot"><p class="empty-state">Carregando sua agenda...</p></div>'
  const cached = standaloneAgenda() ? readOfflineCache(context.usuario.masterId ?? '') : null
  if (cached) {
    offlinePersonalEvents = cached.events
    offlineAnnouncementEvents = cached.announcements
    data = { master:{ pessoas:cached.person ? { [cached.masterId]:cached.person } : {} }, secretario:cached.secretary, agenda:cached.agenda } as RawRoot
    loadingAssignments = Date.now() - cached.savedAt >= DAILY_SYNC_MS
    render()
    if (!loadingAssignments) return
  }
  void load()
}

function standaloneAgenda(): boolean { return ctx?.uid.startsWith('agenda-') === true }
function offlineCacheKey(masterId: string): string { return `${OFFLINE_CACHE_KEY}:${masterId}` }

function readOfflineCache(masterId: string): OfflineAgendaCache | null {
  try {
    const cached = JSON.parse(localStorage.getItem(offlineCacheKey(masterId)) ?? 'null') as OfflineAgendaCache | null
    return cached?.masterId === masterId && Array.isArray(cached.events) && Array.isArray(cached.announcements) ? cached : null
  } catch { return null }
}

function saveOfflineCache(): void {
  const masterId = selectedMasterId()
  if (!standaloneAgenda() || !masterId) return
  const secretary = (data.secretario ?? {}) as Record<string, unknown>
  const ownPublishers = Object.fromEntries(Object.entries((secretary['publicadores'] ?? {}) as Record<string, SecretaryPublisher>).filter(([, item]) => item.masterId === masterId))
  const ownReports = Object.fromEntries(Object.entries((secretary['relatorios'] ?? {}) as Record<string, SecretaryReport>).filter(([, item]) => item.masterId === masterId))
  const agenda = agendaRoot()
  const publicAgenda = { config:agenda['config'] ?? {}, documentos:agenda['documentos'] ?? {} }
  const person = people()[masterId]
  const safePerson = person ? { name:person.name, active:person.active, sex:person.sex, role:person.role, whatsapp:'', limpeza:{ grupo:null } } satisfies MasterPessoa : undefined
  const snapshot: OfflineAgendaCache = {
    masterId, savedAt:Date.now(), person:safePerson,
    events:collectAgendaEvents(data, masterId), announcements:collectAnnouncementEvents(data),
    secretary:{ publicadores:ownPublishers, relatorios:ownReports, fechamentos:secretary['fechamentos'] ?? {} },
    agenda:publicAgenda,
  }
  try { localStorage.setItem(offlineCacheKey(masterId), JSON.stringify(snapshot)); offlinePersonalEvents = snapshot.events; offlineAnnouncementEvents = snapshot.announcements }
  catch { /* O app continua online-first se o dispositivo não aceitar o cache. */ }
}

async function load(): Promise<void> {
  const previousData = data
  let synchronized = false
  try {
    const readValue = async (reference: typeof pessoasRef): Promise<unknown> => {
      try { const snapshot = await get(reference); return snapshot.exists() ? snapshot.val() as unknown : undefined }
      catch { return undefined }
    }
    const masterPeople = await readValue(pessoasRef)
    if (!masterPeople || typeof masterPeople !== 'object') throw new Error('Pessoas indisponíveis')
    data = { master:{ pessoas:(masterPeople ?? {}) as Record<string, MasterPessoa> } } as RawRoot
    render()

    const references = [
      tarefasPeopleRef, tarefasScaleRef,
      tarefasOradoresRef, tarefasProgramacaoOradoresRef, tarefasCongregacoesRef,
      limpezaPeriodosRef, escalaParticipantsRef, escalaScalesRef, escalaTablesRef,
      escalaPublishedMonthRef, escalaPublishedMonthsRef, escalaPubSnapshotsRef,
      programacaoRef, secretarioRef, agendaConfigRef, agendaDocumentsRef, servicoCampoRef,
    ]
    const values = await Promise.all(references.map(readValue))
    const value = (index: number): unknown => values[index]
    data = {
      master:{ pessoas:(masterPeople ?? {}) as Record<string, MasterPessoa> },
      tarefas:{ people:value(0), scale:{ periods:value(1) }, discursos:{ oradores:value(2), programacao:value(3), congregacoes:value(4) } },
      limpeza:{ periodos:value(5) },
      escala:{ participants:value(6), scales:value(7), tables:value(8), publishedMonth:value(9), publishedMonths:value(10), publishedSnapshots:value(11) },
      programacao:value(12), secretario:value(13), agenda:{ config:value(14), documentos:value(15) }, servicoCampo:value(16),
    } as RawRoot
    synchronized = true
  }
  catch { data = previousData }
  loadingAssignments = false
  if (synchronized) saveOfflineCache()
  render()
}

function isAdmin(): boolean { return ctx?.usuario.apps.mestre === true }
function selectedMasterId(): string { return ctx?.usuario.masterId ?? (isAdmin() ? subscriptionPersonId : '') }
function personalEvents(): AgendaEvent[] { const masterId = selectedMasterId(); return offlinePersonalEvents ?? (masterId ? collectAgendaEvents(data, masterId) : []) }
function announcementEvents(): AnnouncementEvent[] { return offlineAnnouncementEvents ?? collectAnnouncementEvents(data) }
function monthEvents(): AgendaEvent[] { return personalEvents().filter(event => event.date.startsWith(month)).filter(event => agendaSource === 'todas' || event.source === agendaSource).filter(event => agendaStatus === 'todos' || event.status === agendaStatus) }
function agendaRoot(): Record<string, unknown> { return (data.agenda ?? {}) as Record<string, unknown> }
function agendaConfig(): AgendaConfig { return (agendaRoot()['config'] ?? {}) as AgendaConfig }
function installationId(): string {
  const current = localStorage.getItem(INSTALLATION_KEY) ?? ''
  if (/^[a-f0-9]{32,64}$/.test(current)) return current
  const created = randomToken()
  localStorage.setItem(INSTALLATION_KEY, created)
  return created
}
function subscriptions(): Record<string, AgendaSubscription> {
  try {
    const value = JSON.parse(localStorage.getItem(SUBSCRIPTIONS_KEY) ?? '{}') as Record<string, AgendaSubscription>
    return Object.fromEntries(Object.entries(value).filter(([token, item]) => /^[a-f0-9]{48}$/.test(token) && item.installationId === installationId()))
  } catch { return {} }
}
function saveSubscriptions(values: Record<string, AgendaSubscription>): void { localStorage.setItem(SUBSCRIPTIONS_KEY, JSON.stringify(values)) }
function documents(): AgendaPublicDocument[] { return Object.values((agendaRoot()['documentos'] ?? {}) as Record<string, AgendaPublicDocument>) }
function people(): Record<string, MasterPessoa> { return data.master?.pessoas ?? {} }
function ensureSelectedPerson(): void {
  if (ctx?.usuario.masterId) { subscriptionPersonId = ctx.usuario.masterId; return }
  if (!isAdmin() || (subscriptionPersonId && people()[subscriptionPersonId]?.active !== false)) return
  subscriptionPersonId = Object.entries(people()).filter(([, person]) => person.active !== false).sort(([, a], [, b]) => a.name.localeCompare(b.name, 'pt-BR'))[0]?.[0] ?? ''
}
function adminPersonPicker(): string {
  if (!isAdmin() || ctx?.usuario.masterId) return ''
  const options = Object.entries(people()).filter(([, person]) => person.active !== false).sort(([, a], [, b]) => a.name.localeCompare(b.name, 'pt-BR')).map(([id, person]) => `<option value="${esc(id)}" ${subscriptionPersonId === id ? 'selected' : ''}>${esc(person.name)}</option>`).join('')
  return `<div class="form-panel agenda-admin-person"><label class="form-field"><span>Visualizar pessoa</span><select id="adminAgendaPerson">${options}</select></label><p class="form-help">O Admin consulta a agenda pelo vínculo permanente. Lançamentos em nome da pessoa continuam no Secretário.</p></div>`
}
function bindAdminPersonPicker(): void { document.getElementById('adminAgendaPerson')?.addEventListener('change', event => { subscriptionPersonId = (event.target as HTMLSelectElement).value; render() }) }
function screenTabs(): string { return `<div class="program-period-modes agenda-screen-tabs" role="tablist" aria-label="Minha agenda" style="margin-bottom:12px"><button class="program-period-mode" type="button" data-agenda-screen="agenda" aria-pressed="${screen === 'agenda'}">Pessoal</button><button class="program-period-mode" type="button" data-agenda-screen="geral" aria-pressed="${screen === 'geral'}">Geral</button><button class="program-period-mode" type="button" data-agenda-screen="relatorio" aria-pressed="${screen === 'relatorio'}">Relatório</button><button class="program-period-mode" type="button" data-agenda-screen="quadro" aria-pressed="${screen === 'quadro'}">Quadro</button></div>` }
function bindScreenTabs(): void { document.querySelectorAll<HTMLButtonElement>('[data-agenda-screen]').forEach(button => button.addEventListener('click', () => { screen = button.dataset['agendaScreen'] as typeof screen; render() })) }

function render(): void {
  const root = document.getElementById('individualRoot')
  if (!root || !ctx) return
  ensureSelectedPerson()
  if (!selectedMasterId()) { root.innerHTML = `${moduleTitle('Minha agenda')}<div class="notice ${loadingAssignments ? '' : 'warning'}">${loadingAssignments ? 'Carregando pessoas e vínculos...' : 'Seu usuário ainda não está vinculado ao cadastro do Admin.'}</div>`; return }
  if (screen === 'relatorio') { renderReportScreen(root); return }
  if (screen === 'geral') { renderGeneralAgenda(root); return }
  if (screen === 'quadro') { renderBoard(root); return }
  const events = monthEvents(), [year, monthNumber] = month.split('-').map(Number)
  const firstDow = new Date(year, monthNumber - 1, 1).getDay(), totalDays = new Date(year, monthNumber, 0).getDate()
  const byDay = new Map<number, AgendaEvent[]>(); events.forEach(event => { const day = Number(event.date.slice(-2)); byDay.set(day, [...(byDay.get(day) ?? []), event]) })
  const calendar = [...Array(firstDow).fill(''), ...Array.from({ length:totalDays }, (_, index) => String(index + 1))]
  root.innerHTML = `${moduleTitle('Minha agenda')}${screenTabs()}${loadingAssignments ? '<div class="notice">Atualizando designações dos módulos...</div>' : ''}${adminPersonPicker()}
    <div class="agenda-toolbar"><button class="btn btn-ghost" id="agendaPrev" type="button" aria-label="Mês anterior">‹</button><input class="form-input" id="agendaMonth" type="month" value="${month}"><button class="btn btn-ghost" id="agendaNext" type="button" aria-label="Próximo mês">›</button></div>
    <div class="agenda-actions"><button class="btn btn-primary" id="agendaIcsMonth" type="button">Baixar mês</button><button class="btn btn-ghost" id="agendaIcsUpcoming" type="button">Baixar próximos</button><button class="btn btn-ghost" id="agendaShare" type="button">Compartilhar</button></div>
    <div class="module-form-grid agenda-filters"><label class="form-field"><span>Origem</span><select id="agendaSource"><option value="todas">Todas</option>${Object.entries(sourceLabels).map(([id, label]) => `<option value="${id}" ${agendaSource === id ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label><label class="form-field"><span>Status</span><select id="agendaStatus"><option value="todos">Todos</option><option value="futuro" ${agendaStatus === 'futuro' ? 'selected' : ''}>Futuro</option><option value="confirmacao-pendente" ${agendaStatus === 'confirmacao-pendente' ? 'selected' : ''}>Confirmação pendente</option><option value="alterado" ${agendaStatus === 'alterado' ? 'selected' : ''}>Alterado</option><option value="realizado" ${agendaStatus === 'realizado' ? 'selected' : ''}>Realizado</option></select></label></div>
    <div class="agenda-calendar"><div class="agenda-weekdays">${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(day => `<strong>${day}</strong>`).join('')}</div><div class="agenda-days">${calendar.map(day => day ? `<div class="agenda-day ${byDay.has(Number(day)) ? 'has-events' : ''}"><span>${day}</span>${(byDay.get(Number(day)) ?? []).slice(0, 3).map(event => `<i title="${esc(event.title)}"></i>`).join('')}</div>` : '<div class="agenda-day empty"></div>').join('')}</div></div>
    <div class="agenda-list">${events.map(event => `<article class="agenda-event"><time>${esc(labelDate(event.date))}${event.time ? ` · ${esc(event.time)}` : ''}</time><div><strong>${esc(event.title)}</strong><small><span class="agenda-source ${event.source}">${esc(sourceLabels[event.source])}</span> · ${esc(event.detail)}${event.location ? ` · ${esc(event.location)}` : ''}</small>${event.note ? `<p>${esc(event.note)}</p>` : ''}</div><span class="agenda-status ${event.status}">${esc(event.status.replace(/-/g, ' '))}</span></article>`).join('') || '<p class="empty-state">Nenhuma designação corresponde aos filtros.</p>'}</div>
    ${personalSubscriptionPanel()}`
  bind()
}

function moveMonth(delta: number): void { const [year, value] = month.split('-').map(Number), date = new Date(Date.UTC(year, value - 1 + delta, 1)); month = date.toISOString().slice(0, 7); render() }
function bind(): void {
  bindScreenTabs()
  bindAdminPersonPicker()
  document.getElementById('agendaPrev')?.addEventListener('click', () => moveMonth(-1))
  document.getElementById('agendaNext')?.addEventListener('click', () => moveMonth(1))
  document.getElementById('agendaMonth')?.addEventListener('change', event => { month = (event.target as HTMLInputElement).value || month; render() })
  document.getElementById('agendaSource')?.addEventListener('change', event => { agendaSource = (event.target as HTMLSelectElement).value as typeof agendaSource; render() })
  document.getElementById('agendaStatus')?.addEventListener('change', event => { agendaStatus = (event.target as HTMLSelectElement).value as typeof agendaStatus; render() })
  document.getElementById('agendaIcsMonth')?.addEventListener('click', () => downloadIcs(monthEvents(), `minha-agenda-${month}.ics`, 'Nenhuma designação disponível neste mês.'))
  document.getElementById('agendaIcsUpcoming')?.addEventListener('click', () => downloadIcs(upcomingAgendaEvents(personalEvents(), fortalezaDate()), 'minha-agenda-proximos-compromissos.ics', 'Nenhum compromisso futuro disponível.'))
  document.getElementById('agendaShare')?.addEventListener('click', openShare)
  bindPersonalSubscription()
}

function renderGeneralAgenda(root: HTMLElement): void {
  const events = announcementEvents().filter(event => event.date.startsWith(month)).filter(event => agendaSource === 'todas' || event.source === agendaSource).filter(event => agendaStatus === 'todos' || event.status === agendaStatus)
  const [year, monthNumber] = month.split('-').map(Number), firstDow = new Date(year, monthNumber - 1, 1).getDay(), totalDays = new Date(year, monthNumber, 0).getDate()
  const byDay = new Map<number, AnnouncementEvent[]>(); events.forEach(event => { const day = Number(event.date.slice(-2)); byDay.set(day, [...(byDay.get(day) ?? []), event]) })
  const calendar = [...Array(firstDow).fill(''), ...Array.from({ length:totalDays }, (_, index) => String(index + 1))]
  if (!generalSelectedDate.startsWith(month)) generalSelectedDate = events.find(event => event.date >= fortalezaDate())?.date ?? events[0]?.date ?? `${month}-01`
  const selectedEvents = events.filter(event => event.date === generalSelectedDate)
  root.innerHTML = `${moduleTitle('Minha agenda')}${screenTabs()}${loadingAssignments ? '<div class="notice">Atualizando designações dos módulos...</div>' : ''}
    <div class="agenda-toolbar"><button class="btn btn-ghost" id="generalPrev" type="button" aria-label="Mês anterior">‹</button><input class="form-input" id="generalMonth" type="month" value="${month}"><button class="btn btn-ghost" id="generalNext" type="button" aria-label="Próximo mês">›</button></div>
    <div class="agenda-actions"><button class="btn btn-ghost" id="generalIcsMonth" type="button">Baixar calendário</button></div>
    <div class="module-form-grid agenda-filters"><label class="form-field"><span>Origem</span><select id="generalSource"><option value="todas">Todas</option>${Object.entries(sourceLabels).map(([id, label]) => `<option value="${id}" ${agendaSource === id ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label><label class="form-field"><span>Status</span><select id="generalStatus"><option value="todos">Todos</option><option value="futuro" ${agendaStatus === 'futuro' ? 'selected' : ''}>Futuro</option><option value="confirmacao-pendente" ${agendaStatus === 'confirmacao-pendente' ? 'selected' : ''}>Confirmação pendente</option><option value="alterado" ${agendaStatus === 'alterado' ? 'selected' : ''}>Alterado</option><option value="realizado" ${agendaStatus === 'realizado' ? 'selected' : ''}>Realizado</option></select></label></div>
    <div class="agenda-calendar"><div class="agenda-weekdays">${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(day => `<strong>${day}</strong>`).join('')}</div><div class="agenda-days">${calendar.map(day => day ? `<button class="agenda-day agenda-day-button ${byDay.has(Number(day)) ? 'has-events' : ''} ${generalSelectedDate === `${month}-${day.padStart(2, '0')}` ? 'selected' : ''}" type="button" data-general-date="${month}-${day.padStart(2, '0')}" aria-label="Ver designações de ${day}/${monthNumber}"><span>${day}</span>${(byDay.get(Number(day)) ?? []).slice(0, 4).map(event => `<i title="${esc(event.title)}"></i>`).join('')}</button>` : '<div class="agenda-day empty"></div>').join('')}</div></div>
    <div class="agenda-selected-day"><strong>${esc(labelDate(generalSelectedDate))}</strong><span>${selectedEvents.length} item(ns)</span></div>
    <div class="agenda-list">${selectedEvents.map(event => `<article class="agenda-event"><time>${event.time ? esc(event.time) : 'Dia inteiro'}</time><div><strong>${esc(event.title)}</strong><small><span class="agenda-source ${event.source}">${esc(sourceLabels[event.source])}</span> · ${esc(event.detail)}${event.location ? ` · ${esc(event.location)}` : ''}</small><p>${esc(event.people.join(', '))}</p></div><span class="agenda-status ${event.status}">${esc(event.status.replace(/-/g, ' '))}</span></article>`).join('') || '<p class="empty-state">Nenhuma designação nesta data.</p>'}</div>`
  bindScreenTabs()
  document.getElementById('generalPrev')?.addEventListener('click', () => moveMonth(-1))
  document.getElementById('generalNext')?.addEventListener('click', () => moveMonth(1))
  document.getElementById('generalMonth')?.addEventListener('change', event => { month = (event.target as HTMLInputElement).value || month; render() })
  document.getElementById('generalSource')?.addEventListener('change', event => { agendaSource = (event.target as HTMLSelectElement).value as typeof agendaSource; render() })
  document.getElementById('generalStatus')?.addEventListener('change', event => { agendaStatus = (event.target as HTMLSelectElement).value as typeof agendaStatus; render() })
  document.getElementById('generalIcsMonth')?.addEventListener('click', () => downloadBoardIcs(events))
  document.querySelectorAll<HTMLButtonElement>('[data-general-date]').forEach(button => button.addEventListener('click', () => { generalSelectedDate = button.dataset['generalDate'] ?? generalSelectedDate; render() }))
}

function feedUrl(token: string): string {
  return `${window.location.origin}/.netlify/functions/calendar?token=${encodeURIComponent(token)}`
}

function webcalUrl(token: string): string {
  return feedUrl(token).replace(/^https?:/, 'webcal:')
}

function personalSubscriptionPanel(): string {
  const current = Object.values(subscriptions()).find(item => item.tipo === 'pessoal' && item.masterId === subscriptionPersonId && item.ativo)
  return `<details class="form-panel agenda-subscription"><summary>Assinatura atualizável do calendário</summary><div style="margin-top:12px">${current ? `<div class="notice">Link ativo desde ${esc(labelDate(current.criadoEm.slice(0, 10)))}.</div><div class="agenda-actions"><button class="btn btn-primary" id="copyPersonalSubscription" type="button">Copiar link</button><a class="btn btn-ghost" href="${esc(webcalUrl(current.token))}">Assinar calendário</a><button class="btn btn-danger" id="revokePersonalSubscription" type="button">Revogar</button></div>` : '<button class="btn btn-primary" id="createPersonalSubscription" type="button">Gerar link de assinatura</button>'}<p class="form-help">A assinatura se atualiza no calendário externo. Os botões acima de download geram apenas um arquivo pontual.</p></div></details>`
}

function randomToken(): string {
  const bytes = new Uint8Array(24); crypto.getRandomValues(bytes)
  return Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

async function createSubscription(item: Omit<AgendaSubscription, 'token' | 'ativo' | 'criadoEm'>): Promise<void> {
  const response = await fetch('/.netlify/functions/calendar-subscriptions', {
    method:'POST', headers:{ 'content-type':'application/json' },
    body:JSON.stringify({ ...item, installationId:installationId() }),
  })
  if (!response.ok) throw new Error('Não foi possível criar a assinatura.')
  const record = await response.json() as AgendaSubscription
  const current = subscriptions(); current[record.token] = record; saveSubscriptions(current)
}

async function revokeSubscription(token: string): Promise<void> {
  const response = await fetch('/.netlify/functions/calendar-subscriptions', {
    method:'DELETE', headers:{ 'content-type':'application/json' },
    body:JSON.stringify({ token, installationId:installationId() }),
  })
  if (!response.ok) throw new Error('Não foi possível revogar a assinatura.')
  const current = subscriptions(); delete current[token]; saveSubscriptions(current)
}

async function updateBoardSubscription(token: string, modulos: AgendaSource[]): Promise<AgendaSubscription> {
  const response = await fetch('/.netlify/functions/calendar-subscriptions', {
    method:'PATCH', headers:{ 'content-type':'application/json' },
    body:JSON.stringify({ token, installationId:installationId(), modulos }),
  })
  if (!response.ok) throw new Error('Não foi possível atualizar a assinatura.')
  const record = await response.json() as AgendaSubscription
  const current = subscriptions(); current[token] = record; saveSubscriptions(current)
  return record
}

function bindPersonalSubscription(): void {
  document.getElementById('createPersonalSubscription')?.addEventListener('click', async () => { try { await createSubscription({ tipo:'pessoal', masterId:subscriptionPersonId }); render() } catch { alert('Não foi possível gerar o link de assinatura.') } })
  const current = Object.values(subscriptions()).find(item => item.tipo === 'pessoal' && item.masterId === subscriptionPersonId && item.ativo)
  document.getElementById('copyPersonalSubscription')?.addEventListener('click', async () => { if (current) await navigator.clipboard.writeText(feedUrl(current.token)) })
  document.getElementById('revokePersonalSubscription')?.addEventListener('click', async () => { if (!current || !confirm('Revogar este link de assinatura?')) return; try { await revokeSubscription(current.token); render() } catch { alert('Não foi possível revogar o link.') } })
}

function renderReportScreen(root: HTMLElement): void {
  const masterId = selectedMasterId(), secretary = (data.secretario ?? {}) as Record<string, unknown>, publisher = Object.values((secretary['publicadores'] ?? {}) as Record<string, SecretaryPublisher>).find(item => item.masterId === masterId && item.ativo)
  const allReports = (secretary['relatorios'] ?? {}) as Record<string, SecretaryReport>, reports = Object.values(allReports).filter(report => report.masterId === masterId)
  const year = serviceYearStart(month), start = `${year}-09`, end = `${year + 1}-08`
  const serviceReports = reports.filter(report => { const competence = String(report['competencia'] ?? ''); return competence >= start && competence <= end })
  const studies = serviceReports.reduce((sum, report) => sum + (Number(report['estudos']) || 0), 0)
  const regularHours = serviceReports.reduce((sum, report) => sum + (Number(report.horasCampo) || 0), 0)
  const pioneerProgress = publisher?.categoria === 'pioneiro_regular' ? `<div><strong>${regularHours}/600</strong><span>Horas no ano</span></div>` : ''
  const viewingAsAdmin = isAdmin() && !ctx!.usuario.masterId, current = matchingReports(allReports, masterId, month)[0]?.[1], closed = isClosedMonth(month, secretary['fechamentos'])
  const state = current ? reportPresentation(current, closed) : null
  const reportAction = !publisher ? '<div class="notice warning">Este cadastro ainda não foi vinculado como publicador pelo secretário.</div>'
    : viewingAsAdmin ? '<div class="notice">Use o módulo Secretário para lançar ou ajustar o relatório desta pessoa.</div>'
      : state ? `<div class="notice"><strong>${esc(state.label)}</strong><br>Este mês já possui um relatório oficial e está bloqueado para edição pela pessoa.</div>`
        : closed ? '<div class="notice warning">Esta competência foi fechada pelo secretário.</div>'
          : `<button class="btn btn-primary" id="openPersonalReport" type="button">${readReportDraft(masterId, month) ? 'Continuar rascunho' : 'Preencher relatório'}</button>`
  root.innerHTML = `${moduleTitle('Minha agenda')}${screenTabs()}${loadingAssignments ? '<div class="notice">Atualizando dados dos módulos...</div>' : ''}${adminPersonPicker()}<div class="agenda-toolbar"><button class="btn btn-ghost" id="reportPrev" type="button" aria-label="Mês anterior">‹</button><input class="form-input" id="reportMonth" type="month" value="${month}"><button class="btn btn-ghost" id="reportNext" type="button" aria-label="Próximo mês">›</button></div><div class="program-summary"><div><strong>${serviceReports.length}</strong><span>Relatórios no ano</span></div><div><strong>${studies}</strong><span>Estudos bíblicos</span></div>${pioneerProgress}<div><strong>${year}/${String(year + 1).slice(-2)}</strong><span>Ano de serviço</span></div></div><div class="form-panel"><h3 style="margin-top:0">Relatório de serviço</h3><p class="form-help">${publisher ? `${esc(CATEGORY_LABELS[publisher.categoria])}. ${viewingAsAdmin ? 'Consulta administrativa do ano de serviço.' : 'O rascunho fica somente neste aparelho até você confirmar o envio.'}` : 'Aguarde o vínculo do cadastro pelo secretário.'}</p>${reportAction}</div><div class="module-option-list">${serviceReports.sort((a, b) => String(b.competencia).localeCompare(String(a.competencia))).map(report => { const presentation = reportPresentation(report, isClosedMonth(String(report.competencia), secretary['fechamentos'])); return `<div class="agenda-event"><time>${esc(String(report.competencia))}</time><div><strong>${report.participou === false ? 'Não participou' : 'Participou no ministério'}</strong><small>${Number(report.estudos) || 0} estudo(s) bíblico(s)${report.horasCampo ? ` · ${report.horasCampo} hora(s)` : ''} · ${esc(presentation.label)}</small></div><span class="agenda-status ${presentation.style}">${esc(presentation.badge)}</span></div>` }).join('') || '<p class="empty-state">Nenhum relatório neste ano de serviço.</p>'}</div>`
  bindScreenTabs(); bindAdminPersonPicker()
  document.getElementById('reportPrev')?.addEventListener('click', () => moveMonth(-1))
  document.getElementById('reportNext')?.addEventListener('click', () => moveMonth(1))
  document.getElementById('reportMonth')?.addEventListener('change', event => { month = (event.target as HTMLInputElement).value || month; render() })
  document.getElementById('openPersonalReport')?.addEventListener('click', openReport)
}

function reportPresentation(report: SecretaryReport, closed: boolean): { label: string; badge: string; style: string } {
  if (closed || report.status === 'fechado') return { label:'Mês fechado', badge:'Fechado', style:'realizado' }
  const created = reportCreatedBy(report), edited = reportLastEditedBy(report)
  if (created === 'pessoa' && edited === 'secretario') return { label:'Enviado por você · ajustado pelo Secretário', badge:'Ajustado', style:'alterado' }
  if (created === 'pessoa') return { label:'Enviado por você', badge:'Enviado', style:'realizado' }
  return { label:'Registrado pelo Secretário', badge:'Secretário', style:'alterado' }
}

function reportDraftKey(masterId: string, competence: string): string { return `${REPORT_DRAFT_KEY}:${masterId}:${competence}` }
function readReportDraft(masterId: string, competence: string): PersonalReportDraft | null {
  try {
    const value = JSON.parse(localStorage.getItem(reportDraftKey(masterId, competence)) ?? 'null') as PersonalReportDraft | null
    return value?.competencia === competence ? value : null
  } catch { return null }
}
function saveReportDraft(masterId: string, draft: PersonalReportDraft): void { localStorage.setItem(reportDraftKey(masterId, draft.competencia), JSON.stringify(draft)) }
function removeReportDraft(masterId: string, competence: string): void { localStorage.removeItem(reportDraftKey(masterId, competence)) }

function renderBoard(root: HTMLElement): void {
  const allEvents = announcementEvents()
  const meetingDates = boardMeetingDates(allEvents, fortalezaDate())
  if (!meetingDates.some(item => item.date === boardMeetingDate)) boardMeetingDate = meetingDates[0]?.date ?? ''
  const selectedMeeting = meetingDates.find(item => item.date === boardMeetingDate)
  const meetingEvents = boardMeetingEvents(allEvents, selectedMeeting)
  const allDocuments = documents().sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)), periods = [...new Set(allDocuments.map(item => item.periodo))].sort((a, b) => b.localeCompare(a))
  if (!periods.includes(boardDocumentPeriod)) boardDocumentPeriod = periods[0] ?? month
  const visibleDocuments = allDocuments.filter(item => item.periodo === boardDocumentPeriod)
  root.innerHTML = `${moduleTitle('Minha agenda')}${screenTabs()}${loadingAssignments ? '<div class="notice">Atualizando designações dos módulos...</div>' : ''}
    <div class="agenda-toolbar"><button class="btn btn-ghost" id="boardPrev" type="button" aria-label="Mês anterior">‹</button><input class="form-input" id="boardMonth" type="month" value="${month}"><button class="btn btn-ghost" id="boardNext" type="button" aria-label="Próximo mês">›</button></div>
    <div class="agenda-board-sections">
      <details class="form-panel agenda-board-card"><summary><strong>Dados das reuniões</strong><span>Texto por data</span></summary><div class="agenda-board-body"><label class="form-field"><span>Reunião</span><select id="boardMeetingDate">${meetingDates.map(item => `<option value="${esc(item.date)}" ${item.date === boardMeetingDate ? 'selected' : ''}>${esc(labelDate(item.date))} · ${item.kind === 'midweek' ? 'Meio de semana' : 'Fim de semana'}</option>`).join('') || '<option value="">Nenhuma reunião futura</option>'}</select></label><textarea id="boardInlineDraft" class="form-input" rows="12" maxlength="4000">${esc(announcementMessage(meetingEvents))}</textarea><div class="agenda-actions"><button class="btn btn-ghost" id="boardInlineCopy" type="button">Copiar texto</button><button class="btn btn-primary" id="boardWhatsapp" type="button">Abrir WhatsApp</button></div><p class="form-help">${agendaConfig().quadroWhatsAppLink ? 'O texto será copiado e o grupo configurado no Admin será aberto.' : 'Nenhum grupo foi configurado no Admin; o seletor comum do WhatsApp será aberto.'}</p></div></details>
      <details class="form-panel agenda-board-card"><summary><strong>Arquivos publicados</strong><span>${allDocuments.length} arquivo(s)</span></summary><div class="agenda-board-body"><label class="form-field"><span>Período</span><select id="boardDocumentPeriod">${periods.map(period => `<option value="${esc(period)}" ${period === boardDocumentPeriod ? 'selected' : ''}>${esc(period)}</option>`).join('') || `<option value="${esc(month)}">${esc(month)}</option>`}</select></label><div class="agenda-document-list">${visibleDocuments.map(item => `<a class="agenda-document" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer"><span><strong>${esc(item.nome)}</strong><small>${esc(documentSourceLabels[item.modulo] ?? item.modulo)} · publicado em ${esc(labelDate(item.criadoEm.slice(0, 10)))}</small></span><b>Baixar PDF</b></a>`).join('') || '<p class="empty-state">Nenhum PDF publicado neste período.</p>'}</div></div></details>
      ${boardSubscriptionPanel()}
    </div>`
  bindScreenTabs()
  document.getElementById('boardPrev')?.addEventListener('click', () => moveMonth(-1))
  document.getElementById('boardNext')?.addEventListener('click', () => moveMonth(1))
  document.getElementById('boardMonth')?.addEventListener('change', event => { month = (event.target as HTMLInputElement).value || month; render() })
  document.getElementById('boardMeetingDate')?.addEventListener('change', event => { boardMeetingDate = (event.target as HTMLSelectElement).value; render() })
  document.getElementById('boardDocumentPeriod')?.addEventListener('change', event => { boardDocumentPeriod = (event.target as HTMLSelectElement).value; render() })
  document.getElementById('boardInlineCopy')?.addEventListener('click', () => void navigator.clipboard.writeText((document.getElementById('boardInlineDraft') as HTMLTextAreaElement).value))
  document.getElementById('boardWhatsapp')?.addEventListener('click', () => openBoardWhatsapp((document.getElementById('boardInlineDraft') as HTMLTextAreaElement).value))
  bindBoardSubscription()
}

function boardReminderOptions(): Partial<Record<AgendaSource, string[]>> {
  const values = agendaConfig().icsReminders?.quadro ?? []
  return Object.fromEntries(Object.keys(sourceLabels).map(source => [source, source === 'servicoCampo' ? [] : values])) as Partial<Record<AgendaSource, string[]>>
}

function downloadBoardIcs(events: AgendaEvent[]): void {
  if (!events.length) { alert('Nenhuma designação disponível neste mês.'); return }
  const blob = new Blob([agendaToIcs(events, new Date().toISOString(), { reminders:boardReminderOptions(), calendarName:'Quadro de anúncios Noroeste', namespace:'noroeste-quadro' })], { type:'text/calendar;charset=utf-8' }), link = document.createElement('a')
  link.href = URL.createObjectURL(blob); link.download = `quadro-anuncios-${month}.ics`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}

function boardSubscriptionPanel(): string {
  const current = Object.values(subscriptions()).find(item => item.tipo === 'quadro' && item.ativo)
  const selected = current?.modulos?.filter(module => module !== 'quadro') as AgendaSource[] | undefined
  if (selected?.length) { boardSubscriptionModules.clear(); selected.forEach(module => boardSubscriptionModules.add(module)) }
  const checks = (Object.entries(sourceLabels) as [AgendaSource, string][]).filter(([id]) => id !== 'limpeza').map(([id, label]) => `<label class="agenda-module-check"><input type="checkbox" data-board-module="${id}" ${boardSubscriptionModules.has(id) ? 'checked' : ''}> ${esc(label)}</label>`).join('')
  return `<details class="form-panel agenda-board-card"><summary><strong>Assinar o quadro</strong><span>${current ? 'Link ativo' : 'Calendário atualizável'}</span></summary><div class="agenda-board-body"><div class="agenda-module-options">${checks}</div>${current ? `<div class="notice">Esta assinatura recebe automaticamente os módulos selecionados.</div><div class="agenda-actions"><button class="btn btn-primary" id="copyBoardSubscription" type="button">Copiar link</button><a class="btn btn-ghost" href="${esc(webcalUrl(current.token))}">Assinar calendário</a><button class="btn btn-danger" id="revokeBoardSubscription" type="button">Revogar</button></div>` : '<button class="btn btn-primary" id="createBoardSubscription" type="button">Gerar link de assinatura</button>'}<p class="form-help">O link contém um token revogável e não expõe o identificador de nenhuma pessoa.</p></div></details>`
}

function bindBoardSubscription(): void {
  const current = Object.values(subscriptions()).find(item => item.tipo === 'quadro' && item.ativo)
  document.querySelectorAll<HTMLInputElement>('[data-board-module]').forEach(input => input.addEventListener('change', async () => {
    const source = input.dataset['boardModule'] as AgendaSource
    input.checked ? boardSubscriptionModules.add(source) : boardSubscriptionModules.delete(source)
    if (!current) return
    if (!boardSubscriptionModules.size) { input.checked = true; boardSubscriptionModules.add(source); alert('A assinatura precisa manter ao menos um módulo.'); return }
    const modulos = [...boardSubscriptionModules]
    try { Object.assign(current, await updateBoardSubscription(current.token, modulos)) } catch { input.checked = !input.checked; input.checked ? boardSubscriptionModules.add(source) : boardSubscriptionModules.delete(source); alert('Não foi possível atualizar os módulos da assinatura.') }
  }))
  document.getElementById('createBoardSubscription')?.addEventListener('click', async () => {
    if (!boardSubscriptionModules.size) { alert('Selecione ao menos um módulo.'); return }
    try { await createSubscription({ tipo:'quadro', modulos:[...boardSubscriptionModules] }); render() } catch { alert('Não foi possível gerar o link de assinatura.') }
  })
  document.getElementById('copyBoardSubscription')?.addEventListener('click', async () => { if (current) await navigator.clipboard.writeText(feedUrl(current.token)) })
  document.getElementById('revokeBoardSubscription')?.addEventListener('click', async () => { if (!current || !confirm('Revogar esta assinatura do quadro?')) return; try { await revokeSubscription(current.token); render() } catch { alert('Não foi possível revogar o link.') } })
}

function downloadIcs(events: AgendaEvent[], filename: string, emptyMessage: string): void {
  if (!events.length) { alert(emptyMessage); return }
  const blob = new Blob([agendaToIcs(events, new Date().toISOString(), { reminders:agendaConfig().icsReminders, calendarName:'Minha agenda Noroeste' })], { type:'text/calendar;charset=utf-8' }), link = document.createElement('a')
  link.href = URL.createObjectURL(blob); link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}

function openShare(): void {
  const overlay = document.createElement('div'); overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal"><h2>Compartilhar agenda</h2><textarea id="agendaDraft" class="form-input" rows="10" maxlength="2000">${esc(agendaMessage(monthEvents()))}</textarea><div class="secretary-actions"><button class="btn btn-ghost" id="agendaCopy">Copiar</button><button class="btn btn-primary" id="agendaWhatsapp">Abrir WhatsApp</button><button class="btn btn-ghost" id="agendaClose">Fechar</button></div></div>`
  document.body.appendChild(overlay)
  document.getElementById('agendaClose')?.addEventListener('click', () => overlay.remove())
  document.getElementById('agendaCopy')?.addEventListener('click', () => void navigator.clipboard.writeText((document.getElementById('agendaDraft') as HTMLTextAreaElement).value))
  document.getElementById('agendaWhatsapp')?.addEventListener('click', () => window.open(`https://wa.me/?text=${encodeURIComponent((document.getElementById('agendaDraft') as HTMLTextAreaElement).value)}`, '_blank', 'noopener,noreferrer'))
}

async function openBoardWhatsapp(message: string): Promise<void> {
  const groupLink = agendaConfig().quadroWhatsAppLink?.trim()
  if (groupLink) {
    try { await navigator.clipboard.writeText(message) } catch { /* O grupo ainda pode ser aberto sem a cópia automática. */ }
    window.open(groupLink, '_blank', 'noopener,noreferrer')
    return
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
}

function openReport(): void {
  const masterId = selectedMasterId()
  if (!ctx || !masterId || (isAdmin() && !ctx.usuario.masterId)) return
  const secretary = (data.secretario ?? {}) as Record<string, unknown>, publisher = Object.values((secretary['publicadores'] ?? {}) as Record<string, SecretaryPublisher>).find(item => item.masterId === masterId && item.ativo)
  if (!publisher) { alert('Seu cadastro ainda não foi vinculado pelo secretário.'); return }
  if (isClosedMonth(month, secretary['fechamentos'])) { alert('Esta competência já foi fechada pelo secretário e não pode mais ser alterada.'); return }
  const existing = matchingReports((secretary['relatorios'] ?? {}) as Record<string, SecretaryReport>, masterId, month)
  if (existing.length) { alert('Este mês já possui um relatório oficial e está bloqueado para edição.'); render(); return }
  const saved = readReportDraft(masterId, month), draft: PersonalReportDraft = saved ?? { competencia:month, participou:true, estudos:0, horasCampo:0, observacoes:'' }
  const day = new Date().getDate(), hasHours = ['pioneiro_auxiliar', 'pioneiro_regular'].includes(publisher.categoria), overlay = document.createElement('div'); overlay.className = 'modal-overlay'
  overlay.innerHTML = `<form class="modal" id="personalReport"><h2>Relatório pessoal</h2>${day > 10 ? '<div class="notice warning">O período normal de envio é do dia 1 ao dia 10.</div>' : ''}<div class="notice">O rascunho fica somente neste aparelho. Depois do envio confirmado, apenas o Secretário poderá corrigir este mês.</div><label class="form-field"><span>Competência</span><input class="form-input" type="month" value="${month}" disabled></label><label><input name="participou" type="checkbox" ${draft.participou ? 'checked' : ''}> Participei no ministério</label><label class="form-field"><span>Estudos bíblicos</span><input class="form-input" name="estudos" type="number" min="0" value="${draft.estudos}"></label>${hasHours ? `<label class="form-field"><span>Horas no mês</span><input class="form-input" name="horasCampo" type="number" min="0" step="0.1" value="${draft.horasCampo}"></label>` : ''}<label class="form-field"><span>Observação</span><textarea class="form-input" name="observacoes" maxlength="250">${esc(draft.observacoes)}</textarea></label><div class="secretary-actions"><button class="btn btn-ghost" id="reportCancel" type="button">Fechar</button><button class="btn btn-primary" id="reportSubmit" type="submit">Enviar relatório</button></div></form>`
  document.body.appendChild(overlay)
  const form = document.getElementById('personalReport') as HTMLFormElement, cancel = document.getElementById('reportCancel') as HTMLButtonElement, submit = document.getElementById('reportSubmit') as HTMLButtonElement
  let timer: ReturnType<typeof setInterval> | null = null
  const currentDraft = (): PersonalReportDraft => { const values = new FormData(form); return { competencia:month, participou:values.get('participou') === 'on', estudos:Math.max(0, Number(values.get('estudos')) || 0), horasCampo:Math.max(0, Number(values.get('horasCampo')) || 0), observacoes:String(values.get('observacoes') ?? '').trim().slice(0, 250) } }
  const setFormDisabled = (disabled: boolean): void => form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[name], textarea[name]').forEach(input => { input.disabled = disabled })
  const stopCountdown = (): void => { if (timer) clearInterval(timer); timer = null; setFormDisabled(false); cancel.textContent = 'Fechar'; submit.disabled = false; submit.textContent = 'Enviar relatório' }
  form.addEventListener('input', () => saveReportDraft(masterId, currentDraft()))
  cancel.addEventListener('click', () => { if (timer) { stopCountdown(); return }; overlay.remove() })
  form.addEventListener('submit', event => {
    event.preventDefault()
    if (timer) return
    const pendingDraft = currentDraft(); saveReportDraft(masterId, pendingDraft); setFormDisabled(true); cancel.textContent = 'Cancelar envio'; submit.disabled = true
    let remaining = 10; submit.textContent = `Enviando em ${remaining}s`
    timer = setInterval(() => {
      remaining -= 1; submit.textContent = remaining > 0 ? `Enviando em ${remaining}s` : 'Enviando...'
      if (remaining > 0) return
      if (timer) clearInterval(timer); timer = null
      void submitPersonalReport(masterId, publisher, pendingDraft, overlay).catch(() => { setFormDisabled(false); cancel.textContent = 'Fechar'; submit.disabled = false; submit.textContent = 'Tentar novamente'; alert('Não foi possível enviar. O rascunho continua salvo neste aparelho.') })
    }, 1000)
  })
}

async function submitPersonalReport(masterId: string, publisher: SecretaryPublisher, draft: PersonalReportDraft, overlay: HTMLElement): Promise<void> {
  const freshSnapshot = await get(secretarioRef), fresh = freshSnapshot.exists() ? freshSnapshot.val() as Record<string, unknown> : {}
  data.secretario = fresh
  if (isClosedMonth(draft.competencia, fresh['fechamentos'])) { overlay.remove(); render(); alert('A competência foi fechada pelo Secretário antes do envio. O relatório não foi alterado.'); return }
  const freshReports = (fresh['relatorios'] ?? {}) as Record<string, SecretaryReport>
  if (matchingReports(freshReports, masterId, draft.competencia).length) { overlay.remove(); render(); alert('O Secretário já registrou este mês. A versão oficial foi carregada e o card está bloqueado.'); return }
  const id = canonicalReportId(masterId, draft.competencia), now = new Date().toISOString(), submissionId = crypto.randomUUID?.() ?? randomToken()
  const item = normalizePersonalReport({ id, masterId, competencia:draft.competencia, categoria:publisher.categoria, participou:draft.participou, estudos:draft.estudos, horasCampo:draft.horasCampo, observacoes:draft.observacoes, recebidoEm:now.slice(0, 10), atualizadoEm:now, submissionId })
  const result = await runTransaction(secretarioRef, currentValue => {
    const attempt = preparePersonalReportCommit(currentValue, item)
    return attempt.ok ? attempt.value : undefined
  }, { applyLocally:false })
  if (!result.committed) {
    const latest = result.snapshot.exists() ? records(result.snapshot.val()) : fresh; data.secretario = latest; overlay.remove(); render()
    alert(isClosedMonth(draft.competencia, latest['fechamentos']) ? 'A competência foi fechada antes do envio. O relatório não foi alterado.' : 'Outro registro foi recebido antes deste envio. A versão oficial foi mantida.')
    return
  }
  data.secretario = records(result.snapshot.val()); removeReportDraft(masterId, draft.competencia); saveOfflineCache(); overlay.remove(); render(); alert('Relatório enviado. Este mês agora está bloqueado para edição pela pessoa.')
}
