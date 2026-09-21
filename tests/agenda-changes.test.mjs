import test from 'node:test'
import assert from 'node:assert/strict'
import { parseAgendaHistory, updateAgendaHistory } from '../src/modules/agenda-changes.ts'
test('histórico corrompido é descartado com segurança', () => {
  for (const raw of ['{', '{"events":[],"changes":[null]}', '{"events":[{}],"changes":[]}']) assert.equal(parseAgendaHistory(raw), null)
})
const event = { id:'a', source:'tarefas', date:'2026-09-25', title:'Entrada', detail:'Reunião', status:'futuro' }
const update = (previous, events) => updateAgendaHistory(previous, events, '2026-09-21T12:00:00Z', '2026-09-21')
test('primeira sincronização é referência, e repetições não duplicam histórico', () => {
  const first = update(null, [event])
  assert.deepEqual(first.changes, [])
  const changed = update(first, [{ ...event, time:'19:00' }])
  assert.equal(changed.changes[0].kind, 'alterado')
  assert.equal(update(changed, changed.events).changes.length, 1)
})
test('retirada preserva descrição sem gerar evento ICS; passado não gera alerta', () => {
  const result = update(update(null, [event, { ...event, id:'old', date:'2026-09-01' }]), [])
  assert.deepEqual(result.events, [])
  assert.equal(result.changes.length, 1)
  assert.equal(result.changes[0].kind, 'retirado')
  assert.equal(result.changes[0].before.title, 'Entrada')
})
test('novos eventos e retorno de compromisso ficam registrados', () => {
  const removed = update(update(null, [event]), [])
  assert.equal(update(removed, [event]).changes[0].kind, 'adicionado')
})
