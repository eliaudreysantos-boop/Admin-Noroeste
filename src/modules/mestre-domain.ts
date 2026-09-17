import type { MasterPessoa, RawPessoas, RawUsuarios } from '../types'

export function createMasterId(randomUuid = crypto.randomUUID()): string {
  return `m_${randomUuid.replace(/-/g, '')}`
}

export function normalizeWhatsapp(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.startsWith('55') ? digits : `55${digits}`
}

export function sharedWhatsappPeople(
  people: RawPessoas,
  whatsapp: string,
  currentMasterId: string | null,
): Array<[string, MasterPessoa]> {
  if (!whatsapp) return []
  return Object.entries(people).filter(([masterId, person]) => (
    masterId !== currentMasterId && person.whatsapp === whatsapp
  ))
}

export function personalUserConflict(
  users: RawUsuarios,
  masterId: string,
  currentUid: string | null,
): boolean {
  if (!masterId) return false
  return Object.entries(users).some(([uid, user]) => (
    uid !== currentUid && user.ativo && user.masterId === masterId
  ))
}

export function stableUserMasterId(
  currentUser: RawUsuarios[string] | undefined,
  requestedMasterId: string,
  people: RawPessoas,
): string {
  const currentMasterId = currentUser?.masterId?.trim() ?? ''
  return currentMasterId && people[currentMasterId] ? currentMasterId : requestedMasterId
}

export function masterIdReferencePaths(value: unknown, masterId: string): string[] {
  const paths: string[] = []
  const visited = new WeakSet<object>()

  const visit = (current: unknown, path: string): void => {
    if (current === masterId) {
      paths.push(path)
      return
    }
    if (!current || typeof current !== 'object') return
    if (visited.has(current)) return
    visited.add(current)
    Object.entries(current as Record<string, unknown>).forEach(([key, child]) => {
      visit(child, path ? `${path}/${key}` : key)
    })
  }

  visit(value, '')
  return paths
}

export function sanitizeFailureReportValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[omitido: profundidade maxima]'
  if (Array.isArray(value)) {
    return value.slice(0, 40).map(item => sanitizeFailureReportValue(item, depth + 1))
  }
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => (
      /senha|password|whatsapp|telefone|phone/i.test(key)
        ? []
        : [[key, sanitizeFailureReportValue(item, depth + 1)]]
    )),
  )
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function linkIssueSource(
  data: Record<string, unknown>,
  module: string,
  id: string,
): { path: string; record: unknown } {
  const tarefas = objectValue(data['tarefas'])
  const escala = objectValue(data['escala'])
  const servicoCampo = objectValue(data['servicoCampo'])
  const usuarios = objectValue(data['usuarios'])

  if (module === 'Serviço de Campo') {
    const [periodId, assignmentId] = id.split('/')
    if (assignmentId) {
      const periods = objectValue(servicoCampo['periods'])
      const period = objectValue(periods[periodId ?? ''])
      return {
        path: `servicoCampo/periods/${periodId}/assignments/${assignmentId}`,
        record: objectValue(period['assignments'])[assignmentId],
      }
    }
    return { path: `servicoCampo/leaders/${id}`, record: objectValue(servicoCampo['leaders'])[id] }
  }
  const sources: Record<string, { path: string; record: unknown }> = {
    Tarefas: { path: `tarefas/people/${id}`, record: objectValue(tarefas['people'])[id] },
    Escala: { path: `escala/participants/${id}`, record: objectValue(escala['participants'])[id] },
    Usuários: { path: `usuarios/${id}`, record: usuarios[id] },
  }
  return sources[module] ?? { path: 'desconhecido', record: null }
}
