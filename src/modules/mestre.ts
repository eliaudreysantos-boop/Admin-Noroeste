import type {
  AppContext,
  MasterConfig,
  MasterPessoa,
  RawPessoas,
  RawUsuarios,
  Role,
  Sex,
  SecretarioPapel,
  TipoDesignacao,
  Usuario,
  ConfigLimpeza,
  ConfigLimpezaGrupo,
} from '../types'
import {
  get, set, update, remove,
  pessoaRef, pessoasRef,
  usuarioRef, usuariosRef,
  configRef,
  configCongregacaoRef,
  configReunioesRef,
  configLimpezaRef,
  configDesignacoesRef,
} from '../firebase'

// ─── Estado do módulo ────────────────────────────────────────────────────────

let pessoas:   RawPessoas  = {}
let usuarios:  RawUsuarios = {}
let config:    MasterConfig = {}

let activeTab: 'pessoas' | 'limpeza' | 'usuarios' | 'config' = 'pessoas'
let activeConfigSection: 'congregacao' | 'limpeza' | 'designacoes' = 'congregacao'

const limpezaChanges = new Map<string, 1 | 2 | 3 | 4 | null>()
let pessoaFilter = { nome: '', role: '', ativo: 'true', sex: '' }

// ─── Constantes ──────────────────────────────────────────────────────────────

const DIAS_SEMANA = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']

const DESIGNACOES_TIPOS: TipoDesignacao[] = [
  'presidente','leitor','microfone','operador','auditorio','entrada',
  'limpeza-super','limpeza-ajudante','limpeza-grupo',
  'escala-campo','discurso-local','discurso-saida','programacao-parte',
]

const DESIGNACAO_LABELS: Record<TipoDesignacao, string> = {
  'presidente':        'Presidente',
  'leitor':            'Leitor',
  'microfone':         'Microfone',
  'operador':          'Operador AV',
  'auditorio':         'Auditório',
  'entrada':           'Entrada',
  'limpeza-super':     'Limpeza — Superintendente',
  'limpeza-ajudante':  'Limpeza — Ajudante',
  'limpeza-grupo':     'Limpeza — Grupo',
  'escala-campo':      'Escala de campo',
  'discurso-local':    'Discurso local',
  'discurso-saida':    'Discurso saída',
  'programacao-parte': 'Programação — parte',
}

// ─── Utilitários gerais ───────────────────────────────────────────────────────

function toast(msg: string, ms = 2600): void {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = msg
  el.classList.add('show')
  setTimeout(() => el.classList.remove('show'), ms)
}

function genId(prefix: string): string {
  // Usado apenas para UIDs de usuários (aleatório é correto para users)
  const arr = new Uint8Array(4)
  crypto.getRandomValues(arr)
  return prefix + Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function midFromWhatsapp(whatsapp: string): Promise<string> {
  // C6: mid = 'm_' + primeiros 8 hex do SHA-256 do whatsapp normalizado (13 dígitos)
  const wpp = normalizeWhatsapp(whatsapp)
  const enc = new TextEncoder().encode(wpp)
  const buf = await crypto.subtle.digest('SHA-256', enc)
  const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
  return `m_${hex.slice(0, 8)}`
}

function normalizeWhatsapp(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.startsWith('55') ? digits : `55${digits}`
}

function roleLabel(role: Role | null): string {
  const map: Record<string, string> = {
    'anciao': 'Ancião', 'servo-ministerial': 'Servo min.',
    'pioneiro': 'Pioneiro', 'batizado': 'Batizado', 'publicador': 'Publicador',
  }
  return role ? (map[role] ?? role) : '—'
}

function sexLabel(sex: Sex | null): string {
  return sex === 'M' ? 'M' : sex === 'F' ? 'F' : '—'
}

function papelLabel(papel: SecretarioPapel | undefined): string {
  const map: Record<string, string> = {
    secretario:'Secretário', publicador:'Publicador',
    assistencia:'Assistência', coordenador:'Coordenador',
  }
  return papel ? (map[papel] ?? papel) : '—'
}

function appsList(apps: Usuario['apps']): string {
  const labels: Record<string, string> = {
    mestre:'Admin', tarefas:'Tarefas', escala:'Escala',
    programacao:'Programação', secretario:'Secretário',
  }
  return (Object.keys(apps) as Array<keyof typeof apps>)
    .filter(k => apps[k]).map(k => labels[k]).join(', ') || '—'
}

function appCheck(id: string, label: string, checked: boolean): string {
  return `<label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:4px 0">
    <input type="checkbox" id="uApp_${id}" ${checked ? 'checked' : ''}>
    <span style="font-size:.88rem">${label}</span>
  </label>`
}

function setLoading(btnId: string, loading: boolean, label = 'Salvar'): void {
  const btn = document.getElementById(btnId) as HTMLButtonElement | null
  if (!btn) return
  btn.disabled = loading
  btn.textContent = loading ? 'Salvando…' : label
}

// ─── Utilitários de config ────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(d: string): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function toStringArray(val: string[] | Record<string, string> | undefined | null): string[] {
  if (!val) return []
  if (Array.isArray(val)) return val
  return Object.values(val)
}

function charCounter(textareaId: string, counterId: string, max = 250): void {
  const ta = document.getElementById(textareaId) as HTMLTextAreaElement | null
  const ct = document.getElementById(counterId)
  if (!ta || !ct) return
  const update = () => { ct.textContent = `${ta.value.length}/${max}` }
  ta.addEventListener('input', update)
  update()
}

// ─── Mount ───────────────────────────────────────────────────────────────────

export default function mount(_ctx: AppContext): void {
  activeTab = 'pessoas'
  activeConfigSection = 'congregacao'
  limpezaChanges.clear()
  pessoaFilter = { nome: '', role: '', ativo: 'true', sex: '' }

  const root = document.getElementById('appContent')!
  root.innerHTML = `
    <div id="mestreRoot">
      <div id="mestreTabs" style="display:flex;gap:4px;margin-bottom:16px"></div>
      <div id="mestreContent"></div>
    </div>`

  renderTabBar()
  void loadAll()
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

function renderTabBar(): void {
  const bar = document.getElementById('mestreTabs')!
  const tabs: Array<{ id: typeof activeTab; label: string }> = [
    { id: 'pessoas',  label: 'Pessoas'  },
    { id: 'limpeza',  label: 'Limpeza'  },
    { id: 'usuarios', label: 'Usuários' },
    { id: 'config',   label: 'Config'   },
  ]
  bar.innerHTML = tabs.map(t =>
    `<button class="btn ${activeTab === t.id ? 'btn-primary' : 'btn-ghost'}"
      data-tab="${t.id}" style="flex:1;font-size:.82rem">${t.label}</button>`
  ).join('')
  bar.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset['tab'] as typeof activeTab))
  })
}

function switchTab(t: typeof activeTab): void {
  activeTab = t
  renderTabBar()
  renderContent()
}

async function loadAll(): Promise<void> {
  document.getElementById('mestreContent')!.innerHTML =
    '<p style="padding:24px;color:var(--ink-3);text-align:center">Carregando…</p>'
  try {
    const [pSnap, uSnap, cSnap] = await Promise.all([
      get(pessoasRef), get(usuariosRef), get(configRef),
    ])
    pessoas  = pSnap.exists()  ? (pSnap.val()  as RawPessoas)  : {}
    usuarios = uSnap.exists()  ? (uSnap.val()  as RawUsuarios) : {}
    config   = cSnap.exists()  ? (cSnap.val()  as MasterConfig): {}
  } catch {
    toast('Erro ao carregar dados do Firebase')
  }
  renderContent()
}

function renderContent(): void {
  if      (activeTab === 'pessoas')  renderPessoas()
  else if (activeTab === 'limpeza')  renderLimpeza()
  else if (activeTab === 'usuarios') renderUsuarios()
  else                               renderConfig()
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA: PESSOAS
// ─────────────────────────────────────────────────────────────────────────────

function renderPessoas(): void {
  const mc = document.getElementById('mestreContent')!

  const filtered = Object.entries(pessoas).filter(([, p]) => {
    if (pessoaFilter.ativo === 'true'  && !p.active) return false
    if (pessoaFilter.ativo === 'false' &&  p.active) return false
    if (pessoaFilter.role  && p.role !== pessoaFilter.role) return false
    if (pessoaFilter.sex   && p.sex  !== pessoaFilter.sex)  return false
    if (pessoaFilter.nome  && !p.name.toLowerCase().includes(pessoaFilter.nome.toLowerCase())) return false
    return true
  }).sort((a, b) => a[1].name.localeCompare(b[1].name, 'pt-BR'))

  mc.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
      <input id="pFiltroNome" class="form-input" placeholder="Buscar nome…"
        value="${pessoaFilter.nome}" style="flex:2;min-width:120px">
      <select id="pFiltroRole" class="form-select" style="flex:2;min-width:120px">
        <option value="">Todas funções</option>
        <option value="anciao">Ancião</option>
        <option value="servo-ministerial">Servo ministerial</option>
        <option value="pioneiro">Pioneiro</option>
        <option value="batizado">Batizado</option>
        <option value="publicador">Publicador</option>
      </select>
      <select id="pFiltroSex" class="form-select" style="flex:1;min-width:90px">
        <option value="">M + F</option>
        <option value="M">Irmãos</option>
        <option value="F">Irmãs</option>
      </select>
      <select id="pFiltroAtivo" class="form-select" style="flex:1;min-width:90px">
        <option value="true">Ativos</option>
        <option value="false">Inativos</option>
        <option value="">Todos</option>
      </select>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <span style="font-size:.8rem;color:var(--ink-3)">
        ${filtered.length} pessoa${filtered.length !== 1 ? 's' : ''}
        · Total: ${Object.keys(pessoas).length}
      </span>
      <button id="btnAddPessoa" class="btn btn-primary" style="padding:5px 12px;font-size:.82rem">
        + Adicionar
      </button>
    </div>
    <div id="pessoaList">
      ${filtered.length
        ? filtered.map(([mid, p]) => pessoaCard(mid, p)).join('')
        : '<p style="color:var(--ink-3);text-align:center;padding:24px 0">Nenhuma pessoa encontrada.</p>'}
    </div>`

  ;(document.getElementById('pFiltroRole')  as HTMLSelectElement).value = pessoaFilter.role
  ;(document.getElementById('pFiltroSex')   as HTMLSelectElement).value = pessoaFilter.sex
  ;(document.getElementById('pFiltroAtivo') as HTMLSelectElement).value = pessoaFilter.ativo

  document.getElementById('pFiltroNome')!.addEventListener('input', e => {
    pessoaFilter.nome = (e.target as HTMLInputElement).value
    renderPessoas()
  })
  document.getElementById('pFiltroRole')!.addEventListener('change', e => {
    pessoaFilter.role = (e.target as HTMLSelectElement).value
    renderPessoas()
  })
  document.getElementById('pFiltroSex')!.addEventListener('change', e => {
    pessoaFilter.sex = (e.target as HTMLSelectElement).value
    renderPessoas()
  })
  document.getElementById('pFiltroAtivo')!.addEventListener('change', e => {
    pessoaFilter.ativo = (e.target as HTMLSelectElement).value
    renderPessoas()
  })
  document.getElementById('btnAddPessoa')!
    .addEventListener('click', () => openPessoaModal(null))

  document.querySelectorAll<HTMLButtonElement>('[data-edit-pessoa]').forEach(btn => {
    btn.addEventListener('click', () => openPessoaModal(btn.dataset['editPessoa']!))
  })
  document.querySelectorAll<HTMLButtonElement>('[data-del-pessoa]').forEach(btn => {
    btn.addEventListener('click', () => void deletePessoa(btn.dataset['delPessoa']!))
  })
}

function pessoaCard(mid: string, p: MasterPessoa): string {
  const badge = p.active
    ? `<span style="background:#E3F5EB;color:#1A6B3C;padding:1px 7px;border-radius:10px;font-size:.7rem;font-weight:600">Ativo</span>`
    : `<span style="background:#FEE;color:#B3261E;padding:1px 7px;border-radius:10px;font-size:.7rem;font-weight:600">Inativo</span>`
  return `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;
      padding:10px 12px;margin-bottom:6px;display:flex;align-items:center;gap:8px">
      <div style="width:34px;height:34px;border-radius:50%;background:var(--blue-light);
        display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:700;
        color:var(--blue-deep);flex-shrink:0">
        ${p.name.charAt(0).toUpperCase()}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${p.name}
        </div>
        <div style="font-size:.75rem;color:var(--ink-3);display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:1px">
          <span>${roleLabel(p.role)}</span>
          <span>${sexLabel(p.sex)}</span>
          ${badge}
          ${p.limpeza?.grupo ? `<span>G${p.limpeza.grupo}</span>` : ''}
        </div>
      </div>
      <button class="btn btn-ghost" data-edit-pessoa="${mid}"
        style="padding:4px 10px;font-size:.78rem;flex-shrink:0">Editar</button>
      <button class="btn btn-danger" data-del-pessoa="${mid}"
        style="padding:4px 8px;font-size:.82rem;flex-shrink:0">✕</button>
    </div>`
}

function openPessoaModal(mid: string | null): void {
  const p = mid ? pessoas[mid] : null

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal">
      <h2>${mid ? 'Editar Pessoa' : 'Nova Pessoa'}</h2>
      <div class="form-group">
        <label class="form-label">Nome *</label>
        <input id="pNome" class="form-input" value="${p?.name ?? ''}" placeholder="Nome">
      </div>
      <div class="form-group">
        <label class="form-label">WhatsApp
          <span style="color:var(--ink-3);font-weight:400;text-transform:none"> — 55 + DDD + número</span>
        </label>
        <input id="pWpp" class="form-input" value="${p?.whatsapp ?? ''}"
          placeholder="5579999999999" inputmode="numeric">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group">
          <label class="form-label">Sexo</label>
          <select id="pSex" class="form-select">
            <option value="">—</option>
            <option value="M" ${p?.sex === 'M' ? 'selected' : ''}>Masculino</option>
            <option value="F" ${p?.sex === 'F' ? 'selected' : ''}>Feminino</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Função</label>
          <select id="pRole" class="form-select">
            <option value="">—</option>
            <option value="anciao"            ${p?.role === 'anciao'            ? 'selected' : ''}>Ancião</option>
            <option value="servo-ministerial" ${p?.role === 'servo-ministerial' ? 'selected' : ''}>Servo ministerial</option>
            <option value="pioneiro"          ${p?.role === 'pioneiro'          ? 'selected' : ''}>Pioneiro</option>
            <option value="batizado"          ${p?.role === 'batizado'          ? 'selected' : ''}>Batizado</option>
            <option value="publicador"        ${p?.role === 'publicador'        ? 'selected' : ''}>Publicador</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="pAtivo" ${(p?.active ?? true) ? 'checked' : ''}>
          <span class="form-label" style="margin:0">Ativo</span>
        </label>
      </div>
      <div style="display:flex;gap:8px;margin-top:4px">
        <button id="btnCancelPessoa" class="btn btn-ghost" style="flex:1">Cancelar</button>
        <button id="btnSalvarPessoa" class="btn btn-primary" style="flex:1">Salvar</button>
      </div>
    </div>`

  document.body.appendChild(overlay)
  ;(document.getElementById('pNome') as HTMLInputElement).focus()

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
  document.getElementById('btnCancelPessoa')!.addEventListener('click', () => overlay.remove())
  document.getElementById('btnSalvarPessoa')!
    .addEventListener('click', () => void savePessoa(mid, overlay))
}

async function savePessoa(mid: string | null, overlay: HTMLElement): Promise<void> {
  const name    = (document.getElementById('pNome')  as HTMLInputElement).value.trim()
  const wppRaw  = (document.getElementById('pWpp')   as HTMLInputElement).value.trim()
  const sexVal  = (document.getElementById('pSex')   as HTMLSelectElement).value
  const roleVal = (document.getElementById('pRole')  as HTMLSelectElement).value
  const ativo   = (document.getElementById('pAtivo') as HTMLInputElement).checked

  if (!name) { toast('Preencha o nome'); return }

  const wpp = wppRaw ? normalizeWhatsapp(wppRaw) : ''
  if (wpp && wpp.length < 12) { toast('WhatsApp inválido — mínimo 12 dígitos'); return }

  // C6: mid derivado do SHA-256 do whatsapp normalizado; fallback aleatório se sem tel
  const finalMid = mid ?? (wpp ? await midFromWhatsapp(wpp) : genId('m_'))
  const existing = mid ? pessoas[mid] : undefined

  const pessoa: MasterPessoa = {
    name,
    whatsapp: wpp,
    sex:     (sexVal  as Sex  | '') ? (sexVal  as Sex)  : null,
    role:    (roleVal as Role | '') ? (roleVal as Role) : null,
    active:  ativo,
    limpeza: existing?.limpeza ?? { grupo: null },
  }

  setLoading('btnSalvarPessoa', true)
  try {
    await set(pessoaRef(finalMid), pessoa)
    pessoas[finalMid] = pessoa
    overlay.remove()
    toast(mid ? 'Pessoa atualizada ✓' : 'Pessoa adicionada ✓')
    renderPessoas()
  } catch {
    toast('Erro ao salvar — verifique a conexão')
    setLoading('btnSalvarPessoa', false)
  }
}

async function deletePessoa(mid: string): Promise<void> {
  const p = pessoas[mid]
  if (!p) return
  if (!confirm(`Remover "${p.name}" permanentemente? Esta ação não pode ser desfeita.`)) return
  try {
    await remove(pessoaRef(mid))
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete pessoas[mid]
    toast('Pessoa removida')
    renderPessoas()
  } catch {
    toast('Erro ao remover')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA: LIMPEZA (atribuição de grupos)
// ─────────────────────────────────────────────────────────────────────────────

function renderLimpeza(): void {
  const mc = document.getElementById('mestreContent')!
  limpezaChanges.clear()

  const ativos = Object.entries(pessoas)
    .filter(([, p]) => p.active)
    .sort((a, b) => a[1].name.localeCompare(b[1].name, 'pt-BR'))

  mc.innerHTML = `
    <div id="limpezaCounters" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px"></div>
    <div style="font-size:.78rem;color:var(--ink-3);margin-bottom:8px">
      ${ativos.length} pessoa${ativos.length !== 1 ? 's' : ''} ativa${ativos.length !== 1 ? 's' : ''}
    </div>
    <div id="limpezaList">
      ${ativos.map(([mid, p]) => `
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;
          padding:9px 12px;margin-bottom:5px;display:flex;align-items:center;gap:10px">
          <span style="flex:1;font-size:.88rem;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${p.name}
          </span>
          <select class="form-select limpeza-sel" data-mid="${mid}"
            style="width:120px;font-size:.82rem;padding:5px 8px">
            <option value="">Sem grupo</option>
            ${[1,2,3,4].map(g => `
              <option value="${g}" ${(p.limpeza?.grupo ?? null) === g ? 'selected' : ''}>
                Grupo ${g}
              </option>`).join('')}
          </select>
        </div>`).join('')}
    </div>
    <div style="position:sticky;bottom:8px;margin-top:14px">
      <button id="btnSalvarLimpeza" class="btn btn-primary btn-full">
        Salvar Limpeza
      </button>
    </div>`

  updateLimpezaCounters(ativos)

  document.querySelectorAll<HTMLSelectElement>('.limpeza-sel').forEach(sel => {
    sel.addEventListener('change', () => {
      const mid = sel.dataset['mid']!
      const val = sel.value ? (parseInt(sel.value, 10) as 1 | 2 | 3 | 4) : null
      limpezaChanges.set(mid, val)
      updateLimpezaCounters(ativos)
    })
  })

  document.getElementById('btnSalvarLimpeza')!
    .addEventListener('click', () => void saveLimpeza(ativos))
}

function updateLimpezaCounters(ativos: [string, MasterPessoa][]): void {
  const counts: Record<string, number> = { '1':0, '2':0, '3':0, '4':0, sem:0 }

  for (const [mid, p] of ativos) {
    const grupo = limpezaChanges.has(mid)
      ? (limpezaChanges.get(mid) ?? null)
      : (p.limpeza?.grupo ?? null)
    const key = grupo != null ? String(grupo) : 'sem'
    counts[key] = (counts[key] ?? 0) + 1
  }

  const el = document.getElementById('limpezaCounters')
  if (!el) return
  el.innerHTML = [1,2,3,4].map(g => {
    const n = counts[String(g)] ?? 0
    return `<span style="background:var(--surface);border:1px solid var(--border);
      border-radius:8px;padding:5px 12px;font-size:.8rem;font-weight:600">
      Grupo ${g}: <strong>${n}</strong>
    </span>`
  }).join('') + `
    <span style="background:var(--surface);border:1px solid var(--border);
      border-radius:8px;padding:5px 12px;font-size:.8rem;color:var(--ink-3)">
      Sem grupo: ${counts['sem'] ?? 0}
    </span>`
}

async function saveLimpeza(ativos: [string, MasterPessoa][]): Promise<void> {
  if (limpezaChanges.size === 0) { toast('Nenhuma alteração'); return }

  setLoading('btnSalvarLimpeza', true, 'Salvar Limpeza')

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
    toast('Erro ao salvar limpeza')
  } finally {
    setLoading('btnSalvarLimpeza', false, 'Salvar Limpeza')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA: USUÁRIOS
// ─────────────────────────────────────────────────────────────────────────────

function renderUsuarios(): void {
  const mc = document.getElementById('mestreContent')!
  const list = Object.entries(usuarios)
    .sort((a, b) => a[1].nome.localeCompare(b[1].nome, 'pt-BR'))

  mc.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
      <button id="btnAddUsuario" class="btn btn-primary" style="padding:5px 12px;font-size:.82rem">
        + Adicionar
      </button>
    </div>
    <div id="usuarioList">
      ${list.length
        ? list.map(([uid, u]) => usuarioCard(uid, u)).join('')
        : '<p style="color:var(--ink-3);text-align:center;padding:24px 0">Nenhum usuário.</p>'}
    </div>`

  document.getElementById('btnAddUsuario')!
    .addEventListener('click', () => openUsuarioModal(null))
  document.querySelectorAll<HTMLButtonElement>('[data-edit-usuario]').forEach(btn => {
    btn.addEventListener('click', () => openUsuarioModal(btn.dataset['editUsuario']!))
  })
  document.querySelectorAll<HTMLButtonElement>('[data-del-usuario]').forEach(btn => {
    btn.addEventListener('click', () => void deleteUsuario(btn.dataset['delUsuario']!))
  })
}

function usuarioCard(uid: string, u: Usuario): string {
  const badge = u.ativo
    ? `<span style="background:#E3F5EB;color:#1A6B3C;padding:1px 7px;border-radius:10px;font-size:.7rem;font-weight:600">Ativo</span>`
    : `<span style="background:#FEE;color:#B3261E;padding:1px 7px;border-radius:10px;font-size:.7rem;font-weight:600">Inativo</span>`
  return `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;
      padding:10px 12px;margin-bottom:6px;display:flex;align-items:center;gap:8px">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:.9rem;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          ${u.nome} ${badge}
        </div>
        <div style="font-size:.75rem;color:var(--ink-3);margin-top:2px">Apps: ${appsList(u.apps)}</div>
        ${u.secretarioPapel
          ? `<div style="font-size:.75rem;color:var(--ink-3)">Papel: ${papelLabel(u.secretarioPapel)}</div>`
          : ''}
        <div style="font-size:.7rem;color:var(--ink-3);margin-top:1px;font-family:monospace">${uid}</div>
      </div>
      <button class="btn btn-ghost" data-edit-usuario="${uid}"
        style="padding:4px 10px;font-size:.78rem;flex-shrink:0">Editar</button>
      <button class="btn btn-danger" data-del-usuario="${uid}"
        style="padding:4px 8px;font-size:.82rem;flex-shrink:0">✕</button>
    </div>`
}

function openUsuarioModal(uid: string | null): void {
  const u    = uid ? usuarios[uid] : undefined
  const apps = u?.apps ?? { mestre:false, tarefas:false, escala:false, programacao:false, secretario:false }

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal">
      <h2>${uid ? 'Editar Usuário' : 'Novo Usuário'}</h2>
      <div class="form-group">
        <label class="form-label">Nome *</label>
        <input id="uNome" class="form-input" value="${u?.nome ?? ''}" placeholder="Nome de login">
      </div>
      <div class="form-group">
        <label class="form-label">Senha *</label>
        <input id="uSenha" class="form-input" type="password"
          value="${u?.senha ?? ''}" placeholder="Senha" autocomplete="new-password">
      </div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="uAtivo" ${(u?.ativo ?? true) ? 'checked' : ''}>
          <span class="form-label" style="margin:0">Ativo</span>
        </label>
      </div>
      <div class="form-group">
        <span class="form-label" style="display:block;margin-bottom:6px">Módulos</span>
        ${appCheck('mestre',      'Admin',        apps.mestre)}
        ${appCheck('tarefas',     'Tarefas',      apps.tarefas)}
        ${appCheck('escala',      'Escala',       apps.escala)}
        ${appCheck('programacao', 'Programação',  apps.programacao)}
        ${appCheck('secretario',  'Secretário',   apps.secretario)}
      </div>
      <div class="form-group">
        <label class="form-label">Papel (Secretário)</label>
        <select id="uPapel" class="form-select">
          <option value="">Nenhum</option>
          <option value="secretario"  ${u?.secretarioPapel === 'secretario'  ? 'selected' : ''}>Secretário</option>
          <option value="publicador"  ${u?.secretarioPapel === 'publicador'  ? 'selected' : ''}>Publicador</option>
          <option value="assistencia" ${u?.secretarioPapel === 'assistencia' ? 'selected' : ''}>Assistência</option>
          <option value="coordenador" ${u?.secretarioPapel === 'coordenador' ? 'selected' : ''}>Coordenador</option>
        </select>
      </div>
      <div class="form-group" id="masterIdGroup"
        style="${u?.secretarioPapel === 'publicador' ? '' : 'display:none'}">
        <label class="form-label">Master ID
          <span style="color:var(--ink-3);font-weight:400;text-transform:none"> — obrigatório para Publicador</span>
        </label>
        <input id="uMasterId" class="form-input" value="${u?.masterId ?? ''}" placeholder="m_xxxxxxxx">
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button id="btnCancelUsuario" class="btn btn-ghost" style="flex:1">Cancelar</button>
        <button id="btnSalvarUsuario" class="btn btn-primary" style="flex:1">Salvar</button>
      </div>
    </div>`

  document.body.appendChild(overlay)

  const papelSel    = document.getElementById('uPapel') as HTMLSelectElement
  const masterIdGrp = document.getElementById('masterIdGroup')!

  papelSel.addEventListener('change', () => {
    masterIdGrp.style.display = papelSel.value === 'publicador' ? '' : 'none'
  })

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
  document.getElementById('btnCancelUsuario')!.addEventListener('click', () => overlay.remove())
  document.getElementById('btnSalvarUsuario')!
    .addEventListener('click', () => void saveUsuario(uid, overlay))
}

async function saveUsuario(uid: string | null, overlay: HTMLElement): Promise<void> {
  const nome     = (document.getElementById('uNome')     as HTMLInputElement).value.trim()
  const senha    = (document.getElementById('uSenha')    as HTMLInputElement).value
  const ativo    = (document.getElementById('uAtivo')    as HTMLInputElement).checked
  const papelVal = (document.getElementById('uPapel')    as HTMLSelectElement).value as SecretarioPapel | ''
  const masterId = (document.getElementById('uMasterId') as HTMLInputElement | null)?.value.trim() ?? ''

  if (!nome)  { toast('Preencha o nome');  return }
  if (!senha) { toast('Preencha a senha'); return }

  if (papelVal === 'publicador' && !masterId) {
    toast('Master ID obrigatório para Publicador'); return
  }

  const checkApp = (id: string) =>
    (document.getElementById(`uApp_${id}`) as HTMLInputElement).checked

  const usuario: Usuario = {
    nome, senha, ativo,
    apps: {
      mestre:      checkApp('mestre'),
      tarefas:     checkApp('tarefas'),
      escala:      checkApp('escala'),
      programacao: checkApp('programacao'),
      secretario:  checkApp('secretario'),
    },
  }
  if (papelVal) usuario.secretarioPapel = papelVal
  if (masterId) usuario.masterId = masterId

  const finalUid = uid ?? genId('u_')
  setLoading('btnSalvarUsuario', true)

  try {
    await set(usuarioRef(finalUid), usuario)
    usuarios[finalUid] = usuario
    overlay.remove()
    toast(uid ? 'Usuário atualizado ✓' : 'Usuário adicionado ✓')
    renderUsuarios()
  } catch {
    toast('Erro ao salvar')
    setLoading('btnSalvarUsuario', false)
  }
}

async function deleteUsuario(uid: string): Promise<void> {
  const u = usuarios[uid]
  if (!u) return
  if (!confirm(`Remover usuário "${u.nome}" permanentemente?`)) return
  try {
    await remove(usuarioRef(uid))
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete usuarios[uid]
    toast('Usuário removido')
    renderUsuarios()
  } catch {
    toast('Erro ao remover')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA: CONFIG
// ─────────────────────────────────────────────────────────────────────────────

function renderConfig(): void {
  const mc = document.getElementById('mestreContent')!

  const secs: Array<{ id: typeof activeConfigSection; label: string }> = [
    { id: 'congregacao', label: 'Congregação' },
    { id: 'limpeza',     label: 'Limpeza'     },
    { id: 'designacoes', label: 'Designações' },
  ]

  mc.innerHTML = `
    <div style="display:flex;gap:4px;margin-bottom:16px;background:var(--surface-2);
      border-radius:8px;padding:3px;border:1px solid var(--border)">
      ${secs.map(s => `
        <button class="btn ${activeConfigSection === s.id ? 'btn-primary' : 'btn-ghost'}"
          data-cfg-sec="${s.id}" style="flex:1;font-size:.78rem">${s.label}</button>`
      ).join('')}
    </div>
    <div id="configContent"></div>`

  mc.querySelectorAll<HTMLButtonElement>('[data-cfg-sec]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeConfigSection = btn.dataset['cfgSec'] as typeof activeConfigSection
      renderConfig()
    })
  })

  if      (activeConfigSection === 'congregacao') renderConfigCongregacao()
  else if (activeConfigSection === 'limpeza')     renderConfigLimpeza()
  else                                            renderConfigDesignacoes()
}

// ── Congregação ───────────────────────────────────────────────────────────────

function renderConfigCongregacao(): void {
  const el = document.getElementById('configContent')!
  const c  = config.congregacao ?? { nome:'', cidade:'', circuito:'', idioma:'pt-BR' }
  const r  = config.reunioes

  const diaOpts = (sel?: number) => DIAS_SEMANA
    .map((d, i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>${d}</option>`)
    .join('')

  const reuniaoCard = (id: string, label: string, dia?: number, hora?: string) => `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px">
      <div style="font-size:.82rem;font-weight:600;color:var(--ink-2);margin-bottom:10px">${label}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-group" style="margin:0">
          <label class="form-label">Dia</label>
          <select id="${id}Dia" class="form-select">${diaOpts(dia)}</select>
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Horário</label>
          <input id="${id}Hora" class="form-input" type="time" value="${hora ?? ''}">
        </div>
      </div>
    </div>`

  el.innerHTML = `
    <div class="form-group">
      <label class="form-label">Nome da congregação</label>
      <input id="cNome" class="form-input" value="${c.nome}" placeholder="Congregação Noroeste">
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group">
        <label class="form-label">Cidade</label>
        <input id="cCidade" class="form-input" value="${c.cidade}" placeholder="Aracaju">
      </div>
      <div class="form-group">
        <label class="form-label">Circuito</label>
        <input id="cCircuito" class="form-input" value="${c.circuito}" placeholder="SE-01">
      </div>
    </div>

    <div style="font-size:.8rem;font-weight:600;color:var(--ink-2);margin:16px 0 10px;
      text-transform:uppercase;letter-spacing:.05em">Reuniões</div>

    ${reuniaoCard('ms',  'Meio de semana',      r?.meiaDeSemana?.diaSemana,  r?.meiaDeSemana?.horario)}
    ${reuniaoCard('fs1', 'Fim de semana (S1)',   r?.fimDeSemana?.diaSemana,   r?.fimDeSemana?.horario)}
    ${reuniaoCard('fs2', 'Fim de semana (S2)',   r?.fimDeSemanaS2?.diaSemana, r?.fimDeSemanaS2?.horario)}

    <button id="btnSalvarCong" class="btn btn-primary btn-full" style="margin-top:8px">
      Salvar Congregação
    </button>`

  document.getElementById('btnSalvarCong')!
    .addEventListener('click', () => void saveConfigCongregacao())
}

async function saveConfigCongregacao(): Promise<void> {
  const v  = (id: string) => (document.getElementById(id) as HTMLInputElement).value.trim()
  const vi = (id: string) => parseInt((document.getElementById(id) as HTMLSelectElement).value, 10)

  const congregacao = { nome: v('cNome'), cidade: v('cCidade'), circuito: v('cCircuito'), idioma: 'pt-BR' }
  const reunioes = {
    meiaDeSemana:  { diaSemana: vi('msDia'),  horario: v('msHora')  },
    fimDeSemana:   { diaSemana: vi('fs1Dia'), horario: v('fs1Hora') },
    fimDeSemanaS2: { diaSemana: vi('fs2Dia'), horario: v('fs2Hora') },
  }

  setLoading('btnSalvarCong', true)
  try {
    await Promise.all([
      set(configCongregacaoRef, congregacao),
      set(configReunioesRef, reunioes),
    ])
    config.congregacao = congregacao
    config.reunioes    = reunioes
    toast('Congregação salva ✓')
  } catch {
    toast('Erro ao salvar')
  } finally {
    setLoading('btnSalvarCong', false, 'Salvar Congregação')
  }
}

// ── Config Limpeza ────────────────────────────────────────────────────────────

function renderConfigLimpeza(): void {
  const el = document.getElementById('configContent')!
  const lp: Partial<ConfigLimpeza> = config.limpeza ?? {}

  const ativa           = lp.ativa          ?? false
  const grupos          = lp.grupos          ?? 4
  const inicioRotacao   = lp.inicioRotacao   ?? ''
  const coordenadorMid  = lp.coordenadorMid  ?? ''
  const textoPadrao     = lp.textoPadrao     ?? ''
  const tpAprovado      = lp.textoPadraoAprovadoEm ?? ''

  // Candidatos a coordenador/super: ativos, M, anciao ou servo-ministerial
  const ancioes = Object.entries(pessoas)
    .filter(([, p]) => p.active && p.sex === 'M' && (p.role === 'anciao' || p.role === 'servo-ministerial'))
    .sort((a, b) => a[1].name.localeCompare(b[1].name, 'pt-BR'))

  const ativos = Object.entries(pessoas)
    .filter(([, p]) => p.active)
    .sort((a, b) => a[1].name.localeCompare(b[1].name, 'pt-BR'))

  const coordOpts = ancioes
    .map(([mid, p]) => `<option value="${mid}" ${coordenadorMid === mid ? 'selected' : ''}>${p.name}</option>`)
    .join('')

  const grupoCards = Array.from({ length: grupos }, (_, i) => {
    const gid  = String(i + 1)
    const gc: Partial<ConfigLimpezaGrupo> = lp.gruposConfig?.[gid] ?? {}
    const superMid    = gc.superintendenteMid ?? ''
    const ajudantes   = toStringArray(gc.ajudantesMid as string[] | Record<string, string> | undefined)
    const textoGrupo  = gc.textoInstrucoes ?? ''
    const aprovadoGrupo = gc.aprovadoEm ?? ''

    const superOpts = ancioes
      .map(([mid, p]) => `<option value="${mid}" ${superMid === mid ? 'selected' : ''}>${p.name}</option>`)
      .join('')

    const ajudantesCheck = ativos.map(([mid, p]) => `
      <label style="display:flex;align-items:center;gap:5px;cursor:pointer;padding:2px 0;font-size:.8rem">
        <input type="checkbox" class="gAjud_${gid}" value="${mid}" ${ajudantes.includes(mid) ? 'checked' : ''}>
        <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name.split(' ')[0]}</span>
      </label>`).join('')

    return `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;
        padding:14px;margin-bottom:10px">
        <div style="font-size:.85rem;font-weight:700;color:var(--blue-deep);margin-bottom:12px">
          Grupo ${gid}
        </div>
        <div class="form-group">
          <label class="form-label">Superintendente</label>
          <select id="gSuper_${gid}" class="form-select">
            <option value="">Selecionar…</option>
            ${superOpts}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Ajudantes</label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 10px;
            max-height:160px;overflow-y:auto;border:1px solid var(--border);
            border-radius:6px;padding:8px;background:var(--surface-2)">
            ${ajudantesCheck}
          </div>
        </div>
        <div class="form-group">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
            <label class="form-label" style="margin:0">Texto de instrução</label>
            <span style="font-size:.72rem;color:var(--ink-3)" id="gTextoCount_${gid}">
              ${textoGrupo.length}/250
            </span>
          </div>
          <textarea id="gTexto_${gid}" class="form-input" rows="3"
            maxlength="250" style="resize:vertical">${textoGrupo}</textarea>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
            <span style="font-size:.74rem;color:var(--ink-3)">
              Aprovado: <strong>${aprovadoGrupo ? formatDate(aprovadoGrupo) : 'Não aprovado'}</strong>
            </span>
            <button class="btn btn-ghost gAprovar" data-gid="${gid}"
              style="font-size:.75rem;padding:3px 10px">✓ Aprovar hoje</button>
          </div>
        </div>
      </div>`
  }).join('')

  el.innerHTML = `
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
          ${[2,3,4,5,6].map(n =>
            `<option value="${n}" ${grupos === n ? 'selected' : ''}>${n} grupos</option>`).join('')}
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
        <option value="">Selecionar…</option>
        ${coordOpts}
      </select>
    </div>
    <div class="form-group">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
        <label class="form-label" style="margin:0">Texto padrão (.ics / cards)</label>
        <span style="font-size:.72rem;color:var(--ink-3)" id="lTextoPadraoCount">
          ${textoPadrao.length}/250
        </span>
      </div>
      <textarea id="lTextoPadrao" class="form-input" rows="3"
        maxlength="250" style="resize:vertical">${textoPadrao}</textarea>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
        <span style="font-size:.74rem;color:var(--ink-3)">
          Aprovado: <strong>${tpAprovado ? formatDate(tpAprovado) : 'Não aprovado'}</strong>
        </span>
        <button id="btnAprovarTP" class="btn btn-ghost" style="font-size:.75rem;padding:3px 10px">
          ✓ Aprovar hoje
        </button>
      </div>
    </div>

    <div style="font-size:.8rem;font-weight:600;color:var(--ink-2);margin:16px 0 10px;
      text-transform:uppercase;letter-spacing:.05em">Por grupo</div>

    ${grupoCards}

    <div style="position:sticky;bottom:8px;margin-top:4px">
      <button id="btnSalvarLimpezaConfig" class="btn btn-primary btn-full">
        Salvar Config Limpeza
      </button>
    </div>`

  // Contadores de caracteres
  charCounter('lTextoPadrao', 'lTextoPadraoCount')
  Array.from({ length: grupos }, (_, i) => {
    charCounter(`gTexto_${i + 1}`, `gTextoCount_${i + 1}`)
  })

  // Aprovar texto padrão
  document.getElementById('btnAprovarTP')!
    .addEventListener('click', () => void approveTextoPadrao())

  // Aprovar por grupo
  document.querySelectorAll<HTMLButtonElement>('.gAprovar').forEach(btn => {
    btn.addEventListener('click', () => void approveGrupoTexto(btn.dataset['gid']!))
  })

  // Salvar tudo
  document.getElementById('btnSalvarLimpezaConfig')!
    .addEventListener('click', () => void saveConfigLimpeza())
}

async function approveTextoPadrao(): Promise<void> {
  const texto = (document.getElementById('lTextoPadrao') as HTMLTextAreaElement).value
  const hoje  = todayStr()
  try {
    await update(configLimpezaRef, { textoPadrao: texto, textoPadraoAprovadoEm: hoje })
    if (!config.limpeza) config.limpeza = {} as ConfigLimpeza
    config.limpeza.textoPadrao           = texto
    config.limpeza.textoPadraoAprovadoEm = hoje
    toast('Texto padrão aprovado ✓')
    renderConfigLimpeza()
  } catch {
    toast('Erro ao aprovar')
  }
}

async function approveGrupoTexto(gid: string): Promise<void> {
  const texto = (document.getElementById(`gTexto_${gid}`) as HTMLTextAreaElement).value
  const hoje  = todayStr()
  try {
    await update(configLimpezaRef, {
      [`gruposConfig/${gid}/textoInstrucoes`]: texto,
      [`gruposConfig/${gid}/aprovadoEm`]:      hoje,
    })
    if (!config.limpeza) config.limpeza = {} as ConfigLimpeza
    if (!config.limpeza.gruposConfig) config.limpeza.gruposConfig = {}
    if (!config.limpeza.gruposConfig[gid]) {
      config.limpeza.gruposConfig[gid] = { superintendenteMid:'', ajudantesMid:[], textoInstrucoes:'', aprovadoEm:'' }
    }
    config.limpeza.gruposConfig[gid]!.textoInstrucoes = texto
    config.limpeza.gruposConfig[gid]!.aprovadoEm      = hoje
    toast(`Grupo ${gid} aprovado ✓`)
    renderConfigLimpeza()
  } catch {
    toast('Erro ao aprovar')
  }
}

async function saveConfigLimpeza(): Promise<void> {
  const vb  = (id: string) => (document.getElementById(id) as HTMLInputElement).checked
  const vi  = (id: string) => parseInt((document.getElementById(id) as HTMLSelectElement).value, 10)
  const v   = (id: string) => (document.getElementById(id) as HTMLInputElement).value.trim()

  const grupos = vi('lGrupos')

  const gruposConfig: Record<string, ConfigLimpezaGrupo> = {}
  for (let i = 1; i <= grupos; i++) {
    const gid = String(i)
    const existente = config.limpeza?.gruposConfig?.[gid]
    const ajudantesMid = Array.from(
      document.querySelectorAll<HTMLInputElement>(`.gAjud_${gid}:checked`)
    ).map(cb => cb.value)

    gruposConfig[gid] = {
      superintendenteMid: v(`gSuper_${gid}`),
      ajudantesMid,
      textoInstrucoes:    (document.getElementById(`gTexto_${gid}`) as HTMLTextAreaElement).value,
      aprovadoEm:         existente?.aprovadoEm ?? '',
    }
  }

  const limpezaObj: ConfigLimpeza = {
    ativa:                 vb('lAtiva'),
    grupos,
    inicioRotacao:         v('lInicio'),
    coordenadorMid:        v('lCoordenador'),
    textoPadrao:           (document.getElementById('lTextoPadrao') as HTMLTextAreaElement).value,
    textoPadraoAprovadoEm: config.limpeza?.textoPadraoAprovadoEm ?? '',
    gruposConfig,
  }

  setLoading('btnSalvarLimpezaConfig', true)
  try {
    await set(configLimpezaRef, limpezaObj)
    config.limpeza = limpezaObj
    toast('Config Limpeza salva ✓')
  } catch {
    toast('Erro ao salvar')
  } finally {
    setLoading('btnSalvarLimpezaConfig', false, 'Salvar Config Limpeza')
  }
}

// ── Config Designações ────────────────────────────────────────────────────────

function renderConfigDesignacoes(): void {
  const el   = document.getElementById('configContent')!
  const desig = config.designacoes ?? {}

  const cards = DESIGNACOES_TIPOS.map(tipo => {
    const d = desig[tipo] ?? { textoIcs: '', ativo: true, aprovadoEm: '' }
    return `
      <div style="background:var(--surface);border:1px solid var(--border);
        border-radius:8px;padding:12px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-size:.85rem;font-weight:600">${DESIGNACAO_LABELS[tipo]}</span>
          <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:.78rem;
            white-space:nowrap;margin-left:8px">
            <input type="checkbox" class="dAtivo" data-tipo="${tipo}" ${d.ativo ? 'checked' : ''}>
            Ativo
          </label>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
          <label class="form-label" style="margin:0;font-size:.78rem">Texto .ics</label>
          <span style="font-size:.72rem;color:var(--ink-3)" id="dCount_${tipo}">
            ${d.textoIcs.length}/250
          </span>
        </div>
        <textarea id="dTexto_${tipo}" class="form-input" rows="2"
          maxlength="250" style="resize:none;font-size:.82rem">${d.textoIcs}</textarea>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:5px">
          <span style="font-size:.72rem;color:var(--ink-3)">
            Aprovado: <strong>${d.aprovadoEm ? formatDate(d.aprovadoEm) : '—'}</strong>
          </span>
          <button class="btn btn-ghost dAprovar" data-tipo="${tipo}"
            style="font-size:.75rem;padding:3px 10px">✓ Aprovar</button>
        </div>
      </div>`
  }).join('')

  el.innerHTML = `
    <p style="font-size:.78rem;color:var(--ink-3);margin-bottom:12px">
      Texto que aparece no campo Observações do arquivo .ics exportado para o calendário (máx. 250 caracteres).
    </p>
    ${cards}
    <div style="position:sticky;bottom:8px;margin-top:4px">
      <button id="btnSalvarDesig" class="btn btn-primary btn-full">
        Salvar Designações
      </button>
    </div>`

  // Contadores de caracteres
  DESIGNACOES_TIPOS.forEach(tipo => charCounter(`dTexto_${tipo}`, `dCount_${tipo}`))

  // Aprovar individual
  el.querySelectorAll<HTMLButtonElement>('.dAprovar').forEach(btn => {
    btn.addEventListener('click', () => void approveDesignacao(btn.dataset['tipo'] as TipoDesignacao))
  })

  // Salvar tudo
  document.getElementById('btnSalvarDesig')!
    .addEventListener('click', () => void saveConfigDesignacoes())
}

async function approveDesignacao(tipo: TipoDesignacao): Promise<void> {
  const texto = (document.getElementById(`dTexto_${tipo}`) as HTMLTextAreaElement).value
  const ativo = (document.querySelector(`.dAtivo[data-tipo="${tipo}"]`) as HTMLInputElement)?.checked ?? true
  const hoje  = todayStr()
  try {
    await update(configDesignacoesRef, {
      [`${tipo}/textoIcs`]:   texto,
      [`${tipo}/ativo`]:      ativo,
      [`${tipo}/aprovadoEm`]: hoje,
    })
    if (!config.designacoes) config.designacoes = {}
    config.designacoes[tipo] = { textoIcs: texto, ativo, aprovadoEm: hoje }
    toast(`"${DESIGNACAO_LABELS[tipo]}" aprovado ✓`)
    renderConfigDesignacoes()
  } catch {
    toast('Erro ao aprovar')
  }
}

async function saveConfigDesignacoes(): Promise<void> {
  const result: Partial<Record<TipoDesignacao, { textoIcs: string; ativo: boolean; aprovadoEm: string }>> = {}

  for (const tipo of DESIGNACOES_TIPOS) {
    const textoIcs = (document.getElementById(`dTexto_${tipo}`) as HTMLTextAreaElement).value
    const ativo    = (document.querySelector(`.dAtivo[data-tipo="${tipo}"]`) as HTMLInputElement)?.checked ?? true
    const aprovadoEm = config.designacoes?.[tipo]?.aprovadoEm ?? ''
    result[tipo] = { textoIcs, ativo, aprovadoEm }
  }

  setLoading('btnSalvarDesig', true)
  try {
    await set(configDesignacoesRef, result)
    config.designacoes = result as Record<TipoDesignacao, { textoIcs: string; ativo: boolean; aprovadoEm: string }>
    toast('Designações salvas ✓')
  } catch {
    toast('Erro ao salvar')
  } finally {
    setLoading('btnSalvarDesig', false, 'Salvar Designações')
  }
}
