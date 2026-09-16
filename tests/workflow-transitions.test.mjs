import test from 'node:test'
import assert from 'node:assert/strict'
import { closureSnapshot } from '../src/modules/secretario-domain.ts'
import { transitionMonth, removeUnusedParticipant } from '../netlify/lib/workflow-transitions.ts'

const report = { masterId:'m1', competencia:'2026-08', status:'enviado', origem:'minha_agenda' }
test('fechamento recusa novo relatorio ou assistencia apos conferencia', () => {
  const root = { relatorios:{ r:report }, assistencia:{} }
  const expected = closureSnapshot(root, '2026-08')
  assert.equal(transitionMonth({ ...root, relatorios:{ ...root.relatorios, novo:{ ...report, masterId:'m2' } } }, '2026-08', expected, true, 'now'), undefined)
  assert.equal(transitionMonth({ ...root, assistencia:{ a:{ data:'2026-08-02', quantidade:80 } } }, '2026-08', expected, true, 'now'), undefined)
  assert.equal(transitionMonth(root, '2026-08', expected, true, 'now').relatorios.r.status, 'fechado')
  assert.equal(root.relatorios.r.status, 'enviado')
})
test('mes independente e preservado e reabertura restaura autoria', () => {
  const root = { relatorios:{ r:report, s:{ ...report, lastEditedBy:'secretario' } } }
  const latest = { ...root, relatorios:{ ...root.relatorios, outro:{ ...report, competencia:'2026-09' } } }
  const closed = transitionMonth(latest, '2026-08', closureSnapshot(root, '2026-08'), true, 'now')
  assert.equal(closed.relatorios.outro.status, 'enviado')
  assert.equal(transitionMonth(closed, '2026-08', closureSnapshot(root, '2026-08'), true, 'now'), undefined)
  const reopened = transitionMonth(closed, '2026-08', closureSnapshot(closed, '2026-08'), false, 'later')
  assert.equal(reopened.relatorios.r.status, 'enviado')
  assert.equal(reopened.relatorios.s.status, 'revisado')
})
test('exclusao recusa perfil alterado e novas designacoes inclusive publicadas', () => {
  const profile = { active:true }
  const root = { participants:{ m1:profile } }
  assert.equal(removeUnusedParticipant({ participants:{ m1:{ active:false } } }, 'm1', profile), undefined)
  for (const collection of ['tables', 'publishedSnapshots']) {
    assert.equal(removeUnusedParticipant({ ...root, [collection]:{ x:{ rows:{ day:{ slots:{ time:{ p1:'m1' } } } } } } }, 'm1', profile), undefined)
  }
})
test('exclusao limpa dependencias atuais sem apagar outros participantes', () => {
  const root = { participants:{ m1:{ active:true }, m2:{ onlyWithId:'m1', active:true } }, availability:{ local:{ m1:{ a:true }, m2:{ b:true } } }, settings:{ unchanged:true } }
  const next = removeUnusedParticipant(root, 'm1', root.participants.m1)
  assert.equal(next.participants.m1, undefined)
  assert.equal(next.participants.m2.onlyWithId, undefined)
  assert.deepEqual(next.availability.local, { m2:{ b:true } })
  assert.deepEqual(next.settings, root.settings)
  assert.equal(root.participants.m2.onlyWithId, 'm1')
})
