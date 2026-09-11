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
import { formatTaskDate } from './tarefas-output'
import { prepareTaskPrint, printPreparedTaskSchedule } from './tarefas-documents'

type TarefasTab = 'indice' | 'resumo' | 'escala' | 'participantes' | 'pendencias'

const PRINT_FONT_KEY = 'noroeste_tarefas_print_font_pt'
const PRINT_MIN_PT = 8
const PRINT_MAX_PT = 22
const PRINT_DEFAULT_PT = 14

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

interface PendingTarget {
  periodId?: string
  meetingId?: string
  role?: TaskRole
  personId?: string
}

let activeTab: TarefasTab = 'indice'
let pessoas: Record<string, TarefasPessoa> = {}
let periods: Record<string, TarefasPeriod> = {}
let planning: TarefasPlanning = {}
let events: Record<string, TaskEvent> = {}
let speakers: Record<string, TaskSpeaker> = {}
let talks: Record<string, TaskTalk> = {}
let congregationName = 'Noroeste'
let masterPeople: Record<string, { name?: string; whatsapp?: string; active?: boolean }> = {}
let context: AppContext
const TAREFAS_PERIOD_KEY = 'noroeste:tarefas:period'
const TAREFAS_PERIOD_MODE_KEY = 'noroeste:tarefas:period-mode'
const TAREFAS_PENDING_DATES_KEY = 'noroeste:tarefas:pending-dates'
const TAREFAS_ROLE_KEY = 'noroeste:tarefas:generate-role'

let selectedPeriodMonth = monthNow()
let selectedPeriodMode: 'month' | 'bimester' = 'bimester'
let onlyPendingMeetings = localStorage.getItem(TAREFAS_PENDING_DATES_KEY) === 'true'
let selectedGenerateRole = localStorage.getItem(TAREFAS_ROLE_KEY) ?? ''
let participantSearch = ''
let participantMeetingRule = ''
let participantRoleFilter = ''
let pendingTarget: PendingTarget | null = null

function monthNow(): string {
  const date = new Date()
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
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
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
    const [peopleSnap, scaleSnap, planningSnap, eventsSnap, discursosSnap, congregacaoSnap, masterPeopleSnap] = await Promise.all([
      get(tarefasPeopleRef),
      get(tarefasScaleRef),
      get(tarefasPlanejamentoRef),
      get(tarefasEventosRef),
      get(tarefasDiscursosRef),
      get(configCongregacaoRef),
      get(pessoasRef),
    ])

    pessoas = peopleSnap.exists() ? (peopleSnap.val() as Record<string, TarefasPessoa>) : {}
    periods = scaleSnap.exists() ? (scaleSnap.val() as Record<string, TarefasPeriod>) : {}
    planning = planningSnap.exists() ? (planningSnap.val() as TarefasPlanning) : {}
    const savedPeriod = localStorage.getItem(TAREFAS_PERIOD_KEY) ?? planning.editingPeriod ?? planning.scaleStartDate?.slice(0, 7)
    selectedPeriodMonth = /^\d{4}-\d{2}$/.test(savedPeriod ?? '') ? savedPeriod! : monthNow()
    const savedPeriodMode = localStorage.getItem(TAREFAS_PERIOD_MODE_KEY)
    selectedPeriodMode = savedPeriodMode === 'month' || savedPeriodMode === 'bimester'
      ? savedPeriodMode
      : planning.periodMode === 'month' ? 'month' : 'bimester'
    events = eventsSnap.exists() ? (eventsSnap.val() as Record<string, TaskEvent>) : {}
    const discursos = discursosSnap.exists() ? (discursosSnap.val() as Record<string, unknown>) : {}
    speakers = (discursos['oradores'] ?? {}) as Record<string, TaskSpeaker>
    talks = (discursos['programacao'] ?? {}) as Record<string, TaskTalk>
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
  if (activeTab === 'resumo') renderIndex()
  else if (activeTab === 'escala') renderEscala()
  else if (activeTab === 'participantes') renderParticipantes()
  else renderPendencias()
}

function renderIndex(): void {
  const content = document.getElementById('tarefasContent')
  if (!content) return
  content.innerHTML = `<div style="margin-bottom:14px"><h2 style="font-size:1.05rem;color:#7E3AF2;margin-bottom:2px">Tarefas</h2></div><div id="tarefasMenu"></div>`
  const items: ItemMenu[] = [
    { id: 'escala', titulo: 'Escala', subtitulo: 'Escolha o período, gere e revise a escala', icone: '▣', corFundo: '#003F72' },
    { id: 'participantes', titulo: 'Pessoas', subtitulo: 'Participantes e vínculos com Admin', icone: '♙', corFundo: '#006EB6' },
    { id: 'pendencias', titulo: 'Pendências', subtitulo: 'Funções vazias e vínculos incompletos', icone: '!', corFundo: '#B3261E' },
  ]
  renderMenuCards(content.querySelector<HTMLElement>('#tarefasMenu')!, items, id => { activeTab = id as TarefasTab; renderContent() })
}

function renderEscala(): void {
  const content = document.getElementById('tarefasContent')
  if (!content) return

  const periodMode = selectedPeriodMode
  const selectedPeriodId = periodKeyForDate(`${selectedPeriodMonth}-01`, periodMode)
  const locked = periods[selectedPeriodId]?.locked === true
  const allPeriodMeetings = Object.values(periods[selectedPeriodId]?.meetings ?? {})
    .filter(meeting => canonicalMeetingType(meeting.type))
    .sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')))
  const font = printFont()

  content.innerHTML = `
    ${sectionTitle('Escala de tarefas', '')}
    ${locked ? '<div class="notice warning" style="margin-bottom:12px">Esta escala está travada. Destrave para gerar, limpar ou editar.</div>' : ''}
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:12px">
      <div class="module-form-grid">
        <div class="form-group" style="margin:0"><label class="form-label" for="tarefasPeriodMode">Formato</label><select id="tarefasPeriodMode" class="form-select"><option value="month" ${periodMode === 'month' ? 'selected' : ''}>Mensal</option><option value="bimester" ${periodMode === 'bimester' ? 'selected' : ''}>Bimestral</option></select></div>
        <div class="form-group" style="margin:0"><label class="form-label" for="tarefasPeriodMonth">Período</label><input id="tarefasPeriodMonth" class="form-input" type="month" value="${escapeHtml(selectedPeriodMonth)}"></div>
      </div>
      <div class="scale-actions" style="margin-top:8px">
        <button id="btnGenerateScale" class="btn btn-primary" type="button" ${locked ? 'disabled' : ''}>Gerar escala</button>
        <button id="btnToggleTaskLock" class="btn btn-ghost" type="button">${locked ? 'Destravar escala' : 'Travar escala'}</button>
        <button id="btnClearTaskScale" class="btn btn-danger" type="button" ${locked || !allPeriodMeetings.length ? 'disabled' : ''}>Limpar escala</button>
      </div>
      <details style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">
        <summary style="cursor:pointer;font-size:.86rem;font-weight:700;color:var(--ink-2)">Refazer uma função ou ajustar a impressão</summary>
        <div class="module-form-grid" style="margin-top:10px">
          <div class="form-group" style="margin:0"><label class="form-label" for="tarefasGenerateRole">Função</label><select id="tarefasGenerateRole" class="form-select"><option value="">Escolha a função</option>${TASK_ROLES.map(role => `<option value="${role}" ${role === selectedGenerateRole ? 'selected' : ''}>${escapeHtml(TASK_ROLE_LABELS[role])}</option>`).join('')}</select></div>
          <div class="scale-actions" style="align-items:end"><button id="btnGenerateTaskRole" class="btn btn-ghost" type="button" ${locked ? 'disabled' : ''}>Gerar função</button><button id="btnClearTaskRole" class="btn btn-danger" type="button" ${locked ? 'disabled' : ''}>Limpar função</button></div>
        </div>
        <label style="display:flex;align-items:center;gap:7px;margin-top:12px;font-size:.84rem;color:var(--ink-2)"><input id="tarefasOnlyPending" type="checkbox" ${onlyPendingMeetings ? 'checked' : ''}> Apenas datas pendentes</label>
        <div style="display:flex;gap:8px;align-items:center;margin-top:12px"><label class="form-label" for="tarefasPrintFont" style="margin:0;white-space:nowrap">Letra do PDF</label><input id="tarefasPrintFont" class="form-input" type="range" min="${PRINT_MIN_PT}" max="${PRINT_MAX_PT}" step="1" value="${font}" style="padding:0;flex:1"><span id="tarefasPrintFontValue" style="min-width:42px;text-align:right;font-size:.82rem;font-weight:700;color:var(--ink-2)">${font} pt</span><button id="btnTarefasPdf" class="btn btn-ghost" type="button">Gerar PDF</button></div>
      </details>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${allPeriodMeetings.length
        ? allPeriodMeetings.map(meeting => meetingCard(meeting)).join('')
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
    localStorage.setItem(TAREFAS_PERIOD_KEY, selectedPeriodMonth)
    const mode = modeInput?.value === 'month' ? 'month' : 'bimester'
    void generateScale(`${selectedPeriodMonth}-01`, mode, null, onlyPendingMeetings)
  })
  document.getElementById('btnGenerateTaskRole')?.addEventListener('click', () => {
    const role = (document.getElementById('tarefasGenerateRole') as HTMLSelectElement).value as TaskRole
    if (!role) { toast('Escolha a função que deseja gerar'); return }
    void generateScale(`${selectedPeriodMonth}-01`, periodMode, role, onlyPendingMeetings)
  })
  document.getElementById('btnClearTaskRole')?.addEventListener('click', () => {
    const role = (document.getElementById('tarefasGenerateRole') as HTMLSelectElement).value as TaskRole
    if (!role) { toast('Escolha a função que deseja limpar'); return }
    void clearTaskRole(selectedPeriodId, role)
  })
  document.getElementById('btnToggleTaskLock')?.addEventListener('click', () => void toggleTaskLock(selectedPeriodId))
  document.getElementById('btnClearTaskScale')?.addEventListener('click', () => void clearTaskScale(selectedPeriodId))
  document.getElementById('tarefasOnlyPending')?.addEventListener('change', event => {
    onlyPendingMeetings = (event.target as HTMLInputElement).checked
    localStorage.setItem(TAREFAS_PENDING_DATES_KEY, String(onlyPendingMeetings))
  })
  document.getElementById('tarefasGenerateRole')?.addEventListener('change', event => {
    selectedGenerateRole = (event.target as HTMLSelectElement).value
    localStorage.setItem(TAREFAS_ROLE_KEY, selectedGenerateRole)
  })
  document.getElementById('tarefasPeriodMonth')?.addEventListener('change', event => {
    const value = (event.target as HTMLInputElement).value
    const mode = (document.getElementById('tarefasPeriodMode') as HTMLSelectElement | null)?.value === 'month' ? 'month' : 'bimester'
    if (/^\d{4}-\d{2}$/.test(value)) {
      selectedPeriodMonth = periodKeyForDate(`${value}-01`, mode)
      localStorage.setItem(TAREFAS_PERIOD_KEY, selectedPeriodMonth)
    }
    renderEscala()
  })
  document.getElementById('tarefasPeriodMode')?.addEventListener('change', event => {
    const mode = (event.target as HTMLSelectElement).value === 'month' ? 'month' : 'bimester'
    selectedPeriodMode = mode
    localStorage.setItem(TAREFAS_PERIOD_MODE_KEY, mode)
    selectedPeriodMonth = periodKeyForDate(`${selectedPeriodMonth}-01`, mode)
    localStorage.setItem(TAREFAS_PERIOD_KEY, selectedPeriodMonth)
    renderEscala()
  })
  bindAssignmentEditors()
  if (pendingTarget?.meetingId) {
    document.querySelector<HTMLElement>(`[data-task-meeting-id="${pendingTarget.meetingId}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

async function toggleTaskLock(periodId: string): Promise<void> {
  const locked = periods[periodId]?.locked === true
  try {
    await update(tarefasScaleRef, { [`${periodId}/locked`]: !locked })
    periods[periodId] ??= {}
    periods[periodId].locked = !locked
    toast(locked ? 'Escala destravada' : 'Escala travada')
    renderEscala()
  } catch { toast('Não foi possível alterar o travamento') }
}

async function clearTaskScale(periodId: string): Promise<void> {
  if (periods[periodId]?.locked) { toast('Destrave a escala antes de limpar'); return }
  if (!confirm('Limpar todas as designações deste período?')) return
  const period = periods[periodId]
  if (!period) return
  const patch: Record<string, unknown> = {}
  Object.keys(period.meetings ?? {}).forEach(meetingId => {
    patch[`${periodId}/meetings/${meetingId}/assignments`] = null
    patch[`${periodId}/meetings/${meetingId}/manualEdits`] = null
    patch[`${periodId}/meetings/${meetingId}/avisados`] = null
  })
  try {
    await update(tarefasScaleRef, patch)
    Object.values(period.meetings ?? {}).forEach(meeting => { meeting.assignments = {}; meeting.manualEdits = {}; delete meeting.avisados })
    toast('Escala do período limpa')
    renderEscala()
  } catch { toast('Não foi possível limpar a escala') }
}

async function clearTaskRole(periodId: string, role: TaskRole): Promise<void> {
  if (periods[periodId]?.locked) { toast('Destrave a escala antes de limpar'); return }
  if (!confirm(`Limpar ${TASK_ROLE_LABELS[role]} em todo o período?`)) return
  const period = periods[periodId]
  if (!period) return
  const patch: Record<string, unknown> = {}
  Object.entries(period.meetings ?? {}).forEach(([meetingId, meeting]) => {
    if (!meetingAllowsRole(meeting, role)) return
    patch[`${periodId}/meetings/${meetingId}/assignments/${role}`] = null
    patch[`${periodId}/meetings/${meetingId}/manualEdits/${role}`] = null
    patch[`${periodId}/meetings/${meetingId}/avisados/${role}`] = null
  })
  try {
    await update(tarefasScaleRef, patch)
    Object.values(period.meetings ?? {}).forEach(meeting => {
      if (!meetingAllowsRole(meeting, role)) return
      delete meeting.assignments?.[role]
      delete meeting.manualEdits?.[role]
      delete meeting.avisados?.[role]
    })
    toast(`${TASK_ROLE_LABELS[role]} limpa`)
    renderEscala()
  } catch { toast('Não foi possível limpar a função') }
}

async function generateScale(startDate: string, mode: 'month' | 'bimester', role: TaskRole | null, onlyPending: boolean): Promise<void> {
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
    const result = computeGeneration(context, startDate, role, generatedAt, canonical.periodId, onlyPending, todayStr())
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

  const usageSince = new Date()
  usageSince.setMonth(usageSince.getMonth() - 6)
  const usageFloor = usageSince.toISOString().slice(0, 10)
  const usage = Object.fromEntries(Object.keys(pessoas).map(id => [id, 0])) as Record<string, number>
  scaleMeetingEntries().forEach(({ meeting }) => {
    if (!meeting.date || meeting.date < usageFloor) return
    GENERATED_ROLES.forEach(role => {
      const id = assignmentForRole(meeting, role)
      if (id && id in usage) usage[id] += 1
    })
  })
  const targetPersonId = pendingTarget?.personId
  const query = participantSearch.trim().toLocaleLowerCase('pt-BR')
  const rows = Object.entries(pessoas)
    .filter(([id, person]) => !query || pessoaNome(person, id).toLocaleLowerCase('pt-BR').includes(query))
    .filter(([, person]) => {
      const rule = person.rule ?? 'both'
      return !participantMeetingRule || rule === participantMeetingRule || (participantMeetingRule !== 'both' && rule === 'both')
    })
    .filter(([, person]) => !participantRoleFilter || person.roles?.[participantRoleFilter as TaskRole] === true)
    .sort(([, a], [, b]) => pessoaNome(a, '').localeCompare(pessoaNome(b, ''), 'pt-BR'))

  content.innerHTML = `
    ${sectionTitle('Participantes', 'Pessoas gerenciadas pelo Admin. Edite funções, folga e vínculo.')}
    ${context.usuario.apps.mestre ? '<div style="display:flex;justify-content:flex-end;margin-bottom:10px"><button id="btnAddTaskPerson" class="btn btn-primary" type="button">Vincular pessoa</button></div>' : ''}
    <div class="module-form-grid" style="margin-bottom:10px">
      <div class="form-group" style="margin:0"><label class="form-label" for="taskPersonSearch">Buscar</label><input id="taskPersonSearch" class="form-input" value="${escapeHtml(participantSearch)}" placeholder="Nome da pessoa"></div>
      <div class="form-group" style="margin:0"><label class="form-label" for="taskPersonMeetingFilter">Reuniões</label><select id="taskPersonMeetingFilter" class="form-select"><option value="">Todas</option><option value="midweek" ${participantMeetingRule === 'midweek' ? 'selected' : ''}>Meio de semana</option><option value="weekend" ${participantMeetingRule === 'weekend' ? 'selected' : ''}>Fim de semana</option><option value="both" ${participantMeetingRule === 'both' ? 'selected' : ''}>Todas as reuniões</option></select></div>
      <div class="form-group" style="margin:0"><label class="form-label" for="taskPersonRoleFilter">Função</label><select id="taskPersonRoleFilter" class="form-select"><option value="">Todas</option>${TASK_ROLES.map(role => `<option value="${role}" ${participantRoleFilter === role ? 'selected' : ''}>${escapeHtml(TASK_ROLE_LABELS[role])}</option>`).join('')}</select></div>
      <div style="display:flex;align-items:end"><button id="taskClearPersonFilters" class="btn btn-ghost" type="button" style="width:100%">Limpar filtros</button></div>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${rows.length
        ? rows.map(([id, p]) => pessoaRow(id, p, usage[id] ?? 0, id === targetPersonId)).join('')
        : emptyState('Nenhum participante. Adicione pelo módulo Admin.')}
    </div>`
  document.getElementById('btnAddTaskPerson')?.addEventListener('click', () => openTaskPersonModal(null))
  content.querySelectorAll<HTMLButtonElement>('[data-edit-task-person]').forEach(button => {
    button.addEventListener('click', () => openTaskPersonModal(button.dataset['editTaskPerson'] ?? null))
  })
  document.getElementById('taskPersonSearch')?.addEventListener('input', event => { participantSearch = (event.target as HTMLInputElement).value; renderParticipantes() })
  document.getElementById('taskPersonMeetingFilter')?.addEventListener('change', event => { participantMeetingRule = (event.target as HTMLSelectElement).value; renderParticipantes() })
  document.getElementById('taskPersonRoleFilter')?.addEventListener('change', event => { participantRoleFilter = (event.target as HTMLSelectElement).value; renderParticipantes() })
  document.getElementById('taskClearPersonFilters')?.addEventListener('click', () => { participantSearch = ''; participantMeetingRule = ''; participantRoleFilter = ''; renderParticipantes() })
  if (targetPersonId && pessoas[targetPersonId] && context.usuario.apps.mestre) openTaskPersonModal(targetPersonId)
}

type PendingLevel = 'alta' | 'media' | 'baixa'

const pendingLevelLabel: Record<PendingLevel, string> = { alta: 'Alta', media: 'Media', baixa: 'Baixa' }
const pendingLevelColor: Record<PendingLevel, string> = { alta: '#B3261E', media: '#8A5B00', baixa: '#006EB6' }

function renderPendencias(): void {
  const content = document.getElementById('tarefasContent')
  if (!content) return

  const items: Array<{ level: PendingLevel; title: string; detail: string; tab: TarefasTab; target?: PendingTarget }> = []
  const futureEntries = scaleMeetingEntries()
    .filter(entry => entry.meeting.date && entry.meeting.date >= todayStr() && canonicalMeetingType(entry.meeting.type) && !meetingIsBlocked(domainContext(), entry.meeting))
  if (!futureEntries.length) {
    items.push({
      level: 'alta',
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
        level: missing.length === GENERATED_ROLES.filter(role => meetingAllowsRole(meeting, role)).length ? 'alta' : 'media',
        title: missing.length === GENERATED_ROLES.filter(role => meetingAllowsRole(meeting, role)).length
          ? `Escala de ${formatDate(meeting.date)} por gerar`
          : `Reunião de ${formatDate(meeting.date)} incompleta`,
        detail: `Funções sem pessoa: ${missing.join(', ')}`,
        tab: 'escala',
        target: { periodId: entry.periodId, meetingId: entry.meetingId },
      })
    }
    GENERATED_ROLES.forEach(role => {
      const personId = assignmentForRole(meeting, role)
      if (!personId) return
      const person = pessoas[personId]
      if (!person) {
        items.push({
          level: 'alta',
          title: `${roleLabel(role)} aponta para pessoa inexistente`,
          detail: `${formatDate(meeting.date)} · ID ${personId}.`,
          tab: 'participantes',
          target: { personId },
        })
        return
      }
      if (!isActive(person)) {
        items.push({
          level: 'media',
          title: `${roleLabel(role)} aponta para participante inativo`,
          detail: `${formatDate(meeting.date)} · ${pessoaNome(person, personId)} está inativo em Tarefas.`,
          tab: 'participantes',
          target: { personId },
        })
      }
      const conflict = manualConflictReason(domainContext(), entry, role, personId)
      if (conflict) {
        items.push({
          level: 'media',
          title: `${roleLabel(role)} com conflito`,
          detail: `${formatDate(meeting.date)} · ${pessoaNome(person, personId)}: ${conflict}.`,
          tab: 'escala',
          target: { periodId: entry.periodId, meetingId: entry.meetingId, role },
        })
      }
    })
  })

  const unlinked = Object.values(pessoas).filter(person => isActive(person) && !person.masterId).length
  if (unlinked) {
    items.push({
      level: 'baixa',
      title: `${unlinked} participante${unlinked === 1 ? '' : 's'} sem vínculo com Admin`,
      detail: 'Revise os vínculos antes de gerar uma nova escala.',
      tab: 'participantes',
    })
  }
  const counts = items.reduce<Record<PendingLevel, number>>((acc, item) => {
    acc[item.level] += 1
    return acc
  }, { alta: 0, media: 0, baixa: 0 })

  content.innerHTML = `
    ${sectionTitle('Pendências', items.length ? 'Resolva estes itens antes de confirmar a escala.' : 'A escala atual não tem pendências identificadas.')}
    ${items.length ? `<div class="pending-summary"><span style="background:#B3261E">Alta: ${counts.alta}</span><span style="background:#8A5B00">Media: ${counts.media}</span><span style="background:#006EB6">Baixa: ${counts.baixa}</span></div>` : ''}
    ${items.length
      ? `<div style="display:flex;flex-direction:column;gap:8px">${items.map((item, index) => `<button class="module-menu-btn" type="button" data-pending-index="${index}" style="border-radius:8px;padding:12px 14px;border-left:4px solid ${pendingLevelColor[item.level]}"><div style="flex:1;min-width:0"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="pending-badge" style="background:${pendingLevelColor[item.level]}">${pendingLevelLabel[item.level]}</span><div class="mod-label">${escapeHtml(item.title)}</div></div><div class="mod-desc">${escapeHtml(item.detail)}</div></div><span style="font-size:1.1rem;color:${pendingLevelColor[item.level]}">›</span></button>`).join('')}</div>`
      : '<div style="padding:18px;border:1px solid #B7DEC7;background:#F1FAF4;border-radius:8px;color:#1A6B3C;font-size:.84rem">Tudo certo por enquanto.</div>'}`

  content.querySelectorAll<HTMLButtonElement>('[data-pending-index]').forEach(button => {
    button.addEventListener('click', () => {
      const item = items[Number(button.dataset['pendingIndex'])]
      if (!item) return
      pendingTarget = item.target ?? null
      if (item.target?.periodId) selectedPeriodMonth = item.target.periodId
      activeTab = item.tab
      renderContent()
    })
  })
}

function sectionTitle(title: string, desc: string): string {
  return `
    <div style="margin-bottom:14px">
      ${moduleBackButton()}
      <h2 style="font-size:1.05rem;color:#7E3AF2;margin-bottom:2px">${escapeHtml(title)}</h2>
      <p style="font-size:.8rem;color:var(--ink-3)">${escapeHtml(desc)}</p>
    </div>`
}

function meetingCard(meeting: TarefasMeeting): string {
  const count = assignmentCount(meeting)
  const type = canonicalMeetingType(meeting.type) === 'midweek' ? 'Meio de semana' : 'Fim de semana'
  const ref = meetingRefFor(meeting)
  const locked = ref ? periods[ref.periodId]?.locked === true : false
  const editors = ref
    ? GENERATED_ROLES.filter(role => meetingAllowsRole(meeting, role))
      .map(role => assignmentEditor(ref.periodId, ref.meetingId, meeting, role, locked))
      .join('')
    : ''

  return `
    <div data-task-meeting-id="${escapeHtml(ref?.meetingId)}" style="background:var(--surface);border:1px solid ${pendingTarget?.meetingId === ref?.meetingId ? '#7E3AF2' : 'var(--border)'};box-shadow:${pendingTarget?.meetingId === ref?.meetingId ? '0 0 0 3px #EAE1FA' : 'none'};border-radius:8px;padding:10px 12px">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
        <div style="min-width:0">
          <div style="font-size:.9rem;font-weight:700;color:var(--ink)">${formatDate(meeting.date)}</div>
          <div style="font-size:.76rem;color:var(--ink-3)">${escapeHtml(type)}</div>
        </div>
        <span style="font-size:.75rem;font-weight:700;color:${locked ? '#B3261E' : '#7E3AF2'}">
          ${locked ? 'Travada' : `${count} função${count === 1 ? '' : 'ões'}`}
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

function pessoaRow(id: string, p: TarefasPessoa, recentUsage: number, focused = false): string {
  const linked = Boolean(p.masterId)
  const active = isActive(p)
  const meetings = p.rule === 'midweek' ? 'Meio de semana' : p.rule === 'weekend' ? 'Fim de semana' : p.rule === 'none' ? 'Fora da escala' : 'Todas as reuniões'
  const roles = TASK_ROLES.filter(role => p.roles?.[role] === true).map(role => TASK_ROLE_LABELS[role]).join(', ') || 'Nenhuma função'

  return `
    <div data-task-person-id="${escapeHtml(id)}" style="background:var(--surface);border:1px solid ${focused ? '#7E3AF2' : 'var(--border)'};box-shadow:${focused ? '0 0 0 3px #EAE1FA' : 'none'};border-radius:8px;
      padding:9px 12px;display:flex;align-items:center;gap:8px">
      <div style="flex:1;min-width:0">
        <div style="font-size:.88rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          ${escapeHtml(pessoaNome(p, id))}
        </div>
        <div style="font-size:.72rem;color:var(--ink-3)">
          ${active ? 'Ativo' : 'Inativo'} · ${meetings} · ${recentUsage} função${recentUsage === 1 ? '' : 'ões'} em 6 meses
        </div>
        <div style="font-size:.72rem;color:var(--ink-3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(roles)}</div>
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
    .map(([mid, item]) => `<option value="${escapeHtml(mid)}" ${person?.masterId === mid ? 'selected' : ''}>${escapeHtml(item.name || mid)} · ID ${escapeHtml(mid)}</option>`)
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
    <div class="form-group"><label class="form-label" for="taskPersonMaster">Pessoa do cadastro Admin</label><select id="taskPersonMaster" class="form-select" ${id && person?.masterId ? 'disabled' : ''}><option value="">Selecionar pelo nome ou ID...</option>${masterOptions}</select></div>
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

  const prepared = prepareTaskPrint(meetings, congregationName, pessoas, preferredFontPt)
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal tarefas-preview-modal">
      <h2>Prévia da escala de Tarefas</h2>
      <p class="form-help">Fonte ajustada para ${prepared.fontPt} pt. Confira antes de imprimir.</p>
      <div class="tarefas-print-preview" style="font-size:${prepared.fontPt}pt">${prepared.html}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
        <button id="closeTaskPreview" class="btn btn-ghost" type="button">Fechar</button>
        <button id="printTaskPreview" class="btn btn-primary" type="button">Imprimir</button>
      </div>
    </div>`
  document.body.appendChild(overlay)
  document.getElementById('closeTaskPreview')?.addEventListener('click', () => overlay.remove())
  document.getElementById('printTaskPreview')?.addEventListener('click', () => {
    printPreparedTaskSchedule(prepared)
    toast(`PDF em ${prepared.fontPt} pt`)
  })
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove() })
}
