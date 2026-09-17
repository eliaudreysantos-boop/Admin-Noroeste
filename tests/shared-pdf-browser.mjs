import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const require = createRequire(process.env.PLAYWRIGHT_PACKAGE_JSON || new URL('../package.json', import.meta.url))
const { chromium } = require('playwright')
const browser = await chromium.launch({ headless: true, channel: 'msedge' })
try {
  const page = await browser.newPage()
  await page.route('**/.netlify/functions/**', route => route.fulfill({ json: {} }))
  await page.goto(process.env.APP_TEST_URL || 'http://localhost:5180/')
  for (const kind of ['servico-campo', 'limpeza']) {
    const downloadPromise = page.waitForEvent('download')
    const result = await page.evaluate(async kind => {
      try {
        if (kind === 'servico-campo') {
          const { downloadFieldServicePdf } = await import('/src/modules/servico-campo-documents.ts')
          const { generateFieldServicePeriod } = await import('/src/modules/servico-campo-domain.ts')
          const templates = Object.fromEntries(Array.from({ length:7 }, (_, dow) => [String(dow), { id:String(dow), dow, time:'08:30', location:'Salao', leaderIds:['m'], active:true, sortOrder:dow }]))
          const initial = generateFieldServicePeriod({ month:'2026-09', templates, leaderIds:['m'] })
          const completed = generateFieldServicePeriod({ month:'2026-09', templates, leaderIds:['m'], existing:initial })
          await downloadFieldServicePdf({ month: '2026-09', congregation: 'Teste', people: { m: { name: 'Pessoa Teste' } }, assignments: Object.values(completed.assignments) })
        } else {
          const { downloadCleaningPdf } = await import('/src/modules/limpeza-documents.ts')
          const { generateCleaningPeriod } = await import('/src/modules/limpeza-domain.ts')
          const period = generateCleaningPeriod('2026-09-01', 'bimester', { ativa:true, grupos:4, inicioRotacao:'2026-09-02', gruposConfig:{} }, { meiaDeSemana:{ diaSemana:3 }, fimDeSemana:{ diaSemana:0 } }, {}, 'Teste')
          await downloadCleaningPdf(period, { requestedFontSize: 10 })
        }
        return { ok: true }
      } catch (error) { return { ok: false, error: String(error) } }
    }, kind)
    console.log(kind, result)
    assert.equal(result.ok, true, result.error)
    const download = await downloadPromise
    assert.match(download.suggestedFilename(), /\.pdf$/)
    assert.equal(await download.failure(), null)
    assert.equal(await page.locator('iframe, .pdf-preview-modal').count(), 0)
  }
} finally { await browser.close() }
