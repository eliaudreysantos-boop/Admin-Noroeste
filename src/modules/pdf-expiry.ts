export const PDF_RETENTION_DAYS = 60
export const PDF_RETENTION_MS = PDF_RETENTION_DAYS * 24 * 60 * 60 * 1000

export function pdfExpiryTime(publishedAt: unknown): number | null {
  if (typeof publishedAt !== 'string') return null
  const time = Date.parse(publishedAt)
  return Number.isFinite(time) ? time + PDF_RETENTION_MS : null
}

export function pdfHasExpired(publishedAt: unknown, now = Date.now()): boolean {
  const expiresAt = pdfExpiryTime(publishedAt)
  return expiresAt !== null && now >= expiresAt
}
