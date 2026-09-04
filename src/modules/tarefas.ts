import type { AppContext } from '../types'
import {
  get,
  tarefasPeopleRef,
  tarefasPlanejamentoRef,
  tarefasScaleRef,
} from '../firebase'

type TarefasTab = 'resumo' | 'escala' | 'participantes' | 'mensagens' | 'config'

interface TarefasPessoa {
  name?: string
  nome?: string
  active?: boolean
  ativo?: boolean
  masterId?: string
}

interface TarefasMeeting {
  date?: string
  type?: string
  assignments?: Record<string, unknown>
}

interface TarefasPeriod {
  meetings?: Record<string, TarefasMeeting>
}

interface TarefasPlanning {
  enableSection1?: boolean
  periodMode?: string
  scaleStartDate?: string
  s1Time?: string
  s2Time?: string
}

let activeTab: TarefasTab = 'resumo'
let pessoas: Record<string, TarefasPessoa> = {}
let periods: Record<string, TarefasPeriod> = {}
let planning: TarefasPlanning = {}

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
  return p.name || p.nome || fallback
}

function isActive(p: TarefasPessoa): boolean {
  return p.active !== false && p.ativo !== false
}

function allMeetings(): TarefasMeeting[] {
  return Object.values(periods)
    .flatMap(period => Object.values(period.meetings ?? {}))
    .filter(meeting => meeting && typeof meeting === 'object')
}

function futureMeetings(): TarefasMeeting[] {
  const hoje = todayStr()
  return allMeetings()
    .filter(meeting => !meeting.date || meeting.date >= hoje)
    .sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')))
}

function assignmentCount(meeting: TarefasMeeting): number {
  return Object.keys(meeting.assignments ?? {}).length
}

function formatDate(value: string | undefined): string {
  if (!value) return 'Sem data'
  const [y, m, d] = value.split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

export default function mount(_ctx: AppContext): void {
  activeTab = 'resumo'
  const el = document.getElementById('appContent')
  if (!el) return

  el.innerHTML = `
    <div id="tarefasRoot">
      <div id="tarefasTabs" style="display:flex;gap:4px;margin-bottom:16px"></div>
      <div id="tarefasContent">
        <p style="padding:24px;color:var(--ink-3);text-align:center">Carregando...</p>
      </div>
    </div>`

  renderTabs()
  void loadTarefas()
}

function renderTabs(): void {
  const bar = document.getElementById('tarefasTabs')
  if (!bar) return

  const tabs: Array<{ id: TarefasTab; label: string }> = [
    { id: 'resumo', label: 'Resumo' },
    { id: 'escala', label: 'Escala' },
    { id: 'participantes', label: 'Pessoas' },
    { id: 'mensagens', label: 'Mensagens' },
    { id: 'config', label: 'Config' },
  ]

  bar.innerHTML = tabs.map(t => `
    <button class="btn ${activeTab === t.id ? 'btn-primary' : 'btn-ghost'}"
      data-tab="${t.id}" style="flex:1;font-size:.78rem;padding:8px 4px">
      ${t.label}
    </button>`).join('')

  bar.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset['tab'] as TarefasTab
      renderTabs()
      renderContent()
    })
  })
}

async function loadTarefas(): Promise<void> {
  try {
    const [peopleSnap, scaleSnap, planningSnap] = await Promise.all([
      get(tarefasPeopleRef),
      get(tarefasScaleRef),
      get(tarefasPlanejamentoRef),
    ])

    pessoas = peopleSnap.exists() ? (peopleSnap.val() as Record<string, TarefasPessoa>) : {}
    periods = scaleSnap.exists() ? (scaleSnap.val() as Record<string, TarefasPeriod>) : {}
    planning = planningSnap.exists() ? (planningSnap.val() as TarefasPlanning) : {}
  } catch {
    toast('Erro ao carregar Tarefas')
  }

  renderContent()
}

function renderContent(): void {
  if (activeTab === 'resumo') renderResumo()
  else if (activeTab === 'escala') renderEscala()
  else if (activeTab === 'participantes') renderParticipantes()
  else if (activeTab === 'mensagens') renderMensagens()
  else renderConfig()
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
    ${sectionTitle('Tarefas', 'Funções da reunião, participantes, mensagens e configuração.')}
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
      ${flowCard('Configurações', 'Seções, horários e início da escala', 'config')}
    </div>`

  bindFlowCards()
}

function renderEscala(): void {
  const content = document.getElementById('tarefasContent')
  if (!content) return

  const futuras = futureMeetings().slice(0, 12)

  content.innerHTML = `
    ${sectionTitle('Escala de tarefas', 'Confira as próximas reuniões antes de enviar mensagens.')}
    <div style="display:flex;flex-direction:column;gap:8px">
      ${futuras.length
        ? futuras.map(meeting => meetingCard(meeting)).join('')
        : emptyState('Nenhuma reunião futura cadastrada.')}
    </div>`
}

function renderParticipantes(): void {
  const content = document.getElementById('tarefasContent')
  if (!content) return

  const rows = Object.entries(pessoas)
    .sort(([, a], [, b]) => pessoaNome(a, '').localeCompare(pessoaNome(b, ''), 'pt-BR'))

  content.innerHTML = `
    ${sectionTitle('Participantes', 'Mantenha o vínculo com Admin em dia para evitar nomes duplicados.')}
    <div style="display:flex;flex-direction:column;gap:6px">
      ${rows.length
        ? rows.map(([id, p]) => pessoaRow(id, p)).join('')
        : emptyState('Nenhum participante cadastrado.')}
    </div>`
}

function renderMensagens(): void {
  const content = document.getElementById('tarefasContent')
  if (!content) return

  content.innerHTML = `
    ${sectionTitle('Mensagens', 'Use depois de revisar a escala e confirmar que os participantes estão vinculados.')}
    <div style="display:flex;flex-direction:column;gap:8px">
      ${optionCard('Para uma pessoa', 'Tarefas futuras de um participante')}
      ${optionCard('Da reunião', 'Todas as funções de uma data')}
      ${optionCard('Confirmar disponibilidade', 'Checagem antes de fechar a escala')}
    </div>`
}

function renderConfig(): void {
  const content = document.getElementById('tarefasContent')
  if (!content) return

  const section1 = planning.enableSection1 === true ? 'Ativa' : 'Inativa'
  const mode = planning.periodMode || 'Não definido'
  const start = planning.scaleStartDate ? formatDate(planning.scaleStartDate) : 'Não definido'
  const s1 = planning.s1Time || 'Não definido'
  const s2 = planning.s2Time || 'Não definido'

  content.innerHTML = `
    ${sectionTitle('Configurações', 'Revise estes dados antes de gerar ou publicar uma nova escala.')}
    <div style="display:flex;flex-direction:column;gap:8px">
      ${configRow('Seção 1', section1)}
      ${configRow('Modo do período', mode)}
      ${configRow('Início da escala', start)}
      ${configRow('Horário S-1', s1)}
      ${configRow('Horário S-2', s2)}
    </div>`
}

function sectionTitle(title: string, desc: string): string {
  return `
    <div style="margin-bottom:14px">
      <h2 style="font-size:1.05rem;color:#7E3AF2;margin-bottom:2px">${escapeHtml(title)}</h2>
      <p style="font-size:.8rem;color:var(--ink-3)">${escapeHtml(desc)}</p>
    </div>`
}

function metricCard(label: string, value: string, color: string): string {
  return `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 12px">
      <div style="font-size:1.15rem;font-weight:800;color:${color};line-height:1">${escapeHtml(value)}</div>
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
      renderTabs()
      renderContent()
    })
  })
}

function meetingCard(meeting: TarefasMeeting): string {
  const count = assignmentCount(meeting)
  const type = meeting.type === 's1'
    ? 'Meio de semana'
    : meeting.type === 's2'
      ? 'Fim de semana'
      : meeting.type || 'Reunião'

  return `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 12px">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
        <div style="min-width:0">
          <div style="font-size:.9rem;font-weight:700;color:var(--ink)">${formatDate(meeting.date)}</div>
          <div style="font-size:.76rem;color:var(--ink-3)">${escapeHtml(type)}</div>
        </div>
        <span style="font-size:.75rem;font-weight:700;color:#7E3AF2">
          ${count} função${count === 1 ? '' : 'ões'}
        </span>
      </div>
    </div>`
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
    </div>`
}

function optionCard(title: string, desc: string): string {
  return `
    <button class="module-menu-btn" type="button" disabled
      style="opacity:.72;cursor:not-allowed;border-radius:8px;padding:12px 14px">
      <div style="flex:1;min-width:0">
        <div class="mod-label">${escapeHtml(title)}</div>
        <div class="mod-desc">${escapeHtml(desc)}</div>
      </div>
      <span style="font-size:.72rem;color:var(--ink-3);font-weight:700">Em preparo</span>
    </button>`
}

function configRow(label: string, value: string): string {
  return `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;
      padding:10px 12px;display:flex;justify-content:space-between;gap:12px">
      <span style="font-size:.82rem;color:var(--ink-2);font-weight:700">${escapeHtml(label)}</span>
      <span style="font-size:.82rem;color:var(--ink);text-align:right">${escapeHtml(value)}</span>
    </div>`
}

function emptyState(text: string): string {
  return `
    <div class="module-placeholder" style="padding:34px 18px">
      <p>${escapeHtml(text)}</p>
    </div>`
}
