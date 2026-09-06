import type {
  AppContext,
  ConfigLimpeza,
  ConfigLimpezaGrupo,
  ConfigCongregacao,
  ConfigReunioes,
  LimpezaPeriodoGerado,
  MasterPessoa,
  RawPessoas,
} from '../types'
import {
  get,
  set,
  update,
  pessoasRef,
  configLimpezaRef,
  configCongregacaoRef,
  configReunioesRef,
  limpezaPeriodosRef,
  tarefasPlanejamentoRef,
} from '../firebase'
import { renderMenuCards, type ItemMenu } from '../ui/menu-cards'
import { moduleBackButton } from '../ui/module-header'
import {
  cleaningTextForTasks,
  generateCleaningPeriod,
  monthLabel,
  periodBounds,
  type CleaningPeriodMode,
} from './limpeza-domain'

type LimpezaTab = 'indice' | 'escala' | 'grupos' | 'config' | 'texto' | 'pdf'

let pessoas: RawPessoas = {}
let limpeza: Partial<ConfigLimpeza> = {}
let activeTab: LimpezaTab = 'grupos'
let limpezaChanges = new Map<string, number | null>()
let periodos: Record<string, LimpezaPeriodoGerado> = {}
let periodMode: CleaningPeriodMode = 'bimester'
let periodAnchor = todayStr()
let selectedPeriodId = ''
let congregationName = 'Noroeste'
let reunioes: Partial<ConfigReunioes> = {}

function toast(msg: string, ms = 2600): void {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = msg
  el.classList.add('show')
  setTimeout(() => el.classList.remove('show'), ms)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(d: string): string {
  if (!d) return '--'
  const [y, m, day] = d.split('-')
  if (!y || !m || !day) return d
  return `${day}/${m}/${y}`
}

function toStringArray(val: string[] | Record<string, string> | undefined | null): string[] {
  if (!val) return []
  if (Array.isArray(val)) return val
  return Object.values(val)
}

function setLoading(btnId: string, loading: boolean, label: string): void {
  const btn = document.getElementById(btnId) as HTMLButtonElement | null
  if (!btn) return
  btn.disabled = loading
  btn.textContent = loading ? 'Salvando...' : label
}

function keepApprovalIfTextUnchanged(
  savedText: string | undefined,
  currentText: string,
  approvedAt: string | undefined,
): string {
  return savedText === currentText ? (approvedAt ?? '') : ''
}

function charCounter(textareaId: string, counterId: string, max = 250): void {
  const ta = document.getElementById(textareaId) as HTMLTextAreaElement | null
  const ct = document.getElementById(counterId)
  if (!ta || !ct) return
  const refresh = () => { ct.textContent = `${ta.value.length}/${max}` }
  ta.addEventListener('input', refresh)
  refresh()
}

function activePeople(): [string, MasterPessoa][] {
  return Object.entries(pessoas)
    .filter(([, p]) => p.active)
    .sort((a, b) => a[1].name.localeCompare(b[1].name, 'pt-BR'))
}

function groupCount(): number {
  return Math.max(1, Math.min(12, Number(limpeza.grupos ?? 4)))
}

function candidateOptions(selectedMid = ''): string {
  const candidates = activePeople()
  return candidates
    .map(([mid, p]) =>
      `<option value="${mid}" ${selectedMid === mid ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
    )
    .join('')
}

function renderSectionTitle(title: string, desc: string): string {
  return `
    <div style="margin-bottom:14px">
      ${moduleBackButton()}
      <h2 style="font-size:1.05rem;color:var(--blue-deep);margin-bottom:2px">${title}</h2>
      ${desc ? `<p style="font-size:.8rem;color:var(--ink-3)">${desc}</p>` : ''}
    </div>`
}

export default function mount(_ctx: AppContext): void {
  activeTab = 'indice'
  limpezaChanges = new Map()

  const root = document.getElementById('appContent')
  if (!root) return
  root.innerHTML = `
    <div id="limpezaRoot">
      <div id="limpezaContent"></div>
    </div>`

  void loadAll()
}

async function loadAll(): Promise<void> {
  const content = document.getElementById('limpezaContent')
  if (content) {
    content.innerHTML =
      '<p style="padding:24px;color:var(--ink-3);text-align:center">Carregando...</p>'
  }

  try {
    const [pessoasSnap, limpezaSnap, periodosSnap, congregacaoSnap, reunioesSnap, planejamentoSnap] = await Promise.all([
      get(pessoasRef),
      get(configLimpezaRef),
      get(limpezaPeriodosRef),
      get(configCongregacaoRef),
      get(configReunioesRef),
      get(tarefasPlanejamentoRef),
    ])
    pessoas = pessoasSnap.exists() ? (pessoasSnap.val() as RawPessoas) : {}
    limpeza = limpezaSnap.exists() ? (limpezaSnap.val() as ConfigLimpeza) : {}
    periodos = periodosSnap.exists() ? (periodosSnap.val() as Record<string, LimpezaPeriodoGerado>) : {}
    const congregacao = congregacaoSnap.exists() ? (congregacaoSnap.val() as ConfigCongregacao) : undefined
    congregationName = congregacao?.nome?.trim() || 'Noroeste'
    reunioes = reunioesSnap.exists() ? (reunioesSnap.val() as ConfigReunioes) : {}
    const planejamento = planejamentoSnap.exists() ? (planejamentoSnap.val() as { periodMode?: CleaningPeriodMode }) : {}
    periodMode = planejamento.periodMode === 'month' ? 'month' : 'bimester'
    const ids = Object.keys(periodos).sort()
    selectedPeriodId = ids[ids.length - 1] ?? ''
  } catch {
    toast('Erro ao carregar dados de limpeza')
  }

  renderContent()
}

function renderContent(): void {
  if (activeTab === 'indice') {
    renderIndex()
    return
  }
  if (activeTab === 'escala') renderEscala()
  else if (activeTab === 'grupos') renderGrupos()
  else if (activeTab === 'config') renderConfig()
  else if (activeTab === 'texto') renderTexto()
  else renderPdf()
}

function renderIndex(): void {
  const content = document.getElementById('limpezaContent')
  if (!content) return
  content.innerHTML = `<div style="margin-bottom:14px"><h2 style="font-size:1.05rem;color:var(--blue-deep);margin-bottom:2px">Limpeza</h2></div><div id="limpezaMenu"></div>`
  const items: ItemMenu[] = [
    { id: 'escala', titulo: 'Gerar escala', subtitulo: 'Calcule e salve a rotação mensal ou bimestral', icone: '▦', corFundo: '#B83E18' },
    { id: 'grupos', titulo: 'Grupos', subtitulo: 'Distribua as pessoas pelos grupos de limpeza', icone: '♧', corFundo: '#006EB6' },
    { id: 'config', titulo: 'Configuração', subtitulo: 'Rotação, coordenador e instruções', icone: '⚙', corFundo: '#003F72' },
    { id: 'texto', titulo: 'Texto', subtitulo: 'Gere a mensagem para publicar em Tarefas', icone: '≡', corFundo: '#1A6B3C' },
    { id: 'pdf', titulo: 'PDF', subtitulo: 'Baixe a escala já gerada em arquivo separado', icone: '▤', corFundo: '#7E3AF2' },
  ]
  renderMenuCards(content.querySelector<HTMLElement>('#limpezaMenu')!, items, id => { activeTab = id as LimpezaTab; renderContent() })
}

function formatGeneratedDate(value: string): string {
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}/${year.slice(-2)}` : value
}

function generatedPeriod(): LimpezaPeriodoGerado | null {
  return selectedPeriodId ? periodos[selectedPeriodId] ?? null : null
}

function generatedPeriodOptions(): string {
  return Object.values(periodos)
    .sort((a, b) => b.inicio.localeCompare(a.inicio))
    .map(period => `<option value="${period.id}" ${period.id === selectedPeriodId ? 'selected' : ''}>${escapeHtml(monthLabel(period.inicio))}${period.modo === 'bimester' ? ` / ${escapeHtml(monthLabel(period.fim))}` : ''} ${period.inicio.slice(0, 4)}</option>`)
    .join('')
}

function renderPeriodRows(period: LimpezaPeriodoGerado): string {
  return period.semanas.map(week => `
    <div class="cleaning-period-row" style="padding:10px 12px;border-bottom:1px solid var(--border)">
      <strong style="color:var(--blue-deep)">Grupo ${week.grupo}</strong>
      <span style="font-size:.82rem;font-weight:600;overflow-wrap:anywhere">${escapeHtml(week.grupoNome)}</span>
      <span class="cleaning-period-dates" style="font-size:.78rem;color:var(--ink-3)">${formatGeneratedDate(week.dataMeioSemana)} e ${formatGeneratedDate(week.dataFimSemana)}</span>
    </div>`).join('')
}

function renderEscala(): void {
  const content = document.getElementById('limpezaContent')
  if (!content) return
  const currentId = periodBounds(`${periodAnchor.slice(0, 7)}-01`, periodMode).id
  const preview = periodos[currentId]
  content.innerHTML = `
    ${renderSectionTitle('Gerar escala', '')}
    <div class="module-form-grid">
      <div class="form-group"><label class="form-label">Período</label><select id="limpezaPeriodMode" class="form-select"><option value="month" ${periodMode === 'month' ? 'selected' : ''}>Mensal</option><option value="bimester" ${periodMode === 'bimester' ? 'selected' : ''}>Bimestral</option></select></div>
      <div class="form-group"><label class="form-label">Mês inicial</label><input id="limpezaPeriodAnchor" class="form-input" type="month" value="${periodAnchor.slice(0, 7)}"></div>
    </div>
    <button id="btnGerarEscalaLimpeza" class="btn btn-primary btn-full" type="button">Gerar escala</button>
    <div style="margin-top:14px;background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden">
      ${preview ? renderPeriodRows(preview) : '<p style="padding:18px;text-align:center;color:var(--ink-3);font-size:.82rem">Gere este período para revisar as datas e os grupos.</p>'}
    </div>`
  document.getElementById('limpezaPeriodMode')?.addEventListener('change', event => {
    periodMode = (event.target as HTMLSelectElement).value as CleaningPeriodMode
    renderEscala()
  })
  document.getElementById('limpezaPeriodAnchor')?.addEventListener('change', event => {
    periodAnchor = `${(event.target as HTMLInputElement).value}-01`
    renderEscala()
  })
  document.getElementById('btnGerarEscalaLimpeza')?.addEventListener('click', () => void saveGeneratedPeriod())
}

async function saveGeneratedPeriod(): Promise<void> {
  const button = document.getElementById('btnGerarEscalaLimpeza') as HTMLButtonElement | null
  try {
    if (!limpeza.ativa || !limpeza.inicioRotacao || !limpeza.grupos || !reunioes.meiaDeSemana || !reunioes.fimDeSemana) {
      throw new Error('Complete a configuração da rotação e dos dias de reunião antes de gerar.')
    }
    button?.setAttribute('disabled', '')
    if (button) button.textContent = 'Gerando...'
    const generated = generateCleaningPeriod(
      `${periodAnchor.slice(0, 7)}-01`, periodMode, limpeza as ConfigLimpeza,
      reunioes as ConfigReunioes, pessoas, congregationName, new Date().toISOString(),
    )
    await update(limpezaPeriodosRef, { [generated.id]: generated })
    periodos[generated.id] = generated
    selectedPeriodId = generated.id
    toast(`Escala gerada com ${generated.semanas.length} semanas`)
    renderEscala()
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Erro ao gerar a escala')
  } finally {
    button?.removeAttribute('disabled')
  }
}

function renderGrupos(): void {
  const content = document.getElementById('limpezaContent')
  if (!content) return
  limpezaChanges.clear()

  const ativos = activePeople()
  content.innerHTML = `
    ${renderSectionTitle('Grupos de limpeza', '')}
    <div id="limpezaCounters" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px"></div>
    <div style="font-size:.78rem;color:var(--ink-3);margin-bottom:8px">
      ${ativos.length} pessoa${ativos.length !== 1 ? 's' : ''} ativa${ativos.length !== 1 ? 's' : ''}
    </div>
    <div id="limpezaList">
      ${ativos.map(([mid, p]) => `
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;
          padding:9px 12px;margin-bottom:5px;display:flex;align-items:center;gap:10px">
          <span style="flex:1;font-size:.88rem;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${escapeHtml(p.name)}
          </span>
          <select class="form-select limpeza-sel" data-mid="${mid}"
            style="width:126px;font-size:.82rem;padding:5px 8px">
            <option value="">Sem grupo</option>
            ${Array.from({ length: groupCount() }, (_, i) => i + 1).map(g => `
              <option value="${g}" ${(p.limpeza?.grupo ?? null) === g ? 'selected' : ''}>
                Grupo ${g}
              </option>`).join('')}
          </select>
        </div>`).join('')}
    </div>
    <div style="position:sticky;bottom:8px;margin-top:14px">
      <button id="btnSalvarLimpezaGrupos" class="btn btn-primary btn-full">
        Salvar Grupos
      </button>
    </div>`

  updateLimpezaCounters(ativos)

  document.querySelectorAll<HTMLSelectElement>('.limpeza-sel').forEach(sel => {
    sel.addEventListener('change', () => {
      const mid = sel.dataset['mid']!
      const val = sel.value ? parseInt(sel.value, 10) : null
      limpezaChanges.set(mid, val)
      updateLimpezaCounters(ativos)
    })
  })

  document.getElementById('btnSalvarLimpezaGrupos')!
    .addEventListener('click', () => void saveGrupos(ativos))
}

function updateLimpezaCounters(ativos: [string, MasterPessoa][]): void {
  const counts: Record<string, number> = { sem: 0 }
  for (let i = 1; i <= groupCount(); i++) counts[String(i)] = 0

  for (const [mid, p] of ativos) {
    const grupo = limpezaChanges.has(mid)
      ? (limpezaChanges.get(mid) ?? null)
      : (p.limpeza?.grupo ?? null)
    const key = grupo != null ? String(grupo) : 'sem'
    counts[key] = (counts[key] ?? 0) + 1
  }

  const el = document.getElementById('limpezaCounters')
  if (!el) return
  el.innerHTML = Array.from({ length: groupCount() }, (_, i) => i + 1).map(g => `
    <span style="background:var(--surface);border:1px solid var(--border);
      border-radius:8px;padding:5px 12px;font-size:.8rem;font-weight:600">
      Grupo ${g}: <strong>${counts[String(g)] ?? 0}</strong>
    </span>`
  ).join('') + `
    <span style="background:var(--surface);border:1px solid var(--border);
      border-radius:8px;padding:5px 12px;font-size:.8rem;color:var(--ink-3)">
      Sem grupo: ${counts['sem'] ?? 0}
    </span>`
}

async function saveGrupos(ativos: [string, MasterPessoa][]): Promise<void> {
  if (limpezaChanges.size === 0) { toast('Nenhuma alteração'); return }

  setLoading('btnSalvarLimpezaGrupos', true, 'Salvar Grupos')
  const updates: Record<string, unknown> = {}
  for (const [mid, grupo] of limpezaChanges) {
    updates[`${mid}/limpeza/grupo`] = grupo
  }

  try {
    await update(pessoasRef, updates)
    for (const [mid, grupo] of limpezaChanges) {
      const p = pessoas[mid]
      if (p) p.limpeza = { grupo }
    }
    const n = limpezaChanges.size
    toast(`${n} alteraç${n === 1 ? 'ão salva' : 'ões salvas'} ✓`)
    limpezaChanges.clear()
    updateLimpezaCounters(ativos)
  } catch {
    toast('Erro ao salvar grupos')
  } finally {
    setLoading('btnSalvarLimpezaGrupos', false, 'Salvar Grupos')
  }
}

function renderConfig(): void {
  const content = document.getElementById('limpezaContent')
  if (!content) return

  const ativa = limpeza.ativa ?? false
  const grupos = groupCount()
  const inicioRotacao = limpeza.inicioRotacao ?? ''
  const coordenadorMid = limpeza.coordenadorMid ?? ''
  const textoPadrao = limpeza.textoPadrao ?? ''
  const textoPadraoAprovadoEm = limpeza.textoPadraoAprovadoEm ?? ''

  const grupoCards = Array.from({ length: grupos }, (_, i) => {
    const gid = String(i + 1)
    const item: Partial<ConfigLimpezaGrupo> = limpeza.gruposConfig?.[gid] ?? {}
    const nome = item.nome ?? ''
    const superintendenteMid = item.superintendenteMid ?? ''
    const ajudantesMid = toStringArray(item.ajudantesMid as string[] | Record<string, string> | undefined)
    const textoInstrucoes = item.textoInstrucoes ?? ''
    const aprovadoEm = item.aprovadoEm ?? ''

    return `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;
        padding:12px;margin-bottom:10px">
        <div style="font-size:.9rem;font-weight:700;color:var(--blue-deep);margin-bottom:10px">
          Grupo ${gid}
        </div>
        <div class="form-group">
          <label class="form-label">Nome do grupo</label>
          <input id="gNome_${gid}" class="form-input" maxlength="40" value="${escapeHtml(nome)}" placeholder="Ex.: Salão do Reino">
        </div>
        <div class="form-group">
          <label class="form-label">Superintendente</label>
          <select id="gSuper_${gid}" class="form-select">
            <option value="">Selecionar...</option>
            ${candidateOptions(superintendenteMid)}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Ajudantes</label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 10px;
            max-height:150px;overflow-y:auto;border:1px solid var(--border);
            border-radius:6px;padding:8px;background:var(--surface-2)">
            ${activePeople().map(([mid, p]) => `
              <label style="display:flex;align-items:center;gap:5px;cursor:pointer;padding:2px 0;font-size:.8rem">
                <input type="checkbox" class="gAjud_${gid}" value="${mid}" ${ajudantesMid.includes(mid) ? 'checked' : ''}>
                <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(p.name.split(' ')[0] ?? p.name)}</span>
              </label>`).join('')}
          </div>
        </div>
        <div class="form-group">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
            <label class="form-label" style="margin:0">Texto de instrução</label>
            <span style="font-size:.72rem;color:var(--ink-3)" id="gTextoCount_${gid}">${textoInstrucoes.length}/250</span>
          </div>
          <textarea id="gTexto_${gid}" class="form-input" rows="3" maxlength="250">${escapeHtml(textoInstrucoes)}</textarea>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;gap:8px">
            <span style="font-size:.74rem;color:var(--ink-3)">
              Aprovado: <strong>${aprovadoEm ? formatDate(aprovadoEm) : 'Não aprovado'}</strong>
            </span>
            <button class="btn btn-ghost gAprovar" data-gid="${gid}" style="font-size:.75rem;padding:3px 10px">
              Aprovar hoje
            </button>
          </div>
        </div>
      </div>`
  }).join('')

  content.innerHTML = `
    ${renderSectionTitle('Configuração da limpeza', '')}
    <div class="form-group">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
        <input type="checkbox" id="lAtiva" ${ativa ? 'checked' : ''}>
        <span class="form-label" style="margin:0">Rotação ativa</span>
      </label>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group">
        <label class="form-label">Número de grupos</label>
        <select id="lGrupos" class="form-select">
          ${[2,3,4,5,6].map(n => `<option value="${n}" ${grupos === n ? 'selected' : ''}>${n} grupos</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Início da rotação</label>
        <input id="lInicio" class="form-input" type="date" value="${inicioRotacao}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Coordenador</label>
      <select id="lCoordenador" class="form-select">
        <option value="">Selecionar...</option>
        ${candidateOptions(coordenadorMid)}
      </select>
    </div>
    <div class="form-group">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
        <label class="form-label" style="margin:0">Texto padrão</label>
        <span style="font-size:.72rem;color:var(--ink-3)" id="lTextoPadraoCount">${textoPadrao.length}/250</span>
      </div>
      <textarea id="lTextoPadrao" class="form-input" rows="3" maxlength="250">${escapeHtml(textoPadrao)}</textarea>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;gap:8px">
        <span style="font-size:.74rem;color:var(--ink-3)">
          Aprovado: <strong>${textoPadraoAprovadoEm ? formatDate(textoPadraoAprovadoEm) : 'Não aprovado'}</strong>
        </span>
        <button id="btnAprovarTextoPadrao" class="btn btn-ghost" style="font-size:.75rem;padding:3px 10px">
          Aprovar hoje
        </button>
      </div>
    </div>
    <div style="font-size:.8rem;font-weight:600;color:var(--ink-2);margin:16px 0 10px;
      text-transform:uppercase;letter-spacing:.05em">Por grupo</div>
    ${grupoCards}
    <div style="position:sticky;bottom:8px;margin-top:4px">
      <button id="btnSalvarLimpezaConfig" class="btn btn-primary btn-full">Salvar Configuração</button>
    </div>`

  charCounter('lTextoPadrao', 'lTextoPadraoCount')
  Array.from({ length: grupos }, (_, i) => charCounter(`gTexto_${i + 1}`, `gTextoCount_${i + 1}`))

  document.getElementById('btnAprovarTextoPadrao')!
    .addEventListener('click', () => void approveTextoPadrao())
  document.querySelectorAll<HTMLButtonElement>('.gAprovar').forEach(btn => {
    btn.addEventListener('click', () => void approveGrupoTexto(btn.dataset['gid']!))
  })
  document.getElementById('btnSalvarLimpezaConfig')!
    .addEventListener('click', () => void saveConfig())
}

async function approveTextoPadrao(): Promise<void> {
  const textoPadrao = (document.getElementById('lTextoPadrao') as HTMLTextAreaElement).value
  const hoje = todayStr()

  try {
    await update(configLimpezaRef, { textoPadrao, textoPadraoAprovadoEm: hoje })
    limpeza.textoPadrao = textoPadrao
    limpeza.textoPadraoAprovadoEm = hoje
    toast('Texto padrão aprovado ✓')
    renderConfig()
  } catch {
    toast('Erro ao aprovar texto')
  }
}

async function approveGrupoTexto(gid: string): Promise<void> {
  const textoInstrucoes = (document.getElementById(`gTexto_${gid}`) as HTMLTextAreaElement).value
  const hoje = todayStr()

  try {
    await update(configLimpezaRef, {
      [`gruposConfig/${gid}/textoInstrucoes`]: textoInstrucoes,
      [`gruposConfig/${gid}/aprovadoEm`]: hoje,
    })
    if (!limpeza.gruposConfig) limpeza.gruposConfig = {}
    limpeza.gruposConfig[gid] = {
      nome: limpeza.gruposConfig[gid]?.nome ?? '',
      superintendenteMid: limpeza.gruposConfig[gid]?.superintendenteMid ?? '',
      ajudantesMid: limpeza.gruposConfig[gid]?.ajudantesMid ?? [],
      textoInstrucoes,
      aprovadoEm: hoje,
    }
    toast(`Grupo ${gid} aprovado ✓`)
    renderConfig()
  } catch {
    toast('Erro ao aprovar texto do grupo')
  }
}

async function saveConfig(): Promise<void> {
  const checked = (id: string) => (document.getElementById(id) as HTMLInputElement).checked
  const value = (id: string) => (document.getElementById(id) as HTMLInputElement).value.trim()
  const grupos = Number((document.getElementById('lGrupos') as HTMLSelectElement).value)
  const gruposConfig: Record<string, ConfigLimpezaGrupo> = {}

  for (let i = 1; i <= grupos; i++) {
    const gid = String(i)
    const existente = limpeza.gruposConfig?.[gid]
    const textoInstrucoes = (document.getElementById(`gTexto_${gid}`) as HTMLTextAreaElement).value
    const ajudantesMid = Array.from(
      document.querySelectorAll<HTMLInputElement>(`.gAjud_${gid}:checked`)
    ).map(cb => cb.value)

    gruposConfig[gid] = {
      nome: value(`gNome_${gid}`),
      superintendenteMid: value(`gSuper_${gid}`),
      ajudantesMid,
      textoInstrucoes,
      aprovadoEm: keepApprovalIfTextUnchanged(
        existente?.textoInstrucoes,
        textoInstrucoes,
        existente?.aprovadoEm,
      ),
    }
  }

  const textoPadrao = (document.getElementById('lTextoPadrao') as HTMLTextAreaElement).value
  const nextConfig: ConfigLimpeza = {
    ativa: checked('lAtiva'),
    grupos,
    inicioRotacao: value('lInicio'),
    coordenadorMid: value('lCoordenador'),
    textoPadrao,
    textoPadraoAprovadoEm: keepApprovalIfTextUnchanged(
      limpeza.textoPadrao,
      textoPadrao,
      limpeza.textoPadraoAprovadoEm,
    ),
    gruposConfig,
  }

  setLoading('btnSalvarLimpezaConfig', true, 'Salvar Configuração')
  try {
    await set(configLimpezaRef, nextConfig)
    limpeza = nextConfig
    toast('Configuração salva ✓')
    renderConfig()
  } catch {
    toast('Erro ao salvar configuração')
  } finally {
    setLoading('btnSalvarLimpezaConfig', false, 'Salvar Configuração')
  }
}

function renderTexto(): void {
  const content = document.getElementById('limpezaContent')
  if (!content) return
  const period = generatedPeriod()
  content.innerHTML = `
    ${renderSectionTitle('Texto para Tarefas', '')}
    <div class="form-group">
      <label class="form-label">Escala gerada</label>
      <select id="limpezaTextoPeriodo" class="form-select" ${Object.keys(periodos).length ? '' : 'disabled'}>
        ${generatedPeriodOptions() || '<option>Nenhuma escala gerada</option>'}
      </select>
    </div>
    <div class="form-group"><label class="form-label">Mensagem</label><textarea id="textoPreview" class="form-input" rows="16">${escapeHtml(period ? cleaningTextForTasks(period, pessoas) : '')}</textarea></div>
    <button id="btnCopiarTextoLimpeza" class="btn btn-primary btn-full" ${period ? '' : 'disabled'}>Copiar texto</button>`
  document.getElementById('limpezaTextoPeriodo')?.addEventListener('change', event => {
    selectedPeriodId = (event.target as HTMLSelectElement).value
    renderTexto()
  })
  document.getElementById('btnCopiarTextoLimpeza')!
    .addEventListener('click', () => void copyGeneratedText())
}

async function copyGeneratedText(): Promise<void> {
  const text = (document.getElementById('textoPreview') as HTMLTextAreaElement | null)?.value ?? ''
  if (!text) return

  try {
    await navigator.clipboard.writeText(text)
    toast('Texto copiado ✓')
  } catch {
    toast('Não foi possível copiar automaticamente')
  }
}

function renderPdf(): void {
  const content = document.getElementById('limpezaContent')
  if (!content) return
  const period = generatedPeriod()
  const fontSize = Number(localStorage.getItem('noroeste_limpeza_pdf_font') ?? 15)
  content.innerHTML = `
    ${renderSectionTitle('PDF separado', '')}
    <div class="form-panel">
      <label class="form-field"><span>Escala gerada</span><select id="pdfLimpezaPeriodo" class="form-select" ${Object.keys(periodos).length ? '' : 'disabled'}>${generatedPeriodOptions() || '<option>Nenhuma escala gerada</option>'}</select></label>
      <label class="form-field"><span>Fonte base: <strong id="pdfLimpezaFonteValor">${fontSize} pt</strong></span><input id="pdfLimpezaFonte" type="range" min="8" max="22" value="${fontSize}"></label>
      <div id="pdfLimpezaPreview" style="background:#fff;border:1px solid var(--border);padding:14px;margin:12px 0;min-height:180px">
        ${period ? `<div style="text-align:center;font-weight:800;font-size:1.1rem;margin-bottom:10px">LIMPEZA DO SALÃO</div>${renderPeriodRows(period)}` : '<p style="text-align:center;color:var(--ink-3)">Nenhuma escala gerada.</p>'}
      </div>
      <button id="btnGerarPdfLimpeza" class="btn btn-primary btn-full" type="button" ${period ? '' : 'disabled'}>Baixar PDF</button>
    </div>`
  document.getElementById('pdfLimpezaPeriodo')?.addEventListener('change', event => {
    selectedPeriodId = (event.target as HTMLSelectElement).value
    renderPdf()
  })
  document.getElementById('pdfLimpezaFonte')?.addEventListener('input', event => {
    const value = (event.target as HTMLInputElement).value
    localStorage.setItem('noroeste_limpeza_pdf_font', value)
    const label = document.getElementById('pdfLimpezaFonteValor')
    if (label) label.textContent = `${value} pt`
  })
  document.getElementById('btnGerarPdfLimpeza')?.addEventListener('click', () => void exportCleaningPdf())
}

async function exportCleaningPdf(): Promise<void> {
  const period = generatedPeriod()
  if (!period) { toast('Gere a escala antes de baixar o PDF'); return }
  const button = document.getElementById('btnGerarPdfLimpeza') as HTMLButtonElement | null
  const fontSize = Number((document.getElementById('pdfLimpezaFonte') as HTMLInputElement).value)
  try {
    if (button) { button.disabled = true; button.textContent = 'Preparando PDF...' }
    const { downloadCleaningPdf } = await import('./limpeza-documents')
    const result = await downloadCleaningPdf(period, { requestedFontSize: fontSize })
    toast(result.effectiveFontSize < fontSize ? `PDF ajustado para ${result.effectiveFontSize} pt sem quebrar texto` : 'PDF baixado')
  } catch {
    toast('Erro ao gerar o PDF')
  } finally {
    if (button) { button.disabled = false; button.textContent = 'Baixar PDF' }
  }
}
