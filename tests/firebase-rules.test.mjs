import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('regras não permitem enumerar tokens de calendário', async () => {
  const rules = JSON.parse(await readFile(new URL('../database.rules.json', import.meta.url), 'utf8')).rules
  assert.equal(rules['.read'], false)
  assert.equal(rules.agenda.assinaturas['.read'], false)
  assert.equal(rules.agenda.assinaturas['.write'], false)
  assert.equal(rules.agendaAssinaturasPrivadas['.read'], false)
  assert.equal(rules.agendaAssinaturasPrivadas['.write'], false)
  assert.equal(rules.agenda.config['.read'], true)
  assert.equal(rules.agenda.documentos['.read'], true)
})
