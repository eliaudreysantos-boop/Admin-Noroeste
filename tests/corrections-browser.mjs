import { createRequire } from 'node:module'
import assert from 'node:assert/strict'

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

try {
  const context = await browser.newContext({ viewport:{ width:1280, height:800 }, serviceWorkers:'block' })
  const page = await context.newPage()
  await page.clock.setFixedTime(new Date('2027-01-15T12:00:00-03:00'))
  const pageErrors = []
  const writes = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.route('**/.netlify/functions/**', async route => {
    const url = new URL(route.request().url()), endpoint = url.pathname.split('/').pop()
    if (endpoint === 'auth-session') return route.fulfill({ json:{ uid:'audit', csrf:'a'.repeat(48), usuario:{ nome:'Auditoria', ativo:true, apps:{ mestre:true } } } })
    if (endpoint === 'auth-users') return route.fulfill({ json:{ audit:{ nome:'Auditoria', ativo:true } } })
    if (route.request().method() !== 'GET') {
      writes.push({ endpoint, method:route.request().method(), path:url.searchParams.get('path'), body:route.request().postDataJSON() })
      if (endpoint === 'storage-file' && route.request().method() === 'POST') return route.fulfill({ json:{ url:'https://example.invalid/audit.pdf' } })
      return route.fulfill({ json:{ ok:true } })
    }
    const paths = JSON.parse(url.searchParams.get('paths') || '[]')
    if (paths.includes('servicoCampo') || paths.includes('tarefas')) await new Promise(resolve => setTimeout(resolve, 2500))
    return route.fulfill({ json:{ results:paths.map(path => ({ value:sources[path] ?? {} })) } })
  })

  await page.goto(process.env.APP_TEST_URL || 'http://127.0.0.1:5174/')

  await page.locator('[data-menu-card="servicoCampo"]').click()
  await page.locator('[data-menu-card="programacao"]').waitFor({ timeout:300 })
  await page.locator('[data-menu-card="programacao"]').click()
  await page.getByText('Carregando dados...', { exact:true }).waitFor()
  {
    const downloaded = page.waitForEvent('download')
    await page.locator('#servicePdf').click()
    assert.equal(await (await downloaded).failure(), null)
  }
  await page.locator('#serviceReopen').waitFor()
  assert.ok(writes.some(write => write.path === 'servicoCampo' && write.body?.value?.['periods/2027-01/published'] === true))
  page.once('dialog', dialog => dialog.accept())
  await page.locator('#serviceReopen').click()
  await page.getByRole('button', { name:'Baixar PDF e publicar período', exact:true }).waitFor()
  assert.ok(writes.some(write => write.path === 'servicoCampo' && write.body?.value?.['periods/2027-01/published'] === false))
  await page.locator('#btnBack').click()
  await page.locator('#btnBack').click()

  await page.locator('[data-menu-card="limpeza"]').click()
  await page.locator('[data-menu-card="pdf"]').click()
  {
    const downloaded = page.waitForEvent('download')
    await page.locator('#btnGerarPdfLimpeza').click()
    assert.equal(await (await downloaded).failure(), null)
  }
  await page.getByRole('button', { name:'Reabrir período', exact:true }).waitFor()
  assert.ok(writes.some(write => write.path === 'limpeza/periodos' && write.body?.value?.['2026-09/publicado'] === true))
  await page.getByRole('button', { name:'Reabrir período', exact:true }).click()
  await page.getByRole('button', { name:'Baixar PDF e publicar período', exact:true }).waitFor()
  assert.ok(writes.some(write => write.path === 'limpeza/periodos' && write.body?.value?.['2026-09/publicado'] === false))
  await page.locator('#btnBack').click()
  await page.locator('#btnBack').click()

  await page.locator('[data-menu-card="tarefas"]').click()
  await page.locator('[data-menu-card="escala"]').waitFor({ timeout:300 })
  await page.locator('[data-menu-card="escala"]').click()
  await page.getByText('Carregando dados...', { exact:true }).waitFor()
  await page.getByText('Refazer uma função ou ajustar a impressão', { exact:true }).click()
  {
    const downloaded = page.waitForEvent('download')
    await page.locator('#btnTarefasPdf').click()
    assert.equal(await (await downloaded).failure(), null)
  }
  await page.getByRole('button', { name:'Reabrir escala', exact:true }).waitFor()
  await page.locator('#btnToggleTaskLock').click()
  await page.getByText('Refazer uma função ou ajustar a impressão', { exact:true }).click()
  await page.getByRole('button', { name:'Baixar PDF e publicar período', exact:true }).waitFor()
  assert.ok(writes.some(write => write.path === 'tarefas/scale/periods' && write.body?.value?.['2026-09/locked'] === true))

  assert.deepEqual(pageErrors, [])
  assert.ok(writes.some(write => write.endpoint === 'storage-file' && write.method === 'POST'))
  assert.ok(writes.some(write => write.path === 'agenda/documentos'))
  console.log(JSON.stringify({ taskImmediateIndex:true, fieldServiceDownload:true, cleaningDownload:true, taskDownload:true, simulatedPublication:true, simulatedReopen:true, pageErrors:0 }))
  await context.close()
} finally {
  await browser.close()
}
