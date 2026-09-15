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

test('pagina muitas saídas e mantém nomes e locais longos no documento', async () => {
  const assignments = Array.from({ length:50 }, (_, index) => ({ id:`a${index}`, templateId:'t', date:`2026-09-${String(index % 28 + 1).padStart(2, '0')}`, time:'08:30', location:'Salão do Reino do Bairro com nome bastante extenso', label:'Saída', leaderId:'m1' }))
  const bytes = await createFieldServicePdf({ month:'2026-09', congregation:'Noroeste', people:{ m1:{ name:'Dirigente com nome completo bastante extenso para testar quebra', whatsapp:'', sex:'M', role:'publicador', active:true, limpeza:{ grupo:null } } }, assignments })
  const pdf = await PDFDocument.load(bytes)
  assert.ok(pdf.getPageCount() > 1)
  assert.ok(pdf.getPages().every(page => Math.abs(page.getWidth() - 595.28) < 1 && Math.abs(page.getHeight() - 841.89) < 1))
})
