import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib/cjs/index.js'
import { createS140Docx, createS140Pdf, createS89, personIdForDocument } from '../src/modules/programacao-documents.ts'

const people = [{ id: 'p1', masterId: 'm1', name: 'Maria Silva', whatsapp: '', sex: 'feminino', role: 'publicador', active: true, permissions: ['iniciando-conversas'] }]
const program = { id: '2026-09-09', meetingDate: '2026-09-09', bibleReading: 'ISAÍAS 1-2', parts: [
  { id: '2026-09-09-1', section: 'tesouros', title: 'Discurso', durationMinutes: 10 },
  { id: '2026-09-09-4', section: 'ministerio', title: 'Iniciando conversas', durationMinutes: 3, assignedPersonId: 'p1', roomId: 'main' },
] }

test('gera S-89 e S-140 como PDFs reais', async () => {
  const original = structuredClone(program)
  const s89 = await createS89(program, people, new Uint8Array(await readFile(new URL('../public/templates/S-89_T.pdf', import.meta.url))))
  const s140 = await createS140Pdf([program], 'Noroeste', people)
  assert.equal(s89.count, 1)
  assert.equal(new TextDecoder().decode(s89.bytes.slice(0, 4)), '%PDF')
  assert.equal(new TextDecoder().decode(s140.slice(0, 4)), '%PDF')
  assert.deepEqual(program, original)
})

test('repete o template completo em todos os cartões S-89 do lote', async () => {
  const template = new Uint8Array(await readFile(new URL('../public/templates/S-89_T.pdf', import.meta.url)))
  const batch = { ...program, parts: [program.parts[1], { ...program.parts[1], id: '2026-09-09-5', title: 'Cultivando o interesse' }] }
  const result = await createS89(batch, people, template)
  assert.equal(result.count, 2)
  assert.equal((await PDFDocument.load(result.bytes)).getPageCount(), 2)
})

test('documentos priorizam realizado, depois substituto e designado', async () => {
  const template = new Uint8Array(await readFile(new URL('../public/templates/S-89_T.pdf', import.meta.url)))
  const withPeople = [...people, { ...people[0], id: 'p2', name: 'Substituta' }, { ...people[0], id: 'p3', name: 'Realizou' }]
  const completed = { ...program, parts: [{ ...program.parts[1], assignedPersonId: 'p1', substitutePersonId: 'p2', realizedPersonId: 'p3' }] }
  const s89 = await createS89(completed, withPeople, template)
  assert.equal(s89.count, 1)
  assert.equal(personIdForDocument(completed.parts[0]), 'p3')
  assert.equal(personIdForDocument({ ...completed.parts[0], realizedPersonId: undefined }), 'p2')
  assert.equal(personIdForDocument({ ...completed.parts[0], realizedPersonId: undefined, substitutePersonId: undefined }), 'p1')
})

test('gera S-140 como DOCX verdadeiro', async () => {
  const blob = await createS140Docx([program], 'Noroeste', people)
  const bytes = new Uint8Array(await blob.arrayBuffer())
  assert.equal(String.fromCharCode(bytes[0], bytes[1]), 'PK')
  assert.ok(bytes.length > 1000)
})
