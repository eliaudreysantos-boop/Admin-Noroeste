import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const require = createRequire(process.env.PLAYWRIGHT_PACKAGE_JSON || new URL('../package.json', import.meta.url))
const { chromium } = require('playwright')
const browser = await chromium.launch({ channel:'msedge', headless:true })
await mkdir('.netlify', { recursive:true })
try {
  for (const viewport of [{ width:1440, height:900 }, { width:390, height:844 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers:'block' })
    const page = await context.newPage()
    await page.clock.setFixedTime(new Date('2026-09-14T12:00:00-03:00'))
    const errors = [], writes = []
    const month = '2026-09'
    const slots = Array.from({ length:10 }, (_, i) => `${String(i + 7).padStart(2,'0')}:00`)
    const table = { slots, rows:{ '2026-09-03':{ dow:4, slots:Object.fromEntries(slots.map((time, i) => [time, i === 0 ? { p1:'a', p2:'antigo' } : { p1:'', p2:'' }])) } } }
    const data = {
      scales:{ l1:{ name:'Local de teste', active:true, slots, daysActive:[4], stepMinutes:60 } },
      participants:{ a:{ masterId:'m1', active:true }, b:{ masterId:'m2', active:true }, inativo:{ masterId:'m3', active:true } },
      availability:{ l1:Object.fromEntries(['a','b','inativo'].map(id => [id,Object.fromEntries(slots.map(time => [`4|${time}`,true]))])) },
      tables:{ l1:{ [month]:structuredClone(table), '2026-08':structuredClone(table) } },
      publishedMonth:month, publishedMonths:{ [month]:true, '2026-08':true },
      publishedSnapshots:{ [month]:{ participants:{ antigo:{ name:'Nome preservado no historico' } } } },
    }
    let failRemoval = true, failPublication = true
    page.on('pageerror', error => errors.push(error.message))
    page.on('dialog', dialog => dialog.accept())
    await page.route('**/.netlify/functions/**', async route => {
      const request = route.request(), url = new URL(request.url()), endpoint = url.pathname.split('/').pop(), path = url.searchParams.get('path')
      if (endpoint === 'auth-session') return route.fulfill({ json:{ uid:'audit', csrf:'a'.repeat(48), usuario:{ nome:'Auditoria', ativo:true, apps:{ mestre:true } } } })
      if (endpoint === 'auth-users') return route.fulfill({ json:{} })
      if (request.method() !== 'GET') {
        const body = request.postDataJSON()
        writes.push({ endpoint, path, body })
        if (endpoint === 'storage-file' && request.method() === 'POST') return route.fulfill({ json:{ url:'https://example.invalid/test.pdf' } })
        if (failRemoval && path === 'agenda/documentos' && Object.values(body.value).includes(null)) {
          failRemoval = false
          return route.fulfill({ status:503, json:{ error:'Retirada indisponivel' } })
        }
        if (failPublication && path === 'escala' && body.value[`publishedMonths/${month}`] === true) {
          failPublication = false
          return route.fulfill({ status:503, json:{ error:'Publicacao indisponivel' } })
        }
        if (path === 'escala') for (const [key,value] of Object.entries(body.value)) {
          const keys = key.split('/'); let target = data
          for (const key of keys.slice(0,-1)) target = target[key] ??= {}
          if (value === null) delete target[keys.at(-1)]; else target[keys.at(-1)] = value
        }
        return route.fulfill({ json:{ ok:true } })
      }
      const source = { escala:data, 'master/pessoas':{ m1:{ name:'Pessoa teste um', active:true }, m2:{ name:'Pessoa teste dois', active:true }, m3:{ name:'Inativo central', active:false } } }
      const paths = JSON.parse(url.searchParams.get('paths') || '[]')
      return route.fulfill({ json:paths.length ? { results:paths.map(path => ({ value:source[path] ?? {} })) } : { value:{} } })
    })
    await page.goto('http://localhost:5174/')
    await page.locator('[data-menu-card="escala"]').click()
    await page.locator('[data-menu-card="escalaAtual"]').click()
    assert.equal(await page.locator('#sGenerateAll').isDisabled(), true)
    assert.ok(await page.getByText('Pessoa teste um + Nome preservado no historico', { exact:true }).count())
    await page.locator('#eMonth').fill('2026-08')
    await page.locator('#eMonth').dispatchEvent('change')
    assert.equal(await page.locator('#sGenerateAll').isDisabled(), true, 'Mes anterior publicado bloqueado')
    await page.locator('#sUnpublish').click()
    await page.getByText('Não foi possível despublicar', { exact:true }).waitFor()
    assert.equal(data.publishedMonth, month, 'Reabrir anterior nao apaga ponteiro do atual')
    assert.equal(data.publishedMonths['2026-08'], true, 'Falha deve restaurar flag anterior')
    await page.locator('#sUnpublish').click()
    await page.locator('#sPublish').waitFor()
    assert.equal(data.publishedMonth, month)
    await page.locator('#eMonth').fill(month)
    await page.locator('#eMonth').dispatchEvent('change')
    await page.locator('#sUnpublish').click()
    await page.locator('#sPublish').waitFor()
    await page.locator('#sPdf').click()
    await page.locator('[data-pdf-close]').click()
    await page.locator('#sPublish').click()
    await page.getByText('Não foi possível publicar', { exact:true }).waitFor()
    assert.equal(writes.at(-1).path, 'agenda/documentos')
    assert.ok(Object.values(writes.at(-1).body.value).includes(null))
    await page.locator('#sPublish').click()
    await page.locator('#sUnpublish').waitFor()
    assert.equal(await page.locator('#sGenerateAll').isDisabled(), true)
    assert.equal(data.publishedSnapshots[month].participants.antigo.name, 'Nome preservado no historico')
    assert.ok(await page.getByText('Pessoa teste um + Nome preservado no historico', { exact:true }).count())
    await page.waitForTimeout(300)
    await page.screenshot({ path:`.netlify/escala-${viewport.width}.png`, fullPage:true })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.locator('#btnBack').click()
    for (const tab of ['participantes','disponibilidade','locais','mensagens','pendencias','config']) {
      await page.locator(`[data-menu-card="${tab}"]`).click()
      if (tab === 'disponibilidade') assert.ok(!(await page.locator('#aPerson').textContent()).includes('Inativo central'))
      if (tab === 'config') await page.locator('#moduleMessage_escala_save').waitFor({ state:'attached' })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, tab)
      await page.locator('#btnBack').click()
    }
    await page.locator('#btnBack').click()
    await page.locator('#btnSair').waitFor({ state:'visible' })
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ viewport, writesIntercepted:writes.length, errors:errors.length, publicationRollback:true, oldMonthLocked:true, overflow:false }))
    await context.close()
  }
} finally { await browser.close() }
