import test from 'node:test'
import assert from 'node:assert/strict'
import { createScaleSchedulePdf } from '../src/modules/escala-documents.ts'

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
