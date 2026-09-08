import test from 'node:test'
import assert from 'node:assert/strict'
import {
  activeDates, analyzeCell, availabilityKey, generateAll, generateLocal,
  isBlocked, localSlots, pairRule, participantDirectoryForHistory, validatePair,
} from '../src/modules/escala-domain.ts'
import {
  assignmentsForPerson, confirmationMessage, personMessage,
} from '../src/modules/escala-output.ts'
import realDatabase from '../NAO FAZER COMMIT DESSA PASTA/escala - TPL/src/dominio/__testes__/banco-real.json' with { type: 'json' }
import { gerarComOAlgoritmoAntigo } from '../NAO FAZER COMMIT DESSA PASTA/escala - TPL/src/dominio/__testes__/legado.ts'

const person = (overrides = {}) => ({ name: 'Pessoa', sex: 'M', active: true, pioneer: false, withChild: false, sameSexOnly: false, onlyWithId: '', capPerMonth: 0, startFromDate: '', refFolgaDate: '', ...overrides })
const local = { name: 'Praça', daysActive: [4], slots: ['08:00', '10:00'], stepMinutes: 120, sortOrder: 1 }
const available = (...ids) => ({ l1: Object.fromEntries(ids.map(id => [id, { '4|08:00': true, '4|10:00': true }])) })
const base = (participants, extra = {}) => ({ month: '2026-09', localId: 'l1', local, participants, availability: available(...Object.keys(participants)), tables: {}, blocks: {}, exclusions: [], ...extra })

test('calendário usa dias ativos e respeita exceções', () => {
  const dates = activeDates('2026-09', [4], ['2026-09-10'])
  assert.deepEqual(dates, ['2026-09-03', '2026-09-17', '2026-09-24'])
})

test('histórico usa snapshot apenas como fallback e mantém cadastro atual como prioridade', () => {
  const directory = participantDirectoryForHistory(
    { m1: person({ name: 'Nome atual' }) },
    { '2026-08': { participants: { antigo: person({ name: 'Nome histórico' }), m1: person({ name: 'Nome antigo' }) } } },
  )
  assert.equal(directory.antigo.name, 'Nome histórico')
  assert.equal(directory.m1.name, 'Nome atual')
})

test('horários rejeitam intervalo inválido sem entrar em repetição', () => {
  assert.deepEqual(localSlots({ startTime: '18:00', endTime: '08:00', stepMinutes: 120 }), [])
  assert.deepEqual(localSlots({ startTime: '08:00', endTime: '18:00', stepMinutes: -15 }), [])
})

test('bloqueio persistente e mensal impedem o horário', () => {
  assert.equal(isBlocked({ __persist__: { l1: ['4|08:00'] } }, '2026-09', 'l1', 4, '08:00'), true)
  assert.equal(isBlocked({ '2026-09': { __all__: ['4|10:00'] } }, '2026-09', 'l1', 4, '10:00'), true)
})

test('regras de dupla validam criança, sexo e parceiro obrigatório', () => {
  assert.equal(pairRule('a', person({ withChild: true }), 'b', person({ withChild: true })), 'duas_criancas')
  assert.equal(pairRule('a', person({ sex: 'M', sameSexOnly: true }), 'b', person({ sex: 'F' })), 'mesmo_sexo')
  assert.equal(pairRule('a', person({ onlyWithId: 'c' }), 'b', person()), 'so_com')
})

test('inativo, início, folga, teto e disponibilidade barram a pessoa', () => {
  const participants = {
    inactive: person({ active: false }), late: person({ startFromDate: '2026-10-01' }),
    off: person({ refFolgaDate: '2026-09-02' }), capped: person({ capPerMonth: 1 }), unavailable: person(), ok: person(),
  }
  const tables = { l2: { '2026-09': { slots: ['08:00'], rows: { '2026-09-01': { dow: 2, slots: { '08:00': { p1: 'capped', p2: '' } } } } } } }
  const input = base(participants, { tables, availability: available('inactive', 'late', 'off', 'capped', 'ok') })
  const analysis = analyzeCell(input, '2026-09-03', '08:00')
  const rules = Object.fromEntries(analysis.blocked.map(item => [item.id, item.rule]))
  assert.equal(rules.inactive, 'inativo'); assert.equal(rules.late, 'antes_de_iniciar')
  assert.equal(rules.off, 'folga'); assert.equal(rules.capped, 'teto'); assert.equal(rules.unavailable, 'sem_disponibilidade')
})

test('não repete no dia, horário vizinho ou outro local', () => {
  const participants = { a: person(), b: person(), c: person() }
  const existing = { l1: { '2026-09': { slots: ['08:00', '10:00'], rows: { '2026-09-03': { dow: 4, slots: { '08:00': { p1: 'a', p2: 'b' }, '10:00': { p1: '', p2: '' } } } } } }, l2: { '2026-09': { slots: ['08:00'], rows: { '2026-09-10': { dow: 4, slots: { '08:00': { p1: 'c', p2: '' } } } } } } }
  let analysis = analyzeCell(base(participants, { tables: existing }), '2026-09-03', '10:00')
  assert.equal(analysis.blocked.find(item => item.id === 'a')?.rule, 'ja_no_dia')
  analysis = analyzeCell(base(participants, { tables: existing }), '2026-09-10', '08:00')
  assert.equal(analysis.blocked.find(item => item.id === 'c')?.rule, 'outro_local')
})

test('geração equilibra e preserva edição manual', () => {
  const participants = { a: person({ name: 'A' }), b: person({ name: 'B' }), c: person({ name: 'C', pioneer: true }), d: person({ name: 'D' }) }
  const tables = { l1: { '2026-09': { slots: ['08:00', '10:00'], rows: { '2026-09-03': { dow: 4, slots: { '08:00': { p1: 'a', p2: 'b' }, '10:00': { p1: '', p2: '' } } } } } } }
  const result = generateLocal(base(participants, { tables }))
  assert.deepEqual(result.table.rows['2026-09-03'].slots['08:00'], { p1: 'a', p2: 'b' })
  assert.ok(result.summary.preserved >= 1)
})

test('mês sem candidatos retorna vazios sem alterar a entrada', () => {
  const original = {}
  const generated = generateAll({ month: '2026-09', locals: { l1: local }, participants: { a: person({ active: false }), b: person({ active: false }) }, availability: {}, tables: original, blocks: {}, exclusions: [] })
  assert.ok(generated.errors.length > 0)
  assert.deepEqual(original, {})
})

test('edição manual relata meia dupla e conflitos', () => {
  const participants = { a: person({ withChild: true }), b: person({ withChild: true }) }
  assert.ok(validatePair(base(participants), '2026-09-03', '08:00', 'a', '').includes('A dupla está incompleta'))
  assert.ok(validatePair(base(participants), '2026-09-03', '08:00', 'a', 'b').includes('Duas pessoas acompanhando criança não formam dupla'))
})

test('mensagens usam as designações e a disponibilidade registradas', () => {
  const participants = { a: person({ name: 'Ana' }), b: person({ name: 'Bia' }) }
  const tables = { l1: { '2026-09': { slots: ['08:00'], rows: { '2026-09-03': { dow: 4, slots: { '08:00': { p1: 'a', p2: 'b' } } } } } } }
  const assignments = assignmentsForPerson('a', '2026-09', tables, { l1: local }, participants)
  assert.match(personMessage('', participants.a, '2026-09', assignments), /Bia/)
  assert.match(confirmationMessage('', 'a', participants.a, { l1: local }, available('a')), /quinta: 08:00, 10:00/)
  assert.equal(availabilityKey(4, '08:00'), '4|08:00')
})

test('resultado coincide com o algoritmo antigo no banco real', () => {
  const months = [...new Set(Object.values(realDatabase.tables).flatMap(byMonth => Object.keys(byMonth)))].sort()
  const ordered = Object.keys(realDatabase.scales).sort((a, b) => realDatabase.scales[a].sortOrder - realDatabase.scales[b].sortOrder)
  const flatten = rows => Object.fromEntries(Object.entries(rows ?? {}).flatMap(([date, row]) => Object.entries(row.slots ?? {}).filter(([, cell]) => cell.p1 || cell.p2).map(([time, cell]) => [`${date} ${time}`, [cell.p1, cell.p2].sort().join('+')])))
  for (const month of months) {
    let generatedTables = Object.fromEntries(ordered.map(id => [id, { [month]: { rows: {}, slots: [] } }]))
    const legacyState = { participants: realDatabase.participants, scales: realDatabase.scales, availability: realDatabase.availability, monthSlotBlocks: realDatabase.monthSlotBlocks, monthExclusions: realDatabase.monthExclusions, tables: structuredClone(generatedTables) }
    for (const localId of ordered) {
      const result = generateLocal({ month, localId, local: realDatabase.scales[localId], participants: realDatabase.participants, availability: realDatabase.availability, tables: generatedTables, blocks: realDatabase.monthSlotBlocks, exclusions: realDatabase.monthExclusions[month] ?? [] })
      generatedTables = { ...generatedTables, [localId]: { [month]: result.table } }
      const legacy = gerarComOAlgoritmoAntigo(month, localId, legacyState)
      legacyState.tables[localId][month] = legacy
      const legacyRows = Object.fromEntries(legacy.rows.map(row => [row.date, row]))
      assert.deepEqual(flatten(result.table.rows), flatten(legacyRows), `${localId} em ${month}`)
    }
  }
})
