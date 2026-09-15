import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const require = createRequire(process.env.PLAYWRIGHT_PACKAGE_JSON || new URL('../package.json', import.meta.url))
const { chromium } = require('playwright')
const browser = await chromium.launch({ headless:true, channel:'msedge' })
try {
  for (const viewport of [{ width:1440, height:900 }, { width:390, height:844 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers:'block' })
    const page = await context.newPage()
    await page.clock.setFixedTime(new Date('2026-09-14T12:00:00-03:00'))
    await page.addInitScript(() => {
      window.auditCopies = []
      window.auditLinks = []
      Object.defineProperty(navigator, 'clipboard', { value:{ writeText:async text => { window.auditCopies.push(text) } } })
      window.open = () => ({ opener:null, location:{ replace:url => window.auditLinks.push(url) } })
    })
    const errors = []
    const writes = []
    let failPublication = true
    let failRemoval = false
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/.netlify/functions/**', async route => {
      const url = new URL(route.request().url())
      const endpoint = url.pathname.split('/').pop()
      if (endpoint === 'auth-session') return route.fulfill({ json:{ uid:'audit', csrf:'a'.repeat(48), usuario:{ nome:'Auditoria', ativo:true, apps:{ mestre:true } } } })
      if (endpoint === 'auth-users') return route.fulfill({ json:{ audit:{ nome:'Auditoria', ativo:true } } })
      if (route.request().method() !== 'GET') {
        const body = route.request().postDataJSON()
        writes.push({ endpoint, path:url.searchParams.get('path'), body })
        if (endpoint === 'storage-file' && route.request().method() === 'POST') return route.fulfill({ json:{ url:'https://example.invalid/test.pdf' } })
        if (failPublication && url.searchParams.get('path') === 'tarefas/planning/oradoresPublicacoes' && Object.values(body.value).some(Boolean)) {
          failPublication = false
          return route.fulfill({ status:503, json:{ error:'Falha simulada no periodo' } })
        }
        if (failRemoval && url.searchParams.get('path') === 'agenda/documentos' && Object.values(body.value).includes(null)) {
          failRemoval = false
          return route.fulfill({ status:503, json:{ error:'Falha simulada na retirada' } })
        }
        return route.fulfill({ json:{ ok:true } })
      }
      const data = {
        'tarefas/discursos':{ oradores:{ a:{ tipo:'local', pessoaId:'m1', temaIds:['t1','t2'], aprovadoParaSaida:true, sentinelaDirigente:true }, b:{ tipo:'local', pessoaId:'m2', temaIds:['t1'], sentinelaSubstituto:true } }, temas:{ t1:{ numero:1, titulo:'Tema de teste' }, t2:{ numero:2, titulo:'Tema livre' } }, programacao:{ p1:{ data:'2026-09-20', tipo:'discurso_local', oradorId:'a', temaId:'t1', temaNumero:1, temaTitulo:'Tema de teste' } }, congregacoes:{ local:{ nome:'Congregacao teste', tipo:'local' } }, pendenciasIgnoradas:{ exemplo:'2026-09-01' } },
        'master/pessoas':{ m1:{ name:'Pessoa teste um', active:true, whatsapp:'5500000000000' }, m2:{ name:'Pessoa teste dois', active:true } },
        'tarefas/planning':{ meetingDays:{ weekendDow:0 } },
      }
      const paths = JSON.parse(url.searchParams.get('paths') || '[]')
      return route.fulfill({ json:paths.length ? { results:paths.map(path => ({ value:data[path] ?? {} })) } : { value:{} } })
    })
    await page.goto('http://localhost:5174/')
    await page.locator('[data-menu-card="oradores"]').click()
    await page.locator('[data-menu-card="pendencias"]').click()
    await page.locator('[data-pendencia-ignore]').first().waitFor()
    assert.equal(writes.length, 0, 'Abrir pendencias nao deve gravar')
    assert.equal(await page.locator('.modal').count(), 0, 'Abrir pendencias nao deve resolver automaticamente')
    await page.locator('[data-show-ignored]').check()
    await page.locator('[data-pendencia-reactivate]').waitFor()
    assert.equal(writes.length, 0, 'Mostrar ignoradas nao deve reativar')
    await page.locator('[data-pendencia-ignore]').first().click()
    await page.waitForFunction(() => document.querySelector('[data-show-ignored]')?.checked)
    assert.equal(writes.length, 1)
    await page.locator('[data-pendencia-reactivate="exemplo"]').click()
    assert.equal(writes.length, 2)
    await page.locator('[data-pendencia-resolver]').first().click()
    await page.locator('.modal').waitFor()
    await page.locator('.modal-overlay').evaluate(element => element.remove())
    await page.locator('#btnBack').click()
    await page.locator('[data-menu-card="pendencias"]').click()
    await page.waitForTimeout(400)
    await page.screenshot({ path:`.netlify/oradores-pendencias-${viewport.width}.png`, fullPage:true })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.locator('#btnBack').click()
    await page.locator('[data-menu-card="programacao"]').click()
    await page.locator('[data-edit-programacao]').first().click()
    await page.locator('#cancelProg').click()
    await page.locator('[data-programacao-request]').first().click()
    await page.locator('#oradoresWhatsappOpen').click()
    await page.getByText('WhatsApp aberto para revisão', { exact:true }).waitFor()
    assert.ok((await page.evaluate(() => window.auditLinks[0])).startsWith('https://wa.me/5500000000000?text='))
    await page.locator('#oradoresWhatsappClose').click()
    await page.locator('[data-download-programacao]').click()
    await page.locator('[data-pdf-close]').click()
    await page.locator('[data-publish-programacao]').click()
    await page.getByText('Não foi possível alterar a publicação', { exact:true }).waitFor()
    assert.ok(writes.some(write => write.path === 'agenda/documentos' && Object.values(write.body.value).includes(null)), 'Publicacao incompleta deve ser retirada')
    await page.locator('[data-publish-programacao]').click()
    await page.getByRole('button', { name:'Despublicar período', exact:true }).waitFor()
    failRemoval = true
    await page.locator('[data-publish-programacao]').click()
    await page.getByText('Não foi possível alterar a publicação', { exact:true }).waitFor()
    assert.ok(Object.values(writes.at(-1).body.value).some(Boolean), 'Falha de retirada deve restaurar marcador')
    await page.locator('[data-publish-programacao]').click()
    await page.getByRole('button', { name:'Publicar período', exact:true }).waitFor()
    await page.waitForTimeout(400)
    await page.screenshot({ path:`.netlify/oradores-programacao-${viewport.width}.png`, fullPage:true })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.locator('#btnBack').click()
    for (const tab of ['cadastro','designacoes','emergencia','temas','congregacoes','intercambios','eventos','config']) {
      await page.locator(`[data-menu-card="${tab}"]`).click()
      if (tab === 'config') await page.locator('#moduleMessage_oradores_save').waitFor({ state:'attached' })
      if (tab === 'cadastro' || tab === 'emergencia') {
        await page.locator(tab === 'cadastro' ? '[data-copy-approved-speakers]' : '[data-copy-emergency-themes]').click()
        const copied = await page.evaluate(() => window.auditCopies.at(-1))
        assert.ok(copied.includes('Pessoa teste um'))
        assert.ok(!copied.includes('5500000000000'))
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, tab)
      await page.locator('#btnBack').click()
    }
    await page.locator('#btnBack').click()
    await page.locator('#btnSair').waitFor({ state:'visible' })
    await page.locator('[data-menu-card="oradores"]').click()
    await page.locator('[data-menu-card="programacao"]').click()
    await page.locator('[data-programacao-type]').selectOption('saida_orador')
    await page.reload()
    await page.locator('[data-menu-card="oradores"]').click()
    await page.locator('[data-menu-card="programacao"]').click()
    assert.equal(await page.locator('[data-programacao-type]').inputValue(), 'saida_orador')
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ viewport, writesIntercepted:writes.length, pageErrors:errors.length, navigation:'Voltar > Voltar > Sair', overflow:false }))
    await context.close()
  }
} finally { await browser.close() }
