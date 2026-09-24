import type { AppPermissions } from '../types.ts'
import { activityAllowed } from './activity-domain.ts'
import { canonicalTaskPerson,resolveCentralPerson } from './central-person.ts'
import { TASK_ROLES,assignmentForRole,meetingEntries,roleApplies,manualConflictReason,meetingIsBlocked,type TaskDomainContext,type TaskPerson } from './tarefas-domain.ts'
import { normalizeSpeakersRoot,selectSecondSection,speakerPendingItems } from './oradores-domain.ts'
import { resolveSpeakerMasterId,canonicalSpeaker } from './oradores-editor-domain.ts'
import { activeDates,localSlots,isBlocked,validatePair,type EscalaParticipant } from './escala-domain.ts'
import { fieldServiceConflicts } from './servico-campo-domain.ts'
import type { PublicationRoot } from './publication-contract.ts'
import type { PublicPdfModule } from './agenda-documents-domain.ts'
import { fortalezaToday,isValidCivilDate } from './civil-date.ts'

export interface OperationIssue { module:PublicPdfModule; title:string; date:string }
export interface WorkloadRow { module:PublicPdfModule; id:string; name:string; count:number; active:boolean }
export function operationsSummary(root:PublicationRoot,apps:AppPermissions,month:string,today=fortalezaToday()) {
  const issues:OperationIssue[]=[],rows=new Map<string,WorkloadRow>(),people=root.master?.pessoas??{}
  const issue=(module:PublicPdfModule,title:string,date='')=>issues.push({module,title,date})
  const member=(module:PublicPdfModule,id:string,name:string,active=true)=>{
    const key=module+'/'+id
    if(!rows.has(key))rows.set(key,{module,id,name:name||id,count:0,active})
    return rows.get(key)!
  }
  const count=(module:PublicPdfModule,id:string,name:string,active=true)=>{if(id)member(module,id,name,active).count++}
  const future=(date:string)=>isValidCivilDate(date)&&date.startsWith(month)&&date>=today
  if(activityAllowed(apps,'tarefas')) {
    const tasks=root.tarefas??{},profiles:Record<string,TaskPerson>=Object.fromEntries(Object.entries(tasks.people??{}).map(([id,p]:any)=>[id,canonicalTaskPerson(id,p,people)]))
    const context:TaskDomainContext={people:profiles,periods:tasks.scale?.periods??{},events:tasks.events??{},discursos:tasks.discursos??{},engineRules:tasks.planning?.engineRules}
    for(const [id,p] of Object.entries(profiles))if(p.active!==false&&p.rule!=='none')member('tarefas',p.masterId||id,p.name||id)
    for(const entry of meetingEntries(context.periods)) {
      const date=entry.meeting.date??''
      if(!date.startsWith(month)||!TASK_ROLES.some(role=>roleApplies(role,entry.meeting))||meetingIsBlocked(context,entry.meeting))continue
      const reasons:string[]=[]
      for(const role of TASK_ROLES.filter(role=>roleApplies(role,entry.meeting))) {
        const id=assignmentForRole(entry.meeting,role),p=profiles[id??'']
        if(id)count('tarefas',p?.masterId||id,p?.name||'Cadastro não encontrado',p?.active===true)
        if(id&&manualConflictReason(context,entry,role,id))reasons.push('designações com conflito')
      }
      if(future(date)&&reasons.length)issue('tarefas',[...new Set(reasons)].join(' · '),date)
    }
  }
  if(activityAllowed(apps,'oradores')) {
    const talks=selectSecondSection(normalizeSpeakersRoot(root.tarefas?.discursos??{}))
    talks.oradores=Object.fromEntries(Object.entries(talks.oradores??{}).map(([id,p])=>[id,canonicalSpeaker(p,people,root.tarefas?.people??{})]))
    for(const [id,p] of Object.entries(talks.oradores??{}))if(p.ativo!==false)member('oradores',id,p.nome)
    for(const item of Object.values(talks.programacao??{}))if(item.data?.startsWith(month))for(const id of [item.oradorId,item.oradorSecundarioId].filter(Boolean) as string[]) {
      const p=talks.oradores?.[id],mid=p?resolveSpeakerMasterId(p,people,root.tarefas?.people??{}):''
      count('oradores',id,(mid&&people[mid]?.name)||p?.nome||'Cadastro não encontrado',p?.ativo!==false)
    }
    for(const item of speakerPendingItems(talks,today))if(item.date.startsWith(month))issue('oradores',item.title,item.date)
    for(const item of Object.values(talks.programacao??{}))if(future(item.data))for(const id of [item.oradorId,item.oradorSecundarioId].filter(Boolean) as string[])if(!talks.oradores?.[id]?.ativo)issue('oradores','Orador inativo ou sem cadastro válido',item.data)
  }
  if(activityAllowed(apps,'servicoCampo')) {
    const service=root.servicoCampo??{},assignments=Object.values(service.periods?.[month]?.assignments??{}) as any[]
    for(const [id,enabled] of Object.entries(service.leaders??{}))if(enabled&&people[id]?.active!==false&&people[id]?.sex==='M')member('servicoCampo',id,people[id]?.name)
    if(!assignments.length)issue('servicoCampo','Nenhuma saída gerada neste mês')
    const conflicts=new Set(fieldServiceConflicts(assignments).map(a=>a.id))
    for(const item of assignments) {
      if(!item.date?.startsWith(month))continue
      count('servicoCampo',item.leaderId,people[item.leaderId]?.name,Boolean(people[item.leaderId]&&people[item.leaderId].active!==false))
      if(future(item.date)&&(!service.leaders?.[item.leaderId]||!people[item.leaderId]||people[item.leaderId].active===false||people[item.leaderId].sex!=='M'||conflicts.has(item.id)))issue('servicoCampo',`${item.time} · ${item.location}: conferir dirigente`,item.date)
    }
  }
  if(activityAllowed(apps,'escala')) {
    const scale=root.escala??{},participants:Record<string,EscalaParticipant>=Object.fromEntries(Object.entries(scale.participants??{}).map(([id,p]:any)=>{
      const central=resolveCentralPerson(id,p.masterId,people)
      return [id,{...p,name:central.name||p.name,sex:central.person?.sex??p.sex,active:central.active&&p.active!==false}]
    }))
    for(const [id,p] of Object.entries(participants))if(p.active)member('escala',id,p.name||id)
    for(const [localId,local] of Object.entries(scale.scales??{}) as [string,any][]) {
      const input={month,localId,local,participants,availability:scale.availability??{},tables:scale.tables??{},blocks:scale.monthSlotBlocks??{},exclusions:scale.monthExclusions?.[month]??[],rules:scale.settings?.engineRules}
      const days=new Set([...Object.keys(scale.tables?.[localId]?.[month]?.rows??{}),...(local.active===false?[]:activeDates(month,local.daysActive??[],input.exclusions))])
      for(const date of days) {
        if(!date.startsWith(month))continue
        for(const time of new Set([...localSlots(local),...Object.keys(scale.tables?.[localId]?.[month]?.rows?.[date]?.slots??{})])) {
          const cell=scale.tables?.[localId]?.[month]?.rows?.[date]?.slots?.[time]??{p1:'',p2:''}
          for(const id of [cell.p1,cell.p2].filter(Boolean))count('escala',id,participants[id]?.name||id,participants[id]?.active===true)
          if(local.active===false||!future(date)||input.exclusions.includes(date)||isBlocked(input.blocks,month,localId,new Date(date+'T12:00:00Z').getUTCDay(),time))continue
          if((cell.p1||cell.p2)&&validatePair(input,date,time,cell.p1,cell.p2).length)issue('escala',`${local.name||localId} · ${time}: dupla incompleta ou com conflito`,date)
        }
      }
    }
  }
  if(activityAllowed(apps,'limpeza')) {
    const config=root.master?.config?.limpeza
    if(!config?.ativa||!config.inicioRotacao)issue('limpeza','Conferir configuração da rotação')
    for(const [id,p] of Object.entries(people) as [string,any][])if(p.active!==false&&p.limpeza?.grupo)member('limpeza',id,p.name)
    const weeks=new Map<string,any>()
    // Monthly periods override an overlapping bimonthly snapshot; count each week once.
    for(const [id,period] of Object.entries(root.limpeza?.periodos??{}).sort(([a],[b])=>b.length-a.length) as [string,any][]) {
      if(!id.startsWith(month)&&!(period.inicio<=month+'-31'&&period.fim>=month+'-01'))continue
      for(const week of period.semanas??[])if(week.referencia?.startsWith(month))weeks.set(week.referencia,week)
    }
    if(!weeks.size)issue('limpeza','Nenhuma semana gerada neste mês')
    for(const [date,week] of weeks)for(const mid of new Set<string>([week.superintendenteMid,...Object.values(week.ajudantesMid??{}),...Object.values(week.membrosMid??{})].filter(Boolean) as string[])) {
      count('limpeza',mid,people[mid]?.name,Boolean(people[mid]&&people[mid].active!==false))
      if(future(date)&&(!people[mid]||people[mid].active===false))issue('limpeza','Semana com integrante inativo ou sem cadastro',date)
    }
  }
  return {issues:issues.filter((item,index)=>issues.findIndex(other=>other.module===item.module&&other.date===item.date&&other.title===item.title)===index).sort((a,b)=>a.date.localeCompare(b.date)),workload:[...rows.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'pt-BR'))}
}
