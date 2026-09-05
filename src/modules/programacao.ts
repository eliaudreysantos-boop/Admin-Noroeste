import type { AppContext, RawPessoas } from '../types'
import { get, pessoasRef, programacaoRef, update } from '../firebase'
import { renderMenuCards, type ItemMenu } from '../ui/menu-cards'
import { moduleBackButton } from '../ui/module-header'

type ProgramacaoTab = 'indice' | 'programa' | 'apostilas' | 'pessoas' | 'arquivos' | 'lembretes'

let activeTab: ProgramacaoTab = 'indice'
let programacao: Record<string, unknown> = {}
let pessoas: RawPessoas = {}
let editingWeekId: string | null = null

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
  activeTab = 'indice'
  const el = document.getElementById('appContent')
  if (!el) return

  el.innerHTML = `
    <div id="programacaoRoot">
      <div id="programacaoContent">
        <p style="padding:24px;color:var(--ink-3);text-align:center">Carregando...</p>
      </div>
    </div>`

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

function renderContent(): void {
  if (activeTab === 'indice') {
    renderIndex()
    return
  }
  if (activeTab === 'programa') renderPrograma()
  else if (activeTab === 'apostilas') renderApostilas()
  else if (activeTab === 'pessoas') renderPessoas()
  else if (activeTab === 'arquivos') renderArquivos()
  else renderLembretes()
}

function renderIndex(): void {
  const content = document.getElementById('programacaoContent')
  if (!content) return
  content.innerHTML = `<div style="margin-bottom:14px"><h2 style="font-size:1.05rem;color:var(--blue-deep);margin-bottom:2px">Programação</h2></div><div id="programacaoMenu"></div>`
  const items: ItemMenu[] = [
    { id: 'programa', titulo: 'Programa', subtitulo: 'Semanas, partes e designações', icone: '▦', corFundo: '#003F72' },
    { id: 'apostilas', titulo: 'Apostilas', subtitulo: 'Importação dos programas oficiais', icone: '▤', corFundo: '#7E3AF2' },
    { id: 'pessoas', titulo: 'Pessoas', subtitulo: 'Participantes disponíveis para designações', icone: '♙', corFundo: '#006EB6' },
    { id: 'arquivos', titulo: 'Arquivos', subtitulo: 'S-89 e programação para impressão', icone: '▣', corFundo: '#1A6B3C' },
    { id: 'lembretes', titulo: 'Lembretes', subtitulo: 'Mensagens após revisar as designações', icone: '✉', corFundo: '#B3261E' },
  ]
  renderMenuCards(content.querySelector<HTMLElement>('#programacaoMenu')!, items, id => { activeTab = id as ProgramacaoTab; renderContent() })
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
    </div>
    <div id="programacaoEditor" style="margin-top:12px"></div>`
  if (editingWeekId) renderWeekEditor(editingWeekId)
  el.querySelectorAll<HTMLButtonElement>('[data-edit-week]').forEach(button => {
    button.addEventListener('click', () => {
      editingWeekId = button.dataset.editWeek ?? null
      renderPrograma()
    })
  })
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
    <div style="display:flex;align-items:center;gap:10px"><span style="font-size:.72rem;font-weight:700;color:${pending ? '#B3261E' : '#1A6B3C'};white-space:nowrap">${pending ? `${pending} pendente${pending > 1 ? 's' : ''}` : 'Completa'}</span><button class="secondary-btn" type="button" data-edit-week="${escapeHtml(id)}">Editar</button></div>
  </div>`
}

function renderWeekEditor(id: string): void {
  const host = document.getElementById('programacaoEditor')
  const weeks = records(programacao['programs'] ?? programacao['semanas'] ?? programacao)
  const week = records(weeks[id])
  if (!host || !Object.keys(week).length) return
  const parts = Array.isArray(week.parts) ? week.parts as unknown[] : Object.values(records(week.parts))
  host.innerHTML = `<div class="form-panel"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><div><strong>Editar designações de ${escapeHtml(formatDate(String(week.meetingDate ?? week.data ?? week.date ?? id)))}</strong><div class="form-help">As alterações ficam gravadas no programa desta semana.</div></div><button class="secondary-btn" type="button" data-close-editor>Fechar</button></div><div class="module-form-grid" style="margin-top:12px">${parts.map((part, index) => {
    const item = records(part)
    const selected = String(item.assignedPersonId ?? item.pessoaId ?? item.assigned ?? '')
    const options = [`<option value="">Sem designação</option>`, ...Object.entries(pessoas).filter(([, person]) => person.active).sort(([, a], [, b]) => a.name.localeCompare(b.name, 'pt-BR')).map(([personId, person]) => `<option value="${escapeHtml(personId)}" ${personId === selected ? 'selected' : ''}>${escapeHtml(person.name)}</option>`)]
    return `<label class="form-field"><span>${escapeHtml(String(item.title ?? `Parte ${index + 1}`))}</span><select data-program-part="${escapeHtml(String(item.id ?? index))}">${options.join('')}</select></label>`
  }).join('')}</div><button class="primary-btn" type="button" data-save-week="${escapeHtml(id)}" style="margin-top:12px">Salvar designações</button></div>`
  host.querySelector('[data-close-editor]')?.addEventListener('click', () => { editingWeekId = null; renderPrograma() })
  host.querySelector<HTMLButtonElement>('[data-save-week]')?.addEventListener('click', () => { void saveWeekAssignments(id, parts) })
}

async function saveWeekAssignments(id: string, parts: unknown[]): Promise<void> {
  const host = document.getElementById('programacaoEditor')
  if (!host) return
  const values = new Map(Array.from(host.querySelectorAll<HTMLSelectElement>('[data-program-part]')).map(select => [select.dataset.programPart ?? '', select.value]))
  const nextParts = parts.map((part, index) => {
    const item = { ...records(part) }
    const key = String(item.id ?? index)
    const personId = values.get(key) ?? ''
    if (personId) item.assignedPersonId = personId
    else {
      delete item.assignedPersonId
      delete item.pessoaId
      delete item.assigned
    }
    return item
  })
  try {
    await update(programacaoRef, { [`programs/${id}/parts`]: nextParts })
    const current = records(programacao.programs ?? programacao.semanas ?? programacao)
    if (current[id]) current[id] = { ...records(current[id]), parts: nextParts }
    editingWeekId = null
    toast('Designações salvas')
    renderPrograma()
  } catch {
    toast('Não foi possível salvar as designações')
  }
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
    <form id="programacaoImportForm" class="form-panel" style="margin-bottom:10px">
      <label class="form-field"><span>URL oficial do programa</span><input name="url" type="url" placeholder="https://www.jw.org/pt/..." required></label>
      <button class="primary-btn" type="submit">Importar programa</button>
      <div class="form-help">A importação consulta o endpoint oficial configurado no app. As semanas novas são adicionadas sem duplicar as existentes.</div>
    </form>
    <details class="form-panel"><summary>Importação pontual por JSON</summary><p class="form-help">Use para um ajuste manual ou para dados exportados de outra instalação.</p><textarea id="programacaoJson" rows="7" placeholder='{"id":"2026-09-02","meetingDate":"2026-09-02","bibleReading":"...","parts":[]}'></textarea><button class="secondary-btn" type="button" data-import-json style="margin-top:8px">Salvar JSON</button></details>`
  document.getElementById('programacaoImportForm')?.addEventListener('submit', event => {
    event.preventDefault()
    const url = new FormData(event.currentTarget as HTMLFormElement).get('url')
    void importOfficialProgram(String(url ?? ''))
  })
  document.querySelector<HTMLButtonElement>('[data-import-json]')?.addEventListener('click', () => { void importJsonProgram() })
}

async function importOfficialProgram(url: string): Promise<void> {
  try {
    if (!/^https:\/\/www\.jw\.org\/pt\//i.test(url)) throw new Error('Use uma URL oficial em https://www.jw.org/pt/.')
    const response = await fetch('/api/import-jw-program', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
    const payload = await response.json() as { html?: string; error?: string }
    if (!response.ok || !payload.html) throw new Error(payload.error ?? 'A importação não retornou o conteúdo oficial.')
    const program = parseOfficialText(payload.html, url)
    await saveProgram(program)
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Não foi possível importar o programa')
  }
}

async function importJsonProgram(): Promise<void> {
  try {
    const raw = document.getElementById('programacaoJson') as HTMLTextAreaElement | null
    const value = JSON.parse(raw?.value ?? '') as Record<string, unknown>
    const program = normalizeProgram(value)
    await saveProgram(program)
  } catch {
    toast('JSON inválido. Informe uma semana com data e partes.')
  }
}

function normalizeProgram(value: Record<string, unknown>): Record<string, unknown> {
  const date = String(value.meetingDate ?? value.data ?? value.date ?? value.id ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Data inválida')
  const parts = Array.isArray(value.parts) ? value.parts : []
  if (!parts.length) throw new Error('Informe ao menos uma parte')
  return { ...value, id: String(value.id ?? date), meetingDate: date, parts }
}

function parseOfficialText(html: string, sourceUrl: string): Record<string, unknown> {
  const text = html.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
  const dateMatch = text.match(/(\d{1,2})\s*(?:-|–)\s*\d{1,2}\s+de\s+([a-zç]+)\s+de\s+(\d{4})/i)
  const months: Record<string, string> = { janeiro: '01', fevereiro: '02', março: '03', abril: '04', maio: '05', junho: '06', julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12' }
  if (!dateMatch || !months[dateMatch[2].toLowerCase()]) throw new Error('Não foi possível identificar a data da semana')
  const meetingDate = `${dateMatch[3]}-${months[dateMatch[2].toLowerCase()]}-${dateMatch[1].padStart(2, '0')}`
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const bibleReading = lines.find(line => /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ ]+\s+\d/.test(line)) ?? 'Leitura bíblica não informada'
  const parts: Record<string, unknown>[] = []
  let section = 'vida-crista'
  lines.forEach((line, index) => {
    if (/TESOUROS DA PALAVRA/i.test(line)) section = 'tesouros'
    else if (/FAÇA SEU MELHOR/i.test(line)) section = 'ministerio'
    else if (/NOSSA VIDA CRISTÃ/i.test(line)) section = 'vida-crista'
    const match = line.match(/^(\d+)\.\s+(.+)$/)
    const duration = lines[index + 1]?.match(/^\((\d+)\s+min\)\s*(.*)$/i)
    if (match && duration) parts.push({ id: `${meetingDate}-${match[1]}`, section, title: match[2], durationMinutes: Number(duration[1]), ...(duration[2] ? { reference: duration[2] } : {}) })
  })
  if (!parts.length) throw new Error('Não foi possível encontrar as partes da reunião')
  return { id: meetingDate, meetingDate, bibleReading, sourceUrl, parts }
}

async function saveProgram(value: Record<string, unknown>): Promise<void> {
  const program = normalizeProgram(value)
  const id = String(program.id)
  await update(programacaoRef, { [`programs/${id}`]: program })
  const root = programacao.programs ? 'programs' : programacao.semanas ? 'semanas' : 'programs'
  programacao[root] = { ...records(programacao[root]), [id]: program }
  activeTab = 'programa'
  editingWeekId = null
  toast('Programa salvo')
  renderContent()
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
      ${moduleBackButton()}
      <h2 style="font-size:1.05rem;color:var(--blue-deep);margin-bottom:2px">${escapeHtml(title)}</h2>
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
