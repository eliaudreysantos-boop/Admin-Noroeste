import { createHash } from 'node:crypto'
import { publicationSourceValue, publicationInput, publicationPeriod, periodIsPublished, publicationIssues, stableValue, type PublicationRoot } from '../../src/modules/publication-contract.ts'
import { officialDocumentId, type PublicPdfModule } from '../../src/modules/agenda-documents-domain.ts'
export const sourceHash=(root:PublicationRoot,module:PublicPdfModule,id:string):string=>createHash('sha256').update(publicationSourceValue(root,module,id)).digest('hex')
export const publicationVersion=(root:PublicationRoot,module:PublicPdfModule,id:string):string=>createHash('sha256').update(stableValue([publicationInput(root,module,id),publicationPeriod(root,module,id),periodIsPublished(root,module,id)])).digest('hex')
export function transitionPublication(current:PublicationRoot,module:PublicPdfModule,id:string,expectedHash:string,expectedDocument:unknown,document:unknown,expectedVersion?:string):PublicationRoot|undefined {
  if(expectedVersion && publicationVersion(current,module,id)!==expectedVersion)return undefined
  if(module!=='escala'&&module!=='oradores'&&!publicationPeriod(current,module,id))return undefined
  const key=officialDocumentId(module,id)
  if(sourceHash(current,module,id)!==expectedHash||stableValue(current.agenda?.documentos?.[key])!==stableValue(expectedDocument))return undefined
  if(document && publicationIssues(current,module,id).length)return undefined
  const next=structuredClone(current), published=Boolean(document), now=new Date().toISOString()
  next.agenda??={};next.agenda.documentos??={}
  if(document)next.agenda.documentos[key]=document
  else delete next.agenda.documentos[key]
  if(module==='tarefas')next.tarefas.scale.periods[id].locked=published
  if(module==='limpeza'){next.limpeza.periodos[id].publicado=published;next.limpeza.periodos[id].publicadoEm=published?now:null}
  if(module==='servicoCampo'){next.servicoCampo.periods[id].published=published;next.servicoCampo.periods[id].publishedAt=published?now:null}
  if(module==='escala') {
    next.escala.publishedMonths??={}
    if(published){next.escala.publishedMonths[id]=true;next.escala.publishedMonth=id
      const input=publicationInput(current,module,id)
      next.escala.publishedSnapshots??={};next.escala.publishedSnapshots[id]={month:id,publishedAt:now,tables:input.tables,participants:input.participants}
    }
    else {delete next.escala.publishedMonths[id];if(next.escala.publishedMonth===id)next.escala.publishedMonth=''}
  }
  return next
}
