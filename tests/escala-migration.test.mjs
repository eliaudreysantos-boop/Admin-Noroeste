import test from 'node:test'
import assert from 'node:assert/strict'
import { planEscalaIdMigration } from '../src/modules/escala-migration.ts'
import database from '../NAO FAZER COMMIT DESSA PASTA/oradoress2-default-rtdb-export (1).json' with { type: 'json' }

test('une disponibilidade, preserva só participa com e remapeia histórico', () => {
  const plan = planEscalaIdMigration({
    participants: {
      old1: { masterId: 'm1', active: true, onlyWithId: 'old3', capPerMonth: 2 },
      old2: { masterId: 'm1', active: false, onlyWithId: '', capPerMonth: 2 },
      old3: { masterId: 'm2', active: true },
    },
    availability: { local: { old1: { a: true }, old2: { b: true } } },
    tables: { local: { '2026-09': { slots: ['08:00'], rows: { '2026-09-01': { dow: 2, slots: { '08:00': { p1: 'old1', p2: 'old3' } } } } } } },
  })
  assert.equal(plan.canApply, true)
  assert.equal(plan.stats.duplicateProfilesMerged, 1)
  assert.deepEqual(plan.migrated.availability.local.m1, { a: true, b: true })
  assert.equal(plan.migrated.participants.m1.onlyWithId, 'm2')
  assert.deepEqual(plan.migrated.tables.local['2026-09'].rows['2026-09-01'].slots['08:00'], { p1: 'm1', p2: 'm2' })
})

test('bloqueia aplicação quando regras específicas divergem', () => {
  const plan = planEscalaIdMigration({ participants: {
    a: { masterId: 'm1', capPerMonth: 1 }, b: { masterId: 'm1', capPerMonth: 2 },
  } })
  assert.equal(plan.canApply, false)
  assert.equal(plan.conflicts[0].field, 'capPerMonth')
})

test('export real gera prévia sem modificar a origem', () => {
  const before = JSON.stringify(database.escala)
  const plan = planEscalaIdMigration(database.escala)
  assert.equal(JSON.stringify(database.escala), before)
  assert.equal(plan.stats.legacyProfiles, 57)
  assert.equal(plan.stats.duplicateProfilesMerged, 3)
  assert.ok(plan.stats.tableReferencesRemapped > 0)
  assert.ok(Object.keys(plan.migrated.participants).every(id => id.startsWith('m_')))
})
