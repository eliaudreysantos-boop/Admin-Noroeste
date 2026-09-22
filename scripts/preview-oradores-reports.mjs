import { mkdir, writeFile } from 'node:fs/promises'
import { createThemesReportPdf, createSubstitutionsReportPdf } from '../src/modules/oradores-reports.ts'
const folder=new URL('../output/oradores-review/',import.meta.url)
await mkdir(folder,{recursive:true})
const rows=Array.from({length:65},(_,i)=>({id:String(i),theme:{numero:i+1,titulo:`Tema ${i+1} - Como aplicar a sabedoria e fortalecer a esperança no dia a dia`,ativo:true},past:i%3===0,pending:i%2===0,lastPastDate:i%3===0?'2026-07-18':'',nextDate:i%2===0?'2026-11-21':''}))
await writeFile(new URL('temas-qa.pdf',folder),await createThemesReportPdf(rows,'Todos','', '2026-09-22'))
await writeFile(new URL('substituicoes-qa.pdf',folder),await createSubstitutionsReportPdf(Array.from({length:10},(_,i)=>({name:`Orador de exemplo ${i+1}`,themes:rows.slice(i*3,i*3+3).map(row=>row.theme)})),'2026-09-22'))
console.log('PDFs de QA gerados em output/oradores-review com dados fictícios.')
