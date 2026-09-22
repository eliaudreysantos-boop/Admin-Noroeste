import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

const require = createRequire(process.env.PLAYWRIGHT_PACKAGE_JSON || new URL('../package.json', import.meta.url))
const { chromium } = require('playwright')
const browser = await chromium.launch({ headless:true, channel:'msedge' })

const people = {
  m1:{ name:'Dirigente Um', active:true, sex:'M', role:'anciao', limpeza:{ grupo:1 } },
  m2:{ name:'Ajudante Dois', active:true, sex:'M', role:'publicador', limpeza:{ grupo:1 } },
}
const cleaningPeriod = {
  id:'2026-09', modo:'month', inicio:'2026-09-01', fim:'2026-09-30', congregacao:'Noroeste', publicado:false,
  semanas:[{ referencia:'2026-09-02', grupo:1, grupoNome:'Grupo 1', dataMeioSemana:'2026-09-02', dataFimSemana:'2026-09-06', superintendenteMid:'m1', ajudantesMid:['m2'], membrosMid:['m1','m2'] }],
}
const sources = {
  'master/pessoas':people,
  'master/config':{ congregacao:{ nome:'Noroeste' }, reunioes:{ meiaDeSemana:{ diaSemana:3, horario:'19:00' }, fimDeSemana:{ diaSemana:0, horario:'18:00' } }, limpeza:{ ativa:true, grupos:1, inicioRotacao:'2026-09-02' } },
  'master/config/congregacao':{ nome:'Noroeste' },
  tarefas:{
    people:{
      p1:{ masterId:'m1', name:'Dirigente Um', active:true, rule:'both', roles:{ microfone:true } },
      p2:{ masterId:'m2', name:'Ajudante Dois', active:true, rule:'both', roles:{ microfone:true } },
    },
    scale:{ periods:{ '2026-09':{ locked:false, meetings:{ mid:{ date:'2026-09-02', type:'midweek', assignments:{ mic1:'p1' } } } } } },
    planning:{ editingPeriod:'2026-09', periodMode:'month' }, events:{},
  },
  limpeza:{ periodos:{ '2026-09':cleaningPeriod } },
  servicoCampo:{
    leaders:{ m1:true },
    templates:{ t1:{ id:'t1', label:'Saída', dow:1, time:'08:30', location:'Salão', active:true, sortOrder:0, leaderIds:['m1'] } },
    periods:{ '2027-01':{ month:'2027-01', published:false, assignments:{ a1:{ id:'a1', templateId:'t1', date:'2027-01-04', time:'08:30', location:'Salão', label:'Saída', leaderId:'m1' } } } },
  },
}

sources.escala = {
  editingMonth:'2027-01',
  participants:{ p1:{ masterId:'m1', active:true }, p2:{ masterId:'m2', active:true } },
  scales:{ l1:{ name:'Praca', active:true, daysActive:[1], startTime:'08:00', endTime:'10:00', stepMinutes:120 } },
  tables:{"l1":{"2027-01":{"slots":["08:00"],"rows":{"2027-01-04":{"slots":{"08:00":{"p1":"p1","p2":"p2"}}}}}}},
}
const cases = [
  ['tarefas','escala','#btnTarefasPdf','#btnToggleTaskLock','tarefas/scale/periods'],
  ['limpeza','pdf','#btnGerarPdfLimpeza','#btnPublicarPdfLimpeza','limpeza/periodos'],
  ['servicoCampo','programacao','#servicePdf','#serviceReopen','servicoCampo'],
  ['escala','escalaAtual','#sPdf','#sUnpublish','escala'],
]
await mkdir('.netlify', { recursive:true })
try {
  for (const width of [1280, 390]) for (const [module, , buttonId, , periodPath] of cases) {
    const context = await browser.newContext({ viewport:{ width, height:900 }, serviceWorkers:'block' })
    const page = await context.newPage(), writes = [], errors = [], downloads = []
    let failure = 'upload'
    page.on('pageerror', error => errors.push(error.message))
    page.on('download', download => downloads.push(download))
    await page.clock.setFixedTime(new Date('2027-01-15T12:00:00-03:00'))
    await page.route('**/.netlify/functions/**', async route => {
      const req = route.request(), url = new URL(req.url()), endpoint = url.pathname.split('/').pop()
      if (endpoint === 'auth-session') return route.fulfill({ json:{ uid:'audit', csrf:'a'.repeat(48), usuario:{ nome:'Teste', ativo:true, apps:{ mestre:true } } } })
      if (endpoint === 'auth-users') return route.fulfill({ json:{} })
      if (req.method() !== 'GET') {
        const body = req.postDataJSON(), path = url.searchParams.get('path')
        writes.push({ endpoint, path, body, method:req.method() })
        if ((failure === 'upload' && endpoint === 'storage-file' && req.method() === 'POST') || (failure === 'period' && path === periodPath)) return route.fulfill({ status:503, json:{ error:'Falha simulada' } })
        if (endpoint === 'storage-file' && req.method() === 'POST') return route.fulfill({ json:{ url:'https://example.invalid/test.pdf' } })
        return route.fulfill({ json:{ ok:true } })
      }
      const paths = JSON.parse(url.searchParams.get('paths') || '[]')
      return route.fulfill({ json:{ results:paths.map(path => ({ value:sources[path] ?? {} })) } })
    })
    await page.goto(process.env.APP_TEST_URL || 'http://localhost:5180/')
    await page.locator('[data-menu-card="'+module+'"]').click()
    if (module === 'tarefas') await page.getByText('Refazer uma função ou ajustar a impressão', { exact:true }).click()
    const button = page.locator(buttonId)
    await button.waitFor()
    {
      const publish = page.locator(({ limpeza:'#btnPublicarPdfLimpeza', servicoCampo:'#servicePublish', tarefas:'#btnToggleTaskLock', escala:'#sPublish' })[module])
      const draft = page.waitForEvent('download')
      await button.click()
      const draftFile = await draft
      assert.equal(await draftFile.failure(), null)
      await draftFile.saveAs('.netlify/draft-'+module+'-'+width+'.pdf')
      assert.equal(writes.length, 0, 'draft download does not write or upload')
      for (const mode of ['upload', 'period']) {
        failure = mode
        await publish.click()
        await page.waitForFunction(() => !document.getElementById('appShell').inert)
        assert.equal(downloads.length, 1, 'publishing does not download')
        assert.equal(await publish.innerText(), 'Publicar no Quadro')
      }
      assert.ok(writes.some(item => item.path === 'agenda/documentos' && Object.values(item.body.value).includes(null)), 'failed period write rolls back publication')
      failure = ''
      const before = writes.length
      await publish.evaluate(button => { button.click(); button.click() })
      await page.getByRole('button', { name:'Reabrir para edição', exact:true }).waitFor()
      assert.equal(writes.slice(before).filter(item => item.endpoint === 'storage-file' && item.method === 'POST').length, 1)
      assert.equal(downloads.length, 1)
      const publishedWrites = writes.length
      const download = page.waitForEvent('download')
      await button.click()
      assert.equal(await (await download).failure(), null)
      assert.equal(writes.length, publishedWrites)
      if (module === 'servicoCampo') {
        await page.locator('[data-workspace-tab="configuracao"]').click()
        assert.equal(await page.locator('#serviceTemplateForm').isVisible(), false)
        await page.locator('.service-template summary').first().click()
        await page.locator('[data-edit-service-template]').click()
        assert.equal(await page.locator('#serviceTemplateForm').isVisible(), true)
      } else if (module === 'limpeza') {
        await page.getByText('Configurações de Limpeza',{exact:true}).click()
        await page.getByText('Grupos e participantes', { exact:true }).click()
        assert.equal(await page.locator('.limpeza-sel').first().isVisible(), false)
        await page.locator('#cleaningGroups summary').first().click()
        assert.equal(await page.locator('.limpeza-sel').first().isVisible(), true)
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      await page.screenshot({ path:'.netlify/separate-download-'+module+'-'+width+'.png', fullPage:true })
      assert.deepEqual(errors, [])
      console.log(JSON.stringify({ module, width, separateDownload:true, rollback:true, doubleClick:true, expandable:true }))
      await context.close()
      continue
    }
  }
} finally { await browser.close() }
