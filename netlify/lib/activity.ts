import { randomUUID } from 'node:crypto'
import type { AppSession } from './secure-session.ts'
import { pathModule, type ActivityEntry } from '../../src/modules/activity-domain.ts'
import { stableValue, type PublicationRoot } from '../../src/modules/publication-contract.ts'

export const ACTIVITY_ROOT='historicoOperacionalPrivado'
export function activityEntry(session:AppSession,action:ActivityEntry['action'],path:string,module=pathModule(path)):ActivityEntry {
  return {id:randomUUID(),at:new Date().toISOString(),actorId:session.uid,actorName:session.usuario.nome,module,action,paths:[path]}
}
/** Metadata only: never copy passwords, contact details, pairing tokens or field values. */
export function appendActivity(before:PublicationRoot,next:PublicationRoot|undefined,entry:ActivityEntry):PublicationRoot|undefined {
  if (!next || stableValue(before)===stableValue(next)) return next
  const history={...(next[ACTIVITY_ROOT]??{})}
  const previous=history[entry.module]?.[entry.id] as ActivityEntry|undefined
  const records={...(history[entry.module]??{}),[entry.id]:{...entry,paths:[...new Set([...(previous?.paths??[]),...entry.paths])].slice(0,30)}}
  const retained=Object.values(records).sort((a:any,b:any)=>b.at.localeCompare(a.at)||b.id.localeCompare(a.id)).slice(0,500) as ActivityEntry[]
  history[entry.module]=Object.fromEntries(retained.map(item=>[item.id,item]))
  return {...next,[ACTIVITY_ROOT]:history}
}
