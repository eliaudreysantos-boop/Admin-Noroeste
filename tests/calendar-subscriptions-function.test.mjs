import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../netlify/functions/calendar-subscriptions.ts'
test('calendar-subscriptions: assinaturas retiradas retornam 410', async () => {
  assert.equal((await handler()).status, 410)
})
