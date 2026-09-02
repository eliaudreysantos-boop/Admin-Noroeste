import type {
  AppContext,
  MasterPessoa,
  RawPessoas,
  RawUsuarios,
  Role,
  Sex,
  SecretarioPapel,
  Usuario,
} from '../types'
import {
  get, set, update, remove,
  pessoaRef, pessoasRef,
  usuarioRef, usuariosRef,
} from '../firebase'

// ─── Estado do módulo ────────────────────────────────────────────────────────

let pessoas:   RawPessoas  = {}
let usuarios:  RawUsuarios = {}
let activeTab: 'pessoas' | 'limpeza' | 'usuarios' = 'pessoas'

const limpezaChanges = new Map<string, 1 | 2 | 3 | 4 | null>()
let pessoaFilter = { nome: '', role: '', ativo: 'true' }

// ─── Utilitários ─────────────────────────────────────────────────────────────

function toast(msg: string, ms = 2600): void {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = msg
  el.classList.add('show')
  setTimeout(() => el.classList.remove('show'), ms)
}

function genId(prefix: string): string {
  const arr = new Uint8Array(4)
  crypto.getRandomValues(arr)
  return prefix + Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

function normalizeWhatsapp(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.startsWith('55') ? digits : `55${digits}`
}

function roleLabel(role: Role | null): string {
  const map: Record<string, string> = {
    'anciao': 'Ancião',
    'servo-ministerial': 'Servo min.',
    'pioneiro': 'Pioneiro',
    'batizado': 'Batizado',
    'publicador': 'Publicador',
  }
  return role ? (map[role] ?? role) : '—'
}

function sexLabel(sex: Sex | null): string {
  if (sex === 'M') return 'M'
  if (sex === 'F') return 'F'
  return '—'
}

function papelLabel(papel: SecretarioPapel | undefined): string {
  if (!papel) return '—'
  const map: Record<string, string> = {
    secretario: 'Secretário',
    publicador: 'Publicador',
    assistencia: 'Assistência',
    coordenador: 'Coordenador',
  }
  return map[papel] ?? papel
}

function appsList(apps: Usuario['apps']): string {
  const labels: Record<string, string> = {
    mestre: 'Mestre', tarefas: 'Tarefas', escala: 'Escala',
    programacao: 'Programação', secretario: 'Secretário',
  }
  return (Object.keys(apps) as Array<keyof typeof apps>)
    .filter(k => apps[k])
    .map(k => labels[k])
    .join(', ') || '—'
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

// ─── Mount ───────────────────────────────────────────────────────────────────

export default function mount(_ctx: AppContext): void {
  // Reset state on each mount
  activeTab = 'pessoas'
  limpezaChanges.clear()
  pessoaFilter = { nome: '', role: '', ativo: 'true' }

  const root = document.getElementById('appContent')!
  root.innerHTML = `
    <div id="mestreRoot">
      <div id="mestreTabs" style="display:flex;gap:6px;margin-bottom:16px"></div>
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
  ]
  bar.innerHTML = tabs.map(t =>
    `<button class="btn ${activeTab === t.id ? 'btn-primary' : 'btn-ghost'}"
      data-tab="${t.id}" style="flex:1">${t.label}</button>`
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
    const [pSnap, uSnap] = await Promise.all([get(pessoasRef), get(usuariosRef)])
    pessoas  = pSnap.exists()  ? (pSnap.val()  as RawPessoas)  : {}
    usuarios = uSnap.exists() ? (uSnap.val() as RawUsuarios) : {}
  } catch {
    toast('Erro ao carregar dados do Firebase')
  }
  renderContent()
}

function renderContent(): void {
  if (activeTab === 'pessoas')  renderPessoas()
  else if (activeTab === 'limpeza')  renderLimpeza()
  else renderUsuarios()
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
  ;(document.getElementById('pFiltroAtivo') as HTMLSelectElement).value = pessoaFilter.ativo

  document.getElementById('pFiltroNome')!.addEventListener('input', e => {
    pessoaFilter.nome = (e.target as HTMLInputElement).value
    renderPessoas()
  })
  document.getElementById('pFiltroRole')!.addEventListener('change', e => {
    pessoaFilter.role = (e.target as HTMLSelectElement).value
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
            <option value="anciao"             ${p?.role === 'anciao'             ? 'selected' : ''}>Ancião</option>
            <option value="servo-ministerial"  ${p?.role === 'servo-ministerial'  ? 'selected' : ''}>Servo ministerial</option>
            <option value="pioneiro"           ${p?.role === 'pioneiro'           ? 'selected' : ''}>Pioneiro</option>
            <option value="batizado"           ${p?.role === 'batizado'           ? 'selected' : ''}>Batizado</option>
            <option value="publicador"         ${p?.role === 'publicador'         ? 'selected' : ''}>Publicador</option>
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

  const finalMid = mid ?? genId('m_')
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
// ABA: LIMPEZA
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
  const counts: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, sem: 0 }

  for (const [mid, p] of ativos) {
    const grupo = limpezaChanges.has(mid)
      ? (limpezaChanges.get(mid) ?? null)
      : (p.limpeza?.grupo ?? null)
    const key = grupo != null ? String(grupo) : 'sem'
    counts[key] = (counts[key] ?? 0) + 1
  }

  const el = document.getElementById('limpezaCounters')
  if (!el) return
  el.innerHTML = [1, 2, 3, 4].map(g => {
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
        <div style="font-size:.75rem;color:var(--ink-3);margin-top:2px">
          Apps: ${appsList(u.apps)}
        </div>
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
  const apps = u?.apps ?? { mestre: false, tarefas: false, escala: false, programacao: false, secretario: false }

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
        ${appCheck('mestre',      'Mestre',       apps.mestre)}
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
        <input id="uMasterId" class="form-input" value="${u?.masterId ?? ''}"
          placeholder="m_xxxxxxxx">
      </div>

      <div style="display:flex;gap:8px;margin-top:8px">
        <button id="btnCancelUsuario" class="btn btn-ghost" style="flex:1">Cancelar</button>
        <button id="btnSalvarUsuario" class="btn btn-primary" style="flex:1">Salvar</button>
      </div>
    </div>`

  document.body.appendChild(overlay)

  const papelSel     = document.getElementById('uPapel') as HTMLSelectElement
  const masterIdGrp  = document.getElementById('masterIdGroup')!

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
    toast('Master ID obrigatório para Publicador')
    return
  }

  const checkApp = (id: string) =>
    (document.getElementById(`uApp_${id}`) as HTMLInputElement).checked

  const usuario: Usuario = {
    nome,
    senha,
    ativo,
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
