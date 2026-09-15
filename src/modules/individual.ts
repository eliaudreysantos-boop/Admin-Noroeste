import type { AppContext, RawRoot } from '../types'
import { agendaConfigRef, agendaDocumentsRef, escalaParticipantsRef, escalaPublishedMonthRef, escalaPublishedMonthsRef, escalaPubSnapshotsRef, escalaScalesRef, escalaTablesRef, get, limpezaPeriodosRef, pessoasRef, programacaoRef, secretarioRef, servicoCampoRef, tarefasCongregacoesRef, tarefasOradoresRef, tarefasPeopleRef, tarefasProgramacaoOradoresRef, tarefasScaleRef } from '../firebase'
import { apiJson, ApiError } from '../secure-api.ts'
import { moduleTitle } from '../ui/module-header'
import { agendaMessage, agendaToIcs, announcementMessage, boardMeetingDates, boardMeetingEvents, collectAgendaEvents, collectAnnouncementEvents, upcomingAgendaEvents, type AgendaEvent, type AgendaSource, type AgendaStatus, type AnnouncementEvent } from './individual-domain'
import { CATEGORY_LABELS, isClosedMonth, matchingReports, records, reportCreatedBy, reportLastEditedBy, serviceYearStart, type SecretaryPublisher, type SecretaryReport } from './secretario-domain'
import type { AgendaConfig, AgendaPublicDocument, AgendaSubscription, MasterPessoa } from '../types'
import { agendaCacheNeedsSync, agendaUiStorageKey, defaultAgendaUiPreferences, parseAgendaUiPreferences, type AgendaScreen, type BoardPanel, type PersonalPanel } from './individual-preferences.ts'
import { groupPublicDocuments, publicDocumentMonths, PUBLIC_PDF_MODULES, type PublicPdfModule } from './agenda-documents-domain.ts'

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
let uiPreferences = defaultAgendaUiPreferences(month)
let uiPreferencesKey = ''
let subscriptionPersonId = ''
let loadingAssignments = true
let offlinePersonalEvents: AgendaEvent[] | null = null
let offlineAnnouncementEvents: AnnouncementEvent[] | null = null
let boardSubscriptionBusy = false

const OFFLINE_CACHE_KEY = 'noroeste_agenda_offline_v2'
const REPORT_DRAFT_KEY = 'noroeste_relatorio_rascunho_v1'
const INSTALLATION_KEY = 'noroeste_agenda_installation_v1'
const SUBSCRIPTIONS_KEY = 'noroeste_agenda_subscriptions_v2'
const ADMIN_PERSON_KEY = 'noroeste_agenda_admin_person_v1'
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

interface AgendaDataResponse {
  masterId: string
  person?: Pick<MasterPessoa, 'name' | 'active'>
  events: AgendaEvent[]
  announcements: AnnouncementEvent[]
  secretary: Record<string, unknown>
  agenda: Record<string, unknown>
}

const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char] ?? char))
const labelDate = (date: string): string => date.split('-').reverse().join('/')
const sourceLabels: Record<AgendaSource, string> = { tarefas:'Tarefas', limpeza:'Limpeza', escala:'Escala TPL', oradores:'Oradores', programacao:'Vida e Ministério', servicoCampo:'Serviço de Campo' }
const documentSourceLabels: Record<AgendaPublicDocument['modulo'], string> = { tarefas:'Tarefas', limpeza:'Limpeza', escala:'Escala TPL', oradores:'Oradores', programacao:'Vida e Ministério', servicoCampo:'Serviço de Campo', admin:'Admin' }
const fortalezaDate = (): string => new Intl.DateTimeFormat('en-CA', { timeZone:'America/Fortaleza', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date()).replace(/\//g, '-')

export default function mount(context: AppContext): void {
  ctx = context
  uiPreferencesKey = ''
  uiPreferences = defaultAgendaUiPreferences(fortalezaDate().slice(0, 7))
  loadingAssignments = true
  offlinePersonalEvents = null
  offlineAnnouncementEvents = null
  boardSubscriptionBusy = false
  const root = document.getElementById('appContent')
  if (!root) return
  root.innerHTML = '<div id="individualRoot"><p class="empty-state">Carregando sua agenda...</p></div>'
  const cached = standaloneAgenda() ? readOfflineCache(context.usuario.masterId ?? '') : null
  if (cached) {
    offlinePersonalEvents = cached.events
    offlineAnnouncementEvents = cached.announcements
    data = { master:{ pessoas:cached.person ? { [cached.masterId]:cached.person } : {} }, secretario:cached.secretary, agenda:cached.agenda } as RawRoot
    loadingAssignments = agendaCacheNeedsSync(cached.savedAt, Date.now(), DAILY_SYNC_MS)
    render()
    if (!loadingAssignments) return
  }
  void load()
}

function standaloneAgenda(): boolean { return ctx?.uid.startsWith('agenda-') === true }
function offlineCacheKey(masterId: string): string { return `${OFFLINE_CACHE_KEY}:${masterId}` }

function captureUiPreferences(): void {
  uiPreferences.screen = screen
  if (screen === 'agenda') Object.assign(uiPreferences.personal, { month, source:agendaSource, status:agendaStatus })
  if (screen === 'geral') Object.assign(uiPreferences.general, { month, source:agendaSource, status:agendaStatus, selectedDate:generalSelectedDate })
  if (screen === 'relatorio') uiPreferences.report.month = month
  Object.assign(uiPreferences.board, { meetingDate:boardMeetingDate, documentPeriod:boardDocumentPeriod, subscriptionModules:[...boardSubscriptionModules] })
}

function applyScreenPreferences(nextScreen: AgendaScreen): void {
  screen = nextScreen
  if (screen === 'agenda') { month = uiPreferences.personal.month; agendaSource = uiPreferences.personal.source; agendaStatus = uiPreferences.personal.status }
  if (screen === 'geral') { month = uiPreferences.general.month; agendaSource = uiPreferences.general.source; agendaStatus = uiPreferences.general.status; generalSelectedDate = uiPreferences.general.selectedDate }
  if (screen === 'relatorio') month = uiPreferences.report.month
}

function ensureUiPreferences(): void {
  const masterId = selectedMasterId()
  if (!masterId) return
  const nextKey = agendaUiStorageKey(masterId, standaloneAgenda() ? 'standalone' : 'admin')
  if (nextKey === uiPreferencesKey) return
  uiPreferencesKey = nextKey
  uiPreferences = parseAgendaUiPreferences(localStorage.getItem(nextKey), fortalezaDate().slice(0, 7))
  boardMeetingDate = uiPreferences.board.meetingDate
  boardDocumentPeriod = uiPreferences.board.documentPeriod
  boardSubscriptionModules.clear()
  uiPreferences.board.subscriptionModules.forEach(module => boardSubscriptionModules.add(module))
  applyScreenPreferences(uiPreferences.screen)
}

function persistUiPreferences(): void {
  if (!uiPreferencesKey) return
  captureUiPreferences()
  uiPreferences.updatedAt = Date.now()
  try { localStorage.setItem(uiPreferencesKey, JSON.stringify(uiPreferences)) } catch { /* Preferências locais não impedem o uso online. */ }
}

function setPanelOpen(panel: PersonalPanel | BoardPanel, open: boolean): void {
  const panels = panel === 'calendar' || panel === 'filters' || panel === 'sharing' ? uiPreferences.personal.openPanels : uiPreferences.board.openPanels
  const next = new Set<string>(panels)
  open ? next.add(panel) : next.delete(panel)
  if (panel === 'calendar' || panel === 'filters' || panel === 'sharing') uiPreferences.personal.openPanels = [...next] as PersonalPanel[]
  else uiPreferences.board.openPanels = [...next] as BoardPanel[]
  persistUiPreferences()
}

function bindPersistentPanels(): void {
  document.querySelectorAll<HTMLDetailsElement>('details[data-agenda-panel]').forEach(details => details.addEventListener('toggle', () => setPanelOpen(details.dataset['agendaPanel'] as PersonalPanel | BoardPanel, details.open)))
}

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
    events:offlinePersonalEvents ?? collectAgendaEvents(data, masterId),
    announcements:offlineAnnouncementEvents ?? collectAnnouncementEvents(data),
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
    if (standaloneAgenda() || !isAdmin()) {
      const response = await apiJson<AgendaDataResponse>('agenda-data')
      if (!response.masterId || response.masterId !== selectedMasterId()) throw new Error('Identidade da agenda divergente')
      if (!Array.isArray(response.events) || !Array.isArray(response.announcements)) throw new Error('Agenda inválida')
      const person = response.person ? { name:response.person.name, active:response.person.active, whatsapp:'', sex:null, role:null, limpeza:{ grupo:null } } satisfies MasterPessoa : undefined
      data = {
        master:{ pessoas:person ? { [response.masterId]:person } : {} },
        secretario:response.secretary,
        agenda:response.agenda,
      } as RawRoot
      offlinePersonalEvents = response.events
      offlineAnnouncementEvents = response.announcements
      synchronized = true
      loadingAssignments = false
      saveOfflineCache()
      render()
      return
    }
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
  const savedAdminPerson = localStorage.getItem(ADMIN_PERSON_KEY) ?? '', savedPerson = people()[savedAdminPerson]
  if (!subscriptionPersonId && isAdmin() && savedPerson && savedPerson.active !== false) subscriptionPersonId = savedAdminPerson
  const selectedPerson = people()[subscriptionPersonId]
  if (!isAdmin() || (subscriptionPersonId && selectedPerson && selectedPerson.active !== false)) return
  subscriptionPersonId = Object.entries(people()).filter(([, person]) => person.active !== false).sort(([, a], [, b]) => a.name.localeCompare(b.name, 'pt-BR'))[0]?.[0] ?? ''
}
function adminPersonPicker(): string {
  if (!isAdmin() || ctx?.usuario.masterId) return ''
  const options = Object.entries(people()).filter(([, person]) => person.active !== false).sort(([, a], [, b]) => a.name.localeCompare(b.name, 'pt-BR')).map(([id, person]) => `<option value="${esc(id)}" ${subscriptionPersonId === id ? 'selected' : ''}>${esc(person.name)}</option>`).join('')
  return `<div class="form-panel agenda-admin-person"><label class="form-field"><span>Visualizar pessoa</span><select id="adminAgendaPerson">${options}</select></label><p class="form-help">O Admin consulta a agenda pelo vínculo permanente. Lançamentos em nome da pessoa continuam no Secretário.</p></div>`
}
function bindAdminPersonPicker(): void { document.getElementById('adminAgendaPerson')?.addEventListener('change', event => { persistUiPreferences(); subscriptionPersonId = (event.target as HTMLSelectElement).value; localStorage.setItem(ADMIN_PERSON_KEY, subscriptionPersonId); uiPreferencesKey = ''; render() }) }
function screenTabs(): string { return `<div class="program-period-modes agenda-screen-tabs" role="tablist" aria-label="Minha agenda"><button class="program-period-mode" role="tab" type="button" data-agenda-screen="agenda" aria-selected="${screen === 'agenda'}">Pessoal</button><button class="program-period-mode" role="tab" type="button" data-agenda-screen="geral" aria-selected="${screen === 'geral'}">Geral</button><button class="program-period-mode" role="tab" type="button" data-agenda-screen="relatorio" aria-selected="${screen === 'relatorio'}">Relatório</button><button class="program-period-mode" role="tab" type="button" data-agenda-screen="quadro" aria-selected="${screen === 'quadro'}">Quadro</button></div>` }
function bindScreenTabs(): void { document.querySelectorAll<HTMLButtonElement>('[data-agenda-screen]').forEach(button => button.addEventListener('click', () => { captureUiPreferences(); uiPreferences.screen = button.dataset['agendaScreen'] as AgendaScreen; applyScreenPreferences(uiPreferences.screen); persistUiPreferences(); render(); document.getElementById('individualRoot')?.scrollIntoView({ block:'start' }) })) }

function statusLabel(status: AgendaStatus): string {
  return ({ futuro:'Futuro', 'confirmacao-pendente':'Confirmar', alterado:'Alterado', realizado:'Realizado' })[status]
}

function eventRows(events: AgendaEvent[], showDate = true): string {
  return events.map(event => `<article class="agenda-event"><time>${showDate ? esc(labelDate(event.date)) : ''}${event.time ? `${showDate ? ' · ' : ''}${esc(event.time)}` : !showDate ? 'Dia inteiro' : ''}</time><div><strong>${esc(event.title)}</strong><small><span class="agenda-source ${event.source}">${esc(sourceLabels[event.source])}</span> · ${esc(event.detail)}${event.location ? ` · ${esc(event.location)}` : ''}</small>${event.note ? `<p>${esc(event.note)}</p>` : ''}</div><span class="agenda-status ${event.status}">${esc(statusLabel(event.status))}</span></article>`).join('')
}

function nextCommitment(event?: AgendaEvent): string {
  if (!event) return '<section class="agenda-next empty"><span>Próximo compromisso</span><strong>Nenhuma designação futura</strong></section>'
  return `<section class="agenda-next"><span>Próximo compromisso</span><div><time>${esc(labelDate(event.date))}${event.time ? ` · ${esc(event.time)}` : ''}</time><span class="agenda-source ${event.source}">${esc(sourceLabels[event.source])}</span></div><strong>${esc(event.title)}</strong><p>${esc(event.detail)}${event.location ? ` · ${esc(event.location)}` : ''}</p></section>`
}

function render(): void {
  const root = document.getElementById('individualRoot')
  if (!root || !ctx) return
  ensureSelectedPerson()
  if (!selectedMasterId()) { root.innerHTML = `${moduleTitle('Minha agenda')}<div class="notice ${loadingAssignments ? '' : 'warning'}">${loadingAssignments ? 'Carregando pessoas e vínculos...' : 'Seu usuário ainda não está vinculado ao cadastro do Admin.'}</div>`; return }
  ensureUiPreferences()
  if (screen === 'relatorio') { renderReportScreen(root); return }
  if (screen === 'geral') { renderGeneralAgenda(root); return }
  if (screen === 'quadro') { renderBoard(root); return }
  const events = monthEvents(), filtered = personalEvents().filter(event => agendaSource === 'todas' || event.source === agendaSource).filter(event => agendaStatus === 'todos' || event.status === agendaStatus)
  const future = upcomingAgendaEvents(filtered, fortalezaDate()).sort((a, b) => `${a.date} ${a.time ?? ''}`.localeCompare(`${b.date} ${b.time ?? ''}`)), [year, monthNumber] = month.split('-').map(Number)
  const firstDow = new Date(year, monthNumber - 1, 1).getDay(), totalDays = new Date(year, monthNumber, 0).getDate()
  const byDay = new Map<number, AgendaEvent[]>(); events.forEach(event => { const day = Number(event.date.slice(-2)); byDay.set(day, [...(byDay.get(day) ?? []), event]) })
  const calendar = [...Array(firstDow).fill(''), ...Array.from({ length:totalDays }, (_, index) => String(index + 1))]
  const listEvents = uiPreferences.personal.view === 'upcoming' ? future.slice(1, 9) : events
  root.innerHTML = `${moduleTitle('Minha agenda')}${screenTabs()}${loadingAssignments ? '<div class="notice">Atualizando designações dos módulos...</div>' : ''}${adminPersonPicker()}
    ${nextCommitment(future[0])}
    <div class="program-period-modes agenda-view-modes" role="tablist" aria-label="Visualização dos compromissos"><button class="program-period-mode" role="tab" type="button" data-personal-view="upcoming" aria-selected="${uiPreferences.personal.view === 'upcoming'}">Próximos</button><button class="program-period-mode" role="tab" type="button" data-personal-view="month" aria-selected="${uiPreferences.personal.view === 'month'}">Mês</button></div>
    <div class="agenda-list">${eventRows(listEvents) || `<p class="empty-state">${uiPreferences.personal.view === 'upcoming' ? 'Nenhum outro compromisso futuro.' : 'Nenhuma designação corresponde aos filtros.'}</p>`}</div>
    <details class="form-panel agenda-board-card agenda-personal-panel" data-agenda-panel="calendar" ${uiPreferences.personal.openPanels.includes('calendar') ? 'open' : ''}><summary><strong>Calendário mensal</strong><span>${esc(month)}</span></summary><div class="agenda-board-body"><div class="agenda-toolbar"><button class="btn btn-ghost" id="agendaPrev" type="button" aria-label="Mês anterior">‹</button><label class="sr-only" for="agendaMonth">Mês do calendário pessoal</label><input class="form-input" id="agendaMonth" type="month" value="${month}"><button class="btn btn-ghost" id="agendaNext" type="button" aria-label="Próximo mês">›</button></div><div class="agenda-calendar"><div class="agenda-weekdays">${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(day => `<strong>${day}</strong>`).join('')}</div><div class="agenda-days">${calendar.map(day => day ? `<div class="agenda-day ${byDay.has(Number(day)) ? 'has-events' : ''}"><span>${day}</span>${(byDay.get(Number(day)) ?? []).slice(0, 3).map(event => `<i class="${event.source}" aria-hidden="true"></i>`).join('')}</div>` : '<div class="agenda-day empty"></div>').join('')}</div></div></div></details>
    <details class="form-panel agenda-board-card agenda-personal-panel" data-agenda-panel="filters" ${uiPreferences.personal.openPanels.includes('filters') ? 'open' : ''}><summary><strong>Filtros</strong><span>${agendaSource === 'todas' && agendaStatus === 'todos' ? 'Todos' : 'Ativos'}</span></summary><div class="agenda-board-body"><div class="module-form-grid agenda-filters"><label class="form-field"><span>Origem</span><select id="agendaSource"><option value="todas">Todas</option>${Object.entries(sourceLabels).map(([id, label]) => `<option value="${id}" ${agendaSource === id ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label><label class="form-field"><span>Status</span><select id="agendaStatus"><option value="todos">Todos</option><option value="futuro" ${agendaStatus === 'futuro' ? 'selected' : ''}>Futuro</option><option value="confirmacao-pendente" ${agendaStatus === 'confirmacao-pendente' ? 'selected' : ''}>Confirmação pendente</option><option value="alterado" ${agendaStatus === 'alterado' ? 'selected' : ''}>Alterado</option><option value="realizado" ${agendaStatus === 'realizado' ? 'selected' : ''}>Realizado</option></select></label></div></div></details>
    ${personalSubscriptionPanel()}`
  bind()
}

function moveMonth(delta: number): void { const [year, value] = month.split('-').map(Number), date = new Date(Date.UTC(year, value - 1 + delta, 1)); month = date.toISOString().slice(0, 7); persistUiPreferences(); render() }
function bind(): void {
  bindScreenTabs()
  bindAdminPersonPicker()
  document.getElementById('agendaPrev')?.addEventListener('click', () => moveMonth(-1))
  document.getElementById('agendaNext')?.addEventListener('click', () => moveMonth(1))
  document.getElementById('agendaMonth')?.addEventListener('change', event => { month = (event.target as HTMLInputElement).value || month; persistUiPreferences(); render() })
  document.getElementById('agendaSource')?.addEventListener('change', event => { agendaSource = (event.target as HTMLSelectElement).value as typeof agendaSource; persistUiPreferences(); render() })
  document.getElementById('agendaStatus')?.addEventListener('change', event => { agendaStatus = (event.target as HTMLSelectElement).value as typeof agendaStatus; persistUiPreferences(); render() })
  document.querySelectorAll<HTMLButtonElement>('[data-personal-view]').forEach(button => button.addEventListener('click', () => { uiPreferences.personal.view = button.dataset['personalView'] === 'month' ? 'month' : 'upcoming'; persistUiPreferences(); render() }))
  document.getElementById('agendaIcsMonth')?.addEventListener('click', () => downloadIcs(monthEvents(), `minha-agenda-${month}.ics`, 'Nenhuma designação disponível neste mês.'))
  document.getElementById('agendaIcsUpcoming')?.addEventListener('click', () => downloadIcs(upcomingAgendaEvents(personalEvents(), fortalezaDate()), 'minha-agenda-proximos-compromissos.ics', 'Nenhum compromisso futuro disponível.'))
  document.getElementById('agendaShare')?.addEventListener('click', openShare)
  bindPersonalSubscription()
  bindPersistentPanels()
}

function renderGeneralAgenda(root: HTMLElement): void {
  const today = fortalezaDate()
  const events = announcementEvents().filter(event => event.date.startsWith(month)).filter(event => agendaSource === 'todas' || event.source === agendaSource).filter(event => agendaStatus === 'todos' || event.status === agendaStatus).filter(event => uiPreferences.general.showPast || event.date >= today)
  const [year, monthNumber] = month.split('-').map(Number), firstDow = new Date(year, monthNumber - 1, 1).getDay(), totalDays = new Date(year, monthNumber, 0).getDate()
  const byDay = new Map<number, AnnouncementEvent[]>(); events.forEach(event => { const day = Number(event.date.slice(-2)); byDay.set(day, [...(byDay.get(day) ?? []), event]) })
  const calendar = [...Array(firstDow).fill(''), ...Array.from({ length:totalDays }, (_, index) => String(index + 1))]
  if (!events.some(event => event.date === generalSelectedDate)) { generalSelectedDate = events.find(event => event.date >= today)?.date ?? events[0]?.date ?? `${month}-01`; persistUiPreferences() }
  const selectedEvents = events.filter(event => event.date === generalSelectedDate)
  const visibleSources = [...new Set(events.map(event => event.source))]
  root.innerHTML = `${moduleTitle('Minha agenda')}${screenTabs()}${loadingAssignments ? '<div class="notice">Atualizando designações dos módulos...</div>' : ''}
    <div class="agenda-toolbar"><button class="btn btn-ghost" id="generalPrev" type="button" aria-label="Mês anterior">‹</button><label class="sr-only" for="generalMonth">Mês da agenda geral</label><input class="form-input" id="generalMonth" type="month" value="${month}"><button class="btn btn-ghost" id="generalNext" type="button" aria-label="Próximo mês">›</button></div>
    <div class="agenda-actions"><button class="btn btn-ghost" id="generalIcsMonth" type="button">Baixar calendário</button></div>
    <div class="module-form-grid agenda-filters"><label class="form-field"><span>Origem</span><select id="generalSource"><option value="todas">Todas</option>${Object.entries(sourceLabels).map(([id, label]) => `<option value="${id}" ${agendaSource === id ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label><label class="form-field"><span>Status</span><select id="generalStatus"><option value="todos">Todos</option><option value="futuro" ${agendaStatus === 'futuro' ? 'selected' : ''}>Futuro</option><option value="confirmacao-pendente" ${agendaStatus === 'confirmacao-pendente' ? 'selected' : ''}>Confirmação pendente</option><option value="alterado" ${agendaStatus === 'alterado' ? 'selected' : ''}>Alterado</option><option value="realizado" ${agendaStatus === 'realizado' ? 'selected' : ''}>Realizado</option></select></label></div>
    <label class="agenda-past-toggle"><input id="generalShowPast" type="checkbox" ${uiPreferences.general.showPast ? 'checked' : ''}> Incluir datas passadas</label>
    <div class="agenda-source-legend" aria-label="Cores dos módulos">${visibleSources.map(source => `<span><i class="${source}" aria-hidden="true"></i>${esc(sourceLabels[source])}</span>`).join('')}</div>
    <div class="agenda-calendar"><div class="agenda-weekdays">${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(day => `<strong>${day}</strong>`).join('')}</div><div class="agenda-days">${calendar.map(day => { if (!day) return '<div class="agenda-day empty"></div>'; const date = `${month}-${day.padStart(2, '0')}`, dayEvents = byDay.get(Number(day)) ?? [], sources = [...new Set(dayEvents.map(event => event.source))], accessible = dayEvents.length ? `${day}/${monthNumber}, ${dayEvents.length} ${dayEvents.length === 1 ? 'item' : 'itens'}: ${sources.map(source => sourceLabels[source]).join(', ')}` : `${day}/${monthNumber}, sem itens`; return `<button class="agenda-day agenda-day-button ${dayEvents.length ? 'has-events' : ''} ${generalSelectedDate === date ? 'selected' : ''}" type="button" data-general-date="${date}" aria-label="${esc(accessible)}"><span>${day}</span><span class="agenda-day-markers" aria-hidden="true">${dayEvents.slice(0, 3).map(event => `<i class="${event.source}"></i>`).join('')}${dayEvents.length > 3 ? `<b>+${dayEvents.length - 3}</b>` : ''}</span></button>` }).join('')}</div></div>
    <div class="agenda-selected-day"><strong>${esc(labelDate(generalSelectedDate))}</strong><span>${selectedEvents.length} item(ns)</span></div>
    <div class="agenda-list">${selectedEvents.map(event => `<article class="agenda-event"><time>${event.time ? esc(event.time) : 'Dia inteiro'}</time><div><strong>${esc(event.title)}</strong><small><span class="agenda-source ${event.source}">${esc(sourceLabels[event.source])}</span> · ${esc(event.detail)}${event.location ? ` · ${esc(event.location)}` : ''}</small><p>${esc(event.people.join(', '))}</p></div><span class="agenda-status ${event.status}">${esc(statusLabel(event.status))}</span></article>`).join('') || '<p class="empty-state">Nenhuma designação nesta data.</p>'}</div>`
  bindScreenTabs()
  document.getElementById('generalPrev')?.addEventListener('click', () => moveMonth(-1))
  document.getElementById('generalNext')?.addEventListener('click', () => moveMonth(1))
  document.getElementById('generalMonth')?.addEventListener('change', event => { month = (event.target as HTMLInputElement).value || month; persistUiPreferences(); render() })
  document.getElementById('generalSource')?.addEventListener('change', event => { agendaSource = (event.target as HTMLSelectElement).value as typeof agendaSource; persistUiPreferences(); render() })
  document.getElementById('generalStatus')?.addEventListener('change', event => { agendaStatus = (event.target as HTMLSelectElement).value as typeof agendaStatus; persistUiPreferences(); render() })
  document.getElementById('generalShowPast')?.addEventListener('change', event => { uiPreferences.general.showPast = (event.target as HTMLInputElement).checked; persistUiPreferences(); render() })
  document.getElementById('generalIcsMonth')?.addEventListener('click', () => downloadBoardIcs(events))
  document.querySelectorAll<HTMLButtonElement>('[data-general-date]').forEach(button => button.addEventListener('click', () => { generalSelectedDate = button.dataset['generalDate'] ?? generalSelectedDate; persistUiPreferences(); render() }))
}

function feedUrl(token: string): string {
  return `${window.location.origin}/.netlify/functions/calendar?token=${encodeURIComponent(token)}`
}

function webcalUrl(token: string): string {
  return feedUrl(token).replace(/^https?:/, 'webcal:')
}

function personalSubscriptionPanel(): string {
  const current = Object.values(subscriptions()).find(item => item.tipo === 'pessoal' && item.masterId === subscriptionPersonId && item.ativo)
  return `<details class="form-panel agenda-board-card agenda-personal-panel" data-agenda-panel="sharing" ${uiPreferences.personal.openPanels.includes('sharing') ? 'open' : ''}><summary><strong>Calendário e compartilhamento</strong><span>${current ? 'Assinatura ativa' : 'Opções'}</span></summary><div class="agenda-board-body"><div class="agenda-actions agenda-sharing-actions"><button class="btn btn-primary" id="agendaIcsMonth" type="button">Baixar mês</button><button class="btn btn-ghost" id="agendaIcsUpcoming" type="button">Baixar próximos</button><button class="btn btn-ghost" id="agendaShare" type="button">Compartilhar</button></div>${current ? `<div class="notice">Link de calendário ativo.</div><div class="agenda-actions"><button class="btn btn-primary" id="copyPersonalSubscription" type="button">Copiar link</button><a class="btn btn-ghost" href="${esc(webcalUrl(current.token))}">Assinar calendário</a><button class="btn btn-danger" id="revokePersonalSubscription" type="button">Revogar</button></div>` : '<button class="btn btn-primary" id="createPersonalSubscription" type="button">Gerar link de assinatura</button>'}<p class="form-help">Downloads são arquivos pontuais; a assinatura acompanha alterações futuras.</p></div></details>`
}

function randomToken(): string {
  const bytes = new Uint8Array(24); crypto.getRandomValues(bytes)
  return Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

async function createSubscription(item: Omit<AgendaSubscription, 'token' | 'ativo' | 'criadoEm'>): Promise<void> {
  const response = await fetch('/.netlify/functions/calendar-subscriptions', {
    method:'POST', headers:{ 'content-type':'application/json' }, credentials:'include',
    body:JSON.stringify({ ...item, installationId:installationId() }),
  })
  if (!response.ok) throw new Error('Não foi possível criar a assinatura.')
  const record = await response.json() as AgendaSubscription
  const current = subscriptions(); current[record.token] = record; saveSubscriptions(current)
}

async function revokeSubscription(token: string): Promise<void> {
  const response = await fetch('/.netlify/functions/calendar-subscriptions', {
    method:'DELETE', headers:{ 'content-type':'application/json' }, credentials:'include',
    body:JSON.stringify({ token, installationId:installationId() }),
  })
  if (!response.ok) throw new Error('Não foi possível revogar a assinatura.')
  const current = subscriptions(); delete current[token]; saveSubscriptions(current)
}

async function updateBoardSubscription(token: string, modulos: AgendaSource[]): Promise<AgendaSubscription> {
  const response = await fetch('/.netlify/functions/calendar-subscriptions', {
    method:'PATCH', headers:{ 'content-type':'application/json' }, credentials:'include',
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
  const reportAction = viewingAsAdmin ? '<div class="notice">Use o módulo Secretário para lançar ou ajustar o relatório desta pessoa.</div>'
      : state ? `<div class="notice"><strong>${esc(state.label)}</strong><br>Este mês já possui um relatório oficial e está bloqueado para edição pela pessoa.</div>`
        : closed ? '<div class="notice warning">Esta competência foi fechada pelo secretário.</div>'
          : `<button class="btn btn-primary" id="openPersonalReport" type="button">${readReportDraft(masterId, month) ? 'Continuar rascunho' : 'Preencher relatório'}</button>`
  const emptySummary = serviceReports.length === 0 && studies === 0 && regularHours === 0
  const reportPanel = publisher ? `<div class="form-panel"><h3 style="margin-top:0">Relatório de serviço</h3><p class="form-help">${esc(CATEGORY_LABELS[publisher.categoria])}. ${viewingAsAdmin ? 'Consulta administrativa do ano de serviço.' : 'O rascunho fica somente neste aparelho até você confirmar o envio.'}</p>${reportAction}</div>` : '<div class="notice warning">Este cadastro ainda não foi vinculado como publicador pelo Secretário.</div>'
  root.innerHTML = `${moduleTitle('Minha agenda')}${screenTabs()}${loadingAssignments ? '<div class="notice">Atualizando dados dos módulos...</div>' : ''}${adminPersonPicker()}<div class="agenda-toolbar"><button class="btn btn-ghost" id="reportPrev" type="button" aria-label="Mês anterior">‹</button><label class="sr-only" for="reportMonth">Competência do relatório</label><input class="form-input" id="reportMonth" type="month" value="${month}"><button class="btn btn-ghost" id="reportNext" type="button" aria-label="Próximo mês">›</button></div><div class="program-summary ${emptySummary ? 'agenda-summary-empty' : ''}"><div><strong>${serviceReports.length}</strong><span>Relatórios no ano</span></div><div><strong>${studies}</strong><span>Estudos bíblicos</span></div>${pioneerProgress}<div><strong>${year}/${String(year + 1).slice(-2)}</strong><span>Ano de serviço</span></div></div>${reportPanel}<div class="module-option-list">${serviceReports.sort((a, b) => String(b.competencia).localeCompare(String(a.competencia))).map(report => { const presentation = reportPresentation(report, isClosedMonth(String(report.competencia), secretary['fechamentos'])); return `<div class="agenda-event"><time>${esc(String(report.competencia))}</time><div><strong>${report.participou === false ? 'Não participou' : 'Participou no ministério'}</strong><small>${Number(report.estudos) || 0} estudo(s) bíblico(s)${report.horasCampo ? ` · ${report.horasCampo} hora(s)` : ''} · ${esc(presentation.label)}</small></div><span class="agenda-status ${presentation.style}">${esc(presentation.badge)}</span></div>` }).join('') || '<p class="empty-state">Nenhum relatório neste ano de serviço.</p>'}</div>`
  bindScreenTabs(); bindAdminPersonPicker()
  document.getElementById('reportPrev')?.addEventListener('click', () => moveMonth(-1))
  document.getElementById('reportNext')?.addEventListener('click', () => moveMonth(1))
  document.getElementById('reportMonth')?.addEventListener('change', event => { month = (event.target as HTMLInputElement).value || month; persistUiPreferences(); render() })
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
  if (!meetingDates.some(item => item.date === boardMeetingDate)) { boardMeetingDate = meetingDates[0]?.date ?? ''; persistUiPreferences() }
  const selectedMeeting = meetingDates.find(item => item.date === boardMeetingDate)
  const meetingEvents = boardMeetingEvents(allEvents, selectedMeeting)
  const allDocuments = documents().sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)), periods = publicDocumentMonths(allDocuments)
  if (!periods.includes(boardDocumentPeriod)) { boardDocumentPeriod = periods[0] ?? fortalezaDate().slice(0, 7); persistUiPreferences() }
  const visibleDocuments = groupPublicDocuments(allDocuments, boardDocumentPeriod)
  const meetingSummary = selectedMeeting ? `${labelDate(selectedMeeting.date)} · ${selectedMeeting.kind === 'midweek' ? 'Meio de semana' : 'Fim de semana'}` : 'Nenhuma reunião futura'
  root.innerHTML = `${moduleTitle('Minha agenda')}${screenTabs()}${loadingAssignments ? '<div class="notice">Atualizando designações dos módulos...</div>' : ''}
    <div class="agenda-board-sections">
      <details class="form-panel agenda-board-card" data-agenda-panel="meetings" ${uiPreferences.board.openPanels.includes('meetings') ? 'open' : ''}><summary><strong>Dados das reuniões</strong><span>${esc(meetingSummary)}</span></summary><div class="agenda-board-body"><label class="form-field"><span>Reunião</span><select id="boardMeetingDate">${meetingDates.map(item => `<option value="${esc(item.date)}" ${item.date === boardMeetingDate ? 'selected' : ''}>${esc(labelDate(item.date))} · ${item.kind === 'midweek' ? 'Meio de semana' : 'Fim de semana'}</option>`).join('') || '<option value="">Nenhuma reunião futura</option>'}</select></label><textarea id="boardInlineDraft" class="form-input" rows="12" maxlength="4000">${esc(announcementMessage(meetingEvents))}</textarea><div class="agenda-actions"><button class="btn btn-ghost" id="boardInlineCopy" type="button">Copiar texto</button><button class="btn btn-primary" id="boardWhatsapp" type="button">Abrir WhatsApp</button></div><p class="form-help">${agendaConfig().quadroWhatsAppLink ? 'O texto será copiado e o grupo configurado no Admin será aberto.' : 'Nenhum grupo foi configurado no Admin; o seletor comum do WhatsApp será aberto.'}</p></div></details>
      <details class="form-panel agenda-board-card" data-agenda-panel="moduleDocuments" ${uiPreferences.board.openPanels.includes('moduleDocuments') ? 'open' : ''}><summary><strong>PDFs dos módulos</strong><span>${Object.keys(visibleDocuments.modules).length} de ${PUBLIC_PDF_MODULES.length}</span></summary><div class="agenda-board-body"><label class="form-field"><span>Período</span><select id="boardDocumentPeriod">${periods.map(period => `<option value="${esc(period)}" ${period === boardDocumentPeriod ? 'selected' : ''}>${esc(formatDocumentMonth(period))}</option>`).join('') || `<option value="${esc(boardDocumentPeriod)}">${esc(formatDocumentMonth(boardDocumentPeriod))}</option>`}</select></label><div class="agenda-module-downloads">${PUBLIC_PDF_MODULES.map(module => moduleDownloadRow(module, visibleDocuments.modules[module])).join('')}</div></div></details>
      <details class="form-panel agenda-board-card" data-agenda-panel="adminDocuments" ${uiPreferences.board.openPanels.includes('adminDocuments') ? 'open' : ''}><summary><strong>Documentos do Admin</strong><span>${visibleDocuments.admin.length}</span></summary><div class="agenda-board-body"><div class="agenda-document-list">${visibleDocuments.admin.map(item => `<a class="agenda-document" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer" download><span><strong>${esc(item.nome)}</strong><small>Publicado em ${esc(labelDate(item.criadoEm.slice(0, 10)))}</small></span><b>Baixar</b></a>`).join('') || '<p class="empty-state">Nenhum documento do Admin neste período.</p>'}</div></div></details>
      ${boardSubscriptionPanel()}
    </div>`
  bindScreenTabs()
  document.getElementById('boardMeetingDate')?.addEventListener('change', event => { boardMeetingDate = (event.target as HTMLSelectElement).value; persistUiPreferences(); render() })
  document.getElementById('boardDocumentPeriod')?.addEventListener('change', event => { boardDocumentPeriod = (event.target as HTMLSelectElement).value; persistUiPreferences(); render() })
  document.getElementById('boardInlineCopy')?.addEventListener('click', () => void navigator.clipboard.writeText((document.getElementById('boardInlineDraft') as HTMLTextAreaElement).value))
  document.getElementById('boardWhatsapp')?.addEventListener('click', () => openBoardWhatsapp((document.getElementById('boardInlineDraft') as HTMLTextAreaElement).value))
  document.querySelectorAll<HTMLButtonElement>('[data-board-document-whatsapp]').forEach(button => {
    button.addEventListener('click', () => {
      const module = button.dataset['boardDocumentWhatsapp'] as PublicPdfModule
      const item = visibleDocuments.modules[module]
      if (item) void openModuleDocumentWhatsapp(module, item)
    })
  })
  bindBoardSubscription()
  bindPersistentPanels()
}

function formatDocumentMonth(value: string): string {
  if (!/^\d{4}-\d{2}$/.test(value)) return value
  const label = new Intl.DateTimeFormat('pt-BR', { month:'long', year:'numeric', timeZone:'UTC' }).format(new Date(`${value}-15T12:00:00Z`))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function moduleDownloadRow(module: PublicPdfModule, item?: AgendaPublicDocument): string {
  const label = documentSourceLabels[module]
  const hasWhatsapp = Boolean(item && agendaConfig().moduleWhatsApp?.[module]?.groupLink?.trim())
  const actions = item
    ? `<div class="agenda-module-download-actions"><a class="btn btn-primary" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer" download="${esc(item.nome)}">Baixar PDF</a>${hasWhatsapp ? `<button class="btn btn-ghost" type="button" data-board-document-whatsapp="${module}">WhatsApp</button>` : ''}</div>`
    : '<button class="btn btn-primary" type="button" disabled>Baixar PDF</button>'
  return `<div class="agenda-module-download"><span><strong>${esc(label)}</strong><small>${item ? esc(item.periodo) : 'Ainda não publicado'}</small></span>${actions}</div>`
}

async function openModuleDocumentWhatsapp(module: PublicPdfModule, item: AgendaPublicDocument): Promise<void> {
  const current = agendaConfig().moduleWhatsApp?.[module]
  const groupLink = current?.groupLink?.trim()
  if (!groupLink) return
  const label = documentSourceLabels[module]
  const template = current?.documentText?.trim() || 'Olá. O arquivo de {modulo} referente a {periodo} está disponível para consulta:\n\n{link_ou_orientacao}\n\nAgradecemos pela atenção.'
  const message = template
    .split('{modulo}').join(label)
    .split('{periodo}').join(item.periodo)
    .split('{link_ou_orientacao}').join(item.url)
  try { await navigator.clipboard.writeText(message) } catch { /* O grupo ainda pode ser aberto sem a cópia automática. */ }
  window.open(groupLink, '_blank', 'noopener,noreferrer')
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
  return `<details class="form-panel agenda-board-card" data-agenda-panel="subscription" ${uiPreferences.board.openPanels.includes('subscription') ? 'open' : ''}><summary><strong>Assinar o quadro</strong><span>${boardSubscriptionModules.size} módulos · ${current ? 'ativa' : 'não criada'}</span></summary><div class="agenda-board-body"><div class="agenda-module-options">${checks}</div>${current ? `<div class="notice">Esta assinatura recebe automaticamente os módulos selecionados.</div><div class="agenda-actions"><button class="btn btn-primary" id="copyBoardSubscription" type="button">Copiar link</button><a class="btn btn-ghost" href="${esc(webcalUrl(current.token))}">Assinar calendário</a><button class="btn btn-danger" id="revokeBoardSubscription" type="button">Revogar</button></div>` : '<button class="btn btn-primary" id="createBoardSubscription" type="button">Gerar link de assinatura</button>'}<p class="form-help">O link contém um token revogável e não expõe o identificador de nenhuma pessoa.</p></div></details>`
}

function bindBoardSubscription(): void {
  const current = Object.values(subscriptions()).find(item => item.tipo === 'quadro' && item.ativo)
  document.querySelectorAll<HTMLInputElement>('[data-board-module]').forEach(input => input.addEventListener('change', async () => {
    const source = input.dataset['boardModule'] as AgendaSource
    if (boardSubscriptionBusy) { input.checked = boardSubscriptionModules.has(source); return }
    input.checked ? boardSubscriptionModules.add(source) : boardSubscriptionModules.delete(source)
    if (!boardSubscriptionModules.size) { input.checked = true; boardSubscriptionModules.add(source); persistUiPreferences(); alert('A assinatura precisa manter ao menos um módulo.'); return }
    persistUiPreferences()
    if (!current) return
    const modulos = [...boardSubscriptionModules]
    boardSubscriptionBusy = true
    const controls = Array.from(document.querySelectorAll<HTMLInputElement>('[data-board-module]'))
    controls.forEach(control => { control.disabled = true })
    try { Object.assign(current, await updateBoardSubscription(current.token, modulos)) }
    catch { input.checked = !input.checked; input.checked ? boardSubscriptionModules.add(source) : boardSubscriptionModules.delete(source); persistUiPreferences(); alert('Não foi possível atualizar os módulos da assinatura.') }
    finally { boardSubscriptionBusy = false; controls.forEach(control => { control.disabled = false }) }
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
  const groupLink = agendaConfig().moduleWhatsApp?.quadro?.groupLink?.trim() || agendaConfig().quadroWhatsAppLink?.trim()
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
  let submitting = false
  const currentDraft = (): PersonalReportDraft => { const values = new FormData(form); return { competencia:month, participou:values.get('participou') === 'on', estudos:Math.max(0, Number(values.get('estudos')) || 0), horasCampo:Math.max(0, Number(values.get('horasCampo')) || 0), observacoes:String(values.get('observacoes') ?? '').trim().slice(0, 250) } }
  const setFormDisabled = (disabled: boolean): void => form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[name], textarea[name]').forEach(input => { input.disabled = disabled })
  const stopCountdown = (): void => { if (timer) clearInterval(timer); timer = null; setFormDisabled(false); cancel.textContent = 'Fechar'; submit.disabled = false; submit.textContent = 'Enviar relatório' }
  form.addEventListener('input', () => saveReportDraft(masterId, currentDraft()))
  cancel.addEventListener('click', () => { if (submitting) return; if (timer) { stopCountdown(); return }; overlay.remove() })
  form.addEventListener('submit', event => {
    event.preventDefault()
    if (timer) return
    const pendingDraft = currentDraft(); saveReportDraft(masterId, pendingDraft); setFormDisabled(true); cancel.textContent = 'Cancelar envio'; submit.disabled = true
    let remaining = 10; submit.textContent = `Enviando em ${remaining}s`
    timer = setInterval(() => {
      remaining -= 1; submit.textContent = remaining > 0 ? `Enviando em ${remaining}s` : 'Enviando...'
      if (remaining > 0) return
      if (timer) clearInterval(timer); timer = null
      submitting = true; cancel.disabled = true; cancel.textContent = 'Enviando...'
      void submitPersonalReport(masterId, pendingDraft, overlay).catch(() => { submitting = false; setFormDisabled(false); cancel.disabled = false; cancel.textContent = 'Fechar'; submit.disabled = false; submit.textContent = 'Tentar novamente'; alert('Não foi possível enviar. O rascunho continua salvo neste aparelho.') })
    }, 1000)
  })
}

async function submitPersonalReport(masterId: string, draft: PersonalReportDraft, overlay: HTMLElement): Promise<void> {
  try {
    const response = await apiJson<{ report: SecretaryReport }>('secretary-report', {
      method:'POST',
      body:JSON.stringify({ report:{ ...draft, submissionId:crypto.randomUUID?.() ?? randomToken() } }),
    })
    const secretary = records(data.secretario), nextReports = { ...records<SecretaryReport>(secretary['relatorios']), [response.report.id]:response.report }
    data.secretario = { ...secretary, relatorios:nextReports }
    removeReportDraft(masterId, draft.competencia); saveOfflineCache(); overlay.remove(); render(); alert('Relatório enviado. Este mês agora está bloqueado para edição pela pessoa.')
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      await load(); overlay.remove(); render()
      alert('A competência foi fechada ou outro relatório já foi recebido. A versão oficial foi mantida.')
      return
    }
    throw error
  }
}
