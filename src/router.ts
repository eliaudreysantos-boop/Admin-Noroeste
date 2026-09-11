import type { AppContext, ModuleName, AppPermissions } from './types'
import { renderMenuCards, type ItemMenu } from './ui/menu-cards'

// ─── Mapa de módulos ────────────────────────────────────────────────────────

const MODULE_META: Record<
  ModuleName,
  { label: string; desc: string; icon: string; color: string }
> = {
  mestre:      { label: 'Admin',        desc: 'Pessoas, config e usuários',   icon: '⚙️',  color: '#003F72' },
  tarefas:     { label: 'Tarefas',      desc: 'Funções da reunião',           icon: '📋', color: '#7E3AF2' },
  limpeza:     { label: 'Limpeza',      desc: 'Grupos, textos e PDF',         icon: '🧹', color: '#006EB6' },
  oradores:    { label: 'Oradores',     desc: 'Discursos públicos',           icon: '🎙️', color: '#5C6062' },
  escala:      { label: 'Escala TPL',   desc: 'Escala de campo TPL',          icon: '🌿', color: '#1A6B3C' },
  programacao: { label: 'Vida e Ministério', desc: 'Reunião do meio de semana', icon: '📅', color: '#003F72' },
  secretario:  { label: 'Secretário',   desc: 'Relatórios e publicadores',    icon: '📂', color: '#B3261E' },
  individual:  { label: 'Minha agenda',  desc: 'Suas designações e compromissos', icon: '✓', color: '#006EB6' },
}

const MODULES_ORDER: ModuleName[] = [
  'mestre', 'secretario', 'oradores', 'programacao', 'tarefas', 'limpeza', 'escala', 'individual',
]

// ─── Lazy loaders ───────────────────────────────────────────────────────────

async function loadModule(
  name: ModuleName,
  ctx:  AppContext,
): Promise<void> {
  const loaders: Record<ModuleName, () => Promise<{ default: (ctx: AppContext) => void }>> = {
    mestre:      () => import('./modules/mestre'),
    tarefas:     () => import('./modules/tarefas'),
    limpeza:     () => import('./modules/limpeza'),
    oradores:    () => import('./modules/oradores'),
    escala:      () => import('./modules/escala'),
    programacao: () => import('./modules/programacao'),
    secretario:  () => import('./modules/secretario'),
    individual:  () => import('./modules/individual'),
  }
  const mod = await loaders[name]()
  mod.default(ctx)
}

// ─── Módulo activo ──────────────────────────────────────────────────────────

let _ctx: AppContext | null = null
let _accessList: ModuleName[] = []
let _currentModule: ModuleName | null = null

function animateRoute(content: HTMLElement): void {
  content.classList.remove('screen-enter')
  void content.offsetWidth
  content.classList.add('screen-enter')
}

function emitRouteState(): void {
  window.dispatchEvent(new CustomEvent('app-route-change', {
    detail: { canBack: _currentModule !== null && _accessList.length > 1 },
  }))
}

export async function navigateTo(modulo: ModuleName): Promise<void> {
  if (!_ctx) return
  if (!_accessList.includes(modulo)) return
  _currentModule = modulo
  emitRouteState()
  const content = document.getElementById('appContent')!
  content.innerHTML = '<p style="padding:24px;color:var(--ink-3)">Carregando…</p>'
  await loadModule(modulo, _ctx)
  animateRoute(content)
}

export function navigateBack(): void {
  if (_currentModule && _accessList.length > 1) {
    renderMenu(_accessList)
    return
  }
}

export function navigateModuleIndex(): void {
  if (_currentModule) void navigateTo(_currentModule)
}

// ─── Init ───────────────────────────────────────────────────────────────────

export function initRouter(uid: string, usuario: import('./types').Usuario): void {
  _ctx = { uid, usuario }

  // apps.mestre = Admin → acesso total a todos os módulos
  const accessList = usuario.apps.mestre
    ? MODULES_ORDER
    : MODULES_ORDER.filter((m) => hasAccess(usuario.apps, m))
  _accessList = accessList

  if (accessList.length === 0) {
    document.getElementById('appContent')!.innerHTML = `
      <div class="module-placeholder">
        <h2>Sem acesso</h2>
        <p>Nenhum módulo habilitado para este usuário.</p>
      </div>`
    return
  }

  if (accessList.length === 1) {
    void navigateTo(accessList[0])
    return
  }

  renderMenu(accessList)
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function hasAccess(apps: AppPermissions, m: ModuleName): boolean {
  return apps[m] === true
}

function renderMenu(list: ModuleName[]): void {
  _currentModule = null
  emitRouteState()
  const content = document.getElementById('appContent')!
  const items: ItemMenu[] = list.map((m) => {
    const meta = MODULE_META[m]
    return { id: m, titulo: meta.label, subtitulo: meta.desc, icone: meta.icon, corFundo: meta.color }
  })
  renderMenuCards(content, items, id => void navigateTo(id as ModuleName))
  animateRoute(content)
}
