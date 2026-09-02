import type { AppContext, ModuleName, AppPermissions } from './types'

// ─── Mapa de módulos ────────────────────────────────────────────────────────

const MODULE_META: Record<
  ModuleName,
  { label: string; desc: string; icon: string; color: string }
> = {
  mestre:      { label: 'Mestre',       desc: 'Pessoas e limpeza',            icon: '👥', color: '#003F72' },
  tarefas:     { label: 'Tarefas',      desc: 'Designações e discursos',      icon: '📋', color: '#7E3AF2' },
  escala:      { label: 'Escala',       desc: 'Escala de campo TPL',          icon: '🌿', color: '#1A6B3C' },
  programacao: { label: 'Programação',  desc: 'Programação de reuniões',      icon: '📅', color: '#003F72' },
  secretario:  { label: 'Secretário',   desc: 'Relatórios e publicadores',    icon: '📂', color: '#B3261E' },
}

const MODULES_ORDER: ModuleName[] = [
  'mestre', 'tarefas', 'escala', 'programacao', 'secretario',
]

// ─── Lazy loaders ───────────────────────────────────────────────────────────

async function loadModule(
  name: ModuleName,
  ctx:  AppContext,
): Promise<void> {
  const loaders: Record<ModuleName, () => Promise<{ default: (ctx: AppContext) => void }>> = {
    mestre:      () => import('./modules/mestre'),
    tarefas:     () => import('./modules/tarefas'),
    escala:      () => import('./modules/escala'),
    programacao: () => import('./modules/programacao'),
    secretario:  () => import('./modules/secretario'),
  }
  const mod = await loaders[name]()
  mod.default(ctx)
}

// ─── Módulo activo ──────────────────────────────────────────────────────────

let _ctx: AppContext | null = null

export async function navigateTo(modulo: ModuleName): Promise<void> {
  if (!_ctx) return
  const content = document.getElementById('appContent')!
  content.innerHTML = '<p style="padding:24px;color:var(--ink-3)">Carregando…</p>'
  await loadModule(modulo, _ctx)
}

// ─── Init ───────────────────────────────────────────────────────────────────

export function initRouter(uid: string, usuario: import('./types').Usuario): void {
  _ctx = { uid, usuario }

  const accessList = MODULES_ORDER.filter(
    (m) => hasAccess(usuario.apps, m),
  )

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

  // Exibe menu de seleção
  renderMenu(accessList)
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function hasAccess(apps: AppPermissions, m: ModuleName): boolean {
  return apps[m] === true
}

function renderMenu(list: ModuleName[]): void {
  const content = document.getElementById('appContent')!
  const items = list.map((m) => {
    const meta = MODULE_META[m]
    return `
      <button class="module-menu-btn" data-module="${m}">
        <div class="mod-icon" style="background:${meta.color}20;color:${meta.color}">
          ${meta.icon}
        </div>
        <div>
          <div class="mod-label">${meta.label}</div>
          <div class="mod-desc">${meta.desc}</div>
        </div>
      </button>`
  }).join('')

  content.innerHTML = `
    <p style="font-size:.8rem;color:var(--ink-3);margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em">
      Selecione o módulo
    </p>
    <div class="module-menu">${items}</div>`

  content.querySelectorAll<HTMLButtonElement>('.module-menu-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const m = btn.dataset['module'] as ModuleName
      void navigateTo(m)
    })
  })
}
