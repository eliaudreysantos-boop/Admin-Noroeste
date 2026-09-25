interface CachedUserChoice {
  nome: string
  ativo: boolean
}

export type CachedUserChoices = Record<string, CachedUserChoice>

export function sanitizeCachedUserChoices(value: unknown): CachedUserChoices {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([uid, raw]) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
      const record = raw as Record<string, unknown>
      const nome = typeof record['nome'] === 'string' ? record['nome'].trim() : ''
      if (!uid || !nome) return []
      return [[uid, { nome, ativo:record['ativo'] === true }]]
    }),
  )
}
