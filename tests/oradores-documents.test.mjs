import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument, PDFArray, decodePDFRawStream } from 'pdf-lib/cjs/index.js'
import { createAvailableThemesPdf, createSchedulePdf, createThemeCatalogPdf, formatScheduleDay } from '../src/modules/oradores-documents.ts'

function assertPdf(result, expectedPages) {
  assert.equal(new TextDecoder().decode(result.bytes.slice(0, 4)), '%PDF')
  assert.equal(result.pages, expectedPages)
  return PDFDocument.load(result.bytes).then(document => assert.equal(document.getPageCount(), expectedPages))
}

test('gera programação de oradores em uma A4 quando local e saída cabem', async () => {
  const rows = [
    { data:'2026-09-06', tipo:'discurso_local', orador:'Orador local', tema:'1 Tema local', congregacao:'Noroeste' },
    { data:'2026-09-13', tipo:'saida_orador', orador:'Orador em saída', tema:'2 Tema de saída', congregacao:'Centro' },
  ]
  await assertPdf(await createSchedulePdf({ congregation:'Noroeste', periodLabel:'2026-09', rows }), 1)
})

test('PDF mensal mostra somente o dia na coluna de data', () => {
  assert.equal(formatScheduleDay('2026-10-03'), '03')
  assert.equal(formatScheduleDay('data inválida'), 'data inválida')
})

test('programação vazia continua gerando uma página válida', async () => {
  await assertPdf(await createSchedulePdf({ congregation:'Noroeste', periodLabel:'2026-09', rows:[] }), 1)
})

test('textos extensos na programacao e catalogo permanecem dentro da A4', async () => {
  const text = 'Tema extenso para verificar a quebra de linhas e preservar a leitura '.repeat(12)
  const schedule = await createSchedulePdf({ congregation:'Teste', periodLabel:'2026-09', rows:Array.from({ length:16 }, () => ({ data:'2026-09-20', tipo:'discurso_local', orador:'Pessoa de teste', tema:text, congregacao:'Centro' })) })
  const catalog = await createThemeCatalogPdf({ congregation:'Teste', rows:Array.from({ length:23 }, (_, index) => ({ numero:index + 1, titulo:text, ultimoUso:'Nunca', proximos:'2026-09-20' })) })
  for (const result of [schedule, catalog]) {
    assert.ok(result.pages > 1)
    const document = await PDFDocument.load(result.bytes)
    for (const page of document.getPages()) {
      assert.deepEqual(page.getSize(), { width:595.28, height:841.89 })
      const contents = page.node.Contents()
      const streams = contents instanceof PDFArray ? contents.asArray().map(ref => document.context.lookup(ref)) : [contents]
      let positions = 0
      for (const stream of streams) {
        const operators = new TextDecoder().decode(decodePDFRawStream(stream).decode())
        for (const match of operators.matchAll(/1 0 0 1 ([\d.-]+) ([\d.-]+) Tm/g)) {
          const x = Number(match[1]), y = Number(match[2])
          assert.ok(x >= 42 && x <= 553.28, `x fora da pagina: ${x}`)
          assert.ok(y >= 24 && y < 810, `y fora da pagina: ${y}`)
          positions++
        }
      }
      assert.ok(positions > 0)
    }
  }
})

test('catálogo e temas disponíveis paginam listas extensas', async () => {
  const catalog = Array.from({ length:45 }, (_, index) => ({ numero:index + 1, titulo:`Tema ${index + 1}`, ultimoUso:'Nunca', proximos:'—' }))
  const available = Array.from({ length:12 }, (_, index) => ({ nome:`Orador ${index + 1}`, temas:Array.from({ length:8 }, (__, theme) => ({ numero:theme + 1, titulo:`Tema disponível ${theme + 1}`, ultimoUso:'Nunca' })) }))
  await assertPdf(await createThemeCatalogPdf({ congregation:'Noroeste', rows:catalog }), 3)
  const result = await createAvailableThemesPdf({ congregation:'Noroeste', entries:available })
  assert.ok(result.pages > 1)
  assert.equal(new TextDecoder().decode(result.bytes.slice(0, 4)), '%PDF')
})
