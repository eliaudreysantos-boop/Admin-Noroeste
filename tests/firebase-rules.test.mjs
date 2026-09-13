import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('Realtime Database nega toda leitura e escrita direta do cliente', async () => {
  const rules = JSON.parse(await readFile(new URL('../database.rules.json', import.meta.url), 'utf8')).rules
  assert.deepEqual(rules, { '.read':false, '.write':false })
})

test('Storage nega acesso direto; PDFs são geridos somente pela função privada', async () => {
  const rules = await readFile(new URL('../storage.rules', import.meta.url), 'utf8')
  assert.match(rules, /match \/\{document=\*\*\}[\s\S]*allow read, write: if false;/)
  assert.doesNotMatch(rules, /if true/)
})
