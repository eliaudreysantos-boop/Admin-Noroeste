import type { AppPermissions } from '../../src/types.ts'
import { canAccessData, normalizeDataPath, withoutPrivateRoots } from './data-authorization.ts'

export async function readBatch(raw: string, apps: AppPermissions, read: (path: string) => Promise<unknown>) {
  let paths: unknown
  try { paths = JSON.parse(raw) } catch { return null }
  if (!Array.isArray(paths) || !paths.length || paths.length > 32) return null
  const normalized = paths.map(path => typeof path === 'string' ? normalizeDataPath(path) : null)
  if (normalized.some(path => path === null)) return null
  return Promise.all(normalized.map(async path => {
    if (!canAccessData(path!, apps, false)) return { error:'Acesso negado.', status:403 }
    try {
      const value = await read(path!)
      return { value:path ? value : withoutPrivateRoots(value) }
    } catch { return { error:'Leitura indisponivel.', status:503 } }
  }))
}
