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
    uid !== currentUid && user.apps.individual === true && user.masterId === masterId
  ))
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
  const secretario = objectValue(data['secretario'])
  const programacao = objectValue(data['programacao'])
  const escala = objectValue(data['escala'])
  const usuarios = objectValue(data['usuarios'])
  const discursos = objectValue(tarefas['discursos'])

  if (module === 'Secretário') {
    const publicadores = objectValue(secretario['publicadores'])
    if (id in publicadores) return { path: `secretario/publicadores/${id}`, record: publicadores[id] }
    const pessoas = objectValue(secretario['pessoas'])
    return { path: `secretario/pessoas/${id}`, record: pessoas[id] }
  }
  if (module === 'Programação') {
    const pessoas = objectValue(programacao['pessoas'])
    if (id in pessoas) return { path: `programacao/pessoas/${id}`, record: pessoas[id] }
    const people = objectValue(programacao['people'])
    return { path: `programacao/people/${id}`, record: people[id] }
  }
  const sources: Record<string, { path: string; record: unknown }> = {
    Tarefas: { path: `tarefas/people/${id}`, record: objectValue(tarefas['people'])[id] },
    Escala: { path: `escala/participants/${id}`, record: objectValue(escala['participants'])[id] },
    Oradores: { path: `tarefas/discursos/oradores/${id}`, record: objectValue(discursos['oradores'])[id] },
    Usuários: { path: `usuarios/${id}`, record: usuarios[id] },
  }
  return sources[module] ?? { path: 'desconhecido', record: null }
}
