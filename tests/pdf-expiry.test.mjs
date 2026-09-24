import test from 'node:test'
import assert from 'node:assert/strict'
import { expirePdfs } from '../netlify/functions/expire-pdfs.ts'
import { pdfHasExpired } from '../src/modules/pdf-expiry.ts'

const now = Date.parse('2026-11-01T12:00:00Z')
const old = '2026-09-01T10:00:00Z'
const fresh = '2026-10-01T10:00:00Z'
const path = name => `agenda/documentos/admin/${name}.pdf`

test('prazo de cada PDF é 60 dias exatos da publicação', () => {
  assert.equal(pdfHasExpired(old, Date.parse('2026-10-31T09:59:59Z')), false)
  assert.equal(pdfHasExpired(old, Date.parse('2026-10-31T10:00:00Z')), true)
  assert.equal(pdfHasExpired(fresh, now), false)
  assert.equal(pdfHasExpired('inválida', now), false)
})

test('limpeza automática remove cadastro e arquivo vencidos, preservando novos', async () => {
  const documents = {
    old:{ criadoEm:old, storagePath:path('old') },
    fresh:{ criadoEm:fresh, storagePath:path('fresh') },
  }
  const files = new Set([path('old'), path('fresh'), path('orphan')])
  const deleted = []
  const db = { ref(refPath) {
    if (refPath === 'agenda/documentos') return { async get() { return { val:() => ({ ...documents }) } } }
    const id = refPath.split('/').at(-1)
    return { async transaction(update) {
      const next = update(documents[id] ?? null)
      if (next === undefined) return { committed:false }
      if (next === null) delete documents[id]
      return { committed:true }
    } }
  } }
  const store = {
    async delete(value) { files.delete(value); deleted.push(value) },
    async *list() { yield { blobs:[...files].map(key => ({ key })) } },
    async getMetadata(value) { return files.has(value) ? { metadata:{ createdAt:value === path('fresh') ? fresh : old } } : null },
  }
  const result = await expirePdfs(now, () => db, () => store)
  assert.deepEqual(result, { expired:1, deleted:1, failures:0 })
  assert.deepEqual(Object.keys(documents), ['fresh'])
  assert.deepEqual(deleted.sort(), [path('old'), path('orphan')].sort())
  assert.deepEqual([...files], [path('fresh')])
})
