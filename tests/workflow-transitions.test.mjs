import test from 'node:test'
import assert from 'node:assert/strict'
import { removeUnusedParticipant } from '../netlify/lib/workflow-transitions.ts'

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
