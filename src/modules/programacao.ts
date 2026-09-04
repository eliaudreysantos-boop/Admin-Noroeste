import type { AppContext } from '../types'
import { get, programacaoRef } from '../firebase'

type ProgramacaoTab = 'programa' | 'apostilas' | 'pessoas' | 'arquivos' | 'lembretes'

let activeTab: ProgramacaoTab = 'programa'
let programacao: Record<string, unknown> = {}

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

function countRecords(value: unknown): number {
  return value && typeof value === 'object' ? Object.keys(value as Record<string, unknown>).length : 0
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
    const snap = await get(programacaoRef)
    programacao = snap.exists() ? (snap.val() as Record<string, unknown>) : {}
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

  const semanas = countRecords(programacao['programs'] ?? programacao['semanas'] ?? programacao)
  el.innerHTML = `
    ${sectionTitle('Programa', 'Importe a apostila, revise a semana e confira as designações antes dos lembretes.')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      ${metricCard('Semanas', String(semanas), '#003F72')}
      ${metricCard('Pendências', '0', '#1A6B3C')}
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${optionCard('Semana', 'Programação e designações da reunião')}
      ${optionCard('Mês', 'Filtro mensal para conferência')}
      ${optionCard('Bimestre', 'Importação da apostila oficial')}
    </div>`
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
  el.innerHTML = `
    ${sectionTitle('Pessoas', 'Mantenha permissões de designação e WhatsApp antes de criar lembretes.')}
    <div style="display:flex;flex-direction:column;gap:8px">
      ${optionCard('Cadastro', 'Pessoas e permissões da reunião')}
      ${optionCard('Vínculo com Admin', 'Evita cadastro duplicado entre módulos')}
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
