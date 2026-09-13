import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib/cjs/index.js'
import { createAvailableThemesPdf, createSchedulePdf, createThemeCatalogPdf } from '../src/modules/oradores-documents.ts'

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

test('programação vazia continua gerando uma página válida', async () => {
  await assertPdf(await createSchedulePdf({ congregation:'Noroeste', periodLabel:'2026-09', rows:[] }), 1)
})

test('catálogo e temas disponíveis paginam listas extensas', async () => {
  const catalog = Array.from({ length:45 }, (_, index) => ({ numero:index + 1, titulo:`Tema ${index + 1}`, ultimoUso:'Nunca', proximos:'—' }))
  const available = Array.from({ length:12 }, (_, index) => ({ nome:`Orador ${index + 1}`, temas:Array.from({ length:8 }, (__, theme) => ({ numero:theme + 1, titulo:`Tema disponível ${theme + 1}`, ultimoUso:'Nunca' })) }))
  await assertPdf(await createThemeCatalogPdf({ congregation:'Noroeste', rows:catalog }), 3)
  const result = await createAvailableThemesPdf({ congregation:'Noroeste', entries:available })
  assert.ok(result.pages > 1)
  assert.equal(new TextDecoder().decode(result.bytes.slice(0, 4)), '%PDF')
})
