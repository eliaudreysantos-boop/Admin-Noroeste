import { assignmentForRole,manualConflictReason,meetingEntries,TASK_ROLES,type TaskDomainContext,type TaskMeetingEntry,type TaskRole } from './tarefas-domain.ts'
import type { FieldServiceAssignment } from './servico-campo-domain.ts'
import type { RawPessoas } from '../types.ts'
export interface SubstituteCandidate { id:string; name:string; count:number; reason:string }
export const rankCandidates=(items:SubstituteCandidate[])=>items.sort((a,b)=>Number(Boolean(a.reason))-Number(Boolean(b.reason))||a.count-b.count||a.name.localeCompare(b.name,'pt-BR'))
export function taskSubstitutes(context:TaskDomainContext,entry:TaskMeetingEntry,role:TaskRole):SubstituteCandidate[] {
  const month=entry.meeting.date?.slice(0,7),current=assignmentForRole(entry.meeting,role)
  return rankCandidates(Object.entries(context.people).filter(([id])=>id!==current).map(([id,p])=>({id,name:p.name||p.nome||id,reason:manualConflictReason(context,entry,role,id)||'',count:meetingEntries(context.periods).filter(e=>e.meeting.date?.startsWith(month??'')).reduce((sum,e)=>sum+TASK_ROLES.filter(r=>assignmentForRole(e.meeting,r)===id).length,0)})))
}
export function fieldSubstitutes(item:FieldServiceAssignment,assignments:FieldServiceAssignment[],leaders:Record<string,boolean>,people:RawPessoas):SubstituteCandidate[] {
  return rankCandidates(Object.keys(leaders).filter(id=>leaders[id]&&id!==item.leaderId).map(id=>({id,name:people[id]?.name||id,count:assignments.filter(a=>a.leaderId===id).length,reason:!people[id]||people[id].active===false||people[id].sex!=='M'?'Cadastro inativo ou não habilitado':assignments.some(a=>a.id!==item.id&&a.leaderId===id&&a.date===item.date&&a.time===item.time)?'Já dirige uma saída nesta data e horário':''})))
}
