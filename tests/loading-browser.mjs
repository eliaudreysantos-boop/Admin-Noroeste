import { createRequire } from 'node:module'
import assert from 'node:assert/strict'

const require = createRequire(process.env.PLAYWRIGHT_PACKAGE_JSON || new URL('../package.json', import.meta.url))
const { chromium } = require('playwright')
const browser = await chromium.launch({ headless:true, channel:'msedge' })
try {
  const page = await browser.newPage()
  const requests = [], errors = []
  let stallData = true
  page.on('request', request => requests.push(request.url()))
  page.on('pageerror', error => errors.push(error.message))
  await page.clock.install()
  await page.route('**/.netlify/functions/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/auth-users')) return
    if (url.pathname.endsWith('/auth-session')) return route.fulfill({ json:{ uid:'test', csrf:'a'.repeat(48), usuario:{ nome:'Teste', ativo:true, apps:{ mestre:true } } } })
    if (stallData) return
    const paths = JSON.parse(url.searchParams.get('paths') || '[]')
    return route.fulfill({ json:{ results:paths.map(() => ({ value:{} })) } })
  })
  await page.goto(process.env.APP_TEST_URL || 'http://127.0.0.1:5187/')
  await page.locator('[data-menu-card="tarefas"]').waitFor({ timeout:4000 })
  console.log('Sessao restaurada sem aguardar auth-users')
  for (const [module, tab, retry] of [
    ['tarefas','escala','#retryTasks'], ['escala','escalaAtual','#retryScale'],
    ['limpeza',null,'#retryCleaning'], ['servicoCampo',null,'#retryService'],
  ]) {
    await page.reload()
    await page.locator('[data-menu-card="'+module+'"]').waitFor()
    stallData = true
    const requested = page.waitForRequest('**/.netlify/functions/database?*')
    await page.locator('[data-menu-card="'+module+'"]').click()
    if (tab) await page.locator('[data-workspace-tab="'+tab+'"]').last().click()
    await requested
    await page.clock.runFor(15_100)
    await page.clock.resume()
    await page.locator(retry).waitFor()
    stallData = false
    await page.locator(retry).click()
    await page.locator(retry).waitFor({ state:'detached' })
    assert.equal(requests.some(url => /public-pdf-layout|pdf-lib|(?:tarefas|escala|limpeza|servico-campo)-documents/.test(url)), false, 'PDF engine must not load when opening modules')
    console.log(module+': timeout, retry and lazy PDF verified')
  }
  assert.deepEqual(errors, [])
} finally { await browser.close() }
