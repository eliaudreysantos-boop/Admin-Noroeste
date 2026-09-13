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
  secretarioGruposRef,
  secretarioPublicadoresRef,
} from '../firebase'
import { renderMenuCards, type ItemMenu } from '../ui/menu-cards'
import { moduleBackButton } from '../ui/module-header'
import {
  generateCleaningPeriod,
  monthLabel,
  periodBounds,
  type CleaningPeriodMode,
} from './limpeza-domain'
import { PublicationPreviewGate } from './pdf-publication-preview'
import { apiJson } from '../secure-api.ts'

type LimpezaTab = 'indice' | 'escala' | 'grupos' | 'config' | 'pdf'

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
interface GrupoServico { id?: string; nome?: string; ativo?: boolean }
interface PublicadorServico { masterId?: string; grupoId?: string; ativo?: boolean }
let gruposServico: Record<string, GrupoServico> = {}
let publicadoresServico: Record<string, PublicadorServico> = {}
const cleaningPdfPreview = new PublicationPreviewGate()

function cleaningPdfPreviewInput(period: LimpezaPeriodoGerado, fontSize: number): unknown {
  return { period, fontSize }
}

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

function activePeople(): [string, MasterPessoa][] {
  return Object.entries(pessoas)
    .filter(([, p]) => p.active)
    .sort((a, b) => a[1].name.localeCompare(b[1].name, 'pt-BR'))
}

function groupCount(): number {
  if (usingServiceGroups()) return serviceGroupEntries().length
  return Math.max(1, Math.min(12, Number(limpeza.grupos ?? 4)))
}

function usingServiceGroups(): boolean {
  return limpeza.aproveitarGruposServicoCampo === true
}

function serviceGroupEntries(): [string, GrupoServico][] {
  return Object.entries(gruposServico)
    .filter(([, group]) => group.ativo !== false)
    .sort((a, b) => String(a[1].nome ?? a[0]).localeCompare(String(b[1].nome ?? b[0]), 'pt-BR') || a[0].localeCompare(b[0]))
}

function groupSourceId(position: number): string {
  return usingServiceGroups() ? (serviceGroupEntries()[position - 1]?.[0] ?? String(position)) : String(position)
}

function groupOwnConfig(position: number): Partial<ConfigLimpezaGrupo> {
  const key = groupSourceId(position)
  return usingServiceGroups() ? limpeza.gruposServicoConfig?.[key] ?? {} : limpeza.gruposConfig?.[key] ?? {}
}

function effectiveGenerationData(): { config: ConfigLimpeza; people: RawPessoas } {
  if (!usingServiceGroups()) return { config: limpeza as ConfigLimpeza, people: pessoas }
  const groups = serviceGroupEntries()
  const groupPosition = new Map(groups.map(([id], index) => [id, index + 1]))
  const people = Object.fromEntries(Object.entries(pessoas).map(([mid, person]) => [mid, { ...person, limpeza: { grupo: 0 } }])) as RawPessoas
  Object.values(publicadoresServico).forEach(publisher => {
    const position = publisher.ativo === false ? undefined : groupPosition.get(publisher.grupoId ?? '')
    if (position && publisher.masterId && people[publisher.masterId]?.active) people[publisher.masterId] = { ...people[publisher.masterId], limpeza: { grupo: position } }
  })
  const gruposConfig = Object.fromEntries(groups.map(([id, group], index) => {
    const own = limpeza.gruposServicoConfig?.[id] ?? {}
    return [String(index + 1), { ...own, nome: group.nome?.trim() || `Grupo ${index + 1}` }]
  })) as Record<string, ConfigLimpezaGrupo>
  return { config: { ...(limpeza as ConfigLimpeza), grupos: groups.length, gruposConfig }, people }
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
    const [pessoasSnap, limpezaSnap, periodosSnap, congregacaoSnap, reunioesSnap, planejamentoSnap, gruposSnap, publicadoresSnap] = await Promise.all([
      get(pessoasRef),
      get(configLimpezaRef),
      get(limpezaPeriodosRef),
      get(configCongregacaoRef),
      get(configReunioesRef),
      get(tarefasPlanejamentoRef),
      get(secretarioGruposRef),
      get(secretarioPublicadoresRef),
    ])
    pessoas = pessoasSnap.exists() ? (pessoasSnap.val() as RawPessoas) : {}
    limpeza = limpezaSnap.exists() ? (limpezaSnap.val() as ConfigLimpeza) : {}
    periodos = periodosSnap.exists() ? (periodosSnap.val() as Record<string, LimpezaPeriodoGerado>) : {}
    const congregacao = congregacaoSnap.exists() ? (congregacaoSnap.val() as ConfigCongregacao) : undefined
    congregationName = congregacao?.nome?.trim() || 'Noroeste'
    reunioes = reunioesSnap.exists() ? (reunioesSnap.val() as ConfigReunioes) : {}
    const planejamento = planejamentoSnap.exists() ? (planejamentoSnap.val() as { periodMode?: CleaningPeriodMode }) : {}
    periodMode = planejamento.periodMode === 'month' ? 'month' : 'bimester'
    const secretario = {
      grupos:gruposSnap.exists() ? gruposSnap.val() as Record<string, GrupoServico> : {},
      publicadores:publicadoresSnap.exists() ? publicadoresSnap.val() as Record<string, PublicadorServico> : {},
    }
    gruposServico = secretario.grupos ?? {}
    publicadoresServico = secretario.publicadores ?? {}
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
  else renderPdf()
}

function renderIndex(): void {
  const content = document.getElementById('limpezaContent')
  if (!content) return
  content.innerHTML = `<div style="margin-bottom:14px"><h2 style="font-size:1.05rem;color:var(--blue-deep);margin-bottom:2px">Limpeza</h2></div><div id="limpezaMenu"></div>`
  const items: ItemMenu[] = [
    { id: 'escala', titulo: 'Gerar escala', subtitulo: 'Calcule e salve a rotação mensal ou bimestral', icone: '▦', corFundo: '#B83E18' },
    { id: 'grupos', titulo: 'Grupos', subtitulo: 'Distribua as pessoas pelos grupos de limpeza', icone: '♧', corFundo: '#006EB6' },
    { id: 'pdf', titulo: 'PDF', subtitulo: 'Baixe a escala já gerada em arquivo separado', icone: '▤', corFundo: '#7E3AF2' },
    { id: 'config', titulo: 'Configuração', subtitulo: 'Rotação, grupos e responsáveis', icone: '⚙', corFundo: '#003F72' },
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
    const effective = effectiveGenerationData()
    if (!limpeza.ativa || !limpeza.inicioRotacao || !effective.config.grupos || !reunioes.meiaDeSemana || !reunioes.fimDeSemana) {
      throw new Error('Complete a configuração da rotação e dos dias de reunião antes de gerar.')
    }
    button?.setAttribute('disabled', '')
    if (button) button.textContent = 'Gerando...'
    const generated = generateCleaningPeriod(
      `${periodAnchor.slice(0, 7)}-01`, periodMode, effective.config,
      reunioes as ConfigReunioes, effective.people, congregationName, new Date().toISOString(),
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

  if (usingServiceGroups()) {
    const groups = serviceGroupEntries()
    content.innerHTML = `
      ${renderSectionTitle('Grupos de limpeza', '')}
      <div class="notice">Os grupos e seus membros são administrados no Secretário. Aqui eles são somente leitura.</div>
      <div class="module-option-list">${groups.map(([id, group], index) => {
        const members = Object.values(publicadoresServico)
          .filter(publisher => publisher.ativo !== false && publisher.grupoId === id && publisher.masterId && pessoas[publisher.masterId]?.active)
          .map(publisher => pessoas[publisher.masterId!].name)
          .sort((a, b) => a.localeCompare(b, 'pt-BR'))
        return `<div class="module-menu-btn" style="cursor:default"><div class="mod-icon">${index + 1}</div><div><div class="mod-label">${escapeHtml(group.nome ?? `Grupo ${index + 1}`)}</div><div class="mod-desc">${members.length ? escapeHtml(members.join(', ')) : 'Nenhum membro ativo'}</div></div></div>`
      }).join('') || '<p class="empty-state">Nenhum grupo ativo cadastrado no Secretário.</p>'}</div>`
    return
  }

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
  if (usingServiceGroups()) { toast('Os grupos são administrados no Secretário'); return }
  if (limpezaChanges.size === 0) { toast('Nenhuma alteração'); return }

  setLoading('btnSalvarLimpezaGrupos', true, 'Salvar Grupos')
  const groups = Object.fromEntries(limpezaChanges)

  try {
    await apiJson('cleaning-groups', { method:'PATCH', body:JSON.stringify({ groups }) })
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

  const grupoCards = Array.from({ length: grupos }, (_, i) => {
    const gid = String(i + 1)
    const sourceId = groupSourceId(i + 1)
    const item = groupOwnConfig(i + 1)
    const serviceName = usingServiceGroups() ? gruposServico[sourceId]?.nome ?? `Grupo ${gid}` : ''
    const nome = usingServiceGroups() ? serviceName : item.nome ?? ''
    const superintendenteMid = item.superintendenteMid ?? ''
    const ajudantesMid = toStringArray(item.ajudantesMid as string[] | Record<string, string> | undefined)

    return `
      <div data-cleaning-group="${escapeHtml(sourceId)}" style="background:var(--surface);border:1px solid var(--border);border-radius:8px;
        padding:12px;margin-bottom:10px">
        <div style="font-size:.9rem;font-weight:700;color:var(--blue-deep);margin-bottom:10px">
          ${escapeHtml(nome || `Grupo ${gid}`)}
        </div>
        <div class="form-group" ${usingServiceGroups() ? 'hidden' : ''}>
          <label class="form-label">Nome do grupo</label>
          <input id="gNome_${escapeHtml(sourceId)}" class="form-input" maxlength="40" value="${escapeHtml(nome)}" placeholder="Ex.: Salão do Reino">
        </div>
        <div class="form-group">
          <label class="form-label">Superintendente</label>
          <select id="gSuper_${escapeHtml(sourceId)}" class="form-select">
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
                <input type="checkbox" data-group-helper="${escapeHtml(sourceId)}" value="${mid}" ${ajudantesMid.includes(mid) ? 'checked' : ''}>
                <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(p.name.split(' ')[0] ?? p.name)}</span>
              </label>`).join('')}
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
    <div class="form-group">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
        <input type="checkbox" id="lUsarGruposServico" ${usingServiceGroups() ? 'checked' : ''}>
        <span class="form-label" style="margin:0">Aproveitar grupos de serviço de campo</span>
      </label>
      <p class="form-help">Marcado, nomes e membros vêm do Secretário e não podem ser alterados na Limpeza.</p>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group" ${usingServiceGroups() ? 'hidden' : ''}>
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
    <div style="font-size:.8rem;font-weight:600;color:var(--ink-2);margin:16px 0 10px;
      text-transform:uppercase;letter-spacing:.05em">Por grupo</div>
    ${grupoCards}
    <div style="position:sticky;bottom:8px;margin-top:4px">
      <button id="btnSalvarLimpezaConfig" class="btn btn-primary btn-full">Salvar Configuração</button>
    </div>`

  document.getElementById('lUsarGruposServico')!.addEventListener('change', event => {
    limpeza.aproveitarGruposServicoCampo = (event.target as HTMLInputElement).checked
    renderConfig()
  })
  document.getElementById('btnSalvarLimpezaConfig')!
    .addEventListener('click', () => void saveConfig())
}

async function saveConfig(): Promise<void> {
  const checked = (id: string) => (document.getElementById(id) as HTMLInputElement).checked
  const value = (id: string) => (document.getElementById(id) as HTMLInputElement).value.trim()
  const reuseServiceGroups = checked('lUsarGruposServico')
  const grupos = reuseServiceGroups ? serviceGroupEntries().length : Number((document.getElementById('lGrupos') as HTMLSelectElement).value)
  const editedConfigs: Record<string, ConfigLimpezaGrupo> = {}

  for (let i = 1; i <= grupos; i++) {
    const gid = groupSourceId(i)
    const ajudantesMid = Array.from(
      document.querySelectorAll<HTMLInputElement>('[data-group-helper]:checked')
    ).filter(cb => cb.dataset['groupHelper'] === gid).map(cb => cb.value)

    editedConfigs[gid] = {
      nome: reuseServiceGroups ? '' : value(`gNome_${gid}`),
      superintendenteMid: value(`gSuper_${gid}`),
      ajudantesMid,
    }
  }

  const nextConfig: ConfigLimpeza = {
    ativa: checked('lAtiva'),
    aproveitarGruposServicoCampo: reuseServiceGroups,
    grupos: reuseServiceGroups ? Number(limpeza.grupos ?? 4) : grupos,
    inicioRotacao: value('lInicio'),
    gruposConfig: reuseServiceGroups ? limpeza.gruposConfig ?? {} : editedConfigs,
    gruposServicoConfig: reuseServiceGroups ? editedConfigs : limpeza.gruposServicoConfig ?? {},
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
      <button id="btnGerarPdfLimpeza" class="btn btn-primary btn-full" type="button" ${period ? '' : 'disabled'}>Abrir previa do PDF</button>
      ${period ? `<button id="btnPublicarPdfLimpeza" class="btn btn-ghost btn-full" style="margin-top:8px" type="button">${period.publicado ? 'Reabrir período' : 'Publicar período'}</button>` : ''}
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
  document.getElementById('btnPublicarPdfLimpeza')?.addEventListener('click', () => void toggleCleaningPublication())
}

async function toggleCleaningPublication(): Promise<void> {
  const period = generatedPeriod()
  if (!period) return
  try {
    const { createCleaningPdf } = await import('./limpeza-documents')
    const { publishAgendaModulePdf, unpublishAgendaModulePdf } = await import('./agenda-documents')
    if (period.publicado) {
      await unpublishAgendaModulePdf('limpeza', period.id)
      await update(limpezaPeriodosRef, { [`${period.id}/publicado`]:false, [`${period.id}/publicadoEm`]:null })
      period.publicado = false; delete period.publicadoEm
      toast('Período reaberto e retirado do Quadro')
    } else {
      const fontSize = Number(localStorage.getItem('noroeste_limpeza_pdf_font') ?? 15)
      if (!cleaningPdfPreview.matches(cleaningPdfPreviewInput(period, fontSize))) { toast('Abra a prévia atual do PDF antes de publicar'); return }
      const result = await createCleaningPdf(period, { requestedFontSize:fontSize })
      const label = period.modo === 'bimester' ? `${period.inicio.slice(0, 7)} a ${period.fim.slice(0, 7)}` : period.inicio.slice(0, 7)
      await publishAgendaModulePdf(result.bytes, { modulo:'limpeza', periodo:label, inicio:period.inicio, fim:period.fim, origemPeriodoId:period.id, nome:`limpeza-${period.id}.pdf` })
      const publishedAt = new Date().toISOString()
      await update(limpezaPeriodosRef, { [`${period.id}/publicado`]:true, [`${period.id}/publicadoEm`]:publishedAt })
      period.publicado = true; period.publicadoEm = publishedAt
      toast('Período publicado no Quadro')
    }
    renderPdf()
  } catch { toast('Não foi possível alterar a publicação') }
}

async function exportCleaningPdf(): Promise<void> {
  const period = generatedPeriod()
  if (!period) { toast('Gere a escala antes de abrir a previa'); return }
  const button = document.getElementById('btnGerarPdfLimpeza') as HTMLButtonElement | null
  const fontSize = Number((document.getElementById('pdfLimpezaFonte') as HTMLInputElement).value)
  try {
    if (button) { button.disabled = true; button.textContent = 'Preparando PDF...' }
    const { downloadCleaningPdf } = await import('./limpeza-documents')
    const result = await downloadCleaningPdf(period, { requestedFontSize: fontSize })
    cleaningPdfPreview.mark(cleaningPdfPreviewInput(period, fontSize))
    toast(result.effectiveFontSize < fontSize ? `Previa ajustada para ${result.effectiveFontSize} pt sem quebrar texto` : 'Previa do PDF aberta')
  } catch {
    toast('Erro ao gerar o PDF')
  } finally {
    if (button) { button.disabled = false; button.textContent = 'Abrir previa do PDF' }
  }
}
