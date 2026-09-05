import type {
  AppContext,
  ConfigLimpeza,
  ConfigLimpezaGrupo,
  MasterPessoa,
  RawPessoas,
} from '../types'
import {
  get,
  set,
  update,
  pessoasRef,
  configLimpezaRef,
} from '../firebase'
import { renderMenuCards, type ItemMenu } from '../ui/menu-cards'
import { moduleBackButton } from '../ui/module-header'

type LimpezaTab = 'indice' | 'grupos' | 'config' | 'texto' | 'pdf'

let pessoas: RawPessoas = {}
let limpeza: Partial<ConfigLimpeza> = {}
let activeTab: LimpezaTab = 'grupos'
let limpezaChanges = new Map<string, number | null>()

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000

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

function personName(mid: string): string {
  return pessoas[mid]?.name ?? mid
}

function candidateOptions(selectedMid = ''): string {
  const candidates = activePeople()
  return candidates
    .map(([mid, p]) =>
      `<option value="${mid}" ${selectedMid === mid ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
    )
    .join('')
}

function calculateGroup(date: string): number | null {
  const start = limpeza.inicioRotacao
  const total = groupCount()
  if (!start || !date || total <= 0) return null

  const startDate = new Date(`${start}T00:00:00`)
  const targetDate = new Date(`${date}T00:00:00`)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(targetDate.getTime())) return null

  const weeks = Math.floor((targetDate.getTime() - startDate.getTime()) / MS_PER_WEEK)
  const index = ((weeks % total) + total) % total
  return index + 1
}

function peopleInGroup(group: number): [string, MasterPessoa][] {
  return activePeople().filter(([, p]) => p.limpeza?.grupo === group)
}

function renderSectionTitle(title: string, desc: string): string {
  return `
    <div style="margin-bottom:14px">
      ${moduleBackButton()}
      <h2 style="font-size:1.05rem;color:var(--blue-deep);margin-bottom:2px">${title}</h2>
      <p style="font-size:.8rem;color:var(--ink-3)">${desc}</p>
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
    const [pessoasSnap, limpezaSnap] = await Promise.all([
      get(pessoasRef),
      get(configLimpezaRef),
    ])
    pessoas = pessoasSnap.exists() ? (pessoasSnap.val() as RawPessoas) : {}
    limpeza = limpezaSnap.exists() ? (limpezaSnap.val() as ConfigLimpeza) : {}
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
  if (activeTab === 'grupos') renderGrupos()
  else if (activeTab === 'config') renderConfig()
  else if (activeTab === 'texto') renderTexto()
  else renderPdf()
}

function renderIndex(): void {
  const content = document.getElementById('limpezaContent')
  if (!content) return
  content.innerHTML = `<div style="margin-bottom:14px"><h2 style="font-size:1.05rem;color:var(--blue-deep);margin-bottom:2px">Limpeza</h2></div><div id="limpezaMenu"></div>`
  const items: ItemMenu[] = [
    { id: 'grupos', titulo: 'Grupos', subtitulo: 'Distribua as pessoas pelos grupos de limpeza', icone: '♧', corFundo: '#006EB6' },
    { id: 'config', titulo: 'Configuração', subtitulo: 'Rotação, coordenador e instruções', icone: '⚙', corFundo: '#003F72' },
    { id: 'texto', titulo: 'Texto', subtitulo: 'Gere a mensagem para publicar em Tarefas', icone: '≡', corFundo: '#1A6B3C' },
    { id: 'pdf', titulo: 'PDF', subtitulo: 'Consulte a opção de arquivo separado', icone: '▤', corFundo: '#7E3AF2' },
  ]
  renderMenuCards(content.querySelector<HTMLElement>('#limpezaMenu')!, items, id => { activeTab = id as LimpezaTab; renderContent() })
}

function renderGrupos(): void {
  const content = document.getElementById('limpezaContent')
  if (!content) return
  limpezaChanges.clear()

  const ativos = activePeople()
  content.innerHTML = `
    ${renderSectionTitle(
      'Grupos de limpeza',
      'Defina o grupo de cada pessoa antes de gerar o texto da próxima designação.',
    )}
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
    ${renderSectionTitle(
      'Configuração da limpeza',
      'Controla rotação, textos aprovados, superintendentes e ajudantes.',
    )}
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

  const date = todayStr()
  content.innerHTML = `
    ${renderSectionTitle(
      'Gerar texto',
      'Use esta opção quando a limpeza for enviada junto com Tarefas ou por mensagem.',
    )}
    <div class="form-group">
      <label class="form-label">Data da reunião</label>
      <input id="txtData" class="form-input" type="date" value="${date}">
    </div>
    <div class="form-group">
      <label class="form-label">Saída</label>
      <select id="txtModo" class="form-select">
        <option value="tarefas">Texto dentro de Tarefas</option>
        <option value="pdf">Resumo para PDF separado</option>
      </select>
    </div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:10px">
      <div id="textoPreview" style="white-space:pre-wrap;font-size:.88rem;color:var(--ink);line-height:1.5"></div>
    </div>
    <button id="btnCopiarTextoLimpeza" class="btn btn-primary btn-full">Copiar texto</button>`

  const updatePreview = () => {
    const currentDate = (document.getElementById('txtData') as HTMLInputElement).value
    const mode = (document.getElementById('txtModo') as HTMLSelectElement).value as 'tarefas' | 'pdf'
    document.getElementById('textoPreview')!.textContent = buildCleaningText(currentDate, mode)
  }

  document.getElementById('txtData')!.addEventListener('change', updatePreview)
  document.getElementById('txtModo')!.addEventListener('change', updatePreview)
  document.getElementById('btnCopiarTextoLimpeza')!
    .addEventListener('click', () => void copyGeneratedText())
  updatePreview()
}

function buildCleaningText(date: string, mode: 'tarefas' | 'pdf'): string {
  const grupo = calculateGroup(date)
  if (!limpeza.ativa) return 'A rotação de limpeza está desativada.'
  if (!grupo) return 'Defina o início da rotação em Config para gerar o texto.'

  const groupConfig = limpeza.gruposConfig?.[String(grupo)]
  const members = peopleInGroup(grupo).map(([, p]) => p.name)
  const superName = groupConfig?.superintendenteMid ? personName(groupConfig.superintendenteMid) : ''
  const helperNames = toStringArray(groupConfig?.ajudantesMid).map(personName)
  const defaultText = limpeza.textoPadraoAprovadoEm ? (limpeza.textoPadrao ?? '') : ''
  const groupText = groupConfig?.aprovadoEm ? (groupConfig.textoInstrucoes ?? '') : ''

  const lines = mode === 'tarefas'
    ? [`Limpeza - ${formatDate(date)}`, `Grupo ${grupo}`]
    : [`Resumo da limpeza`, `Data: ${formatDate(date)}`, `Grupo: ${grupo}`]

  if (superName) lines.push(`Superintendente: ${superName}`)
  if (helperNames.length > 0) lines.push(`Ajudantes: ${helperNames.join(', ')}`)
  if (members.length > 0) lines.push(`Grupo: ${members.join(', ')}`)
  if (defaultText) lines.push('', defaultText)
  if (groupText) lines.push('', groupText)
  if (!defaultText && !groupText) lines.push('', 'Nenhum texto aprovado para publicar.')

  return lines.join('\n')
}

async function copyGeneratedText(): Promise<void> {
  const text = document.getElementById('textoPreview')?.textContent ?? ''
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

  content.innerHTML = `
    ${renderSectionTitle(
      'PDF separado',
      'Use esta opção quando a limpeza não for publicada dentro de Tarefas.',
    )}
    <div class="form-panel">
      <label class="form-field"><span>Data da reunião</span><input id="pdfLimpezaData" type="date" value="${todayStr()}"></label>
      <label class="form-field"><span>Tamanho da fonte: <strong id="pdfLimpezaFonteValor">16px</strong></span><input id="pdfLimpezaFonte" type="range" min="10" max="28" value="16"></label>
      <div id="pdfLimpezaPreview" style="white-space:pre-wrap;background:#fff;border:1px solid var(--border);padding:14px;margin:12px 0;line-height:1.45"></div>
      <button id="btnGerarPdfLimpeza" class="btn btn-primary btn-full" type="button">Gerar PDF separado</button>
      <div class="form-help">Será aberta a impressão do navegador. Escolha “Salvar como PDF” para criar o arquivo.</div>
    </div>`
  const refresh = () => {
    const date = (document.getElementById('pdfLimpezaData') as HTMLInputElement).value
    const size = (document.getElementById('pdfLimpezaFonte') as HTMLInputElement).value
    const preview = document.getElementById('pdfLimpezaPreview')
    const label = document.getElementById('pdfLimpezaFonteValor')
    if (preview) { preview.textContent = buildCleaningText(date, 'pdf'); preview.style.fontSize = `${size}px` }
    if (label) label.textContent = `${size}px`
  }
  document.getElementById('pdfLimpezaData')?.addEventListener('change', refresh)
  document.getElementById('pdfLimpezaFonte')?.addEventListener('input', refresh)
  document.getElementById('btnGerarPdfLimpeza')?.addEventListener('click', () => {
    const date = (document.getElementById('pdfLimpezaData') as HTMLInputElement).value
    const size = Number((document.getElementById('pdfLimpezaFonte') as HTMLInputElement).value)
    openCleaningPrint(date, size)
  })
  refresh()
}

function openCleaningPrint(date: string, fontSize: number): void {
  const popup = window.open('', '_blank')
  if (!popup) { toast('Permita pop-ups para gerar o PDF'); return }
  const text = escapeHtml(buildCleaningText(date, 'pdf')).replace(/\n/g, '<br>')
  popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Limpeza - ${formatDate(date)}</title><style>@page{margin:18mm}body{font-family:Arial,sans-serif;color:#222;font-size:${fontSize}px;line-height:1.45}h1{font-size:${Math.max(18, fontSize + 4)}px;color:#003f72;border-bottom:2px solid #7e3af2;padding-bottom:8px}button{margin-top:20px;padding:8px 14px}@media print{button{display:none}}</style></head><body><h1>Limpeza</h1><div>${text}</div><button onclick="window.print()">Imprimir / Salvar PDF</button></body></html>`)
  popup.document.close()
  popup.focus()
  toast('Pré-visualização do PDF aberta')
}
