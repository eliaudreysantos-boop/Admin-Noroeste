import { getStore } from '@netlify/blobs'
import { adminDatabase } from '../lib/subscription-store.ts'
import { pdfHasExpired } from '../../src/modules/pdf-expiry.ts'
import { canReadPublicStoragePath, validStoragePath } from './storage-file.ts'

const PREFIX = 'agenda/documentos/'
const STORE = 'admin-noroeste-pdfs'
const MAX_PER_RUN = 40
const row = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

function documentPath(document: Record<string, unknown>): string | null {
  const direct = document['storagePath']
  if (typeof direct === 'string' && validStoragePath(direct) && canReadPublicStoragePath(direct)) return direct
  if (typeof document['url'] !== 'string') return null
  try {
    const path = new URL(document['url']).searchParams.get('path')
    return path && validStoragePath(path) && canReadPublicStoragePath(path) ? path : null
  } catch { return null }
}

export async function expirePdfs(
  now = Date.now(),
  databaseFor = adminDatabase,
  storeFor = () => getStore(STORE, { consistency:'strong' }),
): Promise<{ expired: number; deleted: number; failures: number }> {
  const db = databaseFor(), store = storeFor()
  const documentsRef = db.ref('agenda/documentos')
  const documents = row((await documentsRef.get()).val())
  let expired = 0, deleted = 0, failures = 0

  for (const [id, value] of Object.entries(documents)) {
    if (expired >= MAX_PER_RUN) break
    const document = row(value)
    if (!pdfHasExpired(document['criadoEm'], now)) continue
    expired++
    const path = documentPath(document)
    try {
      const ref = db.ref(`agenda/documentos/${id}`)
      const result = await ref.transaction(current => {
        const latest = row(current)
        return latest['criadoEm'] === document['criadoEm'] && latest['storagePath'] === document['storagePath'] && pdfHasExpired(latest['criadoEm'], now) ? null : undefined
      }, undefined, false)
      if (!result.committed) continue
      if (path) {
        // Paths are unique for published PDFs. A second reference still wins over deletion.
        const remaining = row((await documentsRef.get()).val())
        if (!Object.values(remaining).some(value => documentPath(row(value)) === path)) await store.delete(path)
      }
      deleted++
    } catch (error) {
      failures++
      console.error('PDF expiry failed:', id, error instanceof Error ? error.message : 'Unknown error')
    }
  }

  // Recover blobs left behind by a failed delete or by a superseded publication.
  let scanned = 0, orphanCandidates = 0
  const remaining = row((await documentsRef.get()).val())
  const referenced = new Set(Object.values(remaining).map(value => documentPath(row(value))).filter((path): path is string => Boolean(path)))
  for await (const page of store.list({ prefix:PREFIX, paginate:true })) {
    for (const blob of page.blobs) {
      if (scanned >= 2000 || orphanCandidates >= MAX_PER_RUN) return { expired, deleted, failures }
      scanned++
      if (referenced.has(blob.key) || !validStoragePath(blob.key) || !canReadPublicStoragePath(blob.key)) continue
      orphanCandidates++
      try {
        const metadata = await store.getMetadata(blob.key, { consistency:'strong' })
        if (metadata && pdfHasExpired(metadata.metadata?.['createdAt'], now)) {
          const latest = row((await documentsRef.get()).val())
          if (!Object.values(latest).some(value => documentPath(row(value)) === blob.key)) await store.delete(blob.key)
        }
      } catch (error) {
        failures++
        console.error('Orphan PDF expiry failed:', blob.key, error instanceof Error ? error.message : 'Unknown error')
      }
    }
  }
  return { expired, deleted, failures }
}

export default async (): Promise<void> => {
  const result = await expirePdfs()
  console.log('PDF expiry:', result)
}

export const config = { schedule:'0 3 * * *' }
