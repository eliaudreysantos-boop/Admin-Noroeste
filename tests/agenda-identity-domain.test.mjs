import test from 'node:test'
import assert from 'node:assert/strict'
import { advanceUnlockTap, validAdminPassword } from '../src/modules/agenda-identity-domain.ts'

test('identidade só desbloqueia após sete toques consecutivos', () => {
  let state = { count:0, lastTapAt:0 }
  for (let index = 1; index <= 6; index += 1) {
    const result = advanceUnlockTap(state, index * 500)
    state = result.state
    assert.equal(result.unlocked, false)
  }
  const seventh = advanceUnlockTap(state, 3500)
  assert.equal(seventh.unlocked, true)
  assert.equal(seventh.state.count, 0)
})

test('intervalo longo reinicia a sequência de toques', () => {
  const first = advanceUnlockTap({ count:5, lastTapAt:1000 }, 5000)
  assert.deepEqual(first, { state:{ count:1, lastTapAt:5000 }, unlocked:false })
})

test('desbloqueio aceita somente senha de Admin ativo', () => {
  const users = {
    admin:{ nome:'Admin', senha:'senha-teste', ativo:true, apps:{ mestre:true, tarefas:true, escala:true, programacao:true, secretario:true } },
    inactive:{ nome:'Inativo', senha:'outra', ativo:false, apps:{ mestre:true, tarefas:true, escala:true, programacao:true, secretario:true } },
    common:{ nome:'Comum', senha:'comum', ativo:true, apps:{ mestre:false, tarefas:true, escala:false, programacao:false, secretario:false } },
  }
  assert.equal(validAdminPassword(users, 'senha-teste'), true)
  assert.equal(validAdminPassword(users, 'outra'), false)
  assert.equal(validAdminPassword(users, 'comum'), false)
})
