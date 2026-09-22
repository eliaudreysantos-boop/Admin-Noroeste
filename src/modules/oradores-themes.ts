import type { SpeakersRoot, TalkTheme } from './oradores-domain.ts'

export type ThemeFilter = 'available' | 'used' | 'pending' | 'all'
export const THEME_FILTER_LABELS:Record<ThemeFilter,string>={available:'Disponíveis',used:'Já usados',pending:'Programados / ocupados',all:'Todos'}
export interface ThemeUsage { past:boolean; pending:boolean; lastPastDate:string; nextDate:string }
export interface ThemeRow extends ThemeUsage { id:string; theme:TalkTheme }

export function themeUsageIndex(root:SpeakersRoot,today:string):Map<string,ThemeUsage> {
  const dates=new Map<string,Set<string>>(),cutoff='2026-05-16'
  const add=(id:string,date:string):void=>{if(!id||!/^\d{4}-\d{2}-\d{2}$/.test(date))return;const set=dates.get(id)??new Set<string>();set.add(date);dates.set(id,set)}
  for(const item of Object.values(root.historicoTemas??{})){
    if(item.data<cutoff?item.historicoCompartilhado===true:item.secao!=='s1')add(item.temaId,item.data)
  }
  for(const item of Object.values(root.programacao??{})){
    if(item.tipo==='saida_orador'||item.secao==='s1'||!item.temaId)continue
    if(item.data<cutoff&&item.secao!=='s2'&&item.historicoCompartilhado!==true)continue
    add(item.temaId,item.data)
  }
  return new Map([...dates].map(([id,values])=>{
    const sorted=[...values].sort(),past=sorted.filter(date=>date<today),future=sorted.filter(date=>date>=today)
    return [id,{past:past.length>0,pending:future.length>0,lastPastDate:past[past.length-1]??'',nextDate:future[0]??''}]
  }))
}
export function filteredThemeRows(root:SpeakersRoot,today:string,filter:ThemeFilter='available',query=''):ThemeRow[]{
  const index=themeUsageIndex(root,today),term=query.trim().toLocaleLowerCase('pt-BR')
  return Object.entries(root.temas??{}).map(([id,theme])=>({id,theme,...(index.get(id)??{past:false,pending:false,lastPastDate:'',nextDate:''})}))
    .filter(row=>(!term||(/^\d+$/.test(term)?row.theme.numero===Number(term):row.theme.titulo.toLocaleLowerCase('pt-BR').includes(term)))&&
      (filter==='all'||filter==='available'&&row.theme.ativo&&!row.past&&!row.pending||filter==='used'&&row.past||filter==='pending'&&row.pending))
    .sort((a,b)=>a.theme.numero-b.theme.numero)
}
export const themeDate=(date:string):string=>date?`${date.slice(8,10)}/${date.slice(5,7)}/${date.slice(0,4)}`:'—'
