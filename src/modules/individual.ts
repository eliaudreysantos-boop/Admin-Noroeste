import type { AppContext, RawRoot } from '../types'
import { agendaRef, agendaSubscriptionsRef, escalaParticipantsRef, escalaPublishedMonthRef, escalaPublishedMonthsRef, escalaPubSnapshotsRef, escalaScalesRef, escalaTablesRef, get, limpezaPeriodosRef, pessoasRef, programacaoRef, secretarioRef, servicoCampoRef, tarefasCongregacoesRef, tarefasOradoresRef, tarefasPeopleRef, tarefasProgramacaoOradoresRef, tarefasScaleRef, update } from '../firebase'
import { moduleTitle } from '../ui/module-header'
import { agendaMessage, agendaToIcs, announcementMessage, collectAgendaEvents, collectAnnouncementEvents, upcomingAgendaEvents, type AgendaEvent, type AgendaSource, type AgendaStatus, type AnnouncementEvent } from './individual-domain'
import { CATEGORY_LABELS, isClosedMonth, normalizePersonalReport, serviceYearStart, type PublisherCategory, type SecretaryPublisher, type SecretaryReport } from './secretario-domain'
import type { AgendaConfig, AgendaPublicDocument, AgendaSubscription, MasterPessoa } from '../types'

let ctx: AppContext | null = null
let data: RawRoot = {}
let month = new Date().toISOString().slice(0, 7)
let screen: 'agenda' | 'relatorio' | 'quadro' = 'agenda'
let boardSource: AgendaSource | 'todas' = 'todas'
let boardStatus: AgendaStatus | 'todos' = 'todos'
let agendaSource: AgendaSource | 'todas' = 'todas'
let agendaStatus: AgendaStatus | 'todos' = 'todos'
let boardDocumentPeriod = month
const boardSubscriptionModules = new Set<AgendaSource>(['tarefas', 'escala', 'oradores', 'programacao', 'servicoCampo'])
let subscriptionPersonId = ''
let loadingAssignments = true
let offlinePersonalEvents: AgendaEvent[] | null = null
let offlineAnnouncementEvents: AnnouncementEvent[] | null = null

const OFFLINE_CACHE_KEY = 'noroeste_agenda_offline_v1'
const DAILY_SYNC_MS = 24 * 60 * 60 * 1000

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
      programacaoRef, secretarioRef, agendaRef, servicoCampoRef,
    ]
    const values = await Promise.all(references.map(readValue))
    const value = (index: number): unknown => values[index]
    data = {
      master:{ pessoas:(masterPeople ?? {}) as Record<string, MasterPessoa> },
      tarefas:{ people:value(0), scale:{ periods:value(1) }, discursos:{ oradores:value(2), programacao:value(3), congregacoes:value(4) } },
      limpeza:{ periodos:value(5) },
      escala:{ participants:value(6), scales:value(7), tables:value(8), publishedMonth:value(9), publishedMonths:value(10), publishedSnapshots:value(11) },
      programacao:value(12), secretario:value(13), agenda:value(14), servicoCampo:value(15),
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
function subscriptions(): Record<string, AgendaSubscription> { return (agendaRoot()['assinaturas'] ?? {}) as Record<string, AgendaSubscription> }
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
function screenTabs(): string { return `<div class="program-period-modes" role="tablist" aria-label="Minha agenda" style="margin-bottom:12px"><button class="program-period-mode" type="button" data-agenda-screen="agenda" aria-pressed="${screen === 'agenda'}">Agenda</button><button class="program-period-mode" type="button" data-agenda-screen="relatorio" aria-pressed="${screen === 'relatorio'}">Relatório</button><button class="program-period-mode" type="button" data-agenda-screen="quadro" aria-pressed="${screen === 'quadro'}">Quadro</button></div>` }
function bindScreenTabs(): void { document.querySelectorAll<HTMLButtonElement>('[data-agenda-screen]').forEach(button => button.addEventListener('click', () => { screen = button.dataset['agendaScreen'] as typeof screen; render() })) }

function render(): void {
  const root = document.getElementById('individualRoot')
  if (!root || !ctx) return
  ensureSelectedPerson()
  if (!selectedMasterId()) { root.innerHTML = `${moduleTitle('Minha agenda')}<div class="notice ${loadingAssignments ? '' : 'warning'}">${loadingAssignments ? 'Carregando pessoas e vínculos...' : 'Seu usuário ainda não está vinculado ao cadastro do Admin.'}</div>`; return }
  if (screen === 'relatorio') { renderReportScreen(root); return }
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
  const token = randomToken(), record: AgendaSubscription = { ...item, token, ativo:true, criadoEm:new Date().toISOString() }
  await update(agendaSubscriptionsRef, { [token]:record })
  const current = subscriptions(); current[token] = record; agendaRoot()['assinaturas'] = current
}

async function revokeSubscription(token: string): Promise<void> {
  const revokedAt = new Date().toISOString()
  await update(agendaSubscriptionsRef, { [`${token}/ativo`]:false, [`${token}/revogadoEm`]:revokedAt })
  if (subscriptions()[token]) Object.assign(subscriptions()[token], { ativo:false, revogadoEm:revokedAt })
}

function bindPersonalSubscription(): void {
  document.getElementById('createPersonalSubscription')?.addEventListener('click', async () => { try { await createSubscription({ tipo:'pessoal', masterId:subscriptionPersonId }); render() } catch { alert('Não foi possível gerar o link de assinatura.') } })
  const current = Object.values(subscriptions()).find(item => item.tipo === 'pessoal' && item.masterId === subscriptionPersonId && item.ativo)
  document.getElementById('copyPersonalSubscription')?.addEventListener('click', async () => { if (current) await navigator.clipboard.writeText(feedUrl(current.token)) })
  document.getElementById('revokePersonalSubscription')?.addEventListener('click', async () => { if (!current || !confirm('Revogar este link de assinatura?')) return; try { await revokeSubscription(current.token); render() } catch { alert('Não foi possível revogar o link.') } })
}

function renderReportScreen(root: HTMLElement): void {
  const masterId = selectedMasterId(), secretary = (data.secretario ?? {}) as Record<string, unknown>, publisher = Object.values((secretary['publicadores'] ?? {}) as Record<string, SecretaryPublisher>).find(item => item.masterId === masterId && item.ativo)
  const reports = Object.values((secretary['relatorios'] ?? {}) as Record<string, SecretaryReport>).filter(report => report.masterId === masterId)
  const year = serviceYearStart(month), start = `${year}-09`, end = `${year + 1}-08`
  const serviceReports = reports.filter(report => { const competence = String(report['competencia'] ?? ''); return competence >= start && competence <= end })
  const studies = serviceReports.reduce((sum, report) => sum + (Number(report['estudos']) || 0), 0)
  const regularHours = serviceReports.reduce((sum, report) => sum + (Number(report.horasCampo) || 0), 0)
  const pioneerProgress = publisher?.categoria === 'pioneiro_regular' ? `<div><strong>${regularHours}/600</strong><span>Horas no ano</span></div>` : ''
  const viewingAsAdmin = isAdmin() && !ctx!.usuario.masterId
  const reportAction = publisher ? (viewingAsAdmin ? '<div class="notice">Use o módulo Secretário para lançar ou ajustar o relatório desta pessoa.</div>' : '<button class="btn btn-primary" id="openPersonalReport" type="button">Enviar relatório</button>') : '<div class="notice warning">Este cadastro ainda não foi vinculado como publicador pelo secretário.</div>'
  root.innerHTML = `${moduleTitle('Minha agenda')}${screenTabs()}${loadingAssignments ? '<div class="notice">Atualizando dados dos módulos...</div>' : ''}${adminPersonPicker()}<div class="program-summary"><div><strong>${serviceReports.length}</strong><span>Relatórios no ano</span></div><div><strong>${studies}</strong><span>Estudos bíblicos</span></div>${pioneerProgress}<div><strong>${year}/${String(year + 1).slice(-2)}</strong><span>Ano de serviço</span></div></div><div class="form-panel"><h3 style="margin-top:0">Relatório de serviço</h3><p class="form-help">${publisher ? `${esc(CATEGORY_LABELS[publisher.categoria])}. ${viewingAsAdmin ? 'Consulta administrativa do ano de serviço.' : 'Envie seu relatório mensal e acompanhe os registros já recebidos.'}` : 'Aguarde o vínculo do cadastro pelo secretário.'}</p>${reportAction}</div><div class="module-option-list">${serviceReports.sort((a, b) => String(b.competencia).localeCompare(String(a.competencia))).map(report => `<div class="agenda-event"><time>${esc(String(report.competencia))}</time><div><strong>${report.participou === false ? 'Não participou' : 'Participou no ministério'}</strong><small>${Number(report.estudos) || 0} estudo(s) bíblico(s)${report.horasCampo ? ` · ${report.horasCampo} hora(s)` : ''} · ${report.origem === 'secretario' ? 'Lançado pelo secretário' : 'Enviado pela pessoa'}${isClosedMonth(String(report.competencia), secretary['fechamentos']) ? ' · Mês fechado' : ''}</small></div><span class="agenda-status ${report.origem === 'secretario' ? 'alterado' : 'realizado'}">${report.origem === 'secretario' ? 'Secretário' : 'Pessoa'}</span></div>`).join('') || '<p class="empty-state">Nenhum relatório neste ano de serviço.</p>'}</div>`
  bindScreenTabs(); bindAdminPersonPicker(); document.getElementById('openPersonalReport')?.addEventListener('click', openReport)
}

function renderBoard(root: HTMLElement): void {
  const events = announcementEvents().filter(event => event.date.startsWith(month) && (boardSource === 'todas' || event.source === boardSource) && (boardStatus === 'todos' || event.status === boardStatus))
  const [year, monthNumber] = month.split('-').map(Number), firstDow = new Date(year, monthNumber - 1, 1).getDay(), totalDays = new Date(year, monthNumber, 0).getDate()
  const byDay = new Map<number, typeof events>(); events.forEach(event => { const day = Number(event.date.slice(-2)); byDay.set(day, [...(byDay.get(day) ?? []), event]) })
  const calendar = [...Array(firstDow).fill(''), ...Array.from({ length:totalDays }, (_, index) => String(index + 1))]
  const allDocuments = documents().sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)), periods = [...new Set(allDocuments.map(item => item.periodo))].sort((a, b) => b.localeCompare(a))
  if (!periods.includes(boardDocumentPeriod)) boardDocumentPeriod = periods[0] ?? month
  const visibleDocuments = allDocuments.filter(item => item.periodo === boardDocumentPeriod)
  root.innerHTML = `${moduleTitle('Minha agenda')}${screenTabs()}${loadingAssignments ? '<div class="notice">Atualizando designações dos módulos...</div>' : ''}
    <div class="agenda-toolbar"><button class="btn btn-ghost" id="boardPrev" type="button" aria-label="Mês anterior">‹</button><input class="form-input" id="boardMonth" type="month" value="${month}"><button class="btn btn-ghost" id="boardNext" type="button" aria-label="Próximo mês">›</button></div>
    <div class="module-form-grid" style="margin-bottom:12px"><div class="form-group"><label class="form-label">Origem</label><select id="boardSource" class="form-select"><option value="todas">Todas</option>${Object.entries(sourceLabels).map(([id, label]) => `<option value="${id}" ${boardSource === id ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></div><div class="form-group"><label class="form-label">Status</label><select id="boardStatus" class="form-select"><option value="todos">Todos</option><option value="futuro" ${boardStatus === 'futuro' ? 'selected' : ''}>Futuro</option><option value="confirmacao-pendente" ${boardStatus === 'confirmacao-pendente' ? 'selected' : ''}>Confirmação pendente</option><option value="alterado" ${boardStatus === 'alterado' ? 'selected' : ''}>Alterado</option><option value="realizado" ${boardStatus === 'realizado' ? 'selected' : ''}>Realizado</option></select></div></div>
    <div class="agenda-board-sections">
      <details class="form-panel agenda-board-card" open><summary><strong>Calendário de designações</strong><span>${events.length} item(ns)</span></summary><div class="agenda-board-body"><div class="agenda-actions"><button class="btn btn-ghost" id="boardIcsMonth" type="button">Baixar calendário</button></div><div class="agenda-calendar"><div class="agenda-weekdays">${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(day => `<strong>${day}</strong>`).join('')}</div><div class="agenda-days">${calendar.map(day => day ? `<div class="agenda-day ${byDay.has(Number(day)) ? 'has-events' : ''}"><span>${day}</span>${(byDay.get(Number(day)) ?? []).slice(0, 4).map(event => `<i title="${esc(event.title)}"></i>`).join('')}</div>` : '<div class="agenda-day empty"></div>').join('')}</div></div><div class="agenda-list">${events.map(event => `<article class="agenda-event"><time>${esc(labelDate(event.date))}${event.time ? ` · ${esc(event.time)}` : ''}</time><div><strong>${esc(event.title)}</strong><small><span class="agenda-source ${event.source}">${esc(sourceLabels[event.source])}</span> · ${esc(event.detail)}${event.location ? ` · ${esc(event.location)}` : ''}</small><p>${esc(event.people.join(', '))}</p></div><span class="agenda-status ${event.status}">${esc(event.status.replace(/-/g, ' '))}</span></article>`).join('') || '<p class="empty-state">Nenhuma designação neste período.</p>'}</div></div></details>
      <details class="form-panel agenda-board-card"><summary><strong>Dados das reuniões</strong><span>Texto pronto</span></summary><div class="agenda-board-body"><textarea id="boardInlineDraft" class="form-input" rows="12" maxlength="4000">${esc(announcementMessage(events))}</textarea><div class="agenda-actions"><button class="btn btn-ghost" id="boardInlineCopy" type="button">Copiar texto</button><button class="btn btn-primary" id="boardWhatsapp" type="button">Abrir WhatsApp</button></div><p class="form-help">${agendaConfig().quadroWhatsAppLink ? 'O texto será copiado e o grupo configurado no Admin será aberto.' : 'Nenhum grupo foi configurado no Admin; o seletor comum do WhatsApp será aberto.'}</p></div></details>
      <details class="form-panel agenda-board-card"><summary><strong>Arquivos publicados</strong><span>${allDocuments.length} arquivo(s)</span></summary><div class="agenda-board-body"><label class="form-field"><span>Período</span><select id="boardDocumentPeriod">${periods.map(period => `<option value="${esc(period)}" ${period === boardDocumentPeriod ? 'selected' : ''}>${esc(period)}</option>`).join('') || `<option value="${esc(month)}">${esc(month)}</option>`}</select></label><div class="agenda-document-list">${visibleDocuments.map(item => `<a class="agenda-document" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer"><span><strong>${esc(item.nome)}</strong><small>${esc(documentSourceLabels[item.modulo] ?? item.modulo)} · publicado em ${esc(labelDate(item.criadoEm.slice(0, 10)))}</small></span><b>Baixar PDF</b></a>`).join('') || '<p class="empty-state">Nenhum PDF publicado neste período.</p>'}</div></div></details>
      ${boardSubscriptionPanel()}
    </div>`
  bindScreenTabs()
  document.getElementById('boardPrev')?.addEventListener('click', () => moveMonth(-1))
  document.getElementById('boardNext')?.addEventListener('click', () => moveMonth(1))
  document.getElementById('boardMonth')?.addEventListener('change', event => { month = (event.target as HTMLInputElement).value || month; render() })
  document.getElementById('boardSource')?.addEventListener('change', event => { boardSource = (event.target as HTMLSelectElement).value as typeof boardSource; render() })
  document.getElementById('boardStatus')?.addEventListener('change', event => { boardStatus = (event.target as HTMLSelectElement).value as typeof boardStatus; render() })
  document.getElementById('boardDocumentPeriod')?.addEventListener('change', event => { boardDocumentPeriod = (event.target as HTMLSelectElement).value; render() })
  document.getElementById('boardIcsMonth')?.addEventListener('click', () => downloadBoardIcs(events))
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
    try { await update(agendaSubscriptionsRef, { [`${current.token}/modulos`]:modulos }); current.modulos = modulos } catch { input.checked = !input.checked; input.checked ? boardSubscriptionModules.add(source) : boardSubscriptionModules.delete(source); alert('Não foi possível atualizar os módulos da assinatura.') }
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
  const existing = Object.values((secretary['relatorios'] ?? {}) as Record<string, SecretaryReport>).find(report => report.masterId === ctx!.usuario.masterId && report.competencia === month)
  if (existing?.origem === 'secretario') { alert('Este relatório já foi lançado pelo secretário.'); return }
  const day = new Date().getDate(), hasHours = ['pioneiro_auxiliar', 'pioneiro_regular'].includes(publisher.categoria), overlay = document.createElement('div'); overlay.className = 'modal-overlay'
  overlay.innerHTML = `<form class="modal" id="personalReport"><h2>Relatório pessoal</h2>${day > 10 ? '<div class="notice warning">O período normal de envio é do dia 1 ao dia 10.</div>' : ''}<label class="form-field"><span>Competência</span><input class="form-input" name="competencia" type="month" value="${month}" required></label><label><input name="participou" type="checkbox" ${existing?.participou !== false ? 'checked' : ''}> Participei no ministério</label><label class="form-field"><span>Estudos bíblicos</span><input class="form-input" name="estudos" type="number" min="0" value="${existing?.estudos ?? 0}"></label>${hasHours ? `<label class="form-field"><span>Horas no mês</span><input class="form-input" name="horasCampo" type="number" min="0" step="0.1" value="${existing?.horasCampo ?? 0}"></label>` : ''}<label class="form-field"><span>Observação</span><textarea class="form-input" name="observacoes" maxlength="250">${esc(existing?.observacoes)}</textarea></label><div class="secretary-actions"><button class="btn btn-ghost" id="reportCancel" type="button">Cancelar</button><button class="btn btn-primary" type="submit">${existing ? 'Atualizar relatório' : 'Enviar relatório'}</button></div></form>`
  document.body.appendChild(overlay); document.getElementById('reportCancel')?.addEventListener('click', () => overlay.remove())
  document.getElementById('personalReport')?.addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget as HTMLFormElement, values = new FormData(form), competence = String(values.get('competencia'))
    if (isClosedMonth(competence, ((data.secretario ?? {}) as Record<string, unknown>)['fechamentos'])) { alert('Esta competência já foi fechada pelo secretário e não pode mais ser alterada.'); return }
    const reports = ((data.secretario ?? {}) as Record<string, unknown>)['relatorios'] as Record<string, SecretaryReport> ?? {}, current = Object.values(reports).find(report => report.masterId === masterId && report.competencia === competence)
    if (current?.origem === 'secretario') { alert('Este relatório já foi lançado pelo secretário.'); return }
    const now = new Date().toISOString(), id = current?.id ?? `pessoal-${masterId}-${competence}`, item = normalizePersonalReport({ id, masterId, competencia:competence, categoria:publisher.categoria as PublisherCategory, participou:values.get('participou') === 'on', estudos:values.get('estudos'), horasCampo:values.get('horasCampo'), observacoes:values.get('observacoes'), recebidoEm:current?.recebidoEm ?? now.slice(0, 10), atualizadoEm:now })
    await update(secretarioRef, { [`relatorios/${id}`]: item }); data.secretario = { ...(data.secretario ?? {}), relatorios: { ...(((data.secretario ?? {}) as Record<string, unknown>)['relatorios'] as Record<string, unknown> ?? {}), [id]: item } }; overlay.remove(); render(); alert('Relatório enviado para conferência do secretário.')
  })
}
