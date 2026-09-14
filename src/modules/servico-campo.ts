import type { AppContext, ConfigCongregacao, MasterPessoa, RawPessoas } from '../types'
import { configCongregacaoRef, get, pessoasRef, servicoCampoRef, update } from '../firebase'
import { renderMenuCards, type ItemMenu } from '../ui/menu-cards'
import { moduleBackButton, moduleTitle } from '../ui/module-header'
import { generateFieldServicePeriod, type FieldServiceAssignment, type FieldServicePeriod, type FieldServiceTemplate } from './servico-campo-domain'
import { PublicationPreviewGate } from './pdf-publication-preview'
import { mountModuleMessageSettings } from './module-message-settings'

interface ServiceRoot {
  templates?: Record<string, FieldServiceTemplate>
  leaders?: Record<string, boolean>
  periods?: Record<string, FieldServicePeriod>
}

type Screen = 'indice' | 'programacao' | 'configuracao'
const DAYS = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']
const MONTH_KEY = 'noroeste_servico_campo_month'
let screen: Screen = 'indice'
let data: ServiceRoot = {}
let people: RawPessoas = {}
let congregation: ConfigCongregacao = { nome:'Noroeste', cidade:'', circuito:'', idioma:'pt-BR' }
let selectedMonth = localStorage.getItem(MONTH_KEY) ?? new Date().toISOString().slice(0, 7)
let editingTemplateId = ''
const fieldServicePdfPreview = new PublicationPreviewGate()

function fieldServicePdfInput(assignments = Object.values(currentPeriod()?.assignments ?? {})): Parameters<typeof import('./servico-campo-documents').createFieldServicePdf>[0] {
  return { month:selectedMonth, assignments, people, congregation:congregation.nome }
}

const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char] ?? char))
const id = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
const templates = (): Record<string, FieldServiceTemplate> => data.templates ?? {}
const periods = (): Record<string, FieldServicePeriod> => data.periods ?? {}
const currentPeriod = (): FieldServicePeriod | undefined => periods()[selectedMonth]
const leaderIds = (): string[] => Object.keys(data.leaders ?? {}).filter(masterId => data.leaders?.[masterId] && people[masterId]?.active !== false && people[masterId]?.sex === 'M').sort((a, b) => people[a]!.name.localeCompare(people[b]!.name, 'pt-BR'))
const personName = (masterId: string): string => people[masterId]?.name ?? 'Cadastro não encontrado'
const ROLE_LABELS: Record<string, string> = { anciao:'Ancião', 'servo-ministerial':'Servo ministerial', pioneiro:'Pioneiro', batizado:'Batizado', publicador:'Publicador' }
const roleLabel = (person: MasterPessoa): string => ROLE_LABELS[person.role ?? ''] ?? 'Sem função'
const dateLabel = (date: string): string => new Intl.DateTimeFormat('pt-BR', { weekday:'long', day:'2-digit', month:'2-digit', timeZone:'UTC' }).format(new Date(`${date}T12:00:00Z`))
const monthLabel = (month: string): string => new Intl.DateTimeFormat('pt-BR', { month:'long', year:'numeric', timeZone:'UTC' }).format(new Date(`${month}-15T12:00:00Z`))

function toast(message: string): void { const element = document.getElementById('toast'); if (!element) return; element.textContent = message; element.classList.add('show'); setTimeout(() => element.classList.remove('show'), 2800) }
function root(): HTMLElement { return document.getElementById('servicoCampoRoot')! }
function sectionTitle(title: string): string { return `<div class="module-section-title">${moduleBackButton()}<h2>${esc(title)}</h2></div>` }

export default function mount(appContext: AppContext): void {
  void appContext
  screen = 'indice'; editingTemplateId = ''
  const host = document.getElementById('appContent'); if (!host) return
  host.innerHTML = '<div id="servicoCampoRoot"><p class="empty-state">Carregando Serviço de Campo...</p></div>'
  void load()
}

async function load(): Promise<void> {
  try {
    const [serviceSnapshot, peopleSnapshot, congregationSnapshot] = await Promise.all([get(servicoCampoRef), get(pessoasRef), get(configCongregacaoRef)])
    data = serviceSnapshot.exists() ? serviceSnapshot.val() as ServiceRoot : {}
    people = peopleSnapshot.exists() ? peopleSnapshot.val() as RawPessoas : {}
    if (congregationSnapshot.exists()) congregation = { ...congregation, ...congregationSnapshot.val() as ConfigCongregacao }
  } catch { toast('Não foi possível carregar Serviço de Campo') }
  render()
}

function render(): void {
  if (screen === 'indice') renderIndex()
  else if (screen === 'configuracao') renderConfiguration()
  else renderSchedule()
}

function renderIndex(): void {
  root().innerHTML = `${moduleTitle('Serviço de Campo')}<div id="serviceMenu"></div>`
  const items: ItemMenu[] = [
    { id:'programacao', titulo:'Programação', subtitulo:'Gerar, revisar, publicar e imprimir', icone:'▦', corFundo:'#8A5A00' },
    { id:'configuracao', titulo:'Configuração', subtitulo:'Saídas recorrentes e dirigentes', icone:'⚙', corFundo:'#1A6B3C' },
  ]
  renderMenuCards(root().querySelector<HTMLElement>('#serviceMenu')!, items, selected => { screen = selected as Screen; render() })
}

function periodControl(): string {
  return `<div class="agenda-toolbar service-period"><button class="btn btn-ghost" id="servicePrev" type="button" aria-label="Mês anterior">‹</button><input id="serviceMonth" class="form-input" type="month" value="${selectedMonth}"><button class="btn btn-ghost" id="serviceNext" type="button" aria-label="Próximo mês">›</button></div>`
}

function bindPeriod(): void {
  const move = (delta: number): void => { const [year, month] = selectedMonth.split('-').map(Number), date = new Date(Date.UTC(year, month - 1 + delta, 1)); selectedMonth = date.toISOString().slice(0, 7); localStorage.setItem(MONTH_KEY, selectedMonth); render() }
  document.getElementById('servicePrev')?.addEventListener('click', () => move(-1))
  document.getElementById('serviceNext')?.addEventListener('click', () => move(1))
  document.getElementById('serviceMonth')?.addEventListener('change', event => { const value = (event.currentTarget as HTMLInputElement).value; if (/^\d{4}-\d{2}$/.test(value)) { selectedMonth = value; localStorage.setItem(MONTH_KEY, value); render() } })
}

function leaderOptions(selected = ''): string {
  return `<option value="">A definir</option>${leaderIds().map(masterId => `<option value="${esc(masterId)}" ${selected === masterId ? 'selected' : ''}>${esc(personName(masterId))}</option>`).join('')}`
}

function assignmentRow(assignment: FieldServiceAssignment, locked: boolean): string {
  return `<article class="service-assignment"><div class="service-assignment-date"><strong>${esc(dateLabel(assignment.date))}</strong><span>${esc(assignment.time)}</span></div><div><strong>${esc(assignment.location)}</strong><small>${esc(assignment.label)}${assignment.manual ? ' · Adicionada manualmente' : ''}</small></div><select class="form-select" data-service-leader="${esc(assignment.id)}" ${locked ? 'disabled' : ''}>${leaderOptions(assignment.leaderId)}</select>${locked ? '' : `<button class="btn btn-danger" type="button" data-service-delete="${esc(assignment.id)}" title="Remover saída">✕</button>`}</article>`
}

function renderSchedule(): void {
  const period = currentPeriod(), assignments = Object.values(period?.assignments ?? {}).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.location.localeCompare(b.location, 'pt-BR')), locked = period?.published === true
  const blank = assignments.filter(item => !item.leaderId).length
  root().innerHTML = `${sectionTitle('Programação de Serviço de Campo')}${periodControl()}${locked ? '<div class="notice">Este mês está publicado no Quadro e bloqueado para edição.</div>' : ''}<div class="service-summary"><div><strong>${assignments.length}</strong><span>Saídas</span></div><div><strong>${new Set(assignments.map(item => item.date)).size}</strong><span>Dias</span></div><div><strong>${blank}</strong><span>Sem dirigente</span></div><div><strong>${leaderIds().length}</strong><span>No rodízio</span></div></div><div class="service-actions"><button id="serviceGenerate" class="btn btn-primary" type="button" ${locked ? 'disabled' : ''}>${assignments.length ? 'Completar mês' : 'Gerar rodízio'}</button><button id="servicePdf" class="btn btn-ghost" type="button" ${assignments.length ? '' : 'disabled'}>Prévia PDF</button>${locked ? '<button id="serviceReopen" class="btn btn-ghost" type="button">Reabrir mês</button>' : `<button id="servicePublish" class="btn btn-ghost" type="button" ${assignments.length && !blank ? '' : 'disabled'}>Publicar mês</button>`}</div>${locked ? '' : manualAssignmentForm()}<div class="service-assignment-list">${assignments.map(item => assignmentRow(item, locked)).join('') || '<p class="empty-state">Configure as saídas e gere o rodízio deste mês.</p>'}</div>`
  bindPeriod()
  document.getElementById('serviceGenerate')?.addEventListener('click', () => void generatePeriod())
  document.getElementById('servicePdf')?.addEventListener('click', () => void openPdf())
  document.getElementById('servicePublish')?.addEventListener('click', () => void publishPeriod())
  document.getElementById('serviceReopen')?.addEventListener('click', () => void reopenPeriod())
  document.getElementById('manualServiceForm')?.addEventListener('submit', event => { event.preventDefault(); void addManualAssignment(event.currentTarget as HTMLFormElement) })
  document.querySelectorAll<HTMLSelectElement>('[data-service-leader]').forEach(select => select.addEventListener('change', () => void changeLeader(select.dataset.serviceLeader!, select.value)))
  document.querySelectorAll<HTMLButtonElement>('[data-service-delete]').forEach(button => button.addEventListener('click', () => void deleteAssignment(button.dataset.serviceDelete!)))
}

function manualAssignmentForm(): string {
  return `<form id="manualServiceForm" class="form-panel"><h3 style="margin-top:0">Adicionar saída</h3><div class="module-form-grid"><label class="form-field"><span>Data</span><input name="date" type="date" value="${selectedMonth}-01" required></label><label class="form-field"><span>Hora</span><input name="time" type="time" value="08:30" required></label><label class="form-field"><span>Local</span><input name="location" maxlength="80" required></label><label class="form-field"><span>Descrição</span><input name="label" maxlength="60" value="Saída de campo"></label><label class="form-field"><span>Dirigente</span><select name="leaderId">${leaderOptions()}</select></label></div><button class="btn btn-ghost" type="submit">Adicionar à programação</button></form>`
}

async function generatePeriod(): Promise<void> {
  if (!Object.values(templates()).some(item => item.active !== false)) { toast('Cadastre ao menos uma saída recorrente'); return }
  if (!leaderIds().length) { toast('Selecione ao menos um dirigente para o rodízio'); return }
  const period = generateFieldServicePeriod({ month:selectedMonth, templates:templates(), leaderIds:leaderIds(), periods:periods(), existing:currentPeriod() })
  try { await update(servicoCampoRef, { [`periods/${selectedMonth}`]:period }); data.periods = { ...periods(), [selectedMonth]:period }; toast('Rodízio gerado e pronto para revisão'); render() } catch { toast('Não foi possível gerar o rodízio') }
}

async function changeLeader(assignmentId: string, leaderId: string): Promise<void> {
  const period = currentPeriod(), assignment = period?.assignments?.[assignmentId]; if (!period || !assignment || period.published) return
  try { await update(servicoCampoRef, { [`periods/${selectedMonth}/assignments/${assignmentId}/leaderId`]:leaderId }); assignment.leaderId = leaderId; toast('Dirigente atualizado'); render() } catch { toast('Não foi possível atualizar o dirigente') }
}

async function addManualAssignment(form: HTMLFormElement): Promise<void> {
  const values = new FormData(form), date = String(values.get('date') ?? ''), time = String(values.get('time') ?? ''), location = String(values.get('location') ?? '').trim(), assignmentId = id('saida')
  if (!date.startsWith(selectedMonth) || !location || !/^\d{2}:\d{2}$/.test(time)) { toast('Preencha uma saída válida dentro do mês selecionado'); return }
  const assignment: FieldServiceAssignment = { id:assignmentId, templateId:'', date, time, location, label:String(values.get('label') ?? '').trim() || 'Saída de campo', leaderId:String(values.get('leaderId') ?? ''), manual:true }
  const current = currentPeriod() ?? { month:selectedMonth, assignments:{}, published:false }
  try { await update(servicoCampoRef, { [`periods/${selectedMonth}/month`]:selectedMonth, [`periods/${selectedMonth}/published`]:false, [`periods/${selectedMonth}/assignments/${assignmentId}`]:assignment }); current.assignments[assignmentId] = assignment; data.periods = { ...periods(), [selectedMonth]:current }; toast('Saída adicionada'); render() } catch { toast('Não foi possível adicionar a saída') }
}

async function deleteAssignment(assignmentId: string): Promise<void> {
  const period = currentPeriod(); if (!period || period.published || !period.assignments[assignmentId]) return
  if (!confirm('Remover esta saída da programação?')) return
  try { await update(servicoCampoRef, { [`periods/${selectedMonth}/assignments/${assignmentId}`]:null }); delete period.assignments[assignmentId]; toast('Saída removida'); render() } catch { toast('Não foi possível remover a saída') }
}

async function publishPeriod(): Promise<void> {
  const period = currentPeriod(), assignments = Object.values(period?.assignments ?? {})
  if (!period || !assignments.length || assignments.some(item => !item.leaderId)) { toast('Defina um dirigente para todas as saídas'); return }
  if (!fieldServicePdfPreview.matches(fieldServicePdfInput(assignments))) { toast('Abra a prévia atual do PDF antes de publicar'); return }
  const publishedAt = new Date().toISOString()
  try {
    const { createFieldServicePdf } = await import('./servico-campo-documents')
    const { publishAgendaModulePdf } = await import('./agenda-documents')
    const bytes = await createFieldServicePdf(fieldServicePdfInput(assignments))
    const lastDay = new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)), 0).getDate()
    await publishAgendaModulePdf(bytes, { modulo:'servicoCampo', periodo:selectedMonth, inicio:`${selectedMonth}-01`, fim:`${selectedMonth}-${lastDay}`, origemPeriodoId:selectedMonth, nome:`servico-de-campo-${selectedMonth}.pdf` })
    await update(servicoCampoRef, { [`periods/${selectedMonth}/published`]:true, [`periods/${selectedMonth}/publishedAt`]:publishedAt }); period.published = true; period.publishedAt = publishedAt; toast('Mês publicado na Minha Agenda e no Quadro'); render()
  } catch { toast('Não foi possível publicar o mês') }
}

async function reopenPeriod(): Promise<void> {
  const period = currentPeriod(); if (!period || !confirm(`Reabrir ${monthLabel(selectedMonth)} para edição?`)) return
  try { const { unpublishAgendaModulePdf } = await import('./agenda-documents'); await unpublishAgendaModulePdf('servicoCampo', selectedMonth); await update(servicoCampoRef, { [`periods/${selectedMonth}/published`]:false, [`periods/${selectedMonth}/publishedAt`]:null }); period.published = false; delete period.publishedAt; toast('Mês reaberto'); render() } catch { toast('Não foi possível reabrir o mês') }
}

async function openPdf(): Promise<void> {
  const assignments = Object.values(currentPeriod()?.assignments ?? {}); if (!assignments.length) return
  const input = fieldServicePdfInput(assignments)
  try { const docs = await import('./servico-campo-documents'); await docs.previewFieldServicePdf(input); fieldServicePdfPreview.mark(input); toast('Prévia do PDF gerada e pronta para publicação') } catch { toast('Não foi possível gerar o PDF') }
}

function renderConfiguration(): void {
  const current = templates()[editingTemplateId]
  const templateRows = Object.values(templates()).sort((a, b) => a.sortOrder - b.sortOrder || a.dow - b.dow || a.time.localeCompare(b.time)).map(item => `<div class="secretary-row"><div><strong>${DAYS[item.dow]} · ${esc(item.time)}</strong><small>${esc(item.location)} · ${esc(item.label)} · ${item.active ? 'Ativa' : 'Inativa'} · ${item.leaderIds?.length ? `${item.leaderIds.length} dirigente(s) próprio(s)` : 'rodízio geral'}</small></div><button class="btn btn-ghost" data-edit-service-template="${esc(item.id)}">Editar</button><button class="btn btn-danger" data-delete-service-template="${esc(item.id)}" title="Remover saída">✕</button></div>`).join('')
  const leaderRows = Object.entries(people).filter(([, person]) => person.active !== false && person.sex === 'M').sort((a, b) => a[1].name.localeCompare(b[1].name, 'pt-BR')).map(([masterId, person]) => `<label class="service-leader-option"><input type="checkbox" data-service-eligible="${esc(masterId)}" ${data.leaders?.[masterId] ? 'checked' : ''}><span><strong>${esc(person.name)}</strong><small>${esc(roleLabel(person))}</small></span></label>`).join('')
  const ownLeaderRows = Object.entries(people).filter(([, person]) => person.active !== false && person.sex === 'M').sort((a, b) => a[1].name.localeCompare(b[1].name, 'pt-BR')).map(([masterId, person]) => `<label class="service-leader-option"><input name="templateLeader" type="checkbox" value="${esc(masterId)}" ${current?.leaderIds?.includes(masterId) ? 'checked' : ''}><span><strong>${esc(person.name)}</strong><small>${esc(roleLabel(person))}</small></span></label>`).join('')
  root().innerHTML = `${sectionTitle('Configuração do Serviço de Campo')}<form id="serviceTemplateForm" class="form-panel"><h3 style="margin-top:0">${current ? 'Editar saída recorrente' : 'Nova saída recorrente'}</h3><input name="templateId" type="hidden" value="${esc(current?.id)}"><div class="module-form-grid"><label class="form-field"><span>Dia</span><select name="dow">${DAYS.map((day, dow) => `<option value="${dow}" ${current?.dow === dow ? 'selected' : ''}>${day}</option>`).join('')}</select></label><label class="form-field"><span>Hora</span><input name="time" type="time" value="${esc(current?.time ?? '08:30')}" required></label><label class="form-field"><span>Local</span><input name="location" maxlength="80" value="${esc(current?.location)}" required></label><label class="form-field"><span>Descrição</span><input name="label" maxlength="60" value="${esc(current?.label ?? 'Saída de campo')}"></label><label class="form-field"><span>Ordem</span><input name="sortOrder" type="number" value="${current?.sortOrder ?? Object.keys(templates()).length}"></label><label><input name="active" type="checkbox" ${current?.active !== false ? 'checked' : ''}> Saída ativa</label></div><details style="margin-top:12px"><summary>Rodízio próprio deste dia e horário</summary><p class="form-help">Sem seleção, esta saída usa o rodízio geral. Selecione irmãos aqui para criar um revezamento específico.</p><div class="service-leader-grid">${ownLeaderRows || '<p class="empty-state">Nenhum irmão ativo disponível.</p>'}</div></details><div class="service-actions"><button class="btn btn-primary" type="submit">Salvar saída</button>${current ? '<button id="cancelServiceTemplate" class="btn btn-ghost" type="button">Cancelar</button>' : ''}</div></form><div class="module-option-list">${templateRows || '<p class="empty-state">Nenhuma saída recorrente cadastrada.</p>'}</div><div class="form-panel"><h3 style="margin-top:0">Dirigentes do rodízio geral</h3><p class="form-help">Somente irmãos ativos aparecem como dirigentes. O rodízio funciona com qualquer quantidade de pessoas e evita repetir o responsável no mesmo dia enquanto houver outra pessoa disponível.</p><div class="service-leader-grid">${leaderRows || '<p class="empty-state">Nenhum irmão ativo disponível no cadastro Admin.</p>'}</div><button id="saveServiceLeaders" class="btn btn-primary" type="button">Salvar dirigentes</button></div><div id="fieldServiceMessageSettings"></div>`
  document.getElementById('serviceTemplateForm')?.addEventListener('submit', event => { event.preventDefault(); void saveTemplate(event.currentTarget as HTMLFormElement) })
  document.getElementById('cancelServiceTemplate')?.addEventListener('click', () => { editingTemplateId = ''; render() })
  document.querySelectorAll<HTMLButtonElement>('[data-edit-service-template]').forEach(button => button.addEventListener('click', () => { editingTemplateId = button.dataset.editServiceTemplate!; render() }))
  document.querySelectorAll<HTMLButtonElement>('[data-delete-service-template]').forEach(button => button.addEventListener('click', () => void deleteTemplate(button.dataset.deleteServiceTemplate!)))
  document.getElementById('saveServiceLeaders')?.addEventListener('click', () => void saveLeaders())
  void mountModuleMessageSettings('fieldServiceMessageSettings', 'servicoCampo', toast)
}

async function saveTemplate(form: HTMLFormElement): Promise<void> {
  const values = new FormData(form), templateId = String(values.get('templateId') ?? '') || id('modelo'), time = String(values.get('time') ?? ''), location = String(values.get('location') ?? '').trim()
  if (!/^\d{2}:\d{2}$/.test(time) || !location) { toast('Preencha horário e local'); return }
  const item: FieldServiceTemplate = { id:templateId, label:String(values.get('label') ?? '').trim() || 'Saída de campo', dow:Number(values.get('dow')), time, location, active:values.get('active') === 'on', sortOrder:Number(values.get('sortOrder')) || 0, leaderIds:values.getAll('templateLeader').map(String).filter(Boolean) }
  try { await update(servicoCampoRef, { [`templates/${templateId}`]:item }); data.templates = { ...templates(), [templateId]:item }; editingTemplateId = ''; toast('Saída recorrente salva'); render() } catch { toast('Não foi possível salvar a saída') }
}

async function deleteTemplate(templateId: string): Promise<void> {
  const used = Object.values(periods()).some(period => Object.values(period.assignments ?? {}).some(item => item.templateId === templateId))
  if (!confirm(used ? 'Esta saída já possui histórico. Ela será apenas inativada.' : 'Remover esta saída recorrente?')) return
  try {
    if (used) { await update(servicoCampoRef, { [`templates/${templateId}/active`]:false }); templates()[templateId]!.active = false }
    else { await update(servicoCampoRef, { [`templates/${templateId}`]:null }); delete templates()[templateId] }
    editingTemplateId = ''; toast(used ? 'Saída inativada; histórico preservado' : 'Saída removida'); render()
  } catch { toast('Não foi possível alterar a saída') }
}

async function saveLeaders(): Promise<void> {
  const selected = Object.fromEntries([...document.querySelectorAll<HTMLInputElement>('[data-service-eligible]')].filter(input => input.checked).map(input => [input.dataset.serviceEligible!, true]))
  try { await update(servicoCampoRef, { leaders:selected }); data.leaders = selected; toast('Dirigentes do rodízio salvos') } catch { toast('Não foi possível salvar os dirigentes') }
}
