import test from 'node:test'
import assert from 'node:assert/strict'
import { createS140Docx, createS140Pdf, createS89 } from '../src/modules/programacao-documents.ts'

const people = [{ id: 'p1', masterId: 'm1', name: 'Maria Silva', whatsapp: '', sex: 'feminino', role: 'publicador', active: true, permissions: ['iniciando-conversas'] }]
const program = { id: '2026-09-09', meetingDate: '2026-09-09', bibleReading: 'ISAÍAS 1-2', parts: [
  { id: '2026-09-09-1', section: 'tesouros', title: 'Discurso', durationMinutes: 10 },
  { id: '2026-09-09-4', section: 'ministerio', title: 'Iniciando conversas', durationMinutes: 3, assignedPersonId: 'p1', roomId: 'main' },
] }

test('gera S-89 e S-140 como PDFs reais', async () => {
  const s89 = await createS89(program, people)
  const s140 = await createS140Pdf([program], 'Noroeste', people)
  assert.equal(s89.count, 1)
  assert.equal(new TextDecoder().decode(s89.bytes.slice(0, 4)), '%PDF')
  assert.equal(new TextDecoder().decode(s140.slice(0, 4)), '%PDF')
})

test('gera S-140 como DOCX verdadeiro', async () => {
  const blob = await createS140Docx([program], 'Noroeste', people)
  const bytes = new Uint8Array(await blob.arrayBuffer())
  assert.equal(String.fromCharCode(bytes[0], bytes[1]), 'PK')
  assert.ok(bytes.length > 1000)
})
