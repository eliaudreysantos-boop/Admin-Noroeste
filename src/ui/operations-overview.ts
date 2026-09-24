import type { AppContext,ModuleName } from '../types'
import { get,child,rootRef } from '../firebase'
import { apiJson } from '../secure-api'
import { operationsSummary } from '../modules/operations-domain'
import { activityAllowed,ACTIVITY_MODULES,MODULE_LABELS,type ActivityEntry } from '../modules/activity-domain'
import { fortalezaCurrentMonth } from '../modules/civil-date'
import type { PublicationRoot } from '../modules/publication-contract'

const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const actions={alterar:'Alteração salva',remover:'Registro removido',publicar:'Período publicado',reabrir:'Período reaberto'}
const area=(path:string)=>{
  const date=path.match(/\d{4}-\d{2}(?:-\d{2})?/)?.[0]
  const label=/programacao|period|tables|scale/.test(path)?'Programação':/people|pessoas|participants|oradores/.test(path)?'Cadastro':/config|settings|planning/.test(path)?'Configurações':'Dados do módulo'
  return label+(date?' · '+date:'')
}
export function mountOperationsOverview(host:HTMLElement,ctx:AppContext,open:(module:ModuleName,month:string)=>void):void {
  const modules=ACTIVITY_MODULES.filter(m=>m!=='mestre'&&activityAllowed(ctx.usuario.apps,m))
  if(!modules.length&&!ctx.usuario.apps.mestre)return
  host.innerHTML='<section class="form-panel operations-overview"><h2>O que precisa de atenção</h2><label>Mês <input data-operation-month class="form-input" type="month"></label><div data-operation-body aria-live="polite">Carregando resumo…</div><details data-operation-history><summary>Histórico de alterações</summary><div data-history-body></div></details></section>'
  const monthInput=host.querySelector<HTMLInputElement>('[data-operation-month]')!,body=host.querySelector<HTMLElement>('[data-operation-body]')!
  monthInput.value=fortalezaCurrentMonth()
  let data:PublicationRoot={},failed:ModuleName[]=[],loadId=0
  async function load():Promise<void> {
    const requestId=++loadId
    body.textContent='Carregando resumo…'
    data={master:{},tarefas:{}};failed=[]
    try {
      const results=await Promise.all([get(child(rootRef,'master/pessoas')),get(child(rootRef,'master/config'))])
      if(requestId!==loadId||!host.isConnected)return
      data.master={pessoas:results[0].val()??{},config:results[1].val()??{}}
      await Promise.all(modules.map(async module=>{
        try {
          const path=module==='oradores'?'tarefas/discursos':module
          const value=(await get(child(rootRef,path))).val()??{}
          if(requestId!==loadId)return
          if(module==='oradores'){
            const people=(await get(child(rootRef,'tarefas/people'))).val()??{}
            if(requestId!==loadId)return
            data.tarefas={...data.tarefas,discursos:value,people}
          }
          else if(module==='tarefas')data.tarefas={...(value as object),...data.tarefas}
          else data[module]=value
        }catch{if(requestId===loadId)failed.push(module)}
      }))
      if(requestId===loadId&&host.isConnected)render()
    }catch {
      if(requestId!==loadId||!host.isConnected)return
      body.innerHTML='<p>Não foi possível carregar o resumo.</p><button data-retry class="btn btn-ghost">Tentar novamente</button>'
      body.querySelector('[data-retry]')?.addEventListener('click',()=>void load())
    }
  }
  function render():void {
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthInput.value))return
    const apps={...ctx.usuario.apps,mestre:false}
    for(const module of modules)apps[module]=!failed.includes(module)
    const summary=operationsSummary(data,apps,monthInput.value)
    body.innerHTML=`<p class="form-help">Pendências das datas futuras deste mês. Abra o módulo para corrigir. Contagens de distribuição incluem todo o mês.</p>${failed.length?`<p class="notice warning">Resumo incompleto: ${failed.map(m=>esc(MODULE_LABELS[m])).join(', ')} indisponível.</p><button data-retry class="btn btn-ghost">Tentar novamente</button>`:''}<div class="operations-grid">${modules.filter(m=>!failed.includes(m)).map(module=>{
      const pending=summary.issues.filter(i=>i.module===module)
      return `<article><h3>${esc(MODULE_LABELS[module])}</h3><p>${pending.length?`${pending.length} ponto(s) para conferir`:'Nenhuma pendência identificada'}</p>${pending.length?`<ul>${pending.slice(0,3).map(item=>`<li>${esc(item.date?item.date.split('-').reverse().join('/')+' · ':'')}${esc(item.title)}</li>`).join('')}</ul>${pending.length>3?`<p>Mais ${pending.length-3} no resumo do módulo.</p>`:''}`:''}<button class="btn btn-ghost" data-operation-open="${module}">Abrir ${esc(MODULE_LABELS[module])}</button></article>`
    }).join('')}</div><details data-workload><summary>Distribuição de tarefas no mês</summary><p class="form-help">Contagem de funções em Tarefas, discursos em Oradores, horários em TPL, saídas em Campo e semanas em Limpeza. Não equivale a horas de trabalho; disponibilidade e habilitações variam.</p><label>Módulo <select class="form-select" data-workload-module>${modules.filter(m=>!failed.includes(m)).map(m=>`<option value="${m}">${esc(MODULE_LABELS[m])}</option>`).join('')}</select></label><label>Buscar pessoa <input class="form-input" data-workload-search type="search"></label><div data-workload-rows></div></details>`
    body.querySelector('[data-retry]')?.addEventListener('click',()=>void load())
    body.querySelectorAll<HTMLButtonElement>('[data-operation-open]').forEach(button=>button.addEventListener('click',()=>open(button.dataset.operationOpen as ModuleName,monthInput.value)))
    const filter=body.querySelector<HTMLSelectElement>('[data-workload-module]')!,search=body.querySelector<HTMLInputElement>('[data-workload-search]')!,list=body.querySelector<HTMLElement>('[data-workload-rows]')!
    const renderRows=()=>{
      const all=summary.workload.filter(row=>row.module===filter.value),query=search.value.trim().toLocaleLowerCase('pt-BR'),rows=all.filter(row=>(row.name+' '+row.id).toLocaleLowerCase('pt-BR').includes(query))
      list.innerHTML=`<p>${all.reduce((sum,r)=>sum+r.count,0)} designações · ${all.filter(r=>r.active&&r.count===0).length} participantes ativos sem designação.</p>${rows.length?rows.map(row=>`<div class="module-list-row"><div><strong>${esc(row.name)}</strong><small>${esc(row.id)}${row.active?'':' · inativo/sem cadastro'}</small></div><strong>${row.count}</strong></div>`).join(''):'<p>Nenhum participante encontrado.</p>'}`
    }
    filter.addEventListener('change',renderRows);search.addEventListener('input',renderRows);renderRows()
  }
  monthInput.addEventListener('change',render)
  const history=host.querySelector<HTMLDetailsElement>('[data-operation-history]')!,historyBody=host.querySelector<HTMLElement>('[data-history-body]')!
  let historyLoaded=false,historyBusy=false
  async function loadHistory():Promise<void> {
    if(historyBusy)return
    historyBusy=true;historyBody.textContent='Carregando histórico…'
    try {
      const response=await apiJson<{entries:ActivityEntry[]}>('activity')
      if(!Array.isArray(response.entries))throw new Error('Resposta incompleta')
      if(!host.isConnected)return
      historyLoaded=true
      historyBody.innerHTML=`<p class="form-help">Registros a partir da ativação deste recurso, com até 500 alterações recentes por módulo. Não inclui alterações feitas diretamente no banco. Nenhuma senha ou conteúdo de campos é registrado.</p><label>Módulo <select data-history-module class="form-select"><option value="">Todos os permitidos</option>${ACTIVITY_MODULES.filter(m=>activityAllowed(ctx.usuario.apps,m)).map(m=>`<option value="${m}">${esc(MODULE_LABELS[m])}</option>`).join('')}</select></label><div data-history-list></div><button data-history-more class="btn btn-ghost">Mostrar mais</button><button data-history-refresh class="btn btn-ghost">Atualizar histórico</button>`
      const filter=historyBody.querySelector<HTMLSelectElement>('[data-history-module]')!,list=historyBody.querySelector<HTMLElement>('[data-history-list]')!,more=historyBody.querySelector<HTMLButtonElement>('[data-history-more]')!
      let limit=30
      const show=()=>{
        const entries=response.entries.filter(e=>activityAllowed(ctx.usuario.apps,e.module)&&(!filter.value||e.module===filter.value))
        list.innerHTML=entries.slice(0,limit).map(entry=>`<div class="module-list-row"><div><strong>${esc(actions[entry.action])} · ${esc(MODULE_LABELS[entry.module])}</strong><small>${esc(entry.actorName)} · ${esc(new Date(entry.at).toLocaleString('pt-BR',{timeZone:'America/Fortaleza'}))}</small><small>${esc([...new Set(entry.paths.map(area))].join(' · '))}</small></div></div>`).join('')||'<p>Nenhuma alteração registrada.</p>'
        more.hidden=entries.length<=limit
      }
      filter.addEventListener('change',()=>{limit=30;show()});more.addEventListener('click',()=>{limit+=30;show()});historyBody.querySelector('[data-history-refresh]')!.addEventListener('click',()=>void loadHistory());show()
    }catch{historyBody.innerHTML='<p>Histórico indisponível.</p><button data-history-retry class="btn btn-ghost">Tentar novamente</button>';historyBody.querySelector('button')!.addEventListener('click',()=>void loadHistory())}
    finally{historyBusy=false}
  }
  history.addEventListener('toggle',()=>{if(history.open&&!historyLoaded)void loadHistory()})
  void load()
}
