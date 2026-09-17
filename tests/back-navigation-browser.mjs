import { createRequire } from 'node:module'
import assert from 'node:assert/strict'

const require = createRequire(process.env.PLAYWRIGHT_PACKAGE_JSON || new URL('../package.json', import.meta.url))
const { chromium } = require('playwright')
const browser = await chromium.launch({ channel:'msedge', headless:true })
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport:{ width, height:900 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/.netlify/functions/**', route => {
      const url = new URL(route.request().url())
      const endpoint = url.pathname.split('/').pop()
      if (endpoint === 'auth-session') return route.fulfill({ json:{ uid:'audit', csrf:'a'.repeat(48), usuario:{ nome:'Teste', ativo:true, apps:{ mestre:true } } } })
      if (endpoint === 'auth-users') return route.fulfill({ json:{} })
      const paths = JSON.parse(url.searchParams.get('paths') || '[]')
      return route.fulfill({ json:{ results:paths.map(() => ({ value:{} })) } })
    })
    await page.goto(process.env.APP_TEST_URL || 'http://127.0.0.1:5190/')
    for (let repeat = 0; repeat < 2; repeat++) {
      for (const module of ['limpeza', 'servicoCampo', 'tarefas', 'escala', 'mestre', 'individual']) {
        await page.locator(`[data-menu-card="${module}"]`).click()
        if (module === 'limpeza') await page.locator('#btnGerarEscalaLimpeza').waitFor({ state:'attached' })
        if (module === 'servicoCampo') {
          await page.locator('#serviceConfig').click()
          await page.locator('#serviceSchedule').waitFor()
          await page.locator('#btnBack').click()
          await page.locator('#serviceConfig').waitFor()
        }
        if (module === 'tarefas' || module === 'escala') {
          await page.locator(`[data-menu-card="${module === 'tarefas' ? 'escala' : 'escalaAtual'}"]`).click()
          await page.locator('[data-module-index-marker]').waitFor({ state:'attached' })
          await page.locator('#btnBack').click()
          await page.locator(`[data-menu-card="${module === 'tarefas' ? 'escala' : 'escalaAtual'}"]`).waitFor()
        }
        await page.locator('#btnBack').click()
        await page.locator('[data-menu-card="mestre"]').waitFor({ timeout:5000 })
        assert.equal(await page.locator('#btnBack').isVisible(), false)
        assert.equal(await page.locator('#btnSair').isVisible(), true)
      }
    }
    assert.deepEqual(errors, [])
    console.log(`Back navigation passed: ${width}px, all six modules, two cycles without reload`)
    await page.close()
  }
} finally { await browser.close() }
