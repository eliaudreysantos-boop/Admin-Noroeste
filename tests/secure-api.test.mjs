import test from 'node:test'
import assert from 'node:assert/strict'
import { apiJson } from '../src/secure-api.ts'

test('leitura travada expira e a proxima tentativa funciona', async t => {
  t.mock.timers.enable({ apis:['setTimeout'] })
  t.mock.method(globalThis, 'fetch', (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
  }))
  const read = apiJson('database')
  const rejected = assert.rejects(read, error => error.status === 408)
  t.mock.timers.tick(15_000)
  await rejected
  globalThis.fetch.mock.mockImplementation(async () => Response.json({ ok:true }))
  assert.deepEqual(await apiJson('database'), { ok:true })
})

test('escritas lentas nao sao canceladas nem repetidas', async t => {
  t.mock.timers.enable({ apis:['setTimeout'] })
  let finish, signal, count = 0
  t.mock.method(globalThis, 'fetch', (_url, init) => {
    count++; signal = init.signal
    return new Promise(resolve => { finish = resolve })
  })
  const write = apiJson('database', { method:'PATCH', body:'{}' })
  t.mock.timers.tick(60_000)
  assert.equal(signal.aborted, false)
  finish(Response.json({ ok:true }))
  await write
  assert.equal(count, 1)
})
