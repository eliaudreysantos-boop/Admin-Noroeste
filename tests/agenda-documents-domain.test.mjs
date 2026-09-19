import test from 'node:test'
import assert from 'node:assert/strict'
import { documentCoversMonth, groupPublicDocuments, officialDocumentId, publicDocumentMonths } from '../src/modules/agenda-documents-domain.ts'

const doc = (overrides = {}) => ({ id:'x', modulo:'tarefas', tipo:'modulo', periodo:'2026-09', inicio:'2026-09-01', fim:'2026-09-30', origemPeriodoId:'2026-09', nome:'arquivo.pdf', url:'https://example.test/a.pdf', criadoEm:'2026-09-01T10:00:00.000Z', ...overrides })

test('documento bimestral fica disponível nos dois meses cobertos', () => {
  const item = doc({ periodo:'Setembro e Outubro de 2026', inicio:'2026-09-01', fim:'2026-10-31' })
  assert.equal(documentCoversMonth(item, '2026-09'), true)
  assert.equal(documentCoversMonth(item, '2026-10'), true)
  assert.equal(documentCoversMonth(item, '2026-11'), false)
  assert.deepEqual(publicDocumentMonths([item]), ['2026-10', '2026-09'])
})

test('seleção mantém apenas a versão oficial mais recente de cada módulo e separa Admin', () => {
  const grouped = groupPublicDocuments([
    doc({ id:'old', criadoEm:'2026-09-01T10:00:00.000Z' }),
    doc({ id:'new', criadoEm:'2026-09-02T10:00:00.000Z' }),
    doc({ id:'speakers', modulo:'oradores' }),
    doc({ id:'manual', modulo:'admin', tipo:'admin', nome:'comunicado.pdf' }),
    doc({ id:'secretary', modulo:'programacao' }),
  ], '2026-09')
  assert.equal(grouped.modules.tarefas?.id, 'new')
  assert.equal(grouped.modules.oradores?.id, 'speakers')
  assert.deepEqual(grouped.admin.map(item => item.id), ['manual'])
  assert.equal(Object.hasOwn(grouped.modules, 'programacao'), false)
})

test('id oficial é estável para republicação do mesmo período', () => {
  assert.equal(officialDocumentId('servicoCampo', '2026-09'), 'modulo-servicoCampo-2026-09')
  assert.equal(officialDocumentId('tarefas', '2026/09 bimestre'), officialDocumentId('tarefas', '2026/09 bimestre'))
})
