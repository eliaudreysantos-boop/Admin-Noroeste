import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib/cjs/index.js'
import { createCleaningPdf } from '../src/modules/limpeza-documents.ts'
import { generateCleaningPeriod } from '../src/modules/limpeza-domain.ts'

const groups = Object.fromEntries([1, 2, 3, 4].map(group => [group, {
  nome: group === 3 ? 'Nome de grupo excepcionalmente comprido para testar encaixe' : `Grupo ${group}`,
  superintendenteMid: '', ajudantesMid: [], textoInstrucoes: '', aprovadoEm: '',
}]))
const period = generateCleaningPeriod('2026-09-01', 'bimester', {
  ativa: true, grupos: 4, inicioRotacao: '2026-09-02', coordenadorMid: '', textoPadrao: '', textoPadraoAprovadoEm: '', gruposConfig: groups,
}, { meiaDeSemana: { diaSemana: 3, horario: '19:00' }, fimDeSemana: { diaSemana: 0, horario: '18:00' } }, {}, 'Noroeste', '2026-09-01T12:00:00Z')

test('gera PDF A4 real em uma página e reduz fonte quando necessário', async () => {
  const result = await createCleaningPdf(period, { requestedFontSize: 22 })
  assert.equal(new TextDecoder().decode(result.bytes.slice(0, 4)), '%PDF')
  assert.equal(result.pages, 1)
  assert.ok(result.effectiveFontSize < 22)
  const document = await PDFDocument.load(result.bytes)
  assert.equal(document.getPageCount(), 1)
  const { width, height } = document.getPage(0).getSize()
  assert.ok(Math.abs(width - 595.28) < 0.1)
  assert.ok(Math.abs(height - 841.89) < 0.1)
})
