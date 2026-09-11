import test from 'node:test'
import assert from 'node:assert/strict'
import { subscriptionsResponse } from '../netlify/functions/calendar-subscriptions.ts'

const installationA = 'a'.repeat(32)
const installationB = 'b'.repeat(32)
const tokenA = '1'.repeat(48)
const tokenB = '2'.repeat(48)

function memoryStore() {
  const values = new Map()
  return {
    values,
    store:{
      get:async token => values.get(token) ?? null,
      set:async (token, value) => { values.set(token, structuredClone(value)) },
    },
  }
}

function request(method, body) {
  return new Request('https://app.test/.netlify/functions/calendar-subscriptions', {
    method, headers:{ 'content-type':'application/json' }, body:JSON.stringify(body),
  })
}

test('duas instalações criam assinaturas independentes', async () => {
  const memory = memoryStore()
  const first = await subscriptionsResponse(request('POST', { tipo:'quadro', installationId:installationA, modulos:['tarefas'] }), memory.store, () => tokenA)
  const second = await subscriptionsResponse(request('POST', { tipo:'quadro', installationId:installationB, modulos:['oradores'] }), memory.store, () => tokenB)
  assert.equal(first.status, 201)
  assert.equal(second.status, 201)
  assert.deepEqual(memory.values.get(tokenA).modulos, ['tarefas'])
  assert.deepEqual(memory.values.get(tokenB).modulos, ['oradores'])
})

test('a mesma pessoa pode ter uma assinatura independente por instalação', async () => {
  const memory = memoryStore()
  const first = await subscriptionsResponse(request('POST', { tipo:'pessoal', installationId:installationA, masterId:'m_1' }), memory.store, () => tokenA)
  const second = await subscriptionsResponse(request('POST', { tipo:'pessoal', installationId:installationB, masterId:'m_1' }), memory.store, () => tokenB)
  assert.equal(first.status, 201)
  assert.equal(second.status, 201)
  assert.equal(memory.values.get(tokenA).installationId, installationA)
  assert.equal(memory.values.get(tokenB).installationId, installationB)
})

test('uma instalação não altera nem revoga a assinatura da outra', async () => {
  const memory = memoryStore()
  memory.values.set(tokenA, { token:tokenA, tipo:'quadro', installationId:installationA, modulos:['tarefas'], ativo:true, criadoEm:'2026-09-01' })
  const deniedUpdate = await subscriptionsResponse(request('PATCH', { token:tokenA, installationId:installationB, modulos:['oradores'] }), memory.store)
  const deniedDelete = await subscriptionsResponse(request('DELETE', { token:tokenA, installationId:installationB }), memory.store)
  assert.equal(deniedUpdate.status, 403)
  assert.equal(deniedDelete.status, 403)
  assert.equal(memory.values.get(tokenA).ativo, true)
})

test('dono altera módulos e revoga o próprio token', async () => {
  const memory = memoryStore()
  memory.values.set(tokenA, { token:tokenA, tipo:'quadro', installationId:installationA, modulos:['tarefas'], ativo:true, criadoEm:'2026-09-01' })
  const updated = await subscriptionsResponse(request('PATCH', { token:tokenA, installationId:installationA, modulos:['oradores', 'servicoCampo'] }), memory.store)
  assert.equal(updated.status, 200)
  assert.deepEqual(memory.values.get(tokenA).modulos, ['oradores', 'servicoCampo'])
  const revoked = await subscriptionsResponse(request('DELETE', { token:tokenA, installationId:installationA }), memory.store)
  assert.equal(revoked.status, 200)
  assert.equal(memory.values.get(tokenA).ativo, false)
})

test('valida instalação, pessoa, módulos e token', async () => {
  const memory = memoryStore()
  assert.equal((await subscriptionsResponse(request('POST', { tipo:'pessoal', installationId:'curta', masterId:'m_1' }), memory.store, () => tokenA)).status, 400)
  assert.equal((await subscriptionsResponse(request('POST', { tipo:'pessoal', installationId:installationA, masterId:'nome inseguro' }), memory.store, () => tokenA)).status, 400)
  assert.equal((await subscriptionsResponse(request('POST', { tipo:'quadro', installationId:installationA, modulos:[] }), memory.store, () => tokenA)).status, 400)
  assert.equal((await subscriptionsResponse(request('DELETE', { token:'curto', installationId:installationA }), memory.store)).status, 400)
})
