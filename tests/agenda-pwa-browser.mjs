import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, extname, sep } from 'node:path'
import { once } from 'node:events'

const require = createRequire(process.env.PLAYWRIGHT_PACKAGE_JSON || new URL('../package.json', import.meta.url))
const { chromium } = require('playwright')
const root = resolve('dist')
const people = { m_test1:{ name:'Pessoa teste 1', active:true }, m_test2:{ name:'Pessoa teste 2', active:true } }
let paired = '', installation = '', submissions = [], official = null, loseResponse = true
const calls = [], errors = []
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname
  const json = (status, body) => { response.writeHead(status, { 'content-type':'application/json', 'cache-control':'no-store' }); response.end(JSON.stringify(body)) }
  try {
    if (path.startsWith('/.netlify/functions/')) {
      calls.push(`${request.method} ${path}`)
      let raw = ''
      for await (const chunk of request) raw += chunk
      const body = raw ? JSON.parse(raw) : {}
      if (path.endsWith('/agenda-device')) {
        if (request.method === 'GET') return json(200, { people, masterId:paired })
        if (request.method === 'POST') {
          assert.equal(body.adminPassword, undefined)
          paired = body.masterId; installation = body.installationId
          return json(200, { masterId:paired })
        }
        if (body.adminPassword !== 'fixture-admin') return json(401, { error:'Senha Admin invalida.' })
        paired = ''; return json(200, { ok:true })
      }
      if (path.endsWith('/agenda-data')) return json(200, {
        masterId:paired, person:people[paired], events:[], announcements:[], agenda:{},
        secretary:{ publicadores:{ pub:{ id:'pub', masterId:paired, ativo:true, categoria:'pioneiro_regular' } }, relatorios:official ? { [official.id]:official } : {}, fechamentos:{} },
      })
      if (path.endsWith('/secretary-report')) {
        submissions.push(body.report)
        if (official && official.submissionId !== body.report.submissionId) return json(409, { error:'Ja recebido.' })
        official ??= { ...body.report, id:`${paired}__${body.report.competencia}`, masterId:paired, categoria:'pioneiro_regular', createdBy:'pessoa', lastEditedBy:'pessoa', status:'enviado', revision:1 }
        if (loseResponse) { loseResponse = false; return json(503, { error:'Resposta perdida apos gravacao.' }) }
        return json(200, { report:official })
      }
      return json(404, { error:'Unexpected endpoint' })
    }
    const file = resolve(root, `.${path.endsWith('/') ? `${path}index.html` : path}`)
    if (!file.startsWith(root + sep)) return json(403, {})
    const bytes = await readFile(file)
    const types = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png' }
    response.writeHead(200, { 'content-type':types[extname(file)] || 'application/octet-stream' }); response.end(bytes)
  } catch (error) { errors.push(error.message); json(500, { error:'Fixture failed' }) }
})
server.listen(0, '127.0.0.1')
await once(server, 'listening')
const base = `http://127.0.0.1:${server.address().port}`
await mkdir('.netlify', { recursive:true })
let context
const profiles = []
try {
  for (const viewport of [{ width:1440, height:900 }, { width:390, height:844 }]) {
    paired = ''; installation = ''; submissions = []; official = null; loseResponse = true
    const profile = await mkdtemp(resolve(tmpdir(), 'agenda-pwa-')); profiles.push(profile)
    const launch = () => chromium.launchPersistentContext(profile, { channel:'msedge', headless:true, viewport })
    const attach = page => { page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept()) }
    context = await launch()
    let page = context.pages()[0]; attach(page)
    await page.goto(`${base}/agenda/`)
    await page.locator('#agendaPerson').selectOption('m_test1')
    await page.getByRole('button', { name:'Salvar', exact:true }).click()
    await page.getByRole('tab', { name:'Relatório', exact:true }).click()
    assert.equal(await page.locator('input[type=password]').count(), 0)
    assert.match(installation, /^[a-f0-9]{48}$/)
    await page.locator('#openPersonalReport').click()
    await page.locator('[name=estudos]').fill('3')
    await page.locator('[name=horasCampo]').fill('42')
    await page.locator('[name=observacoes]').fill('Rascunho offline de teste')
    await page.locator('#reportCancel').click()
    assert.equal(submissions.length, 0)
    // Localhost intentionally disables automatic registration; exercise the production worker explicitly.
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/agenda/sw.js', { scope:'/agenda/' })
      await navigator.serviceWorker.ready
    })
    await page.waitForFunction(() => !!navigator.serviceWorker.controller)
    await page.reload()
    assert.equal(await page.getByRole('tab', { name:'Relatório', exact:true }).getAttribute('aria-selected'), 'true')
    const beforeOffline = calls.length
    await context.close()
    context = await launch()
    await context.setOffline(true)
    page = context.pages()[0]; attach(page)
    await page.goto(`${base}/agenda/`)
    await page.locator('#openPersonalReport').click()
    assert.equal(await page.locator('[name=estudos]').inputValue(), '3')
    assert.equal(await page.locator('[name=horasCampo]').inputValue(), '42')
    assert.equal(await page.locator('[name=observacoes]').inputValue(), 'Rascunho offline de teste')
    assert.equal(calls.length, beforeOffline)
    assert.equal(submissions.length, 0)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path:`.netlify/agenda-pwa-offline-${viewport.width}.png`, fullPage:true })
    await context.setOffline(false)
    await page.locator('#reportSubmit').click()
    await page.getByRole('button', { name:'Tentar novamente', exact:true }).waitFor({ timeout:20000 })
    assert.equal(submissions.length, 1)
    await page.reload()
    await page.locator('#openPersonalReport').click()
    await page.locator('#reportSubmit').click()
    await page.locator('#personalReport').waitFor({ state:'detached', timeout:20000 })
    assert.equal(submissions.length, 2)
    assert.equal(submissions[0].submissionId, submissions[1].submissionId, 'retry after reload must reuse submissionId')
    assert.equal(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('noroeste_relatorio_rascunho_v1:'))), false)
    for (let index = 0; index < 7; index++) await page.locator('#bottomUser').click()
    await page.locator('#agendaAdminPassword').fill('wrong')
    await page.locator('#agendaUnlockConfirm').click()
    await page.locator('#agendaUnlockError').filter({ hasText:'inválida' }).waitFor()
    assert.equal(paired, 'm_test1')
    await page.locator('#agendaAdminPassword').fill('fixture-admin')
    await page.locator('#agendaUnlockConfirm').click()
    await page.locator('#agendaPerson').waitFor({ state:'visible' })
    assert.equal(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('noroeste_agenda_offline_v2:'))), false)
    official = null
    await page.locator('#agendaPerson').selectOption('m_test2')
    await page.getByRole('button', { name:'Salvar', exact:true }).click()
    await page.getByRole('tab', { name:'Pessoal', exact:true }).waitFor()
    assert.equal(await page.locator('#bottomUser').innerText(), 'Pessoa teste 2')
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ viewport, saveWithoutPassword:true, offlineBrowserRestart:true, draftPreserved:true, retryAfterLostResponse:true, unlockPassword:true, identityIsolation:true }))
    await context.close(); context = null
  }
} finally {
  await context?.close()
  await new Promise(resolve => server.close(resolve))
  for (const profile of profiles) await rm(profile, { recursive:true, force:true })
}
