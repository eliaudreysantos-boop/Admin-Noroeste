import { apiJson,uploadPdf } from '../secure-api.ts'
import { officialDocumentId,type PublicPdfModule } from './agenda-documents-domain.ts'
import { publicationInput,type PublicationRoot } from './publication-contract.ts'
import type { AgendaPublicDocument } from '../types.ts'

export async function renderPublicationStatus(host:HTMLElement|null,module:PublicPdfModule,periodId:string):Promise<void> {
  if(!host)return
  host.querySelector('[data-publication-state]')?.remove()
  const label=document.createElement('p');label.className='notice';label.dataset.publicationState='';label.setAttribute('aria-live','polite');label.textContent='Consultando publicação…';host.append(label)
  try {
    const response=await apiJson<{hash:string;document:AgendaPublicDocument|null}>('module-publication',{method:'POST',body:JSON.stringify({action:'status',module,periodId})})
    if(!label.isConnected)return
    label.textContent=!response.document?'Ainda não publicado no Quadro.':!response.document.sourceHash?'Publicação anterior: publique novamente para verificar a versão.':response.document.sourceHash===response.hash?'Publicado e atualizado.':'Publicado, mas os dados mudaram. Confira e publique novamente.'
  }catch{if(label.isConnected)label.textContent='Não foi possível conferir a publicação. Reabra o módulo para tentar novamente.'}
}

export async function publishModulePeriod(module:PublicPdfModule,periodId:string,expectedPeriod:unknown,requestedFontPt=12,reopen=false):Promise<void> {
  const prepared=await apiJson<{root:PublicationRoot;hash:string;version:string;previous:AgendaPublicDocument|null}>('module-publication',{method:'POST',body:JSON.stringify({action:'prepare',module,periodId,expectedPeriod,reopen})})
  let document:AgendaPublicDocument|null=null
  if(!reopen) {
    const input=publicationInput(prepared.root,module,periodId),month=periodId.slice(0,7)
    let bytes:Uint8Array
    if(module==='tarefas')bytes=(await (await import('./tarefas-documents')).createTaskSchedulePdf(input.meetings,input.congregation,input.people,requestedFontPt)).bytes
    else if(module==='limpeza')bytes=(await (await import('./limpeza-documents')).createCleaningPdf(input,{requestedFontSize:requestedFontPt})).bytes
    else if(module==='escala')bytes=(await (await import('./escala-documents')).createScaleSchedulePdf({...input,requestedFontPt})).bytes
    else if(module==='servicoCampo')bytes=await (await import('./servico-campo-documents')).createFieldServicePdf(input)
    else bytes=await (await import('./oradores-documents')).createSpeakersSchedulePdf(input)
    const storagePath=`agenda/documentos/modulos/${module}/${periodId}-${crypto.randomUUID()}.pdf`
    const url=await uploadPdf(storagePath,bytes)
    const dates=module==='tarefas'?input.meetings.map((m:{date:string})=>m.date).sort():[]
    const inicio=module==='limpeza'?input.inicio:dates[0]??`${month}-01`
    const fim=module==='limpeza'?input.fim:dates[dates.length-1]??new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10)
    document={id:officialDocumentId(module,periodId),modulo:module,tipo:'modulo',periodo:periodId,nome:`${module}-${periodId}.pdf`,inicio,fim,origemPeriodoId:periodId,storagePath,url,criadoEm:new Date().toISOString(),sourceHash:prepared.hash}
  }
  // Never delete a candidate after an uncertain response: it may be the committed PDF.
  // Superseded files remain recoverable; the official pointer and lock change atomically.
  await apiJson('module-publication',{method:'POST',body:JSON.stringify({action:'commit',module,periodId,hash:prepared.hash,version:prepared.version,previous:prepared.previous,document})})
}
