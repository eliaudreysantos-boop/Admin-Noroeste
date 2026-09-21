import type { AgendaEvent } from './individual-domain'
export interface AgendaChange { kind:'alterado' | 'retirado' | 'adicionado'; before?:AgendaEvent; after?:AgendaEvent; detectedAt:string }
export interface AgendaHistory { events:AgendaEvent[]; changes:AgendaChange[] }
const key = (event:AgendaEvent):string => `${event.source}:${event.id}`
const content = (event:AgendaEvent):string => JSON.stringify([event.date,event.time,event.title,event.detail,event.location,event.status])
export function updateAgendaHistory(previous:AgendaHistory | null, events:AgendaEvent[], now:string, today:string):AgendaHistory {
  if (!previous) return { events, changes:[] }
  const before = new Map(previous.events.map(event => [key(event), event]))
  const after = new Map(events.map(event => [key(event), event]))
  const changes:AgendaChange[] = []
  before.forEach((event, id) => {
    const current = after.get(id)
    if (event.date < today && (!current || current.date < today)) return
    if (!current) changes.push({ kind:'retirado', before:event, detectedAt:now })
    else if (content(event) !== content(current)) changes.push({ kind:'alterado', before:event, after:current, detectedAt:now })
  })
  after.forEach((event,id) => {
    if (!before.has(id) && event.date >= today) changes.push({ kind:'adicionado', after:event, detectedAt:now })
  })
  return { events, changes:[...changes,...previous.changes].slice(0,100) }
}
