import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { sourceHash, publicationVersion, transitionPublication } from '../netlify/lib/publication-transition.ts'
import { officialDocumentId } from '../src/modules/agenda-documents-domain.ts'
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true})
const month='2026-09'
const fixture=()=>({
  master:{pessoas:{m:{name:'Ana',active:true,sex:'M'}},config:{}},
  tarefas:{people:{p:{masterId:'m',active:true}},scale:{periods:{[month]:{meetings:{a:{date:'2026-09-20',type:'weekend',assignments:{presidente:'p'}}}}}},discursos:{}},
  limpeza:{periodos:{[month]:{inicio:'2026-09-01',fim:'2026-09-30',congregacao:'Noroeste',semanas:[]}}},
  servicoCampo:{leaders:{m:true},periods:{[month]:{month,assignments:{}}}},
  escala:{participants:{m:{active:true}},scales:{l:{name:'Praça',slots:['09:00'],daysActive:[0]}},tables:{l:{[month]:{slots:['09:00'],rows:{'2026-09-20':{slots:{'09:00':{p1:'m'}}}}}}}}
})
try {
  for(const width of [1280,390]) {
    const page=await browser.newPage({viewport:{width,height:900},serviceWorkers:'block'})
    const errors=[],uploads=[],requests=[]
    let root=fixture(),conflict=false
    page.on('pageerror',error=>errors.push(error.message))
    await page.route('**/.netlify/functions/**',async route=>{
      const request=route.request(),url=new URL(request.url()),endpoint=url.pathname.split('/').pop()
      requests.push({endpoint,method:request.method(),sources:url.searchParams.get('sources')})
      if(endpoint==='module-publication') {
        const b=request.postDataJSON(),key=officialDocumentId(b.module,b.periodId)
        if(b.action==='status')return route.fulfill({json:{hash:sourceHash(root,b.module,b.periodId),document:root.agenda?.documentos?.[key]??null}})
        if(b.action==='prepare')return route.fulfill({json:{root,hash:sourceHash(root,b.module,b.periodId),version:publicationVersion(root,b.module,b.periodId),previous:root.agenda?.documentos?.[key]??null}})
        const next=transitionPublication(root,b.module,b.periodId,b.hash,b.previous,b.document,b.version)
        if(!next)return route.fulfill({status:409,json:{error:'Conflito simulado'}})
        root=next;return route.fulfill({json:{ok:true}})
      }
      if(endpoint==='storage-file') {
        assert.equal(request.method(),'POST','não excluir arquivo após resposta incerta')
        const b=request.postDataJSON();assert.equal(Buffer.from(b.base64,'base64').subarray(0,4).toString(),'%PDF');uploads.push(b.path)
        if(conflict)root.master.pessoas.m.name='Nome atualizado'
        return route.fulfill({json:{url:url.origin+'/.netlify/functions/storage-file?path='+encodeURIComponent(b.path)}})
      }
      if(endpoint==='agenda-device')return route.fulfill({json:request.method()==='GET'?{people:{},masterId:''}:{masterId:'m',person:{name:'Ana',active:true}}})
      if(endpoint==='agenda-data') {
        const retry=url.searchParams.get('sources')!==null
        return route.fulfill({json:{masterId:'m',person:{name:'Ana',active:true},events:[],announcements:[],agenda:{},completedSources:retry?['limpeza']:['tarefas','oradores','escala','servicoCampo','quadro'],failedSources:retry?[]:['limpeza']}})
      }
      return route.fulfill({json:{}})
    })
    await page.route('**/__integration',route=>route.fulfill({contentType:'text/html',body:'<html><body><div id="status"></div></body></html>'}))
    const origin=process.env.APP_TEST_URL||'http://127.0.0.1:5191/'
    await page.goto(new URL('__integration',origin).href)
    for(const module of ['tarefas','limpeza','escala','servicoCampo','oradores']) {
      await page.evaluate(async({module,month,root})=>{
        const {publishModulePeriod,renderPublicationStatus}=await import('/src/modules/module-publication.ts')
        const {publicationPeriod}=await import('/src/modules/publication-contract.ts')
        await publishModulePeriod(module,month,publicationPeriod(root,module,month))
        await renderPublicationStatus(document.querySelector('#status'),module,month)
      },{module,month,root})
      assert.match(await page.locator('#status').innerText(),/Publicado e atualizado/)
    }
    assert.equal(uploads.length,5)
    const before=structuredClone(root.agenda.documentos)
    conflict=true
    const failed=await page.evaluate(async({month,root})=>{
      const {publishModulePeriod}=await import('/src/modules/module-publication.ts')
      try{await publishModulePeriod('tarefas',month,root.tarefas.scale.periods[month]);return false}catch{return true}
    },{month,root})
    assert.equal(failed,true)
    assert.deepEqual(root.agenda.documentos,before)
    assert.equal(new Set(uploads).size,6)
    await page.goto(new URL('agenda/',origin).href)
    await page.locator('#agendaPairingCode').waitFor()
    assert.equal(await page.locator('#agendaPerson').isVisible(),false)
    await page.locator('#agendaPairingCode').fill('ABCD-EF01-2345-6789')
    await page.locator('#agendaContinue').click()
    await page.locator('[data-sync-failure]').waitFor()
    assert.match(await page.locator('[data-sync-failure]').innerText(),/Limpeza/)
    await page.locator('[data-sync-failure] button').click()
    await page.locator('[data-sync-failure]').waitFor({state:'detached'})
    assert.equal(requests.filter(r=>r.endpoint==='agenda-data').at(-1).sources,'limpeza')
    assert.deepEqual(errors,[])
    console.log('Integração '+width+'px: cinco PDFs reais, publicação, conflito, código e retry parcial OK')
    await page.close()
  }
}finally{await browser.close()}
