import test from 'node:test'
import assert from 'node:assert/strict'
import { agendaDeviceResponse } from '../netlify/functions/agenda-device.ts'

const installationId = 'a'.repeat(48)
const session = async () => ({ masterId:'m_1', installationId })
const request = (masterId, installation = installationId) => new Request('https://app.test/.netlify/functions/agenda-device', {
  method:'POST', headers:{ 'content-type':'application/json' },
  body:JSON.stringify({ masterId, installationId:installation }),
})

test('aparelho vinculado recusa troca de pessoa sem desbloqueio', async () => {
  const response = await agendaDeviceResponse(request('m_2'), session)
  assert.equal(response.status, 409)
  assert.match((await response.json()).error, /Desbloqueie/)
  assert.equal(response.headers.get('set-cookie'), null)
})

test('aparelho vinculado recusa troca da instalacao sem desbloqueio', async () => {
  const response = await agendaDeviceResponse(request('m_1', 'b'.repeat(48)), session)
  assert.equal(response.status, 409)
})

test('repetir Salvar para o mesmo vinculo preserva sessao e assinaturas', async () => {
  const response = await agendaDeviceResponse(request('m_1'), session)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { masterId:'m_1' })
  assert.equal(response.headers.get('set-cookie'), null)
})
