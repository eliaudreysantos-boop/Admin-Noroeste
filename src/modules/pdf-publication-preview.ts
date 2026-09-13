function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (!value || typeof value !== 'object') return value ?? null
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonical(item)]),
  )
}

export function publicationPreviewFingerprint(value: unknown): string {
  const json = JSON.stringify(canonical(value))
  let hash = 2166136261
  for (let index = 0; index < json.length; index += 1) {
    hash ^= json.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${json.length}:${(hash >>> 0).toString(36)}`
}

export class PublicationPreviewGate {
  private fingerprint = ''

  mark(value: unknown): void {
    this.fingerprint = publicationPreviewFingerprint(value)
  }

  matches(value: unknown): boolean {
    return this.fingerprint !== '' && this.fingerprint === publicationPreviewFingerprint(value)
  }

  clear(): void {
    this.fingerprint = ''
  }
}
