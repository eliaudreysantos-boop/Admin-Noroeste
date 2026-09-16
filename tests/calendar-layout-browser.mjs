import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const require = createRequire(process.env.PLAYWRIGHT_PACKAGE_JSON || new URL('../package.json', import.meta.url))
const { chromium } = require('playwright')
const browser = await chromium.launch({ channel:'msedge', headless:true })
const token = 'a'.repeat(48), installationId = 'b'.repeat(48)
await mkdir('.netlify', { recursive:true })
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport:{ width, height:900 }, serviceWorkers:'block' })
    const page = await context.newPage(), errors = [], subscriptionRequests = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('dialog', dialog => dialog.accept())
    await page.addInitScript(({ token, installationId }) => {
      localStorage.setItem('noroeste_agenda_installation_v1', installationId)
      localStorage.setItem('noroeste_agenda_subscriptions_v2', JSON.stringify({ [token]:{ token, installationId, tipo:'pessoal', masterId:'m1', ativo:true } }))
      localStorage.setItem('noroeste:oradores:period', '2026-10')
    }, { token, installationId })
    const sources = {
      'master/pessoas':{ m1:{ name:'Pessoa Teste', active:true, sex:'M' } },
      'master/config/congregacao':{ nome:'Teste' },
      tarefas:{ planning:{ editingPeriod:'2026-10', periodMode:'month' }, people:{ p:{ masterId:'m1' } }, scale:{ periods:{ '2026-10':{ meetings:{ r:{ date:'2026-10-03', type:'weekend', assignments:{ presidente:'p' } } } } } } },
      'tarefas/discursos':{ programacao:{ a:{ data:'2026-10-03', tipo:'discurso_local', oradorNome:'Pessoa Teste', temaTitulo:'Tema para conferir' }, b:{ data:'2026-10-04', tipo:'saida_orador', oradorNome:'Outro Orador', temaTitulo:'Tema externo' } } },
    }
    await page.route('**/.netlify/functions/**', route => {
      const url = new URL(route.request().url()), endpoint = url.pathname.split('/').pop()
      if (endpoint === 'auth-session') return route.fulfill({ json:{ uid:'audit', csrf:'a'.repeat(48), usuario:{ nome:'Teste', ativo:true, masterId:'m1', apps:{ mestre:true } } } })
      if (endpoint === 'auth-users') return route.fulfill({ json:{} })
      if (endpoint === 'calendar-subscriptions') {
        const body = route.request().postDataJSON(), method = route.request().method(), csrf = route.request().headers()['x-noroeste-csrf']
        subscriptionRequests.push({ method, csrf })
        if (csrf !== 'a'.repeat(48)) return route.fulfill({ status:403, json:{ error:'Validacao ausente' } })
        return route.fulfill({ json:method === 'DELETE' ? { ok:true } : { ...body, token:body.token || 'c'.repeat(48), tipo:body.tipo || 'quadro', ativo:true } })
      }
      const paths = JSON.parse(url.searchParams.get('paths') || '[]')
      return route.fulfill({ json:{ results:paths.map(path => ({ value:sources[path] ?? {} })) } })
    })
    await page.goto(process.env.APP_TEST_URL || 'http://localhost:5180/')
    await page.locator('[data-menu-card="individual"]').click()
    await page.getByText('Calendário e compartilhamento', { exact:true }).click()
    assert.match(await page.getByRole('link', { name:'Assinar no iPhone / Apple' }).getAttribute('href'), /^webcal:\/\//)
    assert.match(await page.getByRole('link', { name:'Google Agenda', exact:true }).getAttribute('href'), /^https:\/\/calendar.google.com\//)
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable:true, value:{ writeText:async text => { window.copiedCalendar = text } } }))
    await page.locator('#copyPersonalSubscription').click()
    assert.match(await page.evaluate(() => window.copiedCalendar), /calendar\?token=a{48}$/)
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable:true, value:{ writeText:async () => { throw new Error('denied') } } }))
    await page.locator('#copyPersonalSubscription').click()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path:`.netlify/calendar-layout-${width}.png`, fullPage:true })
    await page.locator('#revokePersonalSubscription').click()
    await page.locator('#createPersonalSubscription').click()
    await page.locator('#revokePersonalSubscription').waitFor()
    await page.getByRole('tab', { name:'Quadro', exact:true }).click()
    await page.getByText('Assinar o quadro', { exact:true }).click()
    await page.locator('#createBoardSubscription').click()
    await page.locator('#revokeBoardSubscription').waitFor()
    await page.locator('[data-board-module="tarefas"]').uncheck()
    await page.waitForFunction(() => !document.querySelector('[data-board-module="tarefas"]').disabled)
    assert.deepEqual(subscriptionRequests.map(item => item.method), ['DELETE', 'POST', 'POST', 'PATCH'])
    assert.ok(subscriptionRequests.every(item => item.csrf === 'a'.repeat(48)))
    for (const [module, tab] of [['oradores','programacao'], ['tarefas','escala'], ['secretario','documentos']]) {
      await page.locator('#btnBack').click()
      await page.locator(`[data-menu-card="${module}"]`).click()
      await page.locator(`[data-menu-card="${tab}"]`).click()
      if (module === 'oradores') {
        await page.getByRole('heading', { name:'Arranjo Local', exact:true }).waitFor()
        await page.getByRole('heading', { name:'Arranjo Externo', exact:true }).waitFor()
        assert.equal(await page.locator('.oradores-program-card').count(), 2)
        const options = page.locator('[data-program-options="a"]')
        assert.equal(await options.evaluate(element => element.open), width >= 700)
        await options.locator('summary').click()
        await page.waitForFunction(expected => localStorage.getItem('noroeste:oradores:actions:a') === expected, String(width < 700))
        await page.locator('[data-programacao-status]').dispatchEvent('change')
        assert.equal(await options.evaluate(element => element.open), width < 700)
      }
      if (module === 'tarefas') {
        assert.equal(await page.locator('#btnTarefasPdf').isVisible(), true)
        assert.equal(await page.locator('#btnTarefasPdf + #btnToggleTaskLock').count(), 1)
        await page.locator('#btnTarefasPdf').click()
        await page.locator('[data-pdf-close]').click()
      }
      if (module === 'secretario') assert.equal(await page.locator('[data-document="s3"], #templateS3').count(), 0)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, module)
      await page.screenshot({ path:`.netlify/${module}-layout-${width}.png`, fullPage:true })
      await page.locator('#btnBack').click()
    }
    assert.deepEqual(errors, [])
    console.log({ width, calendarLinks:true, clipboardFallback:true, layouts:true })
    await context.close()
  }
} finally { await browser.close() }
