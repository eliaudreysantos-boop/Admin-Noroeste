import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const require = createRequire(process.env.PLAYWRIGHT_PACKAGE_JSON || new URL('../package.json', import.meta.url))
const { chromium } = require('playwright')
const browser = await chromium.launch({ headless:true, channel:'msedge' })
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport:{ width, height:900 }, serviceWorkers:'block' })
    const page = await context.newPage(), errors = [], writes = []
    let mode = 'fail', release, started
    page.on('pageerror', error => errors.push(error.message))
    const sources = {
      escala:{ participants:{ m1:{ active:true, capPerMonth:3 } } },
      secretario:{ publicadores:{ p1:{ id:'p1', masterId:'m1', categoria:'publicador', grupoId:'', ativo:true } } },
      'master/pessoas':{ m1:{ name:'Pessoa Teste', active:true, sex:'M' } },
    }
    await page.route('**/.netlify/functions/**', async route => {
      const url = new URL(route.request().url()), endpoint = url.pathname.split('/').pop()
      if (endpoint === 'auth-session') return route.fulfill({ json:{ uid:'audit', csrf:'a'.repeat(48), usuario:{ nome:'Teste', ativo:true, apps:{ mestre:true } } } })
      if (endpoint === 'auth-users') return route.fulfill({ json:{} })
      if (route.request().method() !== 'GET') {
        writes.push(route.request().postDataJSON())
        if (mode === 'hold') { await new Promise(resolve => { release = resolve; started() }); return route.fulfill({ json:{ ok:true } }) }
        return route.fulfill({ status:503, json:{ error:'Falha simulada de rede' } })
      }
      const paths = JSON.parse(url.searchParams.get('paths') || '[]')
      return route.fulfill({ json:{ results:paths.map(path => ({ value:sources[path] ?? {} })) } })
    })
    await page.goto(process.env.APP_TEST_URL || 'http://localhost:5180/')
    await page.locator('[data-menu-card="escala"]').click()
    await page.locator('[data-menu-card="participantes"]').click()
    await page.locator('[data-person="m1"]').click()
    await page.evaluate(() => { document.querySelector('#pmSave').click(); document.querySelector('#pmSave').click() })
    await page.getByText('Falha simulada de rede', { exact:true }).waitFor()
    assert.equal(writes.length, 1)
    assert.equal(await page.locator('#pmSave').isEnabled(), true)
    await page.locator('#pmCancel').click()
    await page.locator('#pmSave').waitFor({ state:'hidden' })
    mode = 'hold'
    let waiting = new Promise(resolve => { started = resolve })
    await page.locator('[data-person="m1"]').click()
    await page.locator('#pmSave').click()
    await waiting
    await page.locator('#pmCancel').click()
    await page.locator('[data-person="m1"]').click()
    await page.locator('#pmCap').fill('12')
    release()
    await page.getByText('Participante salvo', { exact:true }).waitFor()
    assert.equal(await page.locator('#pmCap').inputValue(), '12')
    await page.locator('#pmCancel').click()
    await page.evaluate(async () => (await import('/src/modules/secretario.ts')).default({}))
    await page.locator('[data-menu-card="publicadores"]').click()
    await page.locator('[data-edit-publisher="p1"]').click()
    mode = 'fail'
    const before = writes.length
    await page.evaluate(() => { const b = document.querySelector('#publisherForm button[type="submit"]'); b.click(); b.click() })
    await page.getByText('Falha simulada de rede', { exact:true }).waitFor()
    assert.equal(writes.length, before + 1)
    assert.equal(await page.locator('#publisherForm button[type="submit"]').isEnabled(), true)
    await page.locator('#cancelPublisher').click()
    await page.locator('[data-edit-publisher="p1"]').click()
    mode = 'hold'
    waiting = new Promise(resolve => { started = resolve })
    await page.locator('#publisherForm button[type="submit"]').click()
    await waiting
    await page.locator('#cancelPublisher').click()
    await page.locator('[data-edit-publisher="p1"]').click()
    await page.locator('#publisherForm [name="categoria"]').selectOption('pioneiro_regular')
    release()
    await page.getByText('Publicador salvo', { exact:true }).waitFor()
    assert.equal(await page.locator('#publisherForm [name="categoria"]').inputValue(), 'pioneiro_regular')
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ width, duplicatePrevented:true, cancelAfterFailure:true, lateResponsePreservesEditor:true }))
    await context.close()
  }
} finally { await browser.close() }
