import type { AppContext } from '../types'
import {
  get,
  update,
  tarefasRef,
  tarefasPeopleRef,
  tarefasPlanejamentoRef,
  tarefasScaleRef,
  tarefasDiscursosRef,
  tarefasEventosRef,
  tarefasSettingsRef,
  configCongregacaoRef,
  pessoasRef,
} from '../firebase'
import { renderMenuCards, type ItemMenu } from '../ui/menu-cards'
import { moduleBackButton } from '../ui/module-header'
import {
  TASK_ROLES,
  TASK_ROLE_LABELS,
  assignmentForRole,
  canonicalMeetingType,
  computeGeneration,
  manualConflictReason,
  meetingIsBlocked,
  meetingEntries,
  isHistoricalFirstSection,
  periodKeyForDate,
  personIsActive,
  personName,
  personPhone,
  roleApplies,
  withCanonicalPeriod,
  type TaskDomainContext,
  type TaskEvent,
  type TaskMeeting,
  type TaskPeriod,
  type TaskPerson,
  type TaskRole,
  type TaskSpeaker,
  type TaskTalk,
} from './tarefas-domain'
import {
  buildTaskConfirmationMessage,
  buildTaskDayMessage,
  buildTaskPersonMessage,
  formatTaskDate,
  paginateItems,
  rowsPerPrintPage,
} from './tarefas-output'

type TarefasTab = 'indice' | 'resumo' | 'escala' | 'participantes' | 'mensagens' | 'pendencias'

const PRINT_FONT_KEY = 'noroeste_tarefas_print_font_pt'
const PRINT_MIN_PT = 8
const PRINT_MAX_PT = 22
const PRINT_DEFAULT_PT = 14
const A4_LANDSCAPE_WIDTH_PX = ((297 - 16) / 25.4) * 96
const A4_LANDSCAPE_HEIGHT_PX = ((210 - 16) / 25.4) * 96

type TarefasPessoa = TaskPerson
type TarefasMeeting = TaskMeeting
type TarefasPeriod = TaskPeriod

interface TarefasPlanning {
  scaleStartDate?: string
  generatedAt?: string
  periodMode?: 'month' | 'bimester'
  editingPeriod?: string
  meetingDays?: { midweekDow?: number; weekendDow?: number }
  midweekDow?: number
  weekendDow?: number
  excludedDates?: string[] | Record<string, string>
}

interface TarefasSettings {
  whatsappGroupLink?: string
  messages?: {
    tarefasPessoaPrefix?: string
    tarefasDataPrefix?: string
    tarefasConfirmacaoPrefix?: string
  }
}

let activeTab: TarefasTab = 'indice'
let pessoas: Record<string, TarefasPessoa> = {}
let periods: Record<string, TarefasPeriod> = {}
let planning: TarefasPlanning = {}
let events: Record<string, TaskEvent> = {}
let speakers: Record<string, TaskSpeaker> = {}
let talks: Record<string, TaskTalk> = {}
let settings: TarefasSettings = {}
let congregationName = 'Noroeste'
let masterPeople: Record<string, { name?: string; whatsapp?: string; active?: boolean }> = {}
let context: AppContext
let selectedPeriodMonth = monthNow()

function monthNow(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(value: string, amount: number): string {
  const [year, month] = value.split('-').map(Number)
  const date = new Date(year, month - 1 + amount, 1, 12)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function toast(msg: string, ms = 2600): void {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = msg
  el.classList.add('show')
  setTimeout(() => el.classList.remove('show'), ms)
}

function escapeHtml(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function pessoaNome(p: TarefasPessoa, fallback: string): string {
  return personName(p, fallback)
}

function isActive(p: TarefasPessoa): boolean {
  return personIsActive(p)
}

function allMeetings(): TarefasMeeting[] {
  return Object.values(periods)
    .flatMap(period => Object.values(period.meetings ?? {}))
    .filter(meeting => meeting && typeof meeting === 'object' && canonicalMeetingType(meeting.type))
}

function futureMeetings(): TarefasMeeting[] {
  const hoje = todayStr()
  return allMeetings()
    .filter(meeting => !meeting.date || meeting.date >= hoje)
    .sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')))
}

function assignmentCount(meeting: TarefasMeeting): number {
  return TASK_ROLES.filter(role => assignmentForRole(meeting, role)).length
}

const GENERATED_ROLES: readonly TaskRole[] = TASK_ROLES

function meetingAllowsRole(meeting: TarefasMeeting, role: string): boolean {
  return TASK_ROLES.includes(role as TaskRole) && roleApplies(role as TaskRole, meeting)
}

function scaleMeetingEntries(): Array<{ periodId: string; meetingId: string; meeting: TarefasMeeting }> {
  return Object.entries(periods).flatMap(([periodId, period]) =>
    Object.entries(period.meetings ?? {}).map(([meetingId, meeting]) => ({ periodId, meetingId, meeting })),
  )
}

function meetingRefFor(meeting: TarefasMeeting): { periodId: string; meetingId: string } | null {
  const found = scaleMeetingEntries().find(entry => entry.meeting === meeting)
  return found ? { periodId: found.periodId, meetingId: found.meetingId } : null
}

function domainContext(): TaskDomainContext {
  return { people: pessoas, periods, events, speakers, talks }
}

function formatDate(value: string | undefined): string {
  return formatTaskDate(value)
}

function printFont(): number {
  const saved = Number(localStorage.getItem(PRINT_FONT_KEY))
  if (Number.isFinite(saved)) return Math.min(PRINT_MAX_PT, Math.max(PRINT_MIN_PT, saved))
  return PRINT_DEFAULT_PT
}

function roleLabel(key: string): string {
  if (TASK_ROLES.includes(key as TaskRole)) return TASK_ROLE_LABELS[key as TaskRole]
  const labels: Record<string, string> = {
    operador1: 'Operador',
    operador2: 'Operador',
    mic1: 'Microfone',
    mic2: 'Microfone',
    microfone1: 'Microfone',
    microfone2: 'Microfone',
    presidente: 'Presidente',
    leitor: 'Leitor',
    entrada: 'Entrada',
    auditorio: 'Auditório',
  }
  return labels[key] ?? key
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, ch => ch.toUpperCase())
}

function assignmentName(value: unknown): string {
  if (typeof value === 'string') return pessoas[value] ? pessoaNome(pessoas[value], value) : value
  if (!value || typeof value !== 'object') return ''

  const item = value as Record<string, unknown>
  const direct = item['name'] ?? item['nome'] ?? item['label']
  if (typeof direct === 'string' && direct.trim()) return direct

  const id = item['personId'] ?? item['pessoaId'] ?? item['peopleId'] ?? item['id']
  if (typeof id === 'string') return pessoas[id] ? pessoaNome(pessoas[id], id) : id

  return ''
}

export default function mount(ctx: AppContext): void {
  context = ctx
  activeTab = 'indice'
  const el = document.getElementById('appContent')
  if (!el) return

  el.innerHTML = `
    <div id="tarefasRoot">
      <div id="tarefasContent">
        <p style="padding:24px;color:var(--ink-3);text-align:center">Carregando...</p>
      </div>
    </div>`

  void loadTarefas()
}

async function loadTarefas(): Promise<void> {
  try {
    const [peopleSnap, scaleSnap, planningSnap, eventsSnap, discursosSnap, settingsSnap, congregacaoSnap, masterPeopleSnap] = await Promise.all([
      get(tarefasPeopleRef),
      get(tarefasScaleRef),
      get(tarefasPlanejamentoRef),
      get(tarefasEventosRef),
      get(tarefasDiscursosRef),
      get(tarefasSettingsRef),
      get(configCongregacaoRef),
      get(pessoasRef),
    ])

    pessoas = peopleSnap.exists() ? (peopleSnap.val() as Record<string, TarefasPessoa>) : {}
    periods = scaleSnap.exists() ? (scaleSnap.val() as Record<string, TarefasPeriod>) : {}
    planning = planningSnap.exists() ? (planningSnap.val() as TarefasPlanning) : {}
    const savedPeriod = planning.editingPeriod ?? planning.scaleStartDate?.slice(0, 7)
    selectedPeriodMonth = /^\d{4}-\d{2}$/.test(savedPeriod ?? '') ? savedPeriod! : monthNow()
    events = eventsSnap.exists() ? (eventsSnap.val() as Record<string, TaskEvent>) : {}
    const discursos = discursosSnap.exists() ? (discursosSnap.val() as Record<string, unknown>) : {}
    speakers = (discursos['oradores'] ?? {}) as Record<string, TaskSpeaker>
    talks = (discursos['programacao'] ?? {}) as Record<string, TaskTalk>
    settings = settingsSnap.exists() ? (settingsSnap.val() as TarefasSettings) : {}
    const congregacao = congregacaoSnap.exists() ? (congregacaoSnap.val() as { nome?: string }) : {}
    congregationName = congregacao.nome?.trim() || 'Noroeste'
    masterPeople = masterPeopleSnap.exists() ? (masterPeopleSnap.val() as Record<string, { name?: string; whatsapp?: string; active?: boolean }>) : {}
    pessoas = Object.fromEntries(Object.entries(pessoas).map(([id, person]) => {
      const central = person.masterId ? masterPeople[person.masterId] : undefined
      return [id, central ? { ...person, name: central.name ?? person.name, phone: central.whatsapp ?? person.phone } : person]
    }))
  } catch {
    toast('Erro ao carregar Tarefas')
  }

  renderContent()
}

function renderContent(): void {
  if (activeTab === 'indice') {
    renderIndex()
    return
  }
  if (activeTab === 'resumo') renderResumo()
  else if (activeTab === 'escala') renderEscala()
  else if (activeTab === 'participantes') renderParticipantes()
  else if (activeTab === 'mensagens') renderMensagens()
  else renderPendencias()
}

function renderIndex(): void {
  const content = document.getElementById('tarefasContent')
  if (!content) return
  content.innerHTML = `<div style="margin-bottom:14px"><h2 style="font-size:1.05rem;color:#7E3AF2;margin-bottom:2px">Tarefas</h2></div><div id="tarefasMenu"></div>`
  const items: ItemMenu[] = [
    { id: 'resumo', titulo: 'Resumo', subtitulo: 'Visão geral da escala de tarefas', icone: '▦', corFundo: '#7E3AF2' },
    { id: 'escala', titulo: 'Escala', subtitulo: 'Escolha o período, gere e revise a escala', icone: '▣', corFundo: '#003F72' },
    { id: 'participantes', titulo: 'Pessoas', subtitulo: 'Participantes e vínculos com Admin', icone: '♙', corFundo: '#006EB6' },
    { id: 'mensagens', titulo: 'Mensagens', subtitulo: 'Textos para confirmação e envio', icone: '✉', corFundo: '#1A6B3C' },
    { id: 'pendencias', titulo: 'Pendências', subtitulo: 'Funções vazias e vínculos incompletos', icone: '!', corFundo: '#B3261E' },
  ]
  renderMenuCards(content.querySelector<HTMLElement>('#tarefasMenu')!, items, id => { activeTab = id as TarefasTab; renderContent() })
}

function renderResumo(): void {
  const content = document.getElementById('tarefasContent')
  if (!content) return

  const pessoasList = Object.entries(pessoas)
  const ativos = pessoasList.filter(([, p]) => isActive(p))
  const semVinculo = ativos.filter(([, p]) => !p.masterId).length
  const reunioes = allMeetings()
  const futuras = futureMeetings()
  const proximasDesignacoes = futuras.reduce((sum, meeting) => sum + assignmentCount(meeting), 0)

  content.innerHTML = `
    ${sectionTitle('Tarefas', 'Funções da reunião, participantes e mensagens.')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      ${metricCard('Pessoas ativas', String(ativos.length), '#7E3AF2')}
      ${metricCard('Sem vínculo', String(semVinculo), semVinculo ? '#B3261E' : '#1A6B3C')}
      ${metricCard('Reuniões', String(reunioes.length), '#003F72')}
      ${metricCard('Próximas funções', String(proximasDesignacoes), '#1A6B3C')}
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${flowCard('Escala', `${futuras.length} reunião${futuras.length === 1 ? '' : 'ões'} futura${futuras.length === 1 ? '' : 's'}`, 'escala')}
      ${flowCard('Participantes', `${semVinculo} pessoa${semVinculo === 1 ? '' : 's'} sem vínculo com Admin`, 'participantes')}
      ${flowCard('Mensagens', 'Textos para pessoa, reunião e confirmação', 'mensagens')}
      ${flowCard('Pendências', 'Funções vazias e vínculos que precisam de atenção', 'pendencias')}
    </div>`

  bindFlowCards()
}

function renderEscala(): void {
  const content = document.getElementById('tarefasContent')
  if (!content) return

  const periodMode = planning.periodMode === 'month' ? 'month' : 'bimester'
  const selectedPeriodId = periodKeyForDate(`${selectedPeriodMonth}-01`, periodMode)
  const reunioes = Object.values(periods[selectedPeriodId]?.meetings ?? {})
    .filter(meeting => canonicalMeetingType(meeting.type) || isHistoricalFirstSection(meeting))
    .sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')))
  const font = printFont()

  content.innerHTML = `
    ${sectionTitle('Escala de tarefas', 'Confira as próximas reuniões antes de enviar mensagens.')}
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:12px">
      <div class="module-form-grid">
        <div class="form-group" style="margin:0"><label class="form-label" for="tarefasPeriodMode">Formato</label><select id="tarefasPeriodMode" class="form-select"><option value="month" ${periodMode === 'month' ? 'selected' : ''}>Mensal</option><option value="bimester" ${periodMode === 'bimester' ? 'selected' : ''}>Bimestral</option></select></div>
        <div class="form-group" style="margin:0"><label class="form-label" for="tarefasPeriodMonth">Período</label><input id="tarefasPeriodMonth" class="form-input" type="month" value="${escapeHtml(selectedPeriodMonth)}"></div>
      </div>
      <div class="module-form-grid" style="margin-top:8px">
        <div style="display:flex;gap:8px"><button id="tarefasPreviousPeriod" class="btn btn-ghost" type="button" style="flex:1">Anterior</button><button id="tarefasNextPeriod" class="btn btn-ghost" type="button" style="flex:1">Próximo</button></div>
        <select id="tarefasGenerateRole" class="form-select">
          <option value="">Todas as funções</option>
          ${TASK_ROLES.map(role => `<option value="${role}">${escapeHtml(TASK_ROLE_LABELS[role])}</option>`).join('')}
        </select>
      </div>
      <div style="margin-top:8px">
        <button id="btnGenerateScale" class="btn btn-primary" type="button" style="white-space:nowrap">Gerar escala</button>
      </div>
    </div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;
      padding:12px;margin-bottom:12px">
      <label class="form-label" for="tarefasPrintFont">Letra do PDF</label>
      <div style="display:flex;gap:8px;align-items:center;margin-top:6px">
        <input id="tarefasPrintFont" class="form-input" type="range"
          min="${PRINT_MIN_PT}" max="${PRINT_MAX_PT}" step="1" value="${font}" style="padding:0">
        <span id="tarefasPrintFontValue" style="min-width:42px;text-align:right;font-size:.82rem;font-weight:700;color:var(--ink-2)">
          ${font} pt
        </span>
      </div>
      <button id="btnTarefasPdf" class="btn btn-primary btn-full" type="button" style="margin-top:10px">
        Gerar PDF
      </button>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${reunioes.length
        ? reunioes.map(meeting => meetingCard(meeting)).join('')
        : emptyState('Nenhuma reunião cadastrada neste período.')}
    </div>`

  document.getElementById('tarefasPrintFont')?.addEventListener('input', (event) => {
    const value = Number((event.target as HTMLInputElement).value)
    localStorage.setItem(PRINT_FONT_KEY, String(value))
    const out = document.getElementById('tarefasPrintFontValue')
    if (out) out.textContent = `${value} pt`
  })

  document.getElementById('btnTarefasPdf')?.addEventListener('click', () => {
    const value = Number((document.getElementById('tarefasPrintFont') as HTMLInputElement | null)?.value)
    gerarPdfTarefas(Number.isFinite(value) ? value : PRINT_DEFAULT_PT)
  })

  document.getElementById('btnGenerateScale')?.addEventListener('click', () => {
    const monthInput = document.getElementById('tarefasPeriodMonth') as HTMLInputElement | null
    const modeInput = document.getElementById('tarefasPeriodMode') as HTMLSelectElement | null
    if (!monthInput || !/^\d{4}-\d{2}$/.test(monthInput.value)) { toast('Selecione um período válido'); return }
    selectedPeriodMonth = monthInput.value
    const mode = modeInput?.value === 'month' ? 'month' : 'bimester'
    const roleValue = (document.getElementById('tarefasGenerateRole') as HTMLSelectElement | null)?.value ?? ''
    void generateScale(`${selectedPeriodMonth}-01`, mode, roleValue ? roleValue as TaskRole : null)
  })
  document.getElementById('tarefasPeriodMonth')?.addEventListener('change', event => {
    const value = (event.target as HTMLInputElement).value
    const mode = (document.getElementById('tarefasPeriodMode') as HTMLSelectElement | null)?.value === 'month' ? 'month' : 'bimester'
    if (/^\d{4}-\d{2}$/.test(value)) selectedPeriodMonth = periodKeyForDate(`${value}-01`, mode)
    renderEscala()
  })
  document.getElementById('tarefasPeriodMode')?.addEventListener('change', event => {
    const mode = (event.target as HTMLSelectElement).value === 'month' ? 'month' : 'bimester'
    planning = { ...planning, periodMode: mode }
    selectedPeriodMonth = periodKeyForDate(`${selectedPeriodMonth}-01`, mode)
    renderEscala()
  })
  const navigate = (direction: number) => {
    const mode = (document.getElementById('tarefasPeriodMode') as HTMLSelectElement | null)?.value === 'month' ? 'month' : 'bimester'
    const amount = mode === 'bimester' ? direction * 2 : direction
    selectedPeriodMonth = shiftMonth(selectedPeriodMonth, amount)
    renderEscala()
  }
  document.getElementById('tarefasPreviousPeriod')?.addEventListener('click', () => navigate(-1))
  document.getElementById('tarefasNextPeriod')?.addEventListener('click', () => navigate(1))

  bindAssignmentEditors()
}

async function generateScale(startDate: string, mode: 'month' | 'bimester', role: TaskRole | null): Promise<void> {
  const button = document.getElementById('btnGenerateScale') as HTMLButtonElement | null
  if (button) button.disabled = true
  try {
    const generatedAt = new Date().toISOString()
    const nextPlanning = { ...planning, periodMode: mode }
    const canonical = withCanonicalPeriod(periods, nextPlanning, startDate)
    if (!canonical) {
      showGenerationErrors(['Os dias das reuniões não estão configurados no planejamento.'])
      return
    }
    const context = { ...domainContext(), periods: canonical.periods }
    const result = computeGeneration(context, startDate, role, generatedAt, canonical.periodId)
    if (result.aborted) {
      showGenerationErrors(result.errors)
      return
    }
    const patch: Record<string, unknown> = {
      'planning/periodMode': mode,
      'planning/editingPeriod': selectedPeriodMonth,
      'planning/scaleStartDate': null,
      'planning/generatedAt': generatedAt,
    }
    Object.entries(result.patch).forEach(([path, value]) => {
      patch[`scale/periods/${path}`] = value
    })
    await update(tarefasRef, patch)
    planning = { ...nextPlanning, editingPeriod: selectedPeriodMonth, scaleStartDate: undefined, generatedAt }
    toast(`${result.generated} designações geradas para o período selecionado`)
    await loadTarefas()
  } catch {
    toast('Não foi possível gerar a escala')
  } finally {
    if (button?.isConnected) button.disabled = false
  }
}

function showGenerationErrors(errors: string[]): void {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal"><h2>Escala não gerada</h2><div style="display:flex;flex-direction:column;gap:8px">${errors.slice(0, 20).map(error => `<div style="font-size:.8rem;padding:8px 10px;border-left:3px solid #B3261E;background:var(--surface-2)">${escapeHtml(error)}</div>`).join('')}</div>${errors.length > 20 ? `<p class="form-help">Mais ${errors.length - 20} conflito(s).</p>` : ''}<button id="closeGenerationErrors" class="btn btn-primary btn-full" type="button" style="margin-top:14px">Voltar para a escala</button></div>`
  document.body.appendChild(overlay)
  document.getElementById('closeGenerationErrors')?.addEventListener('click', () => overlay.remove())
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove() })
}

function renderParticipantes(): void {
  const content = document.getElementById('tarefasContent')
  if (!content) return

  const rows = Object.entries(pessoas)
    .sort(([, a], [, b]) => pessoaNome(a, '').localeCompare(pessoaNome(b, ''), 'pt-BR'))

  content.innerHTML = `
    ${sectionTitle('Participantes', 'Pessoas gerenciadas pelo Admin. Edite funções, folga e vínculo.')}
    ${context.usuario.apps.mestre ? '<div style="display:flex;justify-content:flex-end;margin-bottom:10px"><button id="btnAddTaskPerson" class="btn btn-primary" type="button">Vincular pessoa</button></div>' : ''}
    <div style="display:flex;flex-direction:column;gap:6px">
      ${rows.length
        ? rows.map(([id, p]) => pessoaRow(id, p)).join('')
        : emptyState('Nenhum participante. Adicione pelo módulo Mestre no Admin SPA.')}
    </div>`
  document.getElementById('btnAddTaskPerson')?.addEventListener('click', () => openTaskPersonModal(null))
  content.querySelectorAll<HTMLButtonElement>('[data-edit-task-person]').forEach(button => {
    button.addEventListener('click', () => openTaskPersonModal(button.dataset['editTaskPerson'] ?? null))
  })
}

function renderPendencias(): void {
  const content = document.getElementById('tarefasContent')
  if (!content) return

  const items: Array<{ title: string; detail: string; tab: TarefasTab }> = []
  const futureEntries = scaleMeetingEntries()
    .filter(entry => entry.meeting.date && entry.meeting.date >= todayStr() && canonicalMeetingType(entry.meeting.type) && !meetingIsBlocked(domainContext(), entry.meeting))
  if (!futureEntries.length) {
    items.push({
      title: 'Escala futura ainda não gerada',
      detail: 'Abra a Escala, informe a data inicial e gere as designações.',
      tab: 'escala',
    })
  }

  futureEntries.forEach(entry => {
    const { meeting } = entry
    const missing = GENERATED_ROLES
      .filter(role => meetingAllowsRole(meeting, role) && !assignmentForRole(meeting, role))
      .map(role => roleLabel(role))
    if (missing.length) {
      items.push({
        title: missing.length === GENERATED_ROLES.filter(role => meetingAllowsRole(meeting, role)).length
          ? `Escala de ${formatDate(meeting.date)} por gerar`
          : `Reunião de ${formatDate(meeting.date)} incompleta`,
        detail: `Funções sem pessoa: ${missing.join(', ')}`,
        tab: 'escala',
      })
    }
    GENERATED_ROLES.forEach(role => {
      const personId = assignmentForRole(meeting, role)
      if (!personId) return
      const person = pessoas[personId]
      if (!person) {
        items.push({
          title: `${roleLabel(role)} aponta para pessoa inexistente`,
          detail: `${formatDate(meeting.date)} · ID ${personId}.`,
          tab: 'participantes',
        })
        return
      }
      const conflict = manualConflictReason(domainContext(), entry, role, personId)
      if (conflict) {
        items.push({
          title: `${roleLabel(role)} com conflito`,
          detail: `${formatDate(meeting.date)} · ${pessoaNome(person, personId)}: ${conflict}.`,
          tab: 'escala',
        })
      }
      if (!meeting.avisados?.[role]) {
        items.push({
          title: 'Mensagem ainda não aberta',
          detail: `${formatDate(meeting.date)} · ${roleLabel(role)} · ${pessoaNome(person, personId)}.`,
          tab: 'mensagens',
        })
      }
    })
  })

  const unlinked = Object.values(pessoas).filter(person => isActive(person) && !person.masterId).length
  if (unlinked) {
    items.push({
      title: `${unlinked} participante${unlinked === 1 ? '' : 's'} sem vínculo com Admin`,
      detail: 'Revise os vínculos antes de enviar mensagens ou gerar uma nova escala.',
      tab: 'participantes',
    })
  }

  const assignedPeople = new Map<string, string>()
  futureEntries.forEach(({ meeting }) => GENERATED_ROLES.forEach(role => {
    const id = assignmentForRole(meeting, role)
    if (id && !assignedPeople.has(id)) assignedPeople.set(id, meeting.date ?? '')
  }))
  assignedPeople.forEach((date, id) => {
    const person = pessoas[id]
    if (person && !personPhone(person)) {
      items.push({
        title: 'Participante escalado sem telefone',
        detail: `${pessoaNome(person, id)} tem designação em ${formatDate(date)} e só poderá receber o texto por cópia.`,
        tab: 'participantes',
      })
    }
  })

  content.innerHTML = `
    ${sectionTitle('Pendências', items.length ? 'Resolva estes itens antes de confirmar a escala.' : 'A escala atual não tem pendências identificadas.')}
    ${items.length
      ? `<div style="display:flex;flex-direction:column;gap:8px">${items.map(item => `<button class="module-menu-btn" type="button" data-target-tab="${item.tab}" style="border-radius:8px;padding:12px 14px"><div style="flex:1;min-width:0"><div class="mod-label">${escapeHtml(item.title)}</div><div class="mod-desc">${escapeHtml(item.detail)}</div></div><span style="font-size:1.1rem;color:#B3261E">›</span></button>`).join('')}</div>`
      : '<div style="padding:18px;border:1px solid #B7DEC7;background:#F1FAF4;border-radius:8px;color:#1A6B3C;font-size:.84rem">Tudo certo por enquanto.</div>'}`

  content.querySelectorAll<HTMLButtonElement>('[data-target-tab]').forEach(button => {
    button.addEventListener('click', () => {
      activeTab = button.dataset['targetTab'] as TarefasTab
      renderContent()
    })
  })
}

function renderMensagens(): void {
  const content = document.getElementById('tarefasContent')
  if (!content) return

  const entries = scaleMeetingEntries()
    .filter(entry => entry.meeting.date && entry.meeting.date >= todayStr() && canonicalMeetingType(entry.meeting.type) && assignmentCount(entry.meeting) > 0)
    .sort((a, b) => String(a.meeting.date).localeCompare(String(b.meeting.date)))
  const peopleWithAssignments = Object.entries(pessoas)
    .filter(([id, person]) => isActive(person) && entries.some(({ meeting }) => GENERATED_ROLES.some(role => assignmentForRole(meeting, role) === id)))
    .sort(([, a], [, b]) => pessoaNome(a, '').localeCompare(pessoaNome(b, ''), 'pt-BR'))
  const pessoaPrefix = settings.messages?.tarefasPessoaPrefix ?? 'Segue abaixo suas próximas designações.'
  const dataPrefix = settings.messages?.tarefasDataPrefix ?? 'Segue a escala da reunião.'
  const confirmPrefix = settings.messages?.tarefasConfirmacaoPrefix ?? 'Pode confirmar se está tudo certo com sua participação?'

  content.innerHTML = `
    ${sectionTitle('Mensagens', 'Gere um rascunho, revise o texto e só depois copie ou abra o WhatsApp.')}
    <div class="module-form-grid">
      <div class="form-group">
        <label class="form-label" for="messageType">Modelo</label>
        <select id="messageType" class="form-select">
          <option value="person">Para uma pessoa</option>
          <option value="day">Da reunião</option>
          <option value="confirm">Confirmar escala</option>
        </select>
      </div>
      <div class="form-group" id="messagePersonGroup">
        <label class="form-label" for="messagePerson">Pessoa</label>
        <select id="messagePerson" class="form-select">
          <option value="">Selecione uma pessoa</option>
          ${peopleWithAssignments.map(([id, person]) => `<option value="${escapeHtml(id)}">${escapeHtml(pessoaNome(person, id))}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label" for="messageMeeting">Reunião</label>
        <select id="messageMeeting" class="form-select">
          <option value="">Selecione uma reunião</option>
          ${entries.map(entry => `<option value="${escapeHtml(`${entry.periodId}::${entry.meetingId}`)}">${escapeHtml(formatDate(entry.meeting.date))} · ${canonicalMeetingType(entry.meeting.type) === 'midweek' ? 'Meio de semana' : 'Fim de semana'}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label" for="messageDraft">Mensagem para revisão</label>
      <textarea id="messageDraft" class="form-input" rows="8" style="resize:vertical" placeholder="Selecione um modelo para gerar o rascunho."></textarea>
      <div class="form-help">Este texto é um rascunho. Edite conforme a orientação aprovada antes de enviar.</div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button id="btnOpenPersonMessage" class="btn btn-primary" type="button">Abrir WhatsApp</button>
      <button id="btnCopyPersonMessage" class="btn btn-ghost" type="button">Copiar texto</button>
    </div>
    <div style="border-top:1px solid var(--border);margin-top:18px;padding-top:14px">
      <div class="form-group"><label class="form-label" for="tarefasPessoaPrefix">Início da mensagem individual</label><input id="tarefasPessoaPrefix" class="form-input" value="${escapeHtml(pessoaPrefix)}"></div>
      <div class="form-group"><label class="form-label" for="tarefasDataPrefix">Início da mensagem da reunião</label><input id="tarefasDataPrefix" class="form-input" value="${escapeHtml(dataPrefix)}"></div>
      <div class="form-group"><label class="form-label" for="tarefasConfirmPrefix">Pedido de confirmação</label><input id="tarefasConfirmPrefix" class="form-input" value="${escapeHtml(confirmPrefix)}"></div>
      <div class="form-group"><label class="form-label" for="tarefasGroupLink">Link do grupo do WhatsApp</label><input id="tarefasGroupLink" class="form-input" type="url" value="${escapeHtml(settings.whatsappGroupLink)}" placeholder="https://chat.whatsapp.com/..."></div>
      <button id="btnSaveMessageSettings" class="btn btn-ghost" type="button">Salvar textos</button>
    </div>`

  const updateDraft = () => {
    const type = (document.getElementById('messageType') as HTMLSelectElement).value
    const personId = (document.getElementById('messagePerson') as HTMLSelectElement).value
    const meetingKey = (document.getElementById('messageMeeting') as HTMLSelectElement).value
    const person = personId ? pessoas[personId] : undefined
    const entry = entries.find(item => `${item.periodId}::${item.meetingId}` === meetingKey)
    const text = type === 'day'
      ? buildDayMessage(entry?.meeting.date, entries)
      : type === 'confirm'
        ? buildConfirmationMessage(personId, person, entry?.meeting)
        : buildPersonMessage(personId, person, entries)
    const draft = document.getElementById('messageDraft') as HTMLTextAreaElement | null
    if (draft) draft.value = text
    return text
  }

  const syncMessageFields = () => {
    const type = (document.getElementById('messageType') as HTMLSelectElement).value
    const personGroup = document.getElementById('messagePersonGroup')
    if (personGroup) personGroup.style.display = type === 'day' ? 'none' : ''
    const meetingGroup = document.getElementById('messageMeeting')?.closest('.form-group') as HTMLElement | null
    if (meetingGroup) meetingGroup.style.display = type === 'person' ? 'none' : ''
    updateDraft()
  }
  document.getElementById('messageType')?.addEventListener('change', syncMessageFields)
  document.getElementById('messagePerson')?.addEventListener('change', updateDraft)
  document.getElementById('messageMeeting')?.addEventListener('change', updateDraft)
  document.getElementById('btnOpenPersonMessage')?.addEventListener('click', () => {
    const text = (document.getElementById('messageDraft') as HTMLTextAreaElement)?.value.trim()
    if (!text) { toast('Selecione os dados da mensagem'); return }
    const type = (document.getElementById('messageType') as HTMLSelectElement).value
    const personId = (document.getElementById('messagePerson') as HTMLSelectElement).value
    const meetingKey = (document.getElementById('messageMeeting') as HTMLSelectElement).value
    const entry = entries.find(item => `${item.periodId}::${item.meetingId}` === meetingKey)
    if (type === 'day') {
      const link = settings.whatsappGroupLink?.trim() ?? ''
      if (!/^https:\/\/chat\.whatsapp\.com\//i.test(link)) {
        void copyMessage(text)
        toast('Link do grupo não configurado; o texto foi copiado', 4000)
        return
      }
      const copyPromise = copyMessage(text)
      const opened = window.open(link, '_blank')
      if (!opened) { toast('O navegador bloqueou a abertura do WhatsApp'); return }
      opened.opener = null
      void copyPromise
      void markAssignmentsOpened(entries.filter(item => item.meeting.date === entry?.meeting.date))
      toast('WhatsApp aberto e texto copiado. Revise antes de enviar.')
      return
    }
    const phone = personPhone(pessoas[personId])
    if (!phone) { void copyMessage(text); toast('Telefone ausente; o texto foi copiado', 4000); return }
    const normalized = phone.startsWith('55') ? phone : `55${phone}`
    const opened = window.open(`https://wa.me/${normalized}?text=${encodeURIComponent(text)}`, '_blank')
    if (!opened) { toast('O navegador bloqueou a abertura do WhatsApp'); return }
    opened.opener = null
    const affected = type === 'person'
      ? entries.filter(item => GENERATED_ROLES.some(role => assignmentForRole(item.meeting, role) === personId))
      : entry ? [entry] : []
    void markAssignmentsOpened(affected, personId)
    toast('WhatsApp aberto. Revise e envie a mensagem.')
  })
  document.getElementById('btnCopyPersonMessage')?.addEventListener('click', async () => {
    const text = (document.getElementById('messageDraft') as HTMLTextAreaElement)?.value.trim()
    if (!text) { toast('Selecione os dados da mensagem'); return }
    await copyMessage(text, true)
  })
  document.getElementById('btnSaveMessageSettings')?.addEventListener('click', () => void saveMessageSettings())
  syncMessageFields()
}

function buildPersonMessage(id: string, person: TarefasPessoa | undefined, entries: ReturnType<typeof scaleMeetingEntries>): string {
  if (!id || !person) return ''
  const designations = entries.flatMap(({ meeting }) => {
    const roles = GENERATED_ROLES.filter(role => assignmentForRole(meeting, role) === id)
    const type = canonicalMeetingType(meeting.type)
    return roles.length && meeting.date && type ? [{ date: meeting.date, type, roles }] : []
  })
  const prefix = settings.messages?.tarefasPessoaPrefix?.trim() || 'Segue abaixo suas próximas designações.'
  return buildTaskPersonMessage(pessoaNome(person, id), prefix, designations)
}

function buildDayMessage(date: string | undefined, entries: ReturnType<typeof scaleMeetingEntries>): string {
  if (!date) return ''
  const meetings = entries.filter(entry => entry.meeting.date === date)
  const messageMeetings = meetings.flatMap(({ meeting }) => {
    const type = canonicalMeetingType(meeting.type)
    if (!type) return []
    const assignments: Partial<Record<TaskRole, string>> = {}
    GENERATED_ROLES.forEach(role => {
      const id = assignmentForRole(meeting, role)
      if (id) assignments[role] = pessoaNome(pessoas[id]!, id)
    })
    return [{ type, assignments }]
  })
  const prefix = settings.messages?.tarefasDataPrefix?.trim() || 'Segue a escala da reunião.'
  return buildTaskDayMessage(prefix, date, messageMeetings)
}

function buildConfirmationMessage(id: string, person: TarefasPessoa | undefined, meeting: TarefasMeeting | undefined): string {
  if (!id || !person || !meeting) return ''
  const roles = GENERATED_ROLES.filter(role => assignmentForRole(meeting, role) === id)
  if (!roles.length) return ''
  return buildTaskConfirmationMessage(
    pessoaNome(person, id),
    meeting.date ?? '',
    roles,
    settings.messages?.tarefasConfirmacaoPrefix?.trim() || 'Pode confirmar se está tudo certo com sua participação?',
  )
}

async function copyMessage(text: string, notify = false): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    if (notify) toast('Texto copiado')
  } catch {
    toast('Não foi possível copiar o texto')
  }
}

async function markAssignmentsOpened(entries: ReturnType<typeof scaleMeetingEntries>, personId?: string): Promise<void> {
  const stamp = new Date().toISOString()
  const patch: Record<string, string> = {}
  entries.forEach(entry => GENERATED_ROLES.forEach(role => {
    const assigned = assignmentForRole(entry.meeting, role)
    if (assigned && (!personId || assigned === personId)) {
      patch[`${entry.periodId}/meetings/${entry.meetingId}/avisados/${role}`] = stamp
      entry.meeting.avisados = { ...(entry.meeting.avisados ?? {}), [role]: stamp }
    }
  }))
  if (!Object.keys(patch).length) return
  try {
    await update(tarefasScaleRef, patch)
  } catch {
    toast('WhatsApp abriu, mas não foi possível registrar a abertura', 4000)
  }
}

async function saveMessageSettings(): Promise<void> {
  const value = (id: string) => (document.getElementById(id) as HTMLInputElement).value.trim()
  const next: TarefasSettings = {
    ...settings,
    whatsappGroupLink: value('tarefasGroupLink'),
    messages: {
      ...(settings.messages ?? {}),
      tarefasPessoaPrefix: value('tarefasPessoaPrefix'),
      tarefasDataPrefix: value('tarefasDataPrefix'),
      tarefasConfirmacaoPrefix: value('tarefasConfirmPrefix'),
    },
  }
  try {
    await update(tarefasSettingsRef, {
      whatsappGroupLink: next.whatsappGroupLink,
      'messages/tarefasPessoaPrefix': next.messages?.tarefasPessoaPrefix,
      'messages/tarefasDataPrefix': next.messages?.tarefasDataPrefix,
      'messages/tarefasConfirmacaoPrefix': next.messages?.tarefasConfirmacaoPrefix,
    })
    settings = next
    toast('Textos salvos')
  } catch {
    toast('Não foi possível salvar os textos')
  }
}

function sectionTitle(title: string, desc: string): string {
  return `
    <div style="margin-bottom:14px">
      ${moduleBackButton()}
      <h2 style="font-size:1.05rem;color:#7E3AF2;margin-bottom:2px">${escapeHtml(title)}</h2>
      <p style="font-size:.8rem;color:var(--ink-3)">${escapeHtml(desc)}</p>
    </div>`
}

function metricCard(label: string, value: string, color: string): string {
  return `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 12px">
      <div style="font-size:1.15rem;font-weight:800;color:${color};line-height:1"><span data-kpi-value="${escapeHtml(value)}">0</span></div>
      <div style="font-size:.72rem;color:var(--ink-3);margin-top:4px;text-transform:uppercase;font-weight:700">
        ${escapeHtml(label)}
      </div>
    </div>`
}

function flowCard(title: string, desc: string, tab: TarefasTab): string {
  return `
    <button class="module-menu-btn tarefas-flow-card" type="button" data-target-tab="${tab}"
      style="border-radius:8px;padding:12px 14px">
      <div style="flex:1;min-width:0">
        <div class="mod-label">${escapeHtml(title)}</div>
        <div class="mod-desc">${escapeHtml(desc)}</div>
      </div>
      <span style="font-size:1.1rem;color:var(--ink-3)">›</span>
    </button>`
}

function bindFlowCards(): void {
  document.querySelectorAll<HTMLButtonElement>('.tarefas-flow-card').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset['targetTab'] as TarefasTab
      renderContent()
    })
  })
}

function meetingCard(meeting: TarefasMeeting): string {
  const count = assignmentCount(meeting)
  const historicalFirstSection = isHistoricalFirstSection(meeting)
  const type = historicalFirstSection ? '1ª seção (histórico)' : canonicalMeetingType(meeting.type) === 'midweek' ? 'Meio de semana' : 'Fim de semana'
  const ref = meetingRefFor(meeting)
  const locked = ref ? periods[ref.periodId]?.locked === true : false
  const editors = ref && !historicalFirstSection
    ? GENERATED_ROLES.filter(role => meetingAllowsRole(meeting, role))
      .map(role => assignmentEditor(ref.periodId, ref.meetingId, meeting, role, locked))
      .join('')
    : ''

  return `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 12px">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
        <div style="min-width:0">
          <div style="font-size:.9rem;font-weight:700;color:var(--ink)">${formatDate(meeting.date)}</div>
          <div style="font-size:.76rem;color:var(--ink-3)">${escapeHtml(type)}</div>
        </div>
        <span style="font-size:.75rem;font-weight:700;color:${locked ? '#B3261E' : '#7E3AF2'}">
          ${historicalFirstSection ? 'Somente leitura' : locked ? 'Travada' : `${count} função${count === 1 ? '' : 'ões'}`}
        </span>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-top:10px">
        ${editors}
      </div>
    </div>`
}

function assignmentEditor(periodId: string, meetingId: string, meeting: TarefasMeeting, role: TaskRole, locked: boolean): string {
  const selected = assignmentForRole(meeting, role) ?? ''
  const entry = { periodId, meetingId, meeting }
  const options = Object.entries(pessoas)
    .sort(([, a], [, b]) => pessoaNome(a, '').localeCompare(pessoaNome(b, ''), 'pt-BR'))
    .map(([id, person]) => {
      const reason = manualConflictReason(domainContext(), entry, role, id)
      const suffix = reason ? ` [Conflito: ${reason}]` : ''
      return `<option value="${escapeHtml(id)}" ${id === selected ? 'selected' : ''}>${escapeHtml(pessoaNome(person, id) + suffix)}</option>`
    })
    .join('')
  return `<label style="display:flex;align-items:center;gap:8px;font-size:.76rem;color:var(--ink-2)"><span style="min-width:86px;font-weight:700">${escapeHtml(roleLabel(role))}</span><select class="form-select tarefas-assignment-select" data-period="${escapeHtml(periodId)}" data-meeting="${escapeHtml(meetingId)}" data-role="${escapeHtml(role)}" data-original="${escapeHtml(selected)}" style="padding:6px 28px 6px 8px;font-size:.78rem" ${locked ? 'disabled' : ''}><option value="">Deixar vazio</option>${options}</select></label>`
}

function bindAssignmentEditors(): void {
  document.querySelectorAll<HTMLSelectElement>('.tarefas-assignment-select').forEach(select => {
    select.addEventListener('change', () => {
      const periodId = select.dataset['period'] ?? ''
      const meetingId = select.dataset['meeting'] ?? ''
      const role = select.dataset['role'] as TaskRole
      const entry = meetingEntries(periods).find(item => item.periodId === periodId && item.meetingId === meetingId)
      const reason = entry && select.value ? manualConflictReason(domainContext(), entry, role, select.value) : null
      if (reason && !confirm(`${pessoaNome(pessoas[select.value]!, select.value)} tem conflito: ${reason}. Manter esta escolha manual mesmo assim?`)) {
        select.value = select.dataset['original'] ?? ''
        return
      }
      void saveAssignment(
        periodId,
        meetingId,
        role,
        select.value,
      )
    })
  })
}

async function saveAssignment(periodId: string, meetingId: string, role: string, personId: string): Promise<void> {
  if (!periodId || !meetingId || !role) return
  if (periods[periodId]?.locked) { toast('Esta escala está travada'); return }
  const path = `${periodId}/meetings/${meetingId}`
  try {
    await update(tarefasScaleRef, {
      [`${path}/assignments/${role}`]: personId || null,
      [`${path}/manualEdits/${role}`]: personId ? true : null,
    })
    const meeting = periods[periodId]?.meetings?.[meetingId]
    if (meeting) {
      meeting.assignments = { ...(meeting.assignments ?? {}) }
      meeting.manualEdits = { ...(meeting.manualEdits ?? {}) }
      if (personId) meeting.assignments[role] = personId
      else delete meeting.assignments[role]
      if (personId) meeting.manualEdits[role] = true
      else delete meeting.manualEdits[role]
    }
    toast('Designação atualizada')
    renderEscala()
  } catch {
    toast('Não foi possível salvar a designação')
  }
}

function pessoaRow(id: string, p: TarefasPessoa): string {
  const linked = Boolean(p.masterId)
  const active = isActive(p)

  return `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;
      padding:9px 12px;display:flex;align-items:center;gap:8px">
      <div style="flex:1;min-width:0">
        <div style="font-size:.88rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          ${escapeHtml(pessoaNome(p, id))}
        </div>
        <div style="font-size:.72rem;color:var(--ink-3)">
          ${active ? 'Ativo' : 'Inativo'} · ${linked ? 'Vinculado ao Admin' : 'Sem vínculo'}
        </div>
      </div>
      <span style="width:9px;height:9px;border-radius:50%;background:${linked ? '#1A6B3C' : '#B3261E'}"></span>
      ${context.usuario.apps.mestre ? `<button class="btn btn-ghost" type="button" data-edit-task-person="${escapeHtml(id)}" style="padding:4px 9px;font-size:.76rem">Editar</button>` : ''}
    </div>`
}

function taskRoleCheck(role: keyof NonNullable<TarefasPessoa['roles']>, label: string, checked: boolean): string {
  return `<label style="display:flex;align-items:center;gap:6px;font-size:.8rem"><input class="task-person-role" type="checkbox" value="${escapeHtml(role)}" ${checked ? 'checked' : ''}>${escapeHtml(label)}</label>`
}

function openTaskPersonModal(id: string | null): void {
  if (!context.usuario.apps.mestre) { toast('Somente o Admin pode configurar participantes'); return }
  const person = id ? pessoas[id] : undefined
  const unavailable = Array.isArray(person?.unavailableDates)
    ? person.unavailableDates
    : Object.entries(person?.unavailableDates ?? {}).filter(([, blocked]) => blocked).map(([date]) => date)
  const masterOptions = Object.entries(masterPeople)
    .filter(([mid, item]) => item.active !== false && (person?.masterId === mid || !Object.values(pessoas).some(candidate => candidate.masterId === mid)))
    .sort(([, a], [, b]) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'pt-BR'))
    .map(([mid, item]) => `<option value="${escapeHtml(mid)}" ${person?.masterId === mid ? 'selected' : ''}>${escapeHtml(item.name || mid)}</option>`)
    .join('')
  const roles = person?.roles ?? {}
  // Nome canônico vem do Admin — exibir somente leitura
  const displayName = person?.masterId
    ? (masterPeople[person.masterId]?.name ?? personName(person, id ?? ''))
    : ''
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal">
    <h2>${id ? 'Editar participante' : 'Vincular pessoa'}</h2>
    ${id ? `<div class="form-group">
      <label class="form-label">Nome (gerenciado pelo Admin)</label>
      <div style="padding:9px 12px;border:1px solid var(--border);border-radius:var(--radius);
        background:var(--surface2);color:var(--ink-2);font-size:.92rem">
        ${escapeHtml(displayName)}
      </div>
      <div class="form-help">WhatsApp: ${escapeHtml(personPhone(person) || 'não informado')}. Edite os dados pessoais no Admin.</div>
    </div>` : ''}
    <div class="form-group"><label class="form-label" for="taskPersonMaster">Pessoa do cadastro Admin</label><select id="taskPersonMaster" class="form-select" ${id && person?.masterId ? 'disabled' : ''}><option value="">Selecionar...</option>${masterOptions}</select></div>
    <div class="module-form-grid">
      <div class="form-group"><label class="form-label" for="taskPersonRule">Reuniões</label><select id="taskPersonRule" class="form-select"><option value="both" ${(person?.rule ?? 'both') === 'both' ? 'selected' : ''}>Todas</option><option value="midweek" ${person?.rule === 'midweek' ? 'selected' : ''}>Meio de semana</option><option value="weekend" ${person?.rule === 'weekend' ? 'selected' : ''}>Fim de semana</option><option value="none" ${person?.rule === 'none' ? 'selected' : ''}>Fora da escala</option></select></div>
      <div class="form-group"><label class="form-label" for="taskPersonRest">Referência da folga</label><input id="taskPersonRest" class="form-input" type="date" value="${escapeHtml(person?.refFolgaDate)}"></div>
    </div>
    <div class="form-group"><span class="form-label" style="display:block;margin-bottom:6px">Funções</span><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">${taskRoleCheck('presidente', 'Presidente', roles.presidente === true)}${taskRoleCheck('operador', 'Operador', roles.operador === true)}${taskRoleCheck('leitor', 'Leitor', roles.leitor === true)}${taskRoleCheck('entrada', 'Entrada', roles.entrada === true)}${taskRoleCheck('auditorio', 'Auditório', roles.auditorio === true)}${taskRoleCheck('microfone', 'Microfone', roles.microfone === true)}</div></div>
    <div class="form-group"><label class="form-label" for="taskPersonUnavailable">Datas indisponíveis</label><textarea id="taskPersonUnavailable" class="form-input" rows="3" placeholder="AAAA-MM-DD, uma por linha">${escapeHtml(unavailable.join('\n'))}</textarea></div>
    <div style="display:flex;gap:14px;margin-bottom:14px"><label style="display:flex;align-items:center;gap:6px;font-size:.82rem"><input id="taskPersonActive" type="checkbox" ${personIsActive(person ?? {}) ? 'checked' : ''}>Ativo</label><label style="display:flex;align-items:center;gap:6px;font-size:.82rem"><input id="taskPersonYoung" type="checkbox" ${person?.jovem ? 'checked' : ''}>Jovem</label></div>
    <div style="display:flex;gap:8px"><button id="cancelTaskPerson" class="btn btn-ghost" type="button" style="flex:1">Cancelar</button><button id="saveTaskPerson" class="btn btn-primary" type="button" style="flex:1">Salvar</button></div>
  </div>`
  document.body.appendChild(overlay)
  document.getElementById('cancelTaskPerson')?.addEventListener('click', () => overlay.remove())
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove() })
  document.getElementById('saveTaskPerson')?.addEventListener('click', () => void saveTaskPerson(id, overlay))
}

async function saveTaskPerson(id: string | null, overlay: HTMLElement): Promise<void> {
  if (!context.usuario.apps.mestre) { toast('Somente o Admin pode configurar participantes'); return }
  const person = id ? pessoas[id] : undefined
  const input = (elementId: string) => (document.getElementById(elementId) as HTMLInputElement).value.trim()
  const unavailableDates = input('taskPersonUnavailable').split(/[\s,;]+/).filter(Boolean)
  if (unavailableDates.some(date => !/^\d{4}-\d{2}-\d{2}$/.test(date))) { toast('Revise as datas indisponíveis'); return }
  const roles: Record<string, boolean> = {}
  document.querySelectorAll<HTMLInputElement>('.task-person-role').forEach(checkbox => { roles[checkbox.value] = checkbox.checked })
  const selectedMasterId = (document.getElementById('taskPersonMaster') as HTMLSelectElement).value || person?.masterId || ''
  const central = masterPeople[selectedMasterId]
  if (!selectedMasterId || !central) { toast('Selecione uma pessoa do cadastro Admin'); return }
  const finalId = id ?? `tar_${selectedMasterId}`
  const patch: Record<string, unknown> = {
    [`${finalId}/name`]: central.name ?? selectedMasterId,
    [`${finalId}/phone`]: central.whatsapp ?? '',
    [`${finalId}/masterId`]: selectedMasterId,
    [`${finalId}/rule`]: input('taskPersonRule'),
    [`${finalId}/refFolgaDate`]: input('taskPersonRest'),
    [`${finalId}/unavailableDates`]: unavailableDates.length ? unavailableDates : null,
    [`${finalId}/active`]: (document.getElementById('taskPersonActive') as HTMLInputElement).checked,
    [`${finalId}/jovem`]: (document.getElementById('taskPersonYoung') as HTMLInputElement).checked,
  }
  Object.entries(roles).forEach(([role, enabled]) => { patch[`${finalId}/roles/${role}`] = enabled })
  try {
    await update(tarefasPeopleRef, patch)
    overlay.remove()
    toast('Participante atualizado')
    await loadTarefas()
  } catch {
    toast('Não foi possível salvar o participante')
  }
}

function emptyState(text: string): string {
  return `
    <div class="module-placeholder" style="padding:34px 18px">
      <p>${escapeHtml(text)}</p>
    </div>`
}

function gerarPdfTarefas(preferredFontPt: number): void {
  const meetings = futureMeetings()
  if (meetings.length === 0) {
    toast('Nenhuma reunião para gerar PDF')
    return
  }

  const doc = document.createElement('div')
  doc.className = 'tarefas-print-doc'
  doc.innerHTML = printDocumentHtml(meetings)
  document.body.appendChild(doc)

  let chosen = Math.min(PRINT_MAX_PT, Math.max(PRINT_MIN_PT, Math.round(preferredFontPt)))
  let fitsHeight = false
  doc.dataset['measuring'] = 'true'

  for (let size = chosen; size >= PRINT_MIN_PT; size -= 1) {
    doc.style.fontSize = `${size}pt`
    chosen = size
    const fitsWidth = doc.scrollWidth <= A4_LANDSCAPE_WIDTH_PX
    fitsHeight = doc.scrollHeight <= A4_LANDSCAPE_HEIGHT_PX
    if (fitsWidth && fitsHeight) break
  }

  if (!fitsHeight) {
    const headerHeight = doc.querySelector<HTMLElement>('.tarefas-print-header')?.offsetHeight ?? 0
    const tableHeaderHeight = doc.querySelector<HTMLElement>('thead')?.offsetHeight ?? 0
    const rows = [...doc.querySelectorAll<HTMLElement>('tbody tr')]
    const rowHeight = Math.max(1, ...rows.map(row => row.offsetHeight))
    const pageSize = rowsPerPrintPage(A4_LANDSCAPE_HEIGHT_PX, headerHeight, tableHeaderHeight, rowHeight)
    doc.innerHTML = printDocumentHtml(meetings, pageSize)
  }

  delete doc.dataset['measuring']
  doc.dataset['printing'] = 'true'
  doc.style.fontSize = `${chosen}pt`
  toast(`PDF em ${chosen} pt`)

  const cleanup = () => {
    window.removeEventListener('afterprint', cleanup)
    doc.remove()
  }
  window.addEventListener('afterprint', cleanup)
  window.print()
  setTimeout(cleanup, 2000)
}

function printDocumentHtml(meetings: TarefasMeeting[], pageSize = meetings.length): string {
  const roles = TASK_ROLES.filter(role => meetings.some(meeting => roleApplies(role, meeting)))
  const lastMeeting = meetings[meetings.length - 1]
  const pages = paginateItems(meetings, pageSize)

  return pages.map((page, pageIndex) => `
    <div class="tarefas-print-page">
      <header class="tarefas-print-header">
        <div>
          <div class="tarefas-print-title">Escala de Tarefas</div>
          <div class="tarefas-print-subtitle">${escapeHtml(congregationName)}</div>
        </div>
        <div class="tarefas-print-period">${formatDate(meetings[0]?.date)} - ${formatDate(lastMeeting?.date)}${pages.length > 1 ? ` · ${pageIndex + 1}/${pages.length}` : ''}</div>
      </header>
      <table class="tarefas-print-table">
        <thead>
          <tr>
            <th>Data</th>
            ${roles.map(role => `<th>${escapeHtml(roleLabel(role))}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${page.map(meeting => `
            <tr>
              <td>${formatDate(meeting.date)}</td>
              ${roles.map(role => `<td>${escapeHtml(assignmentName(assignmentForRole(meeting, role as TaskRole)))}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`).join('')
}
