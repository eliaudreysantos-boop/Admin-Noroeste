import test from 'node:test'
import assert from 'node:assert/strict'
import { PublicationPreviewGate, publicationPreviewFingerprint } from '../src/modules/pdf-publication-preview.ts'

test('fingerprint da previa independe da ordem das chaves', () => {
  assert.equal(
    publicationPreviewFingerprint({ periodo:'2026-09', dados:{ b:2, a:1 } }),
    publicationPreviewFingerprint({ dados:{ a:1, b:2 }, periodo:'2026-09' }),
  )
})

test('qualquer alteracao invalida a previa publicada', () => {
  const gate = new PublicationPreviewGate()
  const original = { periodo:'2026-09', fonte:14, linhas:['A', 'B'] }
  assert.equal(gate.matches(original), false)
  gate.mark(original)
  assert.equal(gate.matches(original), true)
  assert.equal(gate.matches({ ...original, fonte:15 }), false)
  assert.equal(gate.matches({ ...original, linhas:['A', 'C'] }), false)
  gate.clear()
  assert.equal(gate.matches(original), false)
})
