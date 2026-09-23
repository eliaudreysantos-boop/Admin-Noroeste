import type { AgendaEvent } from './individual-domain.ts'
export const AGENDA_SOURCES=['tarefas','oradores','limpeza','escala','servicoCampo','quadro'] as const
export function mergeAgendaSources<T extends AgendaEvent>(previous:T[],incoming:T[],completed:string[]):T[] {
  return [...previous.filter(event=>!completed.includes(event.source)),...incoming.filter(event=>completed.includes(event.source))].sort((a,b)=>a.date.localeCompare(b.date)||(a.time??'').localeCompare(b.time??''))
}
