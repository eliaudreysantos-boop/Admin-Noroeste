import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const require = createRequire(process.env.PLAYWRIGHT_PACKAGE_JSON || new URL('../package.json', import.meta.url))
const { chromium } = require('playwright')
const browser = await chromium.launch({ headless: true, channel: 'msedge' })
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' })
    const page = await context.newPage()
    await page.clock.setFixedTime(new Date('2026-09-15T12:00:00-03:00'))
    const writes = [], errors = []
    let rejectSave = false
    page.on('pageerror', error => errors.push(error.message))
    page.on('dialog', dialog => dialog.accept())
    const original = { id: '2026-09-16', meetingDate: '2026-09-16', bibleReading: 'PROVERBIOS 1', type: 'normal', parts: [
      { id: '2026-09-16-1', title: 'Tesouros', section: 'tesouros', durationMinutes: 10, assignedPersonId: 'p1' },
    ] }
    const sources = {
      programacao: { programs: { [original.id]: original }, pessoas: { p1: { masterId: 'm1', active: true, permissions: ['presidente', 'oracao-inicial', 'oracao-final'] } } },
      'master/pessoas': { m1: { name: 'Pessoa Teste', active: true, sex: 'M', role: 'anciao' } },
      'master/config/congregacao': { nome: 'Teste' }, 'master/config/reunioes': {},
    }
    await page.route('**/.netlify/functions/**', async route => {
      const url = new URL(route.request().url()), endpoint = url.pathname.split('/').pop()
      if (endpoint === 'auth-session') return route.fulfill({ json: { uid: 'audit', csrf: 'a'.repeat(48), usuario: { nome: 'Teste', ativo: true, apps: { mestre: true } } } })
      if (endpoint === 'auth-users') return route.fulfill({ json: { audit: { nome: 'Teste', ativo: true } } })
      if (route.request().method() !== 'GET') {
        writes.push(route.request().postDataJSON())
        if (rejectSave) return route.fulfill({ status: 409, json: { error: 'Registro alterado por outra pessoa' } })
        return route.fulfill({ json: { ok: true } })
      }
      const paths = JSON.parse(url.searchParams.get('paths') || '[]')
      return route.fulfill({ json: { results: paths.map(path => ({ value: sources[path] ?? {} })) } })
    })
    await page.goto(process.env.APP_TEST_URL || 'http://localhost:5174/')
    await page.locator('[data-menu-card="programacao"]').click()
    await page.locator('[data-menu-card="programa"]').click()
    await page.locator(`[data-week="${original.id}"]`).click()
    await page.locator('#weekNotes').fill('Rascunho descartado')
    await page.getByRole('button', { name: 'Adicionar presidência e orações', exact: true }).click()
    assert.equal(await page.locator('#weekNotes').inputValue(), 'Rascunho descartado')
    await page.locator('#closeWeek').click()
    await page.locator(`[data-week="${original.id}"]`).click()
    assert.equal(await page.locator('#weekNotes').inputValue(), '')
    await page.locator('[data-edit-section="tesouros"]').click()
    await page.locator(`[data-delete-part="${original.parts[0].id}"]`).click()
    await page.locator('#cancelSectionModal').click()
    await page.locator('#saveWeek').click()
    await page.getByText('Programa salvo', { exact: true }).waitFor()
    assert.deepEqual(writes.at(-1).value.parts, original.parts)
    assert.deepEqual(writes.at(-1).expected, original)
    await page.locator(`[data-week="${original.id}"]`).click()
    await page.getByRole('button', { name: 'Adicionar presidência e orações', exact: true }).click()
    await page.getByRole('button', { name: 'Adicionar presidência e orações', exact: true }).click()
    await page.locator('[data-edit-section="tesouros"]').click()
    await page.locator(`[data-part="${original.id}-manual-presidente"] [data-field="assignedPersonId"]`).selectOption('p1')
    await page.locator('#applySectionModal').click()
    await page.locator('#saveWeek').click()
    await page.locator('#weekEditor').filter({ has: page.locator('#saveWeek') }).waitFor({ state: 'hidden' })
    const saved = writes.at(-1).value
    assert.equal(saved.parts.length, 4)
    assert.equal(saved.parts.find(part => part.title === 'Presidente').assignedPersonId, 'p1')
    assert.equal(saved.parts.find(part => part.id === original.parts[0].id).assignedPersonId, 'p1')
    await page.locator(`[data-week="${original.id}"]`).click()
    await page.locator('[data-edit-section="vida-crista"]').click()
    await page.locator(`[data-delete-part="${original.id}-manual-oracao-final"]`).click()
    await page.locator('#applySectionModal').click()
    await page.locator('#saveWeek').click()
    await page.locator('#weekEditor').filter({ has: page.locator('#saveWeek') }).waitFor({ state: 'hidden' })
    assert.equal(writes.at(-1).value.parts.length, 3)
    await page.locator(`[data-week="${original.id}"]`).click()
    rejectSave = true
    await page.locator('#saveWeek').click()
    await page.getByText('Registro alterado por outra pessoa', { exact: true }).waitFor()
    assert.equal(await page.locator('#saveWeek').isEnabled(), true)
    await page.locator('#closeWeek').click()
    await page.locator('#saveWeek').waitFor({ state: 'hidden' })
    assert.deepEqual(errors, [])
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    console.log(JSON.stringify({ width, preservesParts: true, savesPresident: true, noDuplicateRoles: true, cancelDeletionPreservesPart: true, applyDeletionRemovesPart: true, errors: 0 }))
    await context.close()
  }
} finally { await browser.close() }
