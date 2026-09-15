import test from 'node:test'
import assert from 'node:assert/strict'
import { createScaleSchedulePdf } from '../src/modules/escala-documents.ts'
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

test('muitos horarios e nomes extensos paginam sem sair dos limites da A4', async () => {
  const slots = Array.from({ length:20 }, (_, i) => `${String(i).padStart(2,'0')}:00`)
  const rows = Object.fromEntries(Array.from({ length:30 }, (_, i) => [`2026-09-${String(i+1).padStart(2,'0')}`, { dow:i%7, slots:Object.fromEntries(slots.map(time => [time,{ p1:'a', p2:'b' }])) }]))
  const result = await createScaleSchedulePdf({ month:'2026-09', locals:{ l1:{ slots, daysActive:[0,1,2,3,4,5,6] } }, tables:{ l1:{ '2026-09':{ slots,rows } } }, participants:{ a:{ name:'Pessoa de exemplo com sobrenome bastante extenso para verificacao' }, b:{ name:'Segunda pessoa com nome completo para verificacao da impressao' } }, exclusions:[], requestedFontPt:18 })
  assert.ok(result.pages >= 8)
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
        assert.ok(Number(match[2]) >= 20 && Number(match[2]) <= 560)
        count++
      }
    }
    assert.ok(count > 0)
  }
})
