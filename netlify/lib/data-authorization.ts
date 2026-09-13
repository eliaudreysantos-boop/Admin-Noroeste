import type { AppPermissions } from '../../src/types.ts'

const PRIVATE_ROOTS = new Set(['appSessoesPrivadas', 'agendaDispositivosPrivados', 'agendaAssinaturasPrivadas', 'autenticacaoTentativasPrivadas', 'pendenciasMigracao'])

export function normalizeDataPath(value: string): string | null {
  const path = value.trim().replace(/^\/+|\/+$/g, '')
  if (!path) return ''
  if (path.length > 240 || path.split('/').some(part => !part || part === '.' || part === '..' || /[.#$\[\]]/.test(part))) return null
  return path
}

export function canAccessData(path: string, apps: AppPermissions, write: boolean): boolean {
  const [root, second, third] = path.split('/')
  if (PRIVATE_ROOTS.has(root ?? '')) return false
  if (apps.mestre) return true
  if (!root) return false
  if (root === 'master') return !write && (second === 'pessoas' || second === 'config')
  if (root === 'usuarios') return false
  if (root === 'tarefas') {
    if (apps.tarefas === true) return true
    if (apps.oradores === true) {
      if (second === 'discursos' || second === 'events') return true
      if (second === 'scale') return !write
      if (second === 'planning') return !write || third === 'oradoresPublicacoes'
    }
    return !write && apps.limpeza === true && second === 'planning'
  }
  if (root === 'limpeza') return apps.limpeza === true
  if (root === 'escala') return apps.escala === true
  if (root === 'programacao') return apps.programacao === true
  if (root === 'secretario') return apps.secretario === true || (!write && apps.limpeza === true && (second === 'publicadores' || second === 'grupos'))
  if (root === 'servicoCampo') return apps.servicoCampo === true
  if (root === 'agenda') {
    if (second === 'config') return !write
    if (second === 'documentos') return !write || Boolean(apps.tarefas || apps.limpeza || apps.oradores || apps.escala || apps.servicoCampo)
  }
  return false
}

const DOCUMENT_PERMISSIONS: Record<string, keyof AppPermissions> = {
  tarefas:'tarefas', limpeza:'limpeza', oradores:'oradores', escala:'escala', servicoCampo:'servicoCampo',
}

function documentModule(id: string, value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const module = (value as Record<string, unknown>)['modulo']
    if (typeof module === 'string') return module
  }
  return id.match(/^modulo-(tarefas|limpeza|oradores|escala|servicoCampo)-/)?.[1] ?? (id.startsWith('admin-') ? 'admin' : '')
}

export function canMutateData(path: string, method: string, value: unknown, apps: AppPermissions): boolean {
  if (apps.mestre) return true
  if (path.startsWith('agenda/documentos/')) return false
  if (path !== 'agenda/documentos') return true
  if (method !== 'PATCH' || !value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.entries(value as Record<string, unknown>).every(([id, item]) => {
    const module = documentModule(id, item)
    const permission = DOCUMENT_PERMISSIONS[module]
    if (!permission || apps[permission] !== true) return false
    if (item === null) return id.startsWith(`modulo-${module}-`)
    const record = item as Record<string, unknown>
    return id.startsWith(`modulo-${module}-`) && record['tipo'] === 'modulo'
      && typeof record['storagePath'] === 'string'
      && record['storagePath'].startsWith(`agenda/documentos/modulos/${module}/`)
  })
}

export function withoutPrivateRoots(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !PRIVATE_ROOTS.has(key)))
}

export function containsPrivateRoot(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).some(key => PRIVATE_ROOTS.has(key.split('/')[0] ?? '')))
}
