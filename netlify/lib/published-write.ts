import { conditionalPatch, conditionalValue } from './conditional-write.ts'
import { activeData, preserveArchivedTasks } from './retired-data.ts'
import { publicationPeriod, periodIsPublished, stableValue, type PublicationRoot } from '../../src/modules/publication-contract.ts'

export const guardedModulePath=(path:string):boolean=>/^(tarefas|limpeza|escala|servicoCampo)(\/|$)/.test(path)

/** Runs inside the same root transaction as the edit, closing the publish/edit race. */
export function guardedModuleWrite(current:PublicationRoot,path:string,method:string,value:unknown,hasExpected=false,expected?:unknown):PublicationRoot|undefined {
  const keys=path.split('/'), read=(root:any)=>keys.reduce((parent,key)=>parent?.[key]??null,root)
  const before=read(current)
  let proposed:unknown
  if(method==='DELETE')proposed=null
  else if(hasExpected)proposed=method==='PATCH'?conditionalPatch(before,expected as Record<string,unknown>,value as Record<string,unknown>):conditionalValue(path==='tarefas'?activeData(path,before):before,expected,value??null)
  else if(method==='PATCH') {
    if(!value||typeof value!=='object'||Array.isArray(value))return undefined
    const patch=value as Record<string,unknown>
    const baseline=Object.fromEntries(Object.keys(patch).map(key=>[key,key.split('/').reduce<any>((parent,part)=>parent?.[part]??null,before)]))
    proposed=conditionalPatch(before,baseline,patch)
  }else proposed=value??null
  if(proposed===undefined)return undefined
  if(path==='tarefas')proposed=preserveArchivedTasks(before,proposed)
  const next=structuredClone(current??{});let parent=next
  for(const key of keys.slice(0,-1))parent=(parent[key]??={})
  if(proposed===null)delete parent[keys[keys.length-1]];else parent[keys[keys.length-1]]=proposed
  for(const module of ['tarefas','limpeza','servicoCampo','escala'] as const) {
    const periods=(root:PublicationRoot)=>module==='tarefas'?root.tarefas?.scale?.periods:module==='limpeza'?root.limpeza?.periodos:module==='servicoCampo'?root.servicoCampo?.periods:root.escala?.publishedMonths
    const ids=new Set([...Object.keys(periods(current)??{}),...Object.keys(periods(next)??{})])
    if(module==='escala'){if(current.escala?.publishedMonth)ids.add(current.escala.publishedMonth);if(next.escala?.publishedMonth)ids.add(next.escala.publishedMonth)}
    for(const id of ids) {
      const locked=periodIsPublished(current,module,id)
      if(locked!==periodIsPublished(next,module,id))return undefined
      if(locked&&stableValue(publicationPeriod(current,module,id))!==stableValue(publicationPeriod(next,module,id)))return undefined
      if(module==='escala'&&locked&&stableValue(current.escala?.monthExclusions?.[id])!==stableValue(next.escala?.monthExclusions?.[id]))return undefined
    }
  }
  return next
}
