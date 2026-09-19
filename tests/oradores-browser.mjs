import { createRequire } from 'node:module'
import assert from 'node:assert/strict'

const require = createRequire(process.env.PLAYWRIGHT_PACKAGE_JSON || new URL('../package.json', import.meta.url))
const { chromium } = require('playwright')
const browser = await chromium.launch({ channel:'msedge', headless:true })

const source = {
  'tarefas/discursos':{
    oradores:{ local:{ nome:'André Almeida', tipo:'local', funcao:'anciao', telefone:'5585999999999', ativo:true, temaIds:['tema_001'], aprovadoParaSaida:true }, visitante:{ nome:'Carlos Oliveira', tipo:'visitante', funcao:'anciao', telefone:'5585888888888', ativo:true, temaIds:['tema_001'], congregacaoId:'centro' } },
    temas:{ tema_001:{ numero:1, titulo:'Como encontrar verdadeira paz', ativo:true } },
    congregacoes:{ local:{ nome:'Noroeste', cidade:'Fortaleza', tipo:'local', ativa:true, contato:'', telefone:'', diaReuniao:'Domingo', horario:'18:00', localizacao:'', observacoes:'', secao:'s2' }, centro:{ nome:'Centro', cidade:'Fortaleza', tipo:'visitante', ativa:true, contato:'José', telefone:'5585777777777', diaReuniao:'Sábado', horario:'19:00', localizacao:'Centro', observacoes:'' } },
    programacao:{ p1:{ data:'2026-09-20', tipo:'discurso_visitante', status:'por_confirmar', secao:'s2', oradorId:'visitante', oradorNome:'Carlos Oliveira', temaId:'tema_001', temaNumero:1, temaTitulo:'Como encontrar verdadeira paz', congregacaoOrigemId:'centro', congregacaoOrigemNome:'Centro' }, p2:{ data:'2026-09-27', tipo:'saida_orador', status:'confirmado', oradorId:'local', oradorNome:'André Almeida', temaId:'tema_001', temaNumero:1, temaTitulo:'Como encontrar verdadeira paz', congregacaoDestinoId:'centro', congregacaoDestinoNome:'Centro', confirmacao:{status:true,confirmadoEm:'2026-09-01'} } },
  },
  'tarefas/events':{ e1:{ data:'2026-09-13', titulo:'Assembleia', tipo:'congresso_assembleia', impactoTarefas:{bloqueiaReuniao:true} } },
  'tarefas/planning':{ periodMode:'month', meetingDays:{weekendDow:0}, excludedDates:[], enableSection1:false, s2Time:'18:00' },
  'tarefas/people':{},
}

try {
  for (const width of [1280,390]) {
    const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',acceptDownloads:true})
    const page=await context.newPage(), errors=[]
    page.on('pageerror',error=>errors.push(error.message))
    await page.route('**/.netlify/functions/**',route=>{
      const url=new URL(route.request().url()),endpoint=url.pathname.split('/').pop()
      if(endpoint==='auth-session')return route.fulfill({json:{uid:'audit',csrf:'a'.repeat(48),usuario:{nome:'Auditoria',ativo:true,apps:{mestre:false,oradores:true}}}})
      if(endpoint==='auth-users')return route.fulfill({json:{}})
      if(route.request().method()!=='GET')return route.fulfill({json:endpoint==='storage-file'?{url:'https://example.test/oradores.pdf'}:{ok:true}})
      const paths=JSON.parse(url.searchParams.get('paths')||'[]')
      return route.fulfill({json:{results:paths.map(path=>({value:source[path]??{}}))}})
    })
    await page.goto(process.env.APP_TEST_URL||'http://127.0.0.1:5191/')
    await page.getByRole('heading',{name:'Oradores',exact:true}).waitFor()
    await page.locator('#oradoresMonth').fill('2026-09')
    await page.locator('#oradoresMonth').dispatchEvent('change')
    await page.getByText('Carlos Oliveira',{exact:true}).waitFor()
    assert.equal(await page.locator('input[placeholder*="Buscar" i], input[type="search"]').count(),0)
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true)
    const downloaded=page.waitForEvent('download')
    await page.locator('#speakerSchedulePdf').click()
    assert.equal(await (await downloaded).failure(),null)
    assert.equal(await page.locator('#speakerSchedulePublish').isEnabled(),true)
    await page.locator('#speakerSchedulePublish').click()
    await page.getByText('PDF de Oradores publicado no Quadro',{exact:true}).waitFor()
    for(const tab of ['oradores','designacoes','emergencia','congregacoes','intercambios','temas','eventos','pendencias']){
      await page.locator(`[data-workspace-tab="${tab}"]`).last().click()
      await page.waitForFunction(()=>!document.querySelector('#oradoresRoot')?.textContent?.includes('Carregando'))
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${tab} sem overflow em ${width}px`)
    }
    assert.deepEqual(errors,[])
    await context.close()
  }
} finally { await browser.close() }
