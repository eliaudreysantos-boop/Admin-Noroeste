import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib/cjs/index.js'
import { createSpeakersSchedulePdf, speakersPdfScheduleRows } from '../src/modules/oradores-documents.ts'

test('saídas incluem o mês selecionado e todos os meses seguintes', () => {
  const rows = speakersPdfScheduleRows({ month:'2026-09', schedule:[
    { data:'2026-08-30', tipo:'saida_orador', status:'confirmado' },
    { data:'2026-09-01', tipo:'saida_orador', status:'confirmado' },
    { data:'2026-11-15', tipo:'saida_orador', status:'confirmado' },
    { data:'2026-11-20', tipo:'discurso_local', status:'confirmado' },
  ] })
  assert.deepEqual(rows.outgoing.map(item => item.data), ['2026-09-01', '2026-11-15'])
  assert.deepEqual(rows.local, [])
})

test('gera a programação de Oradores em A4 paisagem', async () => {
  const bytes = await createSpeakersSchedulePdf({
    month:'2026-09',
    speakers:{ o1:{ nome:'Orador local', tipo:'local', funcao:'anciao', telefone:'', ativo:true, temaIds:['t1'] } },
    themes:{ t1:{ numero:1, titulo:'Tema de teste com título suficientemente longo', ativo:true } },
    congregations:{ c1:{ nome:'Congregação Centro', cidade:'', tipo:'visitante', ativa:true, contato:'', telefone:'', diaReuniao:'', horario:'', localizacao:'', observacoes:'' } },
    schedule:[{ data:'2026-09-20', tipo:'saida_orador', status:'confirmado', oradorId:'o1', temaId:'t1', congregacaoDestinoId:'c1', confirmacao:{status:true,confirmadoEm:'2026-09-01'} }],
  })
  const pdf = await PDFDocument.load(bytes)
  assert.equal(pdf.getPageCount(), 1)
  const { width, height } = pdf.getPage(0).getSize()
  assert.ok(Math.abs(width - 841.89) < .1)
  assert.ok(Math.abs(height - 595.28) < .1)
})
