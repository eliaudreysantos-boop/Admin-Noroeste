import type { AppContext, RawPessoas } from '../types'
import { get, pessoasRef, programacaoRef } from '../firebase'

type ProgramacaoTab = 'programa' | 'apostilas' | 'pessoas' | 'arquivos' | 'lembretes'

let activeTab: ProgramacaoTab = 'programa'
let programacao: Record<string, unknown> = {}
let pessoas: RawPessoas = {}

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

function records(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function countPending(value: unknown): number {
  return Object.values(records(value)).filter(item => {
    const row = records(item)
    return row.status === 'pendente' || row.status === 'por_definir' || row.status === 'por_confirmar'
  }).length
}

function roleLabel(role: string | null): string {
  const labels: Record<string, string> = {
    anciao: 'Ancião',
    'servo-ministerial': 'Servo ministerial',
    pioneiro: 'Pioneiro',
    batizado: 'Batizado',
    publicador: 'Publicador',
  }
  return role ? (labels[role] ?? role) : 'Sem condição'
}

export default function mount(_ctx: AppContext): void {
  activeTab = 'programa'
  const el = document.getElementById('appContent')
  if (!el) return

  el.innerHTML = `
    <div id="programacaoRoot">
      <div id="programacaoTabs" style="display:flex;gap:4px;margin-bottom:16px"></div>
      <div id="programacaoContent">
        <p style="padding:24px;color:var(--ink-3);text-align:center">Carregando...</p>
      </div>
    </div>`

  renderTabs()
  void loadProgramacao()
}

async function loadProgramacao(): Promise<void> {
  try {
    const [programacaoSnap, pessoasSnap] = await Promise.all([get(programacaoRef), get(pessoasRef)])
    programacao = programacaoSnap.exists() ? (programacaoSnap.val() as Record<string, unknown>) : {}
    pessoas = pessoasSnap.exists() ? pessoasSnap.val() as RawPessoas : {}
  } catch {
    toast('Erro ao carregar Programação')
  }
  renderContent()
}

function renderTabs(): void {
  const bar = document.getElementById('programacaoTabs')
  if (!bar) return

  const tabs: Array<{ id: ProgramacaoTab; label: string }> = [
    { id: 'programa', label: 'Programa' },
    { id: 'apostilas', label: 'Apostilas' },
    { id: 'pessoas', label: 'Pessoas' },
    { id: 'arquivos', label: 'Arquivos' },
    { id: 'lembretes', label: 'Lembretes' },
  ]

  bar.innerHTML = tabs.map(t => `
    <button class="btn ${activeTab === t.id ? 'btn-primary' : 'btn-ghost'}"
      data-tab="${t.id}" style="flex:1;font-size:.74rem;padding:8px 3px">
      ${t.label}
    </button>`).join('')

  bar.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset['tab'] as ProgramacaoTab
      renderTabs()
      renderContent()
    })
  })
}

function renderContent(): void {
  if (activeTab === 'programa') renderPrograma()
  else if (activeTab === 'apostilas') renderApostilas()
  else if (activeTab === 'pessoas') renderPessoas()
  else if (activeTab === 'arquivos') renderArquivos()
  else renderLembretes()
}

function renderPrograma(): void {
  const el = document.getElementById('programacaoContent')
  if (!el) return

  const semanasNode = programacao['programs'] ?? programacao['semanas'] ?? programacao
  const semanaEntries = Object.entries(records(semanasNode))
    .map(([id, value]) => [id, records(value)] as const)
    .sort(([, a], [, b]) => String(a.meetingDate ?? a.data ?? a.date ?? '').localeCompare(String(b.meetingDate ?? b.data ?? b.date ?? '')))
  const semanas = semanaEntries.length
  const pendencias = countPending(semanasNode)
  el.innerHTML = `
    ${sectionTitle('Programa', 'Revise as semanas importadas e complete as designações antes dos lembretes.')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      ${metricCard('Semanas', String(semanas), '#003F72')}
      ${metricCard('Pendências', String(pendencias), pendencias ? '#B3261E' : '#1A6B3C')}
    </div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:0 12px">
      ${semanaEntries.length ? semanaEntries.map(([id, week]) => programWeekRow(id, week)).join('') : '<p style="padding:18px 0;color:var(--ink-3);font-size:.82rem;text-align:center">Nenhuma semana importada ainda. Use Apostilas para iniciar o bimestre.</p>'}
    </div>`
}

function programWeekRow(id: string, week: Record<string, unknown>): string {
  const date = String(week.meetingDate ?? week.data ?? week.date ?? id)
  const parts = Array.isArray(week.parts) ? week.parts as unknown[] : Object.values(records(week.parts))
  const pending = parts.filter(part => {
    const item = records(part)
    return !item.assignedPersonId && !item.pessoaId && !item.assigned
  }).length
  const bible = String(week.bibleReading ?? week.leituraBiblica ?? week.leitura ?? '')
  return `<div style="padding:11px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;gap:12px;align-items:center">
    <div style="min-width:0"><strong>${escapeHtml(formatDate(date))}</strong><div style="font-size:.75rem;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(bible || `${parts.length} partes cadastradas`)}</div></div>
    <span style="font-size:.72rem;font-weight:700;color:${pending ? '#B3261E' : '#1A6B3C'};white-space:nowrap">${pending ? `${pending} pendente${pending > 1 ? 's' : ''}` : 'Completa'}</span>
  </div>`
}

function formatDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value
}

function renderApostilas(): void {
  const el = document.getElementById('programacaoContent')
  if (!el) return
  el.innerHTML = `
    ${sectionTitle('Apostilas', 'Baixe o bimestre oficial e salve apenas semanas novas.')}
    <div style="display:flex;flex-direction:column;gap:8px">
      ${optionCard('Baixar apostila oficial', 'Importação bimestral do jw.org')}
      ${optionCard('Importar uma semana', 'Use quando houver ajuste pontual')}
    </div>`
}

function renderPessoas(): void {
  const el = document.getElementById('programacaoContent')
  if (!el) return
  const list = Object.values(pessoas)
    .filter(person => person.active)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    .map(person => `<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)"><div><strong>${escapeHtml(person.name)}</strong><div style="font-size:.75rem;color:var(--ink-3)">${escapeHtml(roleLabel(person.role))}</div></div><span style="font-size:.72rem;color:var(--ink-3)">${person.sex === 'F' ? 'Feminino' : person.sex === 'M' ? 'Masculino' : 'Sexo não informado'}</span></div>`)
    .join('')
  el.innerHTML = `
    ${sectionTitle('Pessoas', 'Use o cadastro Admin como fonte única para as designações.')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
      ${metricCard('Ativas', String(Object.values(pessoas).filter(person => person.active).length), '#1A6B3C')}
      ${metricCard('Com WhatsApp', String(Object.values(pessoas).filter(person => person.active && person.whatsapp).length), '#003F72')}
    </div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:0 12px">
      ${list || '<p style="padding:16px 0;color:var(--ink-3);font-size:.82rem;text-align:center">Nenhuma pessoa ativa cadastrada.</p>'}
    </div>`
}

function renderArquivos(): void {
  const el = document.getElementById('programacaoContent')
  if (!el) return
  el.innerHTML = `
    ${sectionTitle('Arquivos', 'Gere arquivos depois de revisar o programa da semana.')}
    <div style="display:flex;flex-direction:column;gap:8px">
      ${optionCard('S-89', 'Cartões individuais ou quatro por folha')}
      ${optionCard('S-140 PDF', 'Programação para conferência')}
      ${optionCard('S-140 DOCX', 'Documento editável')}
    </div>`
}

function renderLembretes(): void {
  const el = document.getElementById('programacaoContent')
  if (!el) return
  el.innerHTML = `
    ${sectionTitle('Lembretes', 'Envie somente depois de conferir WhatsApp, data, horário e designação.')}
    <div style="display:flex;flex-direction:column;gap:8px">
      ${optionCard('Lembretes S-89', 'Partes do ministério')}
      ${optionCard('Lembretes gerais', 'Demais partes da reunião')}
    </div>`
}

function sectionTitle(title: string, desc: string): string {
  return `
    <div style="margin-bottom:14px">
      <h2 style="font-size:1.05rem;color:var(--blue-deep);margin-bottom:2px">${escapeHtml(title)}</h2>
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
