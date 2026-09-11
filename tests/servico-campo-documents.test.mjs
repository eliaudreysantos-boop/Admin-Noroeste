import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib/cjs/index.js'
import { createFieldServicePdf } from '../src/modules/servico-campo-documents.ts'

test('gera programação de Serviço de Campo em A4 retrato', async () => {
  const bytes = await createFieldServicePdf({
    month:'2026-09', congregation:'Noroeste',
    people:{ m1:{ name:'Ana', whatsapp:'', sex:'F', role:'publicador', active:true, limpeza:{ grupo:null } } },
    assignments:[{ id:'a', templateId:'t', date:'2026-09-06', time:'08:30', location:'Salão do Reino', label:'Saída', leaderId:'m1' }],
  })
  const pdf = await PDFDocument.load(bytes)
  const [width, height] = pdf.getPage(0).getSize().width ? [pdf.getPage(0).getWidth(), pdf.getPage(0).getHeight()] : [0, 0]
  assert.ok(bytes.length > 800)
  assert.ok(Math.abs(width - 595.28) < 1)
  assert.ok(Math.abs(height - 841.89) < 1)
})
