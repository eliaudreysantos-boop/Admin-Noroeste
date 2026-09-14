import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('Realtime Database nega toda leitura e escrita direta do cliente', async () => {
  const rules = JSON.parse(await readFile(new URL('../database.rules.json', import.meta.url), 'utf8')).rules
  assert.deepEqual(rules, { '.read':false, '.write':false })
})
