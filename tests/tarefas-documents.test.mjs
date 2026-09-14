import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib/cjs/index.js'
import { createTaskSchedulePdf } from '../src/modules/tarefas-documents.ts'

test('Tarefas gera PDF real em A4 retrato com linhas de escala', async () => {
  const meetings = [{ date:'2026-09-12', type:'weekend', assignments:{ presidente:'p1', operador1:'p2', operador2:'p3', leitor:'p4', entrada:'p5', auditorio:'p6', mic1:'p7', mic2:'p8' } }]
  const people = Object.fromEntries(Array.from({ length:8 }, (_, index) => [`p${index + 1}`, { name:`Pessoa ${index + 1}` }]))
  const result = await createTaskSchedulePdf(meetings, 'Noroeste', people, 14)
  assert.equal(Buffer.from(result.bytes).subarray(0, 4).toString(), '%PDF')
  assert.equal(result.pages, 1)
  assert.ok(result.effectiveFontSize >= 7)
  const pdf = await PDFDocument.load(result.bytes)
  const { width, height } = pdf.getPage(0).getSize()
  assert.ok(Math.abs(width - 595.28) < 0.1)
  assert.ok(Math.abs(height - 841.89) < 0.1)
  assert.ok(height > width)
})
