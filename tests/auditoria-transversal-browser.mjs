import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const require = createRequire(process.env.PLAYWRIGHT_PACKAGE_JSON || new URL('../package.json', import.meta.url))
const { chromium } = require('playwright')
const browser = await chromium.launch({ headless: true, channel: 'msedge' })
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' })
    const page = await context.newPage(), writes = [], errors = []
    let reads = 0
    page.on('pageerror', error => errors.push(error.message))
    page.on('dialog', dialog => dialog.accept())
    const sources = {
      servicoCampo: { leaders: { m1:true, m2:true }, templates: {}, periods: {} },
      secretario: { fechamentos: { '2026-08': { fechado:false } }, publicadores: {}, relatorios: {} },
      'master/pessoas': Object.fromEntries(['m1', 'm2', 'm3'].map(mid => [mid, { name:`Pessoa ${mid}`, active:true, sex:'M' }])),
      'master/config/congregacao': { nome:'Teste' },
      'master/config': { limpeza: { ativa:true, aproveitarGruposServicoCampo:true, grupos:1, inicioRotacao:'2026-09-01' } },
      'secretario/grupos': { g1:{ nome:'Grupo 1', ativo:true, superintendenteMasterId:'m1' } },
      'secretario/publicadores': { p1:{ masterId:'m1', grupoId:'g1', ativo:true }, p2:{ masterId:'m2', grupoId:'g1', ativo:true } },
    }
    await page.route('**/.netlify/functions/**', async route => {
      const url = new URL(route.request().url()), endpoint = url.pathname.split('/').pop()
      if (endpoint === 'auth-session') return route.fulfill({ json:{ uid:'audit', csrf:'a'.repeat(48), usuario:{ nome:'Teste', ativo:true, apps:{ mestre:true } } } })
      if (endpoint === 'auth-users') return route.fulfill({ json:{} })
      if (endpoint === 'workflow-transition') { writes.push(route.request().postDataJSON()); return route.fulfill({ json:{ closing:{ fechadoEm:'2026-09-16', enviadoEm:'2026-09-16' } } }) }
      if (route.request().method() !== 'GET') { writes.push(route.request().postDataJSON()); return route.fulfill({ json:{ ok:true } }) }
      reads++
      const paths = JSON.parse(url.searchParams.get('paths') || '[]')
      return route.fulfill({ json:{ results:paths.map(path => ({ value:sources[path] ?? {} })) } })
    })
    await page.goto(process.env.APP_TEST_URL || 'http://localhost:5180/')
    await page.locator('[data-menu-card="servicoCampo"]').click()
    await page.locator('[data-menu-card="configuracao"]').click()
    assert.equal(await page.locator('[name="templateLeader"]').count(), 2)
    assert.equal(await page.locator('[name="templateLeader"][value="m3"]').count(), 0)
    await page.locator('[name="mode"]').selectOption('date')
    await page.locator('[name="date"]').fill('2026-09-21')
    await page.locator('[name="location"]').fill('Salao')
    await page.locator('[name="templateLeader"][value="m1"]').check()
    await page.getByRole('button', { name:'Salvar saída', exact:true }).click()
    await page.getByText('Saída recorrente salva', { exact:true }).waitFor()
    assert.equal(Object.values(writes.at(-1).value)[0].date, '2026-09-21')
    await page.evaluate(async () => {
      const module = await import('/src/modules/secretario.ts')
      module.default({})
    })
    await page.locator('[data-menu-card="conferencia"]').click()
    assert.equal(await page.locator('#conferenceMonth').inputValue(), '2026-08')
    const before = reads
    await page.locator('#markReportSent').click()
    await page.waitForFunction(() => document.querySelector('#conferenceMonth')?.value === '2026-09')
    assert.equal(reads, before)
    await page.evaluate(async () => {
      const module = await import('/src/modules/limpeza.ts')
      module.default({})
    })
    await page.locator('[data-menu-card="config"]').click()
    assert.equal(await page.locator('[data-group-helper]:checked').count(), 2)
    assert.equal(await page.locator('#gSuper_g1 option[value="m3"]').count(), 0)
    assert.equal(await page.locator('#gSuper_g1').inputValue(), 'm1')
    await page.locator('[data-group-helper][value="m2"]').uncheck()
    await page.locator('#btnSalvarLimpezaConfig').click()
    await page.getByText('Configuração salva ✓', { exact:true }).waitFor()
    assert.deepEqual(writes.at(-1).value['gruposServicoConfig/g1/ajudantesExcluidosMid'], ['m2'])
    assert.equal(writes.at(-1).value['gruposServicoConfig/g1/membrosDaOrigem'], true)
    assert.equal(Object.hasOwn(writes.at(-1).value, 'gruposConfig'), false)
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ width, approvedOnly:true, specificDate:true, closingAdvances:true, cleaningMembers:true, localExclusions:true }))
    await context.close()
  }
} finally { await browser.close() }
