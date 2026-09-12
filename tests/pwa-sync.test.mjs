import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldRefreshServiceWorker } from '../src/pwa-sync.ts'

const DAY = 24 * 60 * 60 * 1000

test('service worker nao consulta nova versao antes de sete dias', () => {
  assert.equal(shouldRefreshServiceWorker(1_000, 1_000 + (6 * DAY)), false)
  assert.equal(shouldRefreshServiceWorker(1_000, 1_000 + (7 * DAY)), true)
})

test('primeira instalacao permite carregar o shell', () => {
  assert.equal(shouldRefreshServiceWorker(0, 1_000), true)
  assert.equal(shouldRefreshServiceWorker(Number.NaN, 1_000), true)
})

