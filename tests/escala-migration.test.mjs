import test from 'node:test'
import assert from 'node:assert/strict'
import { planEscalaIdMigration } from '../src/modules/escala-migration.ts'
import { participantDirectoryForHistory } from '../src/modules/escala-domain.ts'

test('une disponibilidade, preserva só participa com e remapeia histórico', () => {
  const plan = planEscalaIdMigration({
    participants: {
      old1: { masterId: 'm1', active: true, onlyWithId: 'old3', capPerMonth: 2, pioneer: true, sameSexOnly: false },
      old2: { masterId: 'm1', active: false, onlyWithId: '', capPerMonth: 2, child: true, sameSexOnly: true },
      old3: { masterId: 'm2', active: true },
    },
    availability: { local: { old1: { a: true }, old2: { b: true } } },
    tables: { local: { '2026-09': { slots: ['08:00'], rows: { '2026-09-01': { dow: 2, slots: { '08:00': { p1: 'old1', p2: 'old3' } } } } } } },
  })
  assert.equal(plan.canApply, true)
  assert.equal(plan.stats.duplicateProfilesMerged, 1)
  assert.deepEqual(plan.migrated.availability.local.m1, { a: true, b: true })
  assert.equal(plan.migrated.participants.m1.onlyWithId, 'm2')
  assert.equal(plan.migrated.participants.m1.pioneer, true)
  assert.equal(plan.migrated.participants.m1.withChild, true)
  assert.equal(plan.migrated.participants.m1.sameSexOnly, true)
  assert.equal('child' in plan.migrated.participants.m1, false)
  assert.deepEqual(plan.migrated.tables.local['2026-09'].rows['2026-09-01'].slots['08:00'], { p1: 'm1', p2: 'm2' })
})

test('bloqueia aplicação quando regras específicas divergem', () => {
  const plan = planEscalaIdMigration({ participants: {
    a: { masterId: 'm1', capPerMonth: 1 }, b: { masterId: 'm1', capPerMonth: 2 },
  } })
  assert.equal(plan.canApply, false)
  assert.equal(plan.conflicts[0].field, 'capPerMonth')
})

test('prévia representativa não modifica a origem', () => {
  const escala = {
    participants: {
      legado1:{ masterId:'m_1', active:true }, legado2:{ masterId:'m_1', active:false },
      legado3:{ masterId:'m_2', active:true },
    },
    availability:{ local:{ legado1:{ '4|08:00':true }, legado2:{ '4|10:00':true } } },
    tables:{ local:{ '2026-09':{ rows:{ '2026-09-03':{ slots:{ '08:00':{ p1:'legado1', p2:'legado3' } } } } } } },
    publishedSnapshots:{ '2026-08':{ participants:{ removido:{ name:'Nome histórico' } } } },
  }
  const before = JSON.stringify(escala)
  const plan = planEscalaIdMigration(escala)
  assert.equal(JSON.stringify(escala), before)
  assert.equal(plan.stats.legacyProfiles, 3)
  assert.equal(plan.stats.duplicateProfilesMerged, 1)
  assert.equal(plan.canApply, true)
  assert.deepEqual(plan.conflicts, [])
  assert.ok(plan.stats.tableReferencesRemapped > 0)
  assert.ok(Object.keys(plan.migrated.participants).every(id => id.startsWith('m_')))
})

test('snapshot publicado resolve participantes removidos do cadastro atual', () => {
  const escala = {
    participants:{ atual:{ masterId:'m_atual', active:true } },
    tables:{ local:{ '2026-08':{ rows:{ '2026-08-06':{ slots:{ '08:00':{ p1:'removido', p2:'atual' } } } } } } },
    publishedSnapshots:{ '2026-08':{ participants:{ removido:{ name:'Nome histórico' } } } },
  }
  const plan = planEscalaIdMigration(escala)
  const directory = participantDirectoryForHistory(
    plan.migrated.participants,
    escala.publishedSnapshots,
  )
  const missing = []
  for (const [localId, byMonth] of Object.entries(plan.migrated.tables ?? {})) {
    for (const [month, table] of Object.entries(byMonth)) {
      for (const [date, row] of Object.entries(table.rows ?? {})) {
        for (const [time, cell] of Object.entries(row.slots ?? {})) {
          for (const id of [cell.p1, cell.p2].filter(Boolean)) {
            if (!directory[id]) missing.push(`${localId}/${month}/${date}/${time}/${id}`)
          }
        }
      }
    }
  }
  assert.deepEqual(missing, [])
})
