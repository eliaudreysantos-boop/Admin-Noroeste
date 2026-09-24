import test from 'node:test'
import assert from 'node:assert/strict'
import { createScaleSchedulePdf, scalePrintHtml } from '../src/modules/escala-documents.ts'
import { printRowsForLocal } from '../src/modules/escala-output.ts'
import { PDFDocument, PDFArray, decodePDFRawStream } from 'pdf-lib/cjs/index.js'

test('Escala TPL gera PDF real e preserva as duplas', async () => {
  const result = await createScaleSchedulePdf({
    month:'2026-09', requestedFontPt:12, exclusions:[],
    locals:{ l1:{ name:'Praça', active:true, daysActive:[4], slots:['08:00'], sortOrder:0 } },
    participants:{ p1:{ name:'Ana' }, p2:{ name:'Bia' } },
    tables:{ l1:{ '2026-09':{ slots:['08:00'], rows:{ '2026-09-03':{ dow:4, slots:{ '08:00':{ p1:'p1', p2:'p2' } } } } } } },
  })
  assert.equal(Buffer.from(result.bytes).subarray(0, 4).toString(), '%PDF')
  assert.equal(result.pages, 1)
})

test('impressao usa as datas e horarios gravados mesmo depois de alterar o local', async () => {
  const local = { daysActive:[0], slots:['18:00'], active:false }
  const tables = { l1:{ '2026-09':{ slots:['08:00'], rows:{ '2026-09-03':{ dow:4, slots:{ '08:00':{ p1:'a', p2:'b' } } } } } } }
  assert.deepEqual(printRowsForLocal('l1','2026-09',local,tables,{ a:{ name:'Ana' }, b:{ name:'Bia' } },['2026-09-03']), [{ date:'2026-09-03', cells:[['Ana','Bia']] }])
  const result = await createScaleSchedulePdf({ month:'2026-09', locals:{ l1:local }, tables, participants:{ a:{ name:'Ana' }, b:{ name:'Bia' } }, exclusions:[], requestedFontPt:12 })
  assert.equal(result.pages, 1)
})

test('PDF e impressão ignoram local sem designações, sem gerar página vazia', async () => {
  const input = {
    month:'2026-09', requestedFontPt:12, exclusions:[],
    locals:{ filled:{ name:'Praça', slots:['08:00'] }, empty:{ name:'Shopping', slots:['08:00'], daysActive:[4] } },
    participants:{ a:{ name:'Ana' } },
    tables:{ filled:{ '2026-09':{ slots:['08:00'], rows:{ '2026-09-03':{ slots:{ '08:00':{ p1:'a', p2:'' } } } } } } },
  }
  assert.equal((await createScaleSchedulePdf(input)).pages, 1)
  assert.match(scalePrintHtml(input), /Praça/)
  assert.doesNotMatch(scalePrintHtml(input), /Shopping/)
})

test('PDF da TPL recusa participante sem nome e período sem designações', async () => {
  const input = { month:'2026-09', requestedFontPt:12, exclusions:[], locals:{ l:{ name:'Praça', slots:['08:00'] } }, participants:{ ghost:{ name:'ghost' } }, tables:{ l:{ '2026-09':{ slots:['08:00'], rows:{ '2026-09-03':{ slots:{ '08:00':{ p1:'ghost', p2:'' } } } } } } } }
  await assert.rejects(createScaleSchedulePdf(input), /participante sem nome cadastrado \(ghost\)/)
  await assert.rejects(createScaleSchedulePdf({ ...input, tables:{} }), /Nenhuma designação/)
})

test('quatro escalas com sete horarios e 17 datas ocupam quatro folhas A4', async () => {
  const slots = ['06:00','08:00','10:00','12:00','14:00','16:00','18:00']
  const rows = Object.fromEntries(Array.from({ length:17 }, (_, i) => [`2026-09-${String(i+1).padStart(2,'0')}`, { slots:{ '08:00':{ p1:'a', p2:'b' }, '18:00':{ p1:'b', p2:'a' } } }]))
  const locals = Object.fromEntries(['l1','l2','l3','l4'].map(id => [id, { name:id, active:true, slots }]))
  const tables = Object.fromEntries(Object.keys(locals).map(id => [id, { '2026-09':{ slots, rows } }]))
  const result = await createScaleSchedulePdf({ month:'2026-09', locals, tables, participants:{ a:{ name:'Pessoa com sobrenome bastante extenso' }, b:{ name:'Segunda pessoa com nome completo' } }, exclusions:[], requestedFontPt:18 })
  assert.equal(result.pages, 4)
  const pdf = await PDFDocument.load(result.bytes)
  for (const page of pdf.getPages()) {
    assert.deepEqual(page.getSize(), { width:841.89, height:595.28 })
    const contents = page.node.Contents()
    const streams = contents instanceof PDFArray ? contents.asArray().map(ref => pdf.context.lookup(ref)) : [contents]
    let count = 0
    for (const stream of streams) {
      const operators = new TextDecoder().decode(decodePDFRawStream(stream).decode())
      for (const match of operators.matchAll(/1 0 0 1 ([\d.-]+) ([\d.-]+) Tm/g)) {
        assert.ok(Number(match[1]) >= 30 && Number(match[1]) <= 812)
        assert.ok(Number(match[2]) >= 30 && Number(match[2]) <= 566)
        count++
      }
    }
    assert.ok(count > 0)
  }
})

test('conteudo impossivel de acomodar nao e cortado nem cria folhas extras', async () => {
  const slots = Array.from({ length:20 }, (_, i) => `${String(i).padStart(2,'0')}:00`)
  const rows = Object.fromEntries(Array.from({ length:30 }, (_, i) => [`2026-09-${String(i+1).padStart(2,'0')}`, { slots:Object.fromEntries(slots.map(time => [time,{ p1:'a', p2:'b' }])) }]))
  await assert.rejects(createScaleSchedulePdf({ month:'2026-09', locals:{ l1:{ slots } }, tables:{ l1:{ '2026-09':{ slots, rows } } }, participants:{ a:{ name:'Nome muito extenso '.repeat(20) }, b:{ name:'Outro nome extenso '.repeat(20) } }, exclusions:[], requestedFontPt:12 }), /não cabe em uma folha/)
})
