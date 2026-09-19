import test from 'node:test'
import assert from 'node:assert/strict'
import { monthBounds, normalizeSpeakersRoot, scheduleStatus, speakerPendingItems } from '../src/modules/oradores-domain.ts'

test('normaliza os registros atuais sem perder os campos principais', () => {
  const root = normalizeSpeakersRoot({
    oradores:{ o1:{ nome:'João', tipo:'local', funcao:'anciao', ativo:true, temaIds:{ tema_001:true } } },
    temas:{ tema_001:{ numero:1, titulo:'Esperança', ativo:true } },
    programacao:{ p1:{ data:'2026-09-20', tipo:'discurso_local', oradorId:'o1', confirmacao:{ status:true, confirmadoEm:'2026-09-01' } } },
  })
  assert.equal(root.oradores.o1.nome, 'João')
  assert.deepEqual(root.oradores.o1.temaIds, ['tema_001'])
  assert.equal(scheduleStatus(root.programacao.p1), 'confirmado')
})

test('pendências preservam falta de orador, tema e reconfirmação', () => {
  const root = normalizeSpeakersRoot({ programacao:{
    vazio:{ data:'2026-09-20', tipo:'discurso_local', status:'por_definir' },
    perto:{ data:'2026-09-21', tipo:'discurso_local', status:'confirmado', oradorNome:'José', temaTitulo:'Tema', confirmacao:{ status:true } },
  } })
  const pending = speakerPendingItems(root, '2026-09-19')
  assert.ok(pending.some(item => item.title === 'Sem orador'))
  assert.ok(pending.some(item => item.title === 'Sem tema'))
  assert.ok(pending.some(item => item.title.startsWith('Reconfirmar')))
})

test('limites mensais usam o calendário real', () => {
  assert.deepEqual(monthBounds('2028-02'), { start:'2028-02-01', end:'2028-02-29' })
})
