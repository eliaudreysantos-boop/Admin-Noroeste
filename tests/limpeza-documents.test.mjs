import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument, PDFArray, decodePDFRawStream } from 'pdf-lib/cjs/index.js'
import { createCleaningPdf } from '../src/modules/limpeza-documents.ts'
import { generateCleaningPeriod } from '../src/modules/limpeza-domain.ts'

const groups = Object.fromEntries([1, 2, 3, 4].map(group => [group, {
  nome: group === 3 ? 'Nome de grupo excepcionalmente comprido para testar encaixe' : `Grupo ${group}`,
  superintendenteMid: '', ajudantesMid: [],
}]))
const period = generateCleaningPeriod('2026-09-01', 'bimester', {
  ativa: true, grupos: 4, inicioRotacao: '2026-09-02', gruposConfig: groups,
}, { meiaDeSemana: { diaSemana: 3, horario: '19:00' }, fimDeSemana: { diaSemana: 0, horario: '18:00' } }, {}, 'Noroeste', '2026-09-01T12:00:00Z')

test('gera PDF A4 tabular em uma página com fonte legível', async () => {
  const result = await createCleaningPdf(period, { requestedFontSize: 22 })
  assert.equal(new TextDecoder().decode(result.bytes.slice(0, 4)), '%PDF')
  assert.equal(result.pages, 1)
  assert.ok(result.effectiveFontSize <= 11)
  assert.ok(result.effectiveFontSize >= 8)
  const document = await PDFDocument.load(result.bytes)
  assert.equal(document.getPageCount(), 1)
  const { width, height } = document.getPage(0).getSize()
  assert.ok(Math.abs(width - 595.28) < 0.1)
  assert.ok(Math.abs(height - 841.89) < 0.1)
  assert.ok(height > width)
})

test('divisorias ficam fora da altura dos textos inclusive em grupos com duas linhas', async () => {
  const result = await createCleaningPdf(period, { requestedFontSize:15 })
  const pdf = await PDFDocument.load(result.bytes)
  for (const page of pdf.getPages()) {
    const contents = page.node.Contents()
    const streams = contents instanceof PDFArray ? contents.asArray().map(ref => pdf.context.lookup(ref)) : [contents]
    const ops = streams.map(stream => new TextDecoder().decode(decodePDFRawStream(stream).decode())).join('\n')
    const rules = [...ops.matchAll(/([\d.-]+) ([\d.-]+) m\s+([\d.-]+) ([\d.-]+) l/g)]
      .filter(match => match[2] === match[4]).map(match => Number(match[2]))
    assert.ok(rules.length >= period.semanas.length)
    let checked = 0
    for (const text of ops.matchAll(/BT([\s\S]*?)ET/g)) {
      const font = /([\d.]+) Tf/.exec(text[1])
      const position = /1 0 0 1 ([\d.-]+) ([\d.-]+) Tm/.exec(text[1])
      if (!font || !position) continue
      checked++
      const baseline = Number(position[2]), size = Number(font[1])
      assert.ok(rules.every(y => y < baseline - 2 || y > baseline + size), 'line overlaps text')
    }
    assert.ok(checked > 0)
  }
})
