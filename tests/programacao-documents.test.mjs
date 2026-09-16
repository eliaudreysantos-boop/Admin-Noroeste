import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib/cjs/index.js'
import { createS140Docx, createS140Pdf, createS89, createS89Batch, paginateS140, documentPartTitle, documentPartLine, personIdForDocument } from '../src/modules/programacao-documents.ts'

const people = [{ id: 'p1', masterId: 'm1', name: 'Maria Silva', whatsapp: '', sex: 'feminino', role: 'publicador', active: true, permissions: ['iniciando-conversas'] }]
const program = { id: '2026-09-09', meetingDate: '2026-09-09', bibleReading: 'ISAÍAS 1-2', parts: [
  { id: '2026-09-09-1', section: 'tesouros', title: 'Discurso', durationMinutes: 10 },
  { id: '2026-09-09-4', section: 'ministerio', title: 'Iniciando conversas', durationMinutes: 3, assignedPersonId: 'p1', roomId: 'main' },
] }

test('numeracao impressa exclui IDs manuais e legados', () => {
  assert.equal(documentPartLine({ id: 'manual-presidente', title: 'Presidente', section: 'tesouros', durationMinutes: 1 }), 'Presidente')
  assert.equal(documentPartLine(program.parts[1]), '4. Iniciando conversas (3 min.)')
  assert.equal(documentPartTitle(program.parts[1]), '4. Iniciando conversas')
  assert.equal(documentPartTitle({ id: '2026-11-04-manual-presidente', title: 'Presidente' }), 'Presidente')
  assert.equal(documentPartTitle({ id: 'legacy-assignment-542', title: 'Leitura da Bíblia' }), 'Leitura da Bíblia')
  assert.equal(documentPartTitle({ id: 'legacy-1-oracao-final', title: 'Oração final' }), 'Oração final')
})

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

test('S-89 em lote distribui cinco cartoes em duas A4 sem perder o excedente', async () => {
  const template = new Uint8Array(await readFile(new URL('../public/templates/S-89_T.pdf', import.meta.url)))
  const batch = { ...program, parts: Array.from({ length: 5 }, (_, i) => ({ ...program.parts[1], id: `2026-09-09-${i + 4}` })) }
  const result = await createS89Batch([batch], people, template)
  const pdf = await PDFDocument.load(result.bytes)
  assert.equal(result.count, 5)
  assert.equal(pdf.getPageCount(), 2)
  assert.equal(pdf.getPages()[0].getWidth(), 595.28)
  assert.equal((await createS89Batch([], people, template)).count, 0)
})

test('S-140 extenso preserva todas as partes e respeita capacidade de cada bloco', async () => {
  const large = { ...program, parts: Array.from({ length: 75 }, (_, i) => ({ ...program.parts[0], id: `2026-09-09-${i + 1}`, title: `Parte ${i + 1}` })) }
  const pages = paginateS140([large])
  const blocks = pages.flat()
  assert.equal(pages.length, 3)
  assert.ok(blocks.every(block => block.parts.length <= 18))
  assert.deepEqual(blocks.flatMap(block => block.parts), large.parts)
  assert.equal((await PDFDocument.load(await createS140Pdf([large], 'Noroeste', people))).getPageCount(), 3)
})
