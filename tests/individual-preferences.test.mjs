import test from 'node:test'
import assert from 'node:assert/strict'
import { agendaCacheNeedsSync, agendaUiStorageKey, defaultAgendaUiPreferences, parseAgendaUiPreferences } from '../src/modules/individual-preferences.ts'

test('preferencias invalidas voltam a padroes seguros', () => {
  const parsed = parseAgendaUiPreferences(JSON.stringify({
    screen:'inexistente',
    personal:{ month:'2026-99', source:'outro', status:'errado', view:'grade', openPanels:['calendar', 'desconhecido'] },
    general:{ selectedDate:'amanha' },
    board:{ subscriptionModules:['tarefas', 'inexistente', 'tarefas'] },
  }), '2026-09')
  assert.equal(parsed.screen, 'agenda')
  assert.equal(parsed.personal.month, '2026-09')
  assert.deepEqual(parsed.personal.openPanels, ['calendar'])
  assert.equal(parsed.general.selectedDate, '')
  assert.equal(parsed.board.subscriptionModules, undefined)
})

test('json corrompido e valor excessivo nao quebram a agenda', () => {
  assert.deepEqual(parseAgendaUiPreferences('{', '2026-09'), defaultAgendaUiPreferences('2026-09'))
  assert.deepEqual(parseAgendaUiPreferences('x'.repeat(20_001), '2026-09'), defaultAgendaUiPreferences('2026-09'))
})

test('preferencias ficam isoladas por pessoa e contexto', () => {
  assert.notEqual(agendaUiStorageKey('pessoa-a', 'standalone'), agendaUiStorageKey('pessoa-b', 'standalone'))
  assert.notEqual(agendaUiStorageKey('pessoa-a', 'standalone'), agendaUiStorageKey('pessoa-a', 'admin'))
})


test('cache ausente, inválido, futuro ou vencido exige sincronização', () => {
  const now = 2_000_000
  assert.equal(agendaCacheNeedsSync(undefined, now, 1000), true)
  assert.equal(agendaCacheNeedsSync('inválido', now, 1000), true)
  assert.equal(agendaCacheNeedsSync(now + 1, now, 1000), true)
  assert.equal(agendaCacheNeedsSync(now - 1000, now, 1000), true)
  assert.equal(agendaCacheNeedsSync(now - 999, now, 1000), false)
})
