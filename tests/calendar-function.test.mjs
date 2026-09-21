import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../netlify/functions/calendar.ts'
test('calendar: assinaturas retiradas retornam 410', async () => {
  assert.equal((await handler()).status, 410)
})
