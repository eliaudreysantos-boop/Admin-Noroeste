interface BackupSummary {
  pessoas: number
  usuarios: number
  modulos: number
}

export type BackupValidation =
  | { ok: true; data: Record<string, unknown>; summary: BackupSummary }
  | { ok: false; error: string }

type Row = Record<string, unknown>

const isRow = (value: unknown): value is Row => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const row = (value: unknown): Row => isRow(value) ? value : {}

function records(value: unknown): Record<string, Row> {
  return Object.fromEntries(Object.entries(row(value)).map(([id, item]) => [id, row(item)]))
}

function hasActiveAdmin(users: Record<string, Row>): boolean {
  return Object.values(users).some(user => row(user.apps).mestre === true && user.ativo === true)
}

export function validateFirebaseValue(value: unknown, path = 'raiz'): string | null {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return null
  if (typeof value === 'number') return Number.isFinite(value) ? null : `${path} contém um número inválido.`
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const error = validateFirebaseValue(value[index], `${path}[${index}]`)
      if (error) return error
    }
    return null
  }
  if (!value || typeof value !== 'object') return `${path} contém um valor incompatível.`
  for (const [key, child] of Object.entries(value as Row)) {
    if (!key || key.includes('.') || key.includes('#') || key.includes('$') || key.includes('[') || key.includes(']') || key.includes('/')) return `${path} contém uma chave inválida "${key}".`
    const error = validateFirebaseValue(child, `${path}.${key}`)
    if (error) return error
  }
  return null
}

export function validateBackup(value: unknown): BackupValidation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: 'O arquivo precisa conter a raiz completa do banco.' }
  const data = value as Row
  const master = row(data.master)
  const people = records(master.pessoas)
  const users = records(data.usuarios)
  if (!data.master || !master.pessoas) return { ok: false, error: 'O arquivo não contém master/pessoas.' }
  if (!isRow(master.pessoas) || !isRow(data.usuarios)) return { ok:false, error:'As coleções de pessoas e usuários precisam conter registros válidos.' }
  if (!data.usuarios || Object.keys(users).length === 0) return { ok: false, error: 'O arquivo não contém usuários.' }

  for (const [masterId, person] of Object.entries(people)) {
    if (typeof person.name !== 'string' || !person.name.trim() || typeof person.whatsapp !== 'string' || typeof person.active !== 'boolean') {
      return { ok: false, error: `A pessoa ${masterId} não tem a estrutura esperada.` }
    }
  }

  for (const [uid, user] of Object.entries(users)) {
    const apps = row(user.apps)
    if (typeof user.nome !== 'string' || typeof user.senha !== 'string' || typeof user.ativo !== 'boolean' || !user.apps || Array.isArray(user.apps) || typeof apps.mestre !== 'boolean') {
      return { ok: false, error: `O usuário ${uid} não tem a estrutura esperada.` }
    }
  }
  if (!hasActiveAdmin(users)) return { ok: false, error: 'O backup precisa manter ao menos um Admin ativo.' }
  const firebaseError = validateFirebaseValue(data)
  if (firebaseError) return { ok: false, error: firebaseError }
  return { ok: true, data, summary: { pessoas: Object.keys(people).length, usuarios: Object.keys(users).length, modulos: Object.keys(data).length } }
}
