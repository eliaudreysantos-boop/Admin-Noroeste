import type { AppContext, RawRoot } from '../types'
import { configRef, escalaSettingsRef } from '../firebase'
import { agendaConfigRef, agendaDocumentsRef, escalaParticipantsRef, escalaPublishedMonthRef, escalaPublishedMonthsRef, escalaPubSnapshotsRef, escalaScalesRef, escalaTablesRef, get, limpezaPeriodosRef, pessoasRef, servicoCampoRef, tarefasPeopleRef, tarefasScaleRef, tarefasDiscursosRef } from '../firebase'
import { apiJson } from '../secure-api.ts'
import { moduleTitle } from '../ui/module-header'
import { agendaMessage, agendaToIcs, boardCleaningMessage, boardMeetingDates, boardMeetingEvents, boardMeetingMessage, collectAgendaEvents, collectAnnouncementEvents, upcomingAgendaEvents, type AgendaEvent, type AgendaSource, type AgendaStatus, type AnnouncementEvent } from './individual-domain'
import type { AgendaConfig, AgendaPublicDocument, MasterPessoa } from '../types'
import { agendaCacheNeedsSync, agendaUiStorageKey, defaultAgendaUiPreferences, parseAgendaUiPreferences, type AgendaScreen, type BoardPanel, type PersonalPanel } from './individual-preferences.ts'
import { groupPublicDocuments, publicDocumentMonths, PUBLIC_PDF_MODULES, type PublicPdfModule } from './agenda-documents-domain.ts'

let ctx: AppContext | null = null
let data: RawRoot = {}
let month = new Date().toISOString().slice(0, 7)
let screen: 'agenda' | 'geral' | 'quadro' = 'agenda'
let generalSelectedDate = ''
let boardDocumentPeriod = month
let boardMeetingDate = ''
let uiPreferences = defaultAgendaUiPreferences(month)
let uiPreferencesKey = ''
let selectedPersonId = ''
let loadingAssignments = true
let offlinePersonalEvents: AgendaEvent[] | null = null
let offlineAnnouncementEvents: AnnouncementEvent[] | null = null

const OFFLINE_CACHE_KEY = 'noroeste_agenda_offline_v3'
const ADMIN_PERSON_KEY = 'noroeste_agenda_admin_person_v1'
const DAILY_SYNC_MS = 24 * 60 * 60 * 1000

interface OfflineAgendaCache {
  masterId: string
  savedAt: number
  person?: MasterPessoa
  events: AgendaEvent[]
  announcements: AnnouncementEvent[]
  agenda: Record<string, unknown>
}

interface AgendaDataResponse {
  masterId: string
  person?: Pick<MasterPessoa, 'name' | 'active'>
  events: AgendaEvent[]
  announcements: AnnouncementEvent[]
  agenda: Record<string, unknown>
}

const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char] ?? char))
const labelDate = (date: string): string => date.split('-').reverse().join('/')
const sourceLabels: Record<AgendaSource, string> = { tarefas:'Tarefas', oradores:'Oradores', limpeza:'Limpeza', escala:'Escala TPL', servicoCampo:'Serviço de Campo' }
const documentSourceLabels: Record<AgendaPublicDocument['modulo'], string> = { tarefas:'Tarefas', oradores:'Oradores', limpeza:'Limpeza', escala:'Escala TPL', servicoCampo:'Serviço de Campo', admin:'Admin' }
const fortalezaDate = (): string => new Intl.DateTimeFormat('en-CA', { timeZone:'America/Fortaleza', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date()).replace(/\//g, '-')

export default function mount(context: AppContext): void {
  ctx = context
  uiPreferencesKey = ''
  uiPreferences = defaultAgendaUiPreferences(fortalezaDate().slice(0, 7))
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
    data = { master:{ pessoas:cached.person ? { [cached.masterId]:cached.person } : {} }, agenda:cached.agenda } as RawRoot
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
  if (screen === 'agenda') Object.assign(uiPreferences.personal, { month })
  if (screen === 'geral') Object.assign(uiPreferences.general, { month, selectedDate:generalSelectedDate })
  Object.assign(uiPreferences.board, { meetingDate:boardMeetingDate, documentPeriod:boardDocumentPeriod })
}

function applyScreenPreferences(nextScreen: AgendaScreen): void {
  screen = nextScreen
  if (screen === 'agenda') month = uiPreferences.personal.month
  if (screen === 'geral') { month = uiPreferences.general.month; generalSelectedDate = uiPreferences.general.selectedDate }
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
  applyScreenPreferences(uiPreferences.screen)
}

function persistUiPreferences(): void {
  if (!uiPreferencesKey) return
  captureUiPreferences()
  uiPreferences.updatedAt = Date.now()
  try { localStorage.setItem(uiPreferencesKey, JSON.stringify(uiPreferences)) } catch { /* Preferências locais não impedem o uso online. */ }
}

function setPanelOpen(panel: PersonalPanel | BoardPanel, open: boolean): void {
  const panels = panel === 'calendar' || panel === 'sharing' ? uiPreferences.personal.openPanels : uiPreferences.board.openPanels
  const next = new Set<string>(panels)
  open ? next.add(panel) : next.delete(panel)
  if (panel === 'calendar' || panel === 'sharing') uiPreferences.personal.openPanels = [...next] as PersonalPanel[]
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
  const agenda = agendaRoot()
  const publicAgenda = { config:agenda['config'] ?? {}, documentos:agenda['documentos'] ?? {} }
  const person = people()[masterId]
  const safePerson = person ? { name:person.name, active:person.active, sex:person.sex, role:person.role, whatsapp:'', limpeza:{ grupo:null } } satisfies MasterPessoa : undefined
  const snapshot: OfflineAgendaCache = {
    masterId, savedAt:Date.now(), person:safePerson,
    events:offlinePersonalEvents ?? collectAgendaEvents(data, masterId),
    announcements:offlineAnnouncementEvents ?? collectAnnouncementEvents(data),
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
      tarefasPeopleRef, tarefasScaleRef, limpezaPeriodosRef,
      escalaParticipantsRef, escalaScalesRef, escalaTablesRef,
      escalaPublishedMonthRef, escalaPublishedMonthsRef, escalaPubSnapshotsRef,
      agendaConfigRef, agendaDocumentsRef, servicoCampoRef, configRef, escalaSettingsRef, tarefasDiscursosRef,
    ]
    const values = await Promise.all(references.map(readValue))
    const value = (index: number): unknown => values[index]
    data = {
      master:{ pessoas:masterPeople, config:value(12) },
      tarefas:{ discursos:value(14), people:value(0), scale:{ periods:value(1) } },
      limpeza:{ periodos:value(2) },
      escala:{ participants:value(3), scales:value(4), tables:value(5), publishedMonth:value(6), publishedMonths:value(7), publishedSnapshots:value(8), settings:value(13) },
      agenda:{ config:value(9), documentos:value(10) }, servicoCampo:value(11),
    } as RawRoot
    synchronized = true
  }
  catch { data = previousData }
  loadingAssignments = false
  if (synchronized) saveOfflineCache()
  render()
}

function isAdmin(): boolean { return ctx?.usuario.apps.mestre === true }
function selectedMasterId(): string { return ctx?.usuario.masterId ?? (isAdmin() ? selectedPersonId : '') }
function personalEvents(): AgendaEvent[] { const masterId = selectedMasterId(); return offlinePersonalEvents ?? (masterId ? collectAgendaEvents(data, masterId) : []) }
function announcementEvents(): AnnouncementEvent[] { return offlineAnnouncementEvents ?? collectAnnouncementEvents(data) }
function monthEvents(): AgendaEvent[] { return personalEvents().filter(event => event.date.startsWith(month)) }
function agendaRoot(): Record<string, unknown> { return (data.agenda ?? {}) as Record<string, unknown> }
function agendaConfig(): AgendaConfig { return (agendaRoot()['config'] ?? {}) as AgendaConfig }
function documents(): AgendaPublicDocument[] { return Object.values((agendaRoot()['documentos'] ?? {}) as Record<string, AgendaPublicDocument>) }
function people(): Record<string, MasterPessoa> { return data.master?.pessoas ?? {} }
function ensureSelectedPerson(): void {
  if (ctx?.usuario.masterId) { selectedPersonId = ctx.usuario.masterId; return }
  const savedAdminPerson = localStorage.getItem(ADMIN_PERSON_KEY) ?? '', savedPerson = people()[savedAdminPerson]
  if (!selectedPersonId && isAdmin() && savedPerson && savedPerson.active !== false) selectedPersonId = savedAdminPerson
  const selectedPerson = people()[selectedPersonId]
  if (!isAdmin() || (selectedPersonId && selectedPerson && selectedPerson.active !== false)) return
  selectedPersonId = Object.entries(people()).filter(([, person]) => person.active !== false).sort(([, a], [, b]) => a.name.localeCompare(b.name, 'pt-BR'))[0]?.[0] ?? ''
}
function adminPersonPicker(): string {
  if (!isAdmin() || ctx?.usuario.masterId) return ''
  const options = Object.entries(people()).filter(([, person]) => person.active !== false).sort(([, a], [, b]) => a.name.localeCompare(b.name, 'pt-BR')).map(([id, person]) => `<option value="${esc(id)}" ${selectedPersonId === id ? 'selected' : ''}>${esc(person.name)}</option>`).join('')
  return `<div class="form-panel agenda-admin-person"><label class="form-field"><span>Visualizar pessoa</span><select id="adminAgendaPerson">${options}</select></label><p class="form-help">O Admin consulta a agenda pelo vínculo permanente.</p></div>`
}
function bindAdminPersonPicker(): void { document.getElementById('adminAgendaPerson')?.addEventListener('change', event => { persistUiPreferences(); selectedPersonId = (event.target as HTMLSelectElement).value; localStorage.setItem(ADMIN_PERSON_KEY, selectedPersonId); uiPreferencesKey = ''; render() }) }
function screenTabs(): string { return `<div class="program-period-modes agenda-screen-tabs" role="tablist" aria-label="Minha agenda"><button class="program-period-mode" role="tab" type="button" data-agenda-screen="agenda" aria-selected="${screen === 'agenda'}">Pessoal</button><button class="program-period-mode" role="tab" type="button" data-agenda-screen="geral" aria-selected="${screen === 'geral'}">Geral</button><button class="program-period-mode" role="tab" type="button" data-agenda-screen="quadro" aria-selected="${screen === 'quadro'}">Quadro</button></div>` }
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
  if (screen === 'geral') { renderGeneralAgenda(root); return }
  if (screen === 'quadro') { renderBoard(root); return }
  const events = monthEvents()
  const future = upcomingAgendaEvents(personalEvents(), fortalezaDate()).sort((a, b) => `${a.date} ${a.time ?? ''}`.localeCompare(`${b.date} ${b.time ?? ''}`)), [year, monthNumber] = month.split('-').map(Number)
  const firstDow = new Date(year, monthNumber - 1, 1).getDay(), totalDays = new Date(year, monthNumber, 0).getDate()
  const byDay = new Map<number, AgendaEvent[]>(); events.forEach(event => { const day = Number(event.date.slice(-2)); byDay.set(day, [...(byDay.get(day) ?? []), event]) })
  const calendar = [...Array(firstDow).fill(''), ...Array.from({ length:totalDays }, (_, index) => String(index + 1))]
  const listEvents = uiPreferences.personal.view === 'upcoming' ? future.slice(1, 9) : events
  root.innerHTML = `${moduleTitle('Minha agenda')}${screenTabs()}${loadingAssignments ? '<div class="notice">Atualizando designações dos módulos...</div>' : ''}${adminPersonPicker()}
    ${nextCommitment(future[0])}
    <div class="program-period-modes agenda-view-modes" role="tablist" aria-label="Visualização dos compromissos"><button class="program-period-mode" role="tab" type="button" data-personal-view="upcoming" aria-selected="${uiPreferences.personal.view === 'upcoming'}">Próximos</button><button class="program-period-mode" role="tab" type="button" data-personal-view="month" aria-selected="${uiPreferences.personal.view === 'month'}">Mês</button></div>
    <div class="agenda-list">${eventRows(listEvents) || `<p class="empty-state">${uiPreferences.personal.view === 'upcoming' ? 'Nenhum outro compromisso futuro.' : 'Nenhuma designação neste mês.'}</p>`}</div>
    <details class="form-panel agenda-board-card agenda-personal-panel" data-agenda-panel="calendar" ${uiPreferences.personal.openPanels.includes('calendar') ? 'open' : ''}><summary><strong>Calendário mensal</strong><span>${esc(month)}</span></summary><div class="agenda-board-body"><div class="agenda-toolbar"><button class="btn btn-ghost" id="agendaPrev" type="button" aria-label="Mês anterior">‹</button><label class="sr-only" for="agendaMonth">Mês do calendário pessoal</label><input class="form-input" id="agendaMonth" type="month" value="${month}"><button class="btn btn-ghost" id="agendaNext" type="button" aria-label="Próximo mês">›</button></div><div class="agenda-calendar"><div class="agenda-weekdays">${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(day => `<strong>${day}</strong>`).join('')}</div><div class="agenda-days">${calendar.map(day => day ? `<div class="agenda-day ${byDay.has(Number(day)) ? 'has-events' : ''}"><span>${day}</span>${(byDay.get(Number(day)) ?? []).slice(0, 3).map(event => `<i class="${event.source}" aria-hidden="true"></i>`).join('')}</div>` : '<div class="agenda-day empty"></div>').join('')}</div></div></div></details>
    ${calendarExportPanel()}`
  bind()
}

function moveMonth(delta: number): void { const [year, value] = month.split('-').map(Number), date = new Date(Date.UTC(year, value - 1 + delta, 1)); month = date.toISOString().slice(0, 7); persistUiPreferences(); render() }
function bind(): void {
  bindScreenTabs()
  bindAdminPersonPicker()
  document.getElementById('agendaPrev')?.addEventListener('click', () => moveMonth(-1))
  document.getElementById('agendaNext')?.addEventListener('click', () => moveMonth(1))
  document.getElementById('agendaMonth')?.addEventListener('change', event => { month = (event.target as HTMLInputElement).value || month; persistUiPreferences(); render() })
  document.querySelectorAll<HTMLButtonElement>('[data-personal-view]').forEach(button => button.addEventListener('click', () => { uiPreferences.personal.view = button.dataset['personalView'] === 'month' ? 'month' : 'upcoming'; persistUiPreferences(); render() }))
  document.getElementById('agendaIcsMonth')?.addEventListener('click', () => downloadIcs(monthEvents(), `minha-agenda-${month}.ics`, 'Nenhuma designação disponível neste mês.'))
  document.getElementById('agendaIcsUpcoming')?.addEventListener('click', () => downloadIcs(upcomingAgendaEvents(personalEvents(), fortalezaDate()), 'minha-agenda-proximos-compromissos.ics', 'Nenhum compromisso futuro disponível.'))
  document.getElementById('agendaShare')?.addEventListener('click', openShare)
  bindPersistentPanels()
}

function renderGeneralAgenda(root: HTMLElement): void {
  const today = fortalezaDate()
  const events = announcementEvents().filter(event => event.date.startsWith(month))
  const [year, monthNumber] = month.split('-').map(Number), firstDow = new Date(year, monthNumber - 1, 1).getDay(), totalDays = new Date(year, monthNumber, 0).getDate()
  const byDay = new Map<number, AnnouncementEvent[]>(); events.forEach(event => { const day = Number(event.date.slice(-2)); byDay.set(day, [...(byDay.get(day) ?? []), event]) })
  const calendar = [...Array(firstDow).fill(''), ...Array.from({ length:totalDays }, (_, index) => String(index + 1))]
  if (!events.some(event => event.date === generalSelectedDate)) { generalSelectedDate = events.find(event => event.date >= today)?.date ?? events[0]?.date ?? `${month}-01`; persistUiPreferences() }
  const selectedEvents = events.filter(event => event.date === generalSelectedDate)
  const visibleSources = [...new Set(events.map(event => event.source))]
  root.innerHTML = `${moduleTitle('Minha agenda')}${screenTabs()}${loadingAssignments ? '<div class="notice">Atualizando designações dos módulos...</div>' : ''}
    <div class="agenda-toolbar"><button class="btn btn-ghost" id="generalPrev" type="button" aria-label="Mês anterior">‹</button><label class="sr-only" for="generalMonth">Mês da agenda geral</label><input class="form-input" id="generalMonth" type="month" value="${month}"><button class="btn btn-ghost" id="generalNext" type="button" aria-label="Próximo mês">›</button></div>
    <div class="agenda-actions"><button class="btn btn-ghost" id="generalIcsMonth" type="button">Baixar calendário</button></div>
    <div class="agenda-source-legend" aria-label="Cores dos módulos">${visibleSources.map(source => `<span><i class="${source}" aria-hidden="true"></i>${esc(sourceLabels[source])}</span>`).join('')}</div>
    <div class="agenda-calendar"><div class="agenda-weekdays">${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(day => `<strong>${day}</strong>`).join('')}</div><div class="agenda-days">${calendar.map(day => { if (!day) return '<div class="agenda-day empty"></div>'; const date = `${month}-${day.padStart(2, '0')}`, dayEvents = byDay.get(Number(day)) ?? [], sources = [...new Set(dayEvents.map(event => event.source))], accessible = dayEvents.length ? `${day}/${monthNumber}, ${dayEvents.length} ${dayEvents.length === 1 ? 'item' : 'itens'}: ${sources.map(source => sourceLabels[source]).join(', ')}` : `${day}/${monthNumber}, sem itens`; return `<button class="agenda-day agenda-day-button ${dayEvents.length ? 'has-events' : ''} ${generalSelectedDate === date ? 'selected' : ''}" type="button" data-general-date="${date}" aria-label="${esc(accessible)}"><span>${day}</span><span class="agenda-day-markers" aria-hidden="true">${dayEvents.slice(0, 3).map(event => `<i class="${event.source}"></i>`).join('')}${dayEvents.length > 3 ? `<b>+${dayEvents.length - 3}</b>` : ''}</span></button>` }).join('')}</div></div>
    <div class="agenda-selected-day"><strong>${esc(labelDate(generalSelectedDate))}</strong><span>${selectedEvents.length} item(ns)</span></div>
    <div class="agenda-list">${selectedEvents.map(event => `<article class="agenda-event"><time>${event.time ? esc(event.time) : 'Dia inteiro'}</time><div><strong>${esc(event.title)}</strong><small><span class="agenda-source ${event.source}">${esc(sourceLabels[event.source])}</span> · ${esc(event.detail)}${event.location ? ` · ${esc(event.location)}` : ''}</small><p>${esc(event.people.join(', '))}</p></div><span class="agenda-status ${event.status}">${esc(statusLabel(event.status))}</span></article>`).join('') || '<p class="empty-state">Nenhuma designação nesta data.</p>'}</div>`
  bindScreenTabs()
  document.getElementById('generalPrev')?.addEventListener('click', () => moveMonth(-1))
  document.getElementById('generalNext')?.addEventListener('click', () => moveMonth(1))
  document.getElementById('generalMonth')?.addEventListener('change', event => { month = (event.target as HTMLInputElement).value || month; persistUiPreferences(); render() })
  document.getElementById('generalIcsMonth')?.addEventListener('click', () => downloadBoardIcs(events))
  document.querySelectorAll<HTMLButtonElement>('[data-general-date]').forEach(button => button.addEventListener('click', () => { generalSelectedDate = button.dataset['generalDate'] ?? generalSelectedDate; persistUiPreferences(); render() }))
}

function calendarExportPanel(): string {
  return `<details class="form-panel agenda-board-card agenda-personal-panel" data-agenda-panel="sharing" ${uiPreferences.personal.openPanels.includes('sharing') ? 'open' : ''}><summary><strong>Calendário e compartilhamento</strong><span>ICS</span></summary><div class="agenda-board-body"><div class="agenda-actions agenda-sharing-actions"><button class="btn btn-primary" id="agendaIcsMonth" type="button">Baixar mês</button><button class="btn btn-ghost" id="agendaIcsUpcoming" type="button">Baixar próximos</button><button class="btn btn-ghost" id="agendaShare" type="button">Compartilhar</button></div></div></details>`
}

function renderBoard(root: HTMLElement): void {
  const allEvents = announcementEvents()
  const meetingDates = boardMeetingDates(allEvents, fortalezaDate())
  if (!meetingDates.some(item => item.date === boardMeetingDate)) { boardMeetingDate = meetingDates[0]?.date ?? ''; persistUiPreferences() }
  const selectedMeeting = meetingDates.find(item => item.date === boardMeetingDate)
  const meetingEvents = boardMeetingEvents(allEvents, selectedMeeting)
  const hasCleaning = meetingEvents.some(event => event.source === 'limpeza')
  const allDocuments = documents().sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)), periods = publicDocumentMonths(allDocuments)
  if (!periods.includes(boardDocumentPeriod)) { boardDocumentPeriod = periods[0] ?? fortalezaDate().slice(0, 7); persistUiPreferences() }
  const visibleDocuments = groupPublicDocuments(allDocuments, boardDocumentPeriod)
  const meetingSummary = selectedMeeting ? `${labelDate(selectedMeeting.date)} · ${selectedMeeting.kind === 'midweek' ? 'Meio de semana' : 'Fim de semana'}` : 'Nenhuma reunião futura'
  root.innerHTML = `${moduleTitle('Minha agenda')}${screenTabs()}${loadingAssignments ? '<div class="notice">Atualizando designações dos módulos...</div>' : ''}
    <div class="agenda-board-sections">
      <details class="form-panel agenda-board-card" data-agenda-panel="meetings" ${uiPreferences.board.openPanels.includes('meetings') ? 'open' : ''}><summary><strong>Dados das reuniões</strong><span>${esc(meetingSummary)}</span></summary><div class="agenda-board-body"><label class="form-field"><span>Reunião</span><select id="boardMeetingDate">${meetingDates.map(item => `<option value="${esc(item.date)}" ${item.date === boardMeetingDate ? 'selected' : ''}>${esc(labelDate(item.date))} · ${item.kind === 'midweek' ? 'Meio de semana' : 'Fim de semana'}</option>`).join('') || '<option value="">Nenhuma reunião futura</option>'}</select></label><textarea id="boardInlineDraft" class="form-input" rows="12" maxlength="4000">${esc(boardMeetingMessage(meetingEvents, selectedMeeting))}</textarea><div class="agenda-actions"><button class="btn btn-ghost" id="boardInlineCopy" type="button">Copiar texto</button>${hasCleaning ? '<button class="btn btn-ghost" id="boardCleaningCopy" type="button">Copiar limpeza</button>' : ''}</div></div></details>
      <details class="form-panel agenda-board-card" data-agenda-panel="moduleDocuments" ${uiPreferences.board.openPanels.includes('moduleDocuments') ? 'open' : ''}><summary><strong>PDFs dos módulos</strong><span>${Object.keys(visibleDocuments.modules).length} de ${PUBLIC_PDF_MODULES.length}</span></summary><div class="agenda-board-body"><label class="form-field"><span>Período</span><select id="boardDocumentPeriod">${periods.map(period => `<option value="${esc(period)}" ${period === boardDocumentPeriod ? 'selected' : ''}>${esc(formatDocumentMonth(period))}</option>`).join('') || `<option value="${esc(boardDocumentPeriod)}">${esc(formatDocumentMonth(boardDocumentPeriod))}</option>`}</select></label><div class="agenda-module-downloads">${PUBLIC_PDF_MODULES.map(module => moduleDownloadRow(module, visibleDocuments.modules[module])).join('')}</div></div></details>
      <details class="form-panel agenda-board-card" data-agenda-panel="adminDocuments" ${uiPreferences.board.openPanels.includes('adminDocuments') ? 'open' : ''}><summary><strong>Documentos do Admin</strong><span>${visibleDocuments.admin.length}</span></summary><div class="agenda-board-body"><div class="agenda-document-list">${visibleDocuments.admin.map(item => `<a class="agenda-document" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer" download><span><strong>${esc(item.nome)}</strong><small>Publicado em ${esc(labelDate(item.criadoEm.slice(0, 10)))}</small></span><b>Baixar</b></a>`).join('') || '<p class="empty-state">Nenhum documento do Admin neste período.</p>'}</div></div></details>
    </div>`
  const sections = root.querySelector('.agenda-board-sections')!
  const moduleDocuments = sections.querySelector('[data-agenda-panel="moduleDocuments"]')!
  const adminDocuments = sections.querySelector('[data-agenda-panel="adminDocuments"]')!
  sections.prepend(moduleDocuments, adminDocuments)
  bindScreenTabs()
  document.getElementById('boardMeetingDate')?.addEventListener('change', event => { boardMeetingDate = (event.target as HTMLSelectElement).value; persistUiPreferences(); render() })
  document.getElementById('boardDocumentPeriod')?.addEventListener('change', event => { boardDocumentPeriod = (event.target as HTMLSelectElement).value; persistUiPreferences(); render() })
  document.getElementById('boardInlineCopy')?.addEventListener('click', () => void navigator.clipboard.writeText((document.getElementById('boardInlineDraft') as HTMLTextAreaElement).value))
  document.getElementById('boardCleaningCopy')?.addEventListener('click', () => void navigator.clipboard.writeText(boardCleaningMessage(meetingEvents)))
  bindPersistentPanels()
}

function formatDocumentMonth(value: string): string {
  if (!/^\d{4}-\d{2}$/.test(value)) return value
  const label = new Intl.DateTimeFormat('pt-BR', { month:'long', year:'numeric', timeZone:'UTC' }).format(new Date(`${value}-15T12:00:00Z`))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function moduleDownloadRow(module: PublicPdfModule, item?: AgendaPublicDocument): string {
  const label = documentSourceLabels[module]
  const actions = item
    ? `<div class="agenda-module-download-actions"><a class="btn btn-primary" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer" download="${esc(item.nome)}">Baixar PDF</a></div>`
    : '<button class="btn btn-primary" type="button" disabled>Baixar PDF</button>'
  return `<div class="agenda-module-download"><span><strong>${esc(label)}</strong><small>${item ? esc(item.periodo) : 'Ainda não publicado'}</small></span>${actions}</div>`
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


function downloadIcs(events: AgendaEvent[], filename: string, emptyMessage: string): void {
  if (!events.length) { alert(emptyMessage); return }
  const blob = new Blob([agendaToIcs(events, new Date().toISOString(), { reminders:agendaConfig().icsReminders, calendarName:'Minha agenda Noroeste' })], { type:'text/calendar;charset=utf-8' }), link = document.createElement('a')
  link.href = URL.createObjectURL(blob); link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}

function openShare(): void {
  const overlay = document.createElement('div'); overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal"><h2>Compartilhar agenda</h2><textarea id="agendaDraft" class="form-input" rows="10" maxlength="2000">${esc(agendaMessage(monthEvents()))}</textarea><div class="module-row-actions"><button class="btn btn-ghost" id="agendaCopy">Copiar</button><button class="btn btn-ghost" id="agendaClose">Fechar</button></div></div>`
  document.body.appendChild(overlay)
  document.getElementById('agendaClose')?.addEventListener('click', () => overlay.remove())
  document.getElementById('agendaCopy')?.addEventListener('click', () => void navigator.clipboard.writeText((document.getElementById('agendaDraft') as HTMLTextAreaElement).value))
}
