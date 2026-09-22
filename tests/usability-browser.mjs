import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE_JSON || new URL('../package.json',import.meta.url))
const {chromium}=require('playwright')
const browser=await chromium.launch({channel:'msedge',headless:true})
try {
  for(const width of [1280,390]) {
    const page=await browser.newPage({viewport:{width,height:900},serviceWorkers:'block'})
    await page.route('**/.netlify/functions/**',route=>route.fulfill({json:{}}))
    await page.route('**/__test-usability',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}))
    await page.goto(new URL('__test-usability',process.env.APP_TEST_URL||'http://127.0.0.1:5191/').href)
    await page.evaluate(async()=>{
      const feedback=await import('/src/ui/editor-feedback.ts')
      feedback.installEditorFeedback()
      ;(await import('/src/ui/person-search.ts')).installPersonSearch()
      ;(await import('/src/ui/month-navigation.ts')).installMonthNavigation()
      document.body.innerHTML='<div class="modal" id="testEditor"><select id="taskPersonMaster"><option value="">Escolha</option><option value="a">André</option><option value="b">Bruno</option><option value="c">Bruno</option></select><input id="notes"><button id="saveExample">Salvar</button><button id="cancelExample">Cancelar</button></div><input type="month" value="2026-09"><button data-workspace-tab="example" id="navigateExample">Outra tela</button>'
      window.navigations=0
      document.querySelector('#navigateExample').addEventListener('click',()=>window.navigations++)
    })
    await page.locator('[data-person-search]').fill('andre')
    assert.equal(await page.locator('#taskPersonMaster option').count(),2)
    await page.locator('#taskPersonMaster').selectOption('a')
    await page.locator('[data-person-search]').fill('bruno')
    assert.equal(await page.locator('#taskPersonMaster').inputValue(),'a')
    assert.match(await page.locator('#taskPersonMaster option[value="b"]').textContent(),/ID b/)
    await page.locator('#notes').fill('Manter preenchimento')
    page.once('dialog',dialog=>dialog.dismiss())
    await page.locator('#navigateExample').click()
    assert.equal(await page.evaluate(()=>window.navigations),0)
    page.once('dialog',dialog=>dialog.dismiss())
    await page.getByRole('button',{name:'Próximo mês'}).click()
    assert.equal(await page.locator('input[type="month"]').inputValue(),'2026-09')
    await page.evaluate(async()=>{
      const helper=await import('/src/ui/editor-feedback.ts')
      window.releaseSave=helper.editorBusy(document.querySelector('#testEditor'))
      helper.editorError(document.querySelector('#testEditor'))
    })
    assert.equal(await page.locator('#notes').isDisabled(),true)
    assert.equal(await page.locator('#cancelExample').isDisabled(),true)
    assert.equal(await page.locator('#saveExample').textContent(),'Salvando…')
    await page.locator('#navigateExample').click()
    assert.equal(await page.evaluate(()=>window.navigations),0)
    await page.evaluate(()=>window.releaseSave())
    assert.equal(await page.locator('#notes').inputValue(),'Manter preenchimento')
    assert.match(await page.locator('[data-editor-error]').innerText(),/mantido/)
    await page.evaluate(async()=>{const helper=await import('/src/ui/editor-feedback.ts');helper.editorSaved(document.querySelector('#testEditor'))})
    assert.equal(await page.locator('[data-editor-error]').count(),0)
    await page.locator('#navigateExample').click()
    assert.equal(await page.evaluate(()=>window.navigations),1)
    console.log(`Usabilidade ${width}px: busca por nome/ID, homônimos, descarte, mês, falha e salvamento OK`)
    await page.close()
  }
} finally {await browser.close()}
