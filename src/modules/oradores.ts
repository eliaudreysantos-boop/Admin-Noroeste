import { speakerAssignmentMessage } from './oradores-messages'
import { cleanAddress } from './agenda-location'
import { publicationSource, publicationHash } from './oradores-publication'
import { officialDocumentId } from './agenda-documents-domain'
import type { AgendaPublicDocument } from '../types'
import type { AppContext } from '../types'
import { agendaDocumentsRef, agendaConfigRef, child, compareAndSet, get, oradoresCadastroRef, oradoresCongregacoesRef, oradoresEventosRef, oradoresProgramacaoRef, oradoresRef, oradoresTemasRef, set, pessoasRef, tarefasScaleRef, tarefasPeopleRef, tarefasPlanejamentoRef, update } from '../firebase'
import { renderWorkspaceNav } from '../ui/workspace-nav'
import { moduleBackButton } from '../ui/module-header'
import { lockPublicationUi } from '../ui/publication-busy'
import { defaultModuleMessageSettings, mountModuleMessageSettings, type ModuleMessageSettings } from './module-message-settings'
import {
  EVENT_KIND_LABEL, SPEAKER_ROLE_LABEL, TALK_KIND_LABEL, TALK_STATUS_LABEL,
  formatSpeakerDate, monthBounds, newSpeakerId, normalizeSpeakerEvents, normalizeSpeakersRoot, selectSecondSection,
  phoneDigits, sameMonth, scheduleCongregationId, scheduleCongregationName, scheduleStatus,
  speakerPendingItems, validIsoDate, scheduleBaseForEdit, isDuplicateSchedule,
  type Speaker, type SpeakerCongregation, type SpeakerEvent, type SpeakerEventKind,
  type SpeakersRoot, type TalkKind, type TalkSchedule, type TalkTheme,
} from './oradores-domain'

import { canonicalSpeaker, resolveSpeakerMasterId, repertoireNumbers, parseRepertoire, matchesSpeaker, speakerConflicts, type CentralPerson, type LinkedPerson } from './oradores-editor-domain'

import { filteredThemeRows, themeUsageIndex, themeDate, THEME_FILTER_LABELS, type ThemeFilter } from './oradores-themes'
import { downloadPdf } from '../ui/pdf-download'
let themeFilter:ThemeFilter='available'
let themeQuery=''
let publicationVersion=0

type Screen = 'programacao' | 'temas' | 'eventos' | 'oradores' | 'designacoes' | 'congregacoes' | 'intercambios' | 'pendencias' | 'emergencia'
type Planning = { meetingDays?:{ weekendDow?:number; weekendS1Dow?:number }; excludedDates?:string[]; enableSection1?:boolean; s1Time?:string; s2Time?:string }
type TaskPerson = LinkedPerson & {name?:string;active?:boolean}

let appContext: AppContext
let masterPeople:Record<string,CentralPerson>={}
let rawSpeakers:Record<string,Speaker>={}
let speakerBaseline:Record<string,unknown>|null=null
let taskPeriods:Record<string,unknown>={}
let speakerQuery=''
let emergencyDate=''
let scheduleQuery=''
let scheduleFilter=''
let onlyFuture=false
let dirty=false
let saving=false
let guardController:AbortController|undefined
const today = ():string => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const canEditPeople = ():boolean => appContext.usuario.apps.mestre === true
const canReadTasks = ():boolean => Boolean(appContext.usuario.apps.mestre || appContext.usuario.apps.tarefas)
function allowLeave():boolean {
  if (saving) { toast('Aguarde o salvamento.'); return false }
  if (dirty && !confirm('Há alterações não salvas. Deseja descartá-las?')) return false
  dirty=false
  return true
}
function formError(form:HTMLFormElement,message:string):void {
  let box=form.querySelector<HTMLElement>('[data-form-error]')
  if (!box) { box=document.createElement('p');box.dataset.formError='';box.className='notice warning';box.setAttribute('role','alert');form.prepend(box) }
  box.textContent=message
}
function freezeForm(form:HTMLFormElement):()=>void {
  const controls=[...form.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement|HTMLButtonElement>('input,select,textarea,button')]
  const disabled=controls.map(control=>control.disabled)
  controls.forEach(control=>{control.disabled=true})
  const submit=form.querySelector<HTMLButtonElement>('[type="submit"]'),label=submit?.textContent
  if(submit)submit.textContent='Salvando…'
  return ()=>{controls.forEach((control,index)=>{control.disabled=disabled[index]!});if(submit)submit.textContent=label??'Salvar'}
}
function installEditGuard():void {
  guardController?.abort(); guardController=new AbortController()
  const options={signal:guardController.signal}
  document.addEventListener('input',event=>{if((event.target as HTMLElement)?.closest('#oradoresRoot form')&&!(event.target as HTMLElement).matches('[data-person-search]'))dirty=true},options)
  document.addEventListener('change',event=>{if((event.target as HTMLElement)?.closest('#oradoresRoot form'))dirty=true},options)
  document.addEventListener('click',event=>{
    if (!document.getElementById('oradoresRoot')) return
    const button=(event.target as HTMLElement)?.closest('button')
    if (!button || !button.matches('[data-workspace-tab], [data-module-index], #btnBack, #btnSair, [id^="cancel"], [id^="new"], [data-edit-speaker], [data-edit-schedule], [data-edit-theme], [data-edit-congregation], [data-edit-event], [data-confirm-schedule], [data-reconfirm-schedule], [data-substitute-date], #clearScheduleFilters, #fillScheduleDates, #oradoresPrev, #oradoresNext')) return
    if (!allowLeave()) {event.preventDefault();event.stopImmediatePropagation()}
  },{...options,capture:true})
  window.addEventListener('beforeunload',event=>{if(document.getElementById('oradoresRoot')&&(dirty||saving)){event.preventDefault();event.returnValue=''}},options)
}
function hydrateSpeakers():void { data.oradores=Object.fromEntries(Object.entries(rawSpeakers).map(([id,item])=>[id,canonicalSpeaker(item,masterPeople,taskPeople)])) }

let screen: Screen = 'programacao'
let data: SpeakersRoot = {}
let events: Record<string, SpeakerEvent> = {}
let planning: Planning = {}
let taskPeople: Record<string, TaskPerson> = {}
let selectedMonth = localStorage.getItem('noroeste_oradores_month') ?? new Date().toISOString().slice(0, 7)
let editingId = ''
let rawSchedule:Record<string, unknown> = {}
let scheduleDraft: Record<string, string> | null = null
let selectedSpeakerId = ''
let selectedCongregationId = ''
let loadPromise: Promise<boolean> | null = null
let downloadingPdf = false
let publishingPdf = false
let messageSettings = defaultModuleMessageSettings('oradores')

const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char] ?? char))
const root = (): HTMLElement => document.getElementById('oradoresRoot')!
const speakers = (): Record<string, Speaker> => data.oradores ?? {}
const themes = (): Record<string, TalkTheme> => data.temas ?? {}
const congregations = (): Record<string, SpeakerCongregation> => data.congregacoes ?? {}
const schedule = (): Record<string, TalkSchedule> => data.programacao ?? {}
const toast = (message: string): void => { const element=document.getElementById('toast'); if (!element) return; element.textContent=message; element.classList.add('show'); setTimeout(()=>element.classList.remove('show'), 3000) }
function openWhatsapp(phone:string, message:string):boolean { const digits=phoneDigits(phone); if(digits.length<12){toast('Cadastre um telefone válido antes de abrir o WhatsApp');return false} window.open(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`,'_blank','noopener,noreferrer');return true }
function applyMessageTemplate(template:string, details:string, name='irmãos'):string { return template.split('{dados_da_reuniao}').join(details).split('{nome}').join(name) }
function scheduleMessage(item:TalkSchedule):string { const name=speakers()[item.oradorId??'']?.nome?.trim()||item.oradorNome?.trim()||'irmão';return applyMessageTemplate(messageSettings.meetingText,`*${name}*\n\n${speakerAssignmentMessage(item,data)}`,name) }
const option = (value:string, label:string, selected:string): string => `<option value="${esc(value)}" ${value===selected?'selected':''}>${esc(label)}</option>`
const field = (label:string, control:string, help=''): string => `<label class="form-field"><span>${esc(label)}</span>${control}${help ? `<small>${esc(help)}</small>` : ''}</label>`
const sectionTitle = (title:string): string => `<div class="module-section-title">${screen === 'programacao' ? '' : moduleBackButton()}<h2>${esc(title)}</h2></div>`
const empty = (message:string): string => `<p class="empty-state">${esc(message)}</p>`
const isoNow = (): string => new Date().toISOString()

export default function mount(context: AppContext): void {
  appContext=context;themeFilter='available';themeQuery='';dirty=false;saving=false;masterPeople={};rawSpeakers={};taskPeriods={};speakerQuery='';scheduleQuery='';scheduleFilter='';onlyFuture=false;emergencyDate=today();installEditGuard()
  screen='pendencias'; editingId=''; scheduleDraft=null; loadPromise=null; data={}; events={}; planning={}; taskPeople={}
  const host=document.getElementById('appContent'); if (!host) return
  host.innerHTML='<div id="oradoresNav"></div><div id="oradoresRoot"></div>'
  void openScreen('pendencias')
}

async function load(): Promise<boolean> {
  try {
    const [rootSnapshot,eventSnapshot,planningSnapshot,peopleSnapshot,messageSnapshot]=await Promise.all([get(oradoresRef), get(oradoresEventosRef), get(tarefasPlanejamentoRef), get(tarefasPeopleRef), get<ModuleMessageSettings>(child(agendaConfigRef,'moduleWhatsApp/oradores'))])
    const [centralSnapshot,periodSnapshot]=await Promise.all([get(pessoasRef),canReadTasks()?get(child(tarefasScaleRef,'periods')):Promise.resolve(null)])
    masterPeople=centralSnapshot.val() as Record<string,CentralPerson> ?? {}
    taskPeriods=periodSnapshot?.val() as Record<string,unknown> ?? {}
    rawSchedule = (rootSnapshot.val() as SpeakersRoot | null)?.programacao ?? {}
    data=selectSecondSection(normalizeSpeakersRoot(rootSnapshot.exists()?rootSnapshot.val():{}))
    events=normalizeSpeakerEvents(eventSnapshot.exists()?eventSnapshot.val():{})
    planning=planningSnapshot.exists() ? planningSnapshot.val() as Planning : {}
    taskPeople=peopleSnapshot.exists() ? peopleSnapshot.val() as Record<string,TaskPerson> : {}
    speakerBaseline=(rootSnapshot.val() as SpeakersRoot|null)?.oradores??null;rawSpeakers=structuredClone(data.oradores??{});hydrateSpeakers()
    messageSettings={...defaultModuleMessageSettings('oradores'),...(messageSnapshot.exists()?messageSnapshot.val()??{}:{})}
    selectedSpeakerId=selectedSpeakerId && speakers()[selectedSpeakerId] ? selectedSpeakerId : Object.entries(speakers()).sort((a,b)=>a[1].nome.localeCompare(b[1].nome,'pt-BR'))[0]?.[0] ?? ''
    selectedCongregationId=selectedCongregationId && congregations()[selectedCongregationId] ? selectedCongregationId : Object.entries(congregations()).filter(([,item])=>item.tipo==='visitante').sort((a,b)=>a[1].nome.localeCompare(b[1].nome,'pt-BR'))[0]?.[0] ?? ''
    return true
  } catch { toast('Não foi possível carregar Oradores'); return false }
}

async function openScreen(next: Screen, substitutionDate=''): Promise<void> {
  if (!allowLeave()) return
  if(next==='emergencia')emergencyDate=substitutionDate
  screen=next; editingId=''; renderNavigation(); root().innerHTML='<p class="empty-state">Carregando dados...</p>'
  loadPromise ??= load()
  const loaded=await loadPromise
  if (!root().isConnected || screen!==next) return
  if (!loaded) { loadPromise=null; root().innerHTML='<p class="empty-state">Não foi possível carregar os dados.</p><button id="retrySpeakers" class="btn btn-primary">Tentar novamente</button>'; document.getElementById('retrySpeakers')?.addEventListener('click',()=>void openScreen(next)); return }
  render()
}

function renderNavigation(): void {
  const host=document.getElementById('oradoresNav'); if (!host) return
  renderWorkspaceNav(host, 'Oradores', 'pendencias', screen, [
    { id:'pendencias', label:'Pendências' },
    { id:'programacao', label:'Programação' },
    { id:'oradores', label:'Oradores', children:[{id:'oradores',label:'Cadastro'},{id:'designacoes',label:'Designações'},{id:'emergencia',label:'Substituições'}] },
    { id:'congregacoes', label:'Congregações', children:[{id:'congregacoes',label:'Cadastro'},{id:'intercambios',label:'Intercâmbios'}] },
    { id:'temas', label:'Mais opções', children:[{id:'temas',label:'Temas'},{id:'eventos',label:'Eventos'}] },
  ], id=>void openScreen(id as Screen))
}

function render(): void {
  renderNavigation()
  if (screen==='programacao') renderSchedule()
  else if (screen==='oradores') renderSpeakers()
  else if (screen==='temas') renderThemes()
  else if (screen==='congregacoes') renderCongregations()
  else if (screen==='eventos') renderEvents()
  else if (screen==='designacoes') renderAssignments()
  else if (screen==='intercambios') renderExchanges()
  else if (screen==='pendencias') renderPending()
  else renderEmergency()
}

function periodControl(): string {
  return `<div class="agenda-toolbar oradores-period"><button id="oradoresPrev" class="btn btn-ghost" type="button" aria-label="Mês anterior">‹</button><input id="oradoresMonth" class="form-input" type="month" value="${esc(selectedMonth)}"><button id="oradoresNext" class="btn btn-ghost" type="button" aria-label="Próximo mês">›</button></div>`
}
function bindPeriod(): void {
  const move=(delta:number):void=>{ const [year,month]=selectedMonth.split('-').map(Number), date=new Date(Date.UTC(year!,month!-1+delta,1)); selectedMonth=date.toISOString().slice(0,7); localStorage.setItem('noroeste_oradores_month',selectedMonth); renderSchedule() }
  document.getElementById('oradoresPrev')?.addEventListener('click',()=>move(-1)); document.getElementById('oradoresNext')?.addEventListener('click',()=>move(1))
  document.getElementById('oradoresMonth')?.addEventListener('change',event=>{ const value=(event.currentTarget as HTMLInputElement).value; if(!allowLeave()){(event.currentTarget as HTMLInputElement).value=selectedMonth;return} if (/^\d{4}-\d{2}$/.test(value)) { selectedMonth=value; localStorage.setItem('noroeste_oradores_month',value); renderSchedule() } })
}

function themeChoiceLabel(id:string):string {
  const usage=themeUse(id)
  return usage.nextDate?`Programado para ${themeDate(usage.nextDate)}`:usage.past?`Já usado em ${themeDate(usage.lastPastDate)}`:'Disponível'
}
async function showPublicationStatus():Promise<void> {
  const version=++publicationVersion, element=document.getElementById('speakerPublicationStatus'), month=selectedMonth
  if(!element)return
  try {
    const [snapshot,hash]=await Promise.all([get<AgendaPublicDocument>(child(agendaDocumentsRef,officialDocumentId('oradores',month))),publicationHash(publicationSource(data,month))])
    if(version!==publicationVersion||!element.isConnected)return
    const item=snapshot.val()
    element.textContent=!item?.criadoEm?'PDF ainda não publicado para este mês.':`PDF publicado em ${new Date(item.criadoEm).toLocaleString('pt-BR',{timeZone:'America/Fortaleza'})}. ${!item.sourceHash?'Versão antiga: publique novamente para habilitar a comparação.':item.sourceHash===hash?'Corresponde aos dados carregados.':'Existem alterações ainda não publicadas no PDF.'}`
  } catch {if(element.isConnected&&version===publicationVersion)element.textContent='Não foi possível consultar a publicação. Não é possível confirmar se o PDF está atualizado.'}
}
function speakerOptions(selected='', kind?:'local'|'visitante'): string {
  return `<option value="">A definir</option>${Object.entries(speakers()).filter(([id,item])=>(item.ativo || id===selected) && (!kind || item.tipo===kind)).sort((a,b)=>a[1].nome.localeCompare(b[1].nome,'pt-BR')).map(([id,item])=>option(id,item.nome,selected)).join('')}`
}
function congregationOptions(selected=''): string { return `<option value="">A definir</option>${Object.entries(congregations()).filter(([,item])=>item.ativa && item.tipo==='visitante').sort((a,b)=>a[1].nome.localeCompare(b[1].nome,'pt-BR')).map(([id,item])=>option(id,item.nome,selected)).join('')}` }

function scheduleEditor(): string {
  if (!editingId) return ''
  const item=editingId==='new' ? undefined : schedule()[editingId]
  const draft=scheduleDraft, kind=(draft?.['tipo'] as TalkKind|undefined) ?? item?.tipo ?? 'discurso_local', congregationId=draft?.['congregacaoId'] ?? (item ? scheduleCongregationId(item) : '')
  return `<form id="speakerScheduleForm" class="form-panel"><h3>${item?'Editar programação':'Nova programação'}</h3><div class="module-form-grid">
    ${field('Tipo',`<select name="tipo">${Object.entries(TALK_KIND_LABEL).map(([id,label])=>option(id,label,kind)).join('')}</select>`)}
    ${field('Data',`<input name="data" type="date" value="${esc(draft?.['data'] ?? item?.data ?? `${selectedMonth}-01`)}" required>`)}
    ${field(kind==='discurso_visitante'?'Visitante':'Orador',`<select name="oradorId">${speakerOptions(draft?.['oradorId']??item?.oradorId,kind==='discurso_visitante'?'visitante':'local')}</select>`)}
    ${kind==='discurso_visitante' ? field('Nome digitado (se não cadastrado)',`<input name="oradorNome" maxlength="100" value="${esc(draft?.['oradorNome']??item?.oradorNome)}">`) : ''}
    ${kind!=='discurso_local' ? field(kind==='saida_orador'?'Congregação de destino':'Congregação de origem',`<select name="congregacaoId">${congregationOptions(congregationId)}</select>`) : ''}
    ${field('Número do tema',`<input name="themeNumber" type="text" inputmode="numeric" autocomplete="off" value="${esc(draft?.['themeNumber']??themes()[item?.temaId??'']?.numero??item?.temaNumero??'')}" placeholder="Ex.: 25" aria-describedby="scheduleThemePreview"><input name="temaId" type="hidden" value="${esc(draft?.['temaId']??item?.temaId)}">`)}<div id="scheduleThemePreview" class="form-help" aria-live="polite"></div>
  </div><details ${draft?.['oradorSecundarioId']||item?.oradorSecundarioId||draft?.['horarioLocal']||item?.horarioLocal||draft?.['observacoes']||item?.observacoes?'open':''}><summary>Mais opções</summary><div class="module-form-grid">
    ${kind==='discurso_local' ? field('Segundo orador',`<select name="oradorSecundarioId">${speakerOptions(draft?.['oradorSecundarioId']??item?.oradorSecundarioId,'local')}</select>`) : ''}
    ${kind!=='saida_orador' ? field('Horário local',`<input name="horarioLocal" type="time" value="${esc(draft?.['horarioLocal']??item?.horarioLocal ?? planning.s2Time ?? '')}">`) : ''}
    ${field('Observações',`<textarea name="observacoes" maxlength="500">${esc(draft?.['observacoes']??item?.observacoes)}</textarea>`)}
  </div></details><div id="scheduleHints" class="form-help" aria-live="polite"></div><div class="service-actions"><button class="btn btn-primary" type="submit">Salvar</button><button id="cancelScheduleEdit" class="btn btn-ghost" type="button">Cancelar</button>${item?'<button id="deleteSchedule" class="btn btn-danger" type="button">Excluir</button>':''}</div></form>`
}

function scheduleCard(id:string,item:TalkSchedule): string {
  const speaker=speakers()[item.oradorId??'']?.nome?.trim() || item.oradorNome?.trim() || 'Sem orador', theme=themes()[item.temaId??''], congregation=congregations()[scheduleCongregationId(item)]?.nome ?? scheduleCongregationName(item)
  const status=scheduleStatus(item), section=''
  return `<article class="oradores-card"><div class="oradores-card-head"><div><strong>${esc(formatSpeakerDate(item.data))}</strong><small>${esc(TALK_KIND_LABEL[item.tipo]+section)}</small></div><span class="status-pill status-${esc(status)}">${esc(TALK_STATUS_LABEL[status])}</span></div><div class="oradores-card-grid"><div><span>Orador</span><strong>${esc(speaker)}</strong></div><div><span>Tema</span><strong>${esc(theme?`${String(theme.numero).padStart(3,'0')} - ${theme.titulo}`:item.temaTitulo||'Sem tema')}</strong></div>${congregation?`<div><span>Congregação</span><strong>${esc(congregation)}</strong></div>`:''}${item.oradorSecundarioNome?`<div><span>Segundo orador</span><strong>${esc(item.oradorSecundarioNome)}</strong></div>`:''}</div><div class="service-actions"><button class="btn btn-ghost" data-edit-schedule="${esc(id)}">${!item.oradorId&&!item.oradorNome?'Definir orador':!item.temaId&&!item.temaTitulo?'Definir tema':'Editar'}</button><button class="btn btn-ghost" data-confirm-schedule="${esc(id)}" ${!item.oradorId&&!item.oradorNome?'disabled':''}>${status==='confirmado'?'Desfazer confirmação':'Confirmar'}</button>${status==='confirmado' ? `<button class="btn btn-ghost" data-reconfirm-schedule="${esc(id)}">${item.reconfirmacao?.status?'Desfazer reconfirmação':'Reconfirmar'}</button>`:''}${id&&item.tipo!=='saida_orador'?`<button class="btn btn-ghost" data-substitute-date="${esc(item.data)}">Buscar substituto</button>`:''}${id?`<button class="btn btn-ghost" data-notify-schedule="${esc(id)}">${status==='confirmado'?'Abrir WhatsApp':'Pedir confirmação'}</button>`:''}</div></article>`
}

function renderSchedule(): void {
  const monthRows=Object.entries(schedule()).filter(([,item])=>sameMonth(item.data,selectedMonth))
  const matchesFilter=(item:TalkSchedule,filter:string):boolean=>filter==='speaker'?!item.oradorId&&!item.oradorNome:filter==='theme'?!item.temaId&&!item.temaTitulo:filter==='confirm'?scheduleStatus(item)==='por_confirmar':filter==='reconfirm'?scheduleStatus(item)==='confirmado'&&!item.reconfirmacao?.status&&item.data>=today()&&item.data<=new Date(Date.now()+7*86400000).toISOString().slice(0,10):true
  const rows=monthRows.filter(([,item])=>(!onlyFuture||item.data>=today())&&matchesFilter(item,scheduleFilter)&&[`${speakers()[item.oradorId??'']?.nome??item.oradorNome??''}`,themes()[item.temaId??'']?.titulo??item.temaTitulo??'',String(themes()[item.temaId??'']?.numero??item.temaNumero??'')].some(value=>value.toLocaleLowerCase('pt-BR').includes(scheduleQuery.toLocaleLowerCase('pt-BR')))).sort((a,b)=>a[1].data.localeCompare(b[1].data)||a[1].tipo.localeCompare(b[1].tipo))
  root().innerHTML=`${sectionTitle('Programação de oradores')}${periodControl()}<div class="service-actions"><button id="newSchedule" class="btn btn-primary" type="button">Nova programação</button><button id="fillScheduleDates" class="btn btn-ghost" type="button">Criar datas do mês</button><button id="speakerSchedulePdf" class="btn btn-ghost" type="button" ${monthRows.length?'':'disabled'}>Baixar PDF</button><button id="speakerSchedulePublish" class="btn btn-ghost" type="button" ${monthRows.length?'':'disabled'}>Publicar no Quadro</button></div><p id="speakerPublicationStatus" class="notice" aria-live="polite">Consultando publicação…</p><p class="form-help">Confirmar registra a resposta do orador. Publicar no Quadro atualiza o PDF; editar a programação não atualiza o arquivo já publicado.</p>${scheduleEditor()}<div class="service-actions">${[['','Todos'],['speaker','Sem orador'],['theme','Sem tema'],['confirm','A confirmar'],['reconfirm','Reconfirmar']].map(([key,label])=>`<button class="btn ${scheduleFilter===key?'btn-primary':'btn-ghost'}" data-schedule-filter="${key}" aria-pressed="${scheduleFilter===key}">${label}: ${monthRows.filter(([,item])=>matchesFilter(item,key!)).length}</button>`).join('')}</div>
    ${field('Buscar na programação',`<input id="scheduleSearch" type="search" value="${esc(scheduleQuery)}" placeholder="Orador, número ou título do tema">`)}
    <label class="oradores-check"><input id="scheduleOnlyFuture" type="checkbox" ${onlyFuture?'checked':''}> Só o que falta (datas de hoje em diante)</label><div class="oradores-list">${rows.map(([id,item])=>scheduleCard(id,item)).join('')||empty(monthRows.length?'Nenhum resultado para esta busca ou filtro.':'Nenhuma programação neste mês.')}</div>${scheduleQuery||scheduleFilter||onlyFuture?'<button id="clearScheduleFilters" class="btn btn-ghost">Limpar filtros</button>':''}<div id="oradoresMessageSettings"></div>`
  bindPeriod()
  void showPublicationStatus()
  document.getElementById('clearScheduleFilters')?.addEventListener('click',()=>{if(!allowLeave())return;scheduleQuery='';scheduleFilter='';onlyFuture=false;renderSchedule()})
  document.querySelectorAll<HTMLButtonElement>('[data-substitute-date]').forEach(button=>button.addEventListener('click',()=>{void openScreen('emergencia',button.dataset.substituteDate!)}))
  document.querySelectorAll<HTMLButtonElement>('[data-schedule-filter]').forEach(button=>button.addEventListener('click',()=>{if(!allowLeave())return;scheduleFilter=button.dataset.scheduleFilter??'';renderSchedule()}))
  document.getElementById('scheduleSearch')?.addEventListener('change',event=>{if(!allowLeave())return;scheduleQuery=(event.target as HTMLInputElement).value;renderSchedule()})
  document.getElementById('scheduleOnlyFuture')?.addEventListener('change',event=>{if(!allowLeave())return;onlyFuture=(event.target as HTMLInputElement).checked;renderSchedule()})
  bindScheduleFields()
  document.getElementById('newSchedule')?.addEventListener('click',()=>{ editingId='new'; scheduleDraft=null; renderSchedule() })
  document.getElementById('fillScheduleDates')?.addEventListener('click',()=>void createMonthSlots())
  document.getElementById('speakerSchedulePdf')?.addEventListener('click',()=>void downloadSchedulePdf())
  document.getElementById('speakerSchedulePublish')?.addEventListener('click',()=>void publishSchedulePdf())
  document.getElementById('cancelScheduleEdit')?.addEventListener('click',()=>{ editingId=''; scheduleDraft=null; renderSchedule() })
  document.getElementById('speakerScheduleForm')?.addEventListener('change',event=>{ if ((event.target as HTMLElement).getAttribute('name')==='tipo') void saveDraftAndRerender(event.currentTarget as HTMLFormElement) })
  document.getElementById('speakerScheduleForm')?.addEventListener('submit',event=>{ event.preventDefault(); void saveSchedule(event.currentTarget as HTMLFormElement) })
  document.getElementById('deleteSchedule')?.addEventListener('click',()=>void deleteSchedule())
  document.querySelectorAll<HTMLButtonElement>('[data-edit-schedule]').forEach(button=>button.addEventListener('click',()=>{ editingId=button.dataset.editSchedule!; scheduleDraft=null; renderSchedule() }))
  document.querySelectorAll<HTMLButtonElement>('[data-confirm-schedule]').forEach(button=>button.addEventListener('click',()=>void toggleConfirmation(button.dataset.confirmSchedule!)))
  document.querySelectorAll<HTMLButtonElement>('[data-reconfirm-schedule]').forEach(button=>button.addEventListener('click',()=>void toggleReconfirmation(button.dataset.reconfirmSchedule!)))
  document.querySelectorAll<HTMLButtonElement>('[data-notify-schedule]').forEach(button=>button.addEventListener('click',()=>void notifySchedule(button.dataset.notifySchedule!)))
  void mountModuleMessageSettings('oradoresMessageSettings','oradores',toast,settings=>{messageSettings=settings})
}

function saveDraftAndRerender(form:HTMLFormElement): void {
  const values=new FormData(form)
  scheduleDraft=Object.fromEntries([...values.entries()].filter(([,value])=>typeof value==='string').map(([key,value])=>[key,String(value)]))
  const speaker=speakers()[scheduleDraft.oradorId??'']
  if(speaker&&(scheduleDraft.tipo==='discurso_visitante'?speaker.tipo!=='visitante':speaker.tipo!=='local')){scheduleDraft.oradorId='';scheduleDraft.oradorNome=''}
  if(scheduleDraft.tipo!=='discurso_local')scheduleDraft.oradorSecundarioId=''
  renderSchedule()
}

function scheduleWarnings(form:HTMLFormElement):string[] {
  const values=new FormData(form),date=String(values.get('data')??''),id=String(values.get('oradorId')??''),second=String(values.get('oradorSecundarioId')??'')
  const reasons=speakerConflicts(id,date,data,masterPeople,taskPeople,taskPeriods,editingId)
  if(second)reasons.push(...speakerConflicts(second,date,data,masterPeople,taskPeople,taskPeriods,editingId).map(reason=>'Segundo orador: '+reason))
  if(id&&second&&(id===second||Boolean(speakers()[id]?.masterId&&speakers()[id]?.masterId===speakers()[second]?.masterId)))reasons.push('Escolha duas pessoas diferentes.')
  if(values.get('tipo')!=='saida_orador'&&blockedDate(date))reasons.push('Data bloqueada por evento ou configuração.')
  return [...new Set(reasons)]
}
function bindScheduleFields():void {
  const form=document.getElementById('speakerScheduleForm') as HTMLFormElement|null
  if(!form)return
  const control=(name:string)=>form.elements.namedItem(name) as HTMLInputElement|HTMLSelectElement|null
  const refresh=(autofill=false):void=>{
    const speaker=speakers()[control('oradorId')?.value??''], number=control('themeNumber')!.value
    const parsed=parseRepertoire(number,themes(),schedule()[editingId]?.temaId?[schedule()[editingId]!.temaId!]:[])
    const error=number.trim()&&(!/^\d+$/.test(number.trim())||parsed.ids.length!==1)?parsed.error||'Informe o número de um único tema.':parsed.error
    control('themeNumber')!.setCustomValidity(error)
    control('temaId')!.value=error?'':parsed.ids[0]??''
    document.getElementById('scheduleThemePreview')!.innerHTML=error?esc(error):parsed.ids.length?esc(themes()[parsed.ids[0]!]!.titulo):'Tema a definir.'
    const congregation=control('congregacaoId'),time=control('horarioLocal')
    if(autofill&&speaker?.tipo==='visitante'&&speaker.congregacaoId&&congregation&&congregations()[speaker.congregacaoId]?.ativa)congregation.value=speaker.congregacaoId
    if(autofill&&time&&!time.value)time.value=planning.s2Time??''
    const warnings=scheduleWarnings(form)
    const repertoire=speaker?repertoireNumbers(speaker.temaIds,themes()):''
    const destination=congregations()[congregation?.value??'']
    document.getElementById('scheduleHints')!.innerHTML=`${speaker?`<p>Telefone: ${esc(speaker.telefone||'não informado')}. ${repertoire?'Temas: '+esc(repertoire):'Sem repertório informado.'}</p>`:''}
      ${speaker?.temaIds.filter(id=>themes()[id]?.ativo).sort((a,b)=>themes()[a]!.numero-themes()[b]!.numero).map(id=>`<button type="button" class="btn btn-ghost" data-pick-theme="${themes()[id]!.numero}" title="${esc(themes()[id]!.titulo)}">${themes()[id]!.numero} · ${themeChoiceLabel(id)}</button>`).join('')??''}
      ${speaker&&parsed.ids[0]&&!speaker.temaIds.includes(parsed.ids[0])?'<p class="notice warning">Este tema não está no repertório do orador. Confira antes de salvar.</p>':''}
      ${warnings.map(reason=>`<p class="notice warning">${esc(reason)}</p>`).join('')}
      ${destination?`<p>${esc(destination.nome)} · ${esc(destination.horario||'Horário não informado')} · ${esc(destination.localizacao||'Endereço não informado')}</p>`:''}
      ${!canReadTasks()?'<p>Designações de Tarefas não verificadas: seu acesso permite apenas consultar os cadastros de participantes.</p>':''}`
    document.querySelectorAll<HTMLButtonElement>('[data-pick-theme]').forEach(button=>button.addEventListener('click',()=>{control('themeNumber')!.value=button.dataset.pickTheme!;dirty=true;refresh()}))
  }
  form.addEventListener('input',()=>refresh())
  form.addEventListener('change',event=>{if((event.target as HTMLElement).getAttribute('name')!=='tipo')refresh((event.target as HTMLElement).getAttribute('name')==='oradorId')})
  refresh()
}

async function saveSchedule(form:HTMLFormElement): Promise<void> {
  if(saving)return
  const warnings=scheduleWarnings(form)
  if(warnings.length){formError(form,warnings.join('. '));return}
  const values=new FormData(form), kind=String(values.get('tipo')) as TalkKind, date=String(values.get('data')), speakerId=String(values.get('oradorId')??''), themeId=String(values.get('temaId')??''), congregationId=String(values.get('congregacaoId')??''), secondId=String(values.get('oradorSecundarioId')??''), section='s2'
  if (!validIsoDate(date)) { formError(form,'Informe uma data válida'); return }
  const duplicate=Object.entries(schedule()).find(([id,item])=>id!==editingId && isDuplicateSchedule(item,date,kind,speakerId,congregationId))
  if (duplicate) { formError(form,'Já existe uma programação igual nesta data'); return }
  const speaker=speakers()[speakerId], theme=themes()[themeId], congregation=congregations()[congregationId], second=speakers()[secondId]
  if(speakerId&&(!speaker||!speaker.ativo)){formError(form,'Selecione um orador ativo.');return}
  if(secondId&&(!second||!second.ativo)){formError(form,'Selecione um segundo orador ativo.');return}
  if(kind==='saida_orador'&&speaker&&!speaker.aprovadoParaSaida){formError(form,'Este orador não está aprovado para saída.');return}
  const manualName=String(values.get('oradorNome')??'').trim(), now=isoNow(), previous=editingId==='new'||editingId==='__draft__'?undefined:schedule()[editingId]
  const changed=previous&&((previous.oradorId??'')!==speakerId||(previous.temaId??'')!==themeId||(!speakerId&&(previous.oradorNome??'')!==manualName)||previous.data!==date||previous.tipo!==kind||previous.oradorSecundarioId!==(secondId||undefined)||scheduleCongregationId(previous)!==congregationId)
  const status=previous?.status==='confirmado'&&!changed?'confirmado':speakerId||manualName?'por_confirmar':'por_definir'
  const item:TalkSchedule={ ...scheduleBaseForEdit(previous), data:date, tipo:kind, status, updatedAt:now, secao:section as 's2', ...(speakerId?{oradorId:speakerId,oradorNome:speaker?.nome}:manualName?{oradorNome:manualName}:{}), ...(theme?{temaId:themeId,temaNumero:theme.numero,temaTitulo:theme.titulo}:{}), ...(second?{oradorSecundarioId:secondId,oradorSecundarioNome:second.nome,oradorSecundarioTipo:second.tipo}:{}), ...(kind==='saida_orador'&&congregation?{congregacaoDestinoId:congregationId,congregacaoDestinoNome:congregation.nome}:kind==='discurso_visitante'&&congregation?{congregacaoOrigemId:congregationId,congregacaoOrigemNome:congregation.nome}:{}), ...(kind!=='saida_orador'&&String(values.get('horarioLocal')??'')?{horarioLocal:String(values.get('horarioLocal'))}:{}), ...(String(values.get('observacoes')??'').trim()?{observacoes:String(values.get('observacoes')).trim()}:{}), ...(status==='confirmado'?{confirmacao:previous?.confirmacao??{status:true,confirmadoEm:now}}:{confirmacao:{status:false,confirmadoEm:''}}) }
  if(changed){delete item.reconfirmacao;delete item.avisadoEm}
  if(kind!=='saida_orador'){
    const local=Object.entries(congregations()).find(([,entry])=>entry.tipo==='local'&&entry.ativa&&entry.secao!=='s1')
    if(local){item.localCongregacaoId=local[0];item.localCongregacaoNome=local[1].nome}
  } else {delete item.localCongregacaoId;delete item.localCongregacaoNome}
  const id=previous?editingId:newSpeakerId('programacao')
  saving=true
  const release=freezeForm(form)
  try { await compareAndSet(child(oradoresProgramacaoRef,id),rawSchedule[id] ?? null,item); rawSchedule[id]=structuredClone(item); schedule()[id]=item; dirty=false; editingId=''; scheduleDraft=null; toast(previous?'Programação atualizada':'Programação criada'); renderSchedule() } catch { formError(form,'Não foi possível salvar. Seu preenchimento foi mantido. Se houve edição por outro administrador, copie suas alterações e recarregue o aplicativo.') } finally {saving=false;release()}
}

async function deleteSchedule(): Promise<void> { const id=editingId, item=schedule()[id]; if (!item||!confirm(`Excluir a programação de ${formatSpeakerDate(item.data)}?`)) return; try { await compareAndSet(child(oradoresProgramacaoRef,id),rawSchedule[id] ?? null,null); delete rawSchedule[id]; delete schedule()[id]; dirty=false;editingId=''; toast('Programação excluída'); renderSchedule() } catch { toast('Não foi possível excluir') } }
async function toggleConfirmation(id:string): Promise<void> { const item=schedule()[id]; if (!item) return; if(!item.oradorId&&!item.oradorNome){toast('Defina o orador antes de confirmar.');return} const confirmed=scheduleStatus(item)==='confirmado', status=confirmed?(item.oradorId||item.oradorNome?'por_confirmar':'por_definir'):'confirmado', confirmation={status:!confirmed,confirmadoEm:confirmed?'':isoNow()}; try { const patch={status,confirmacao:confirmation,updatedAt:isoNow(),reconfirmacao:confirmed?null:item.reconfirmacao??null}; const next={...(rawSchedule[id] as TalkSchedule),...patch};await compareAndSet(child(oradoresProgramacaoRef,id),rawSchedule[id]??null,next);rawSchedule[id]=next; item.status=status; item.confirmacao=confirmation;if(confirmed)delete item.reconfirmacao; renderSchedule() } catch { toast('Não foi possível alterar a confirmação') } }
async function toggleReconfirmation(id:string): Promise<void> { const item=schedule()[id]; if (!item) return; const value=!item.reconfirmacao?.status, reconfirmacao={status:value,confirmadoEm:value?isoNow():''}; try { const next={...(rawSchedule[id] as TalkSchedule),reconfirmacao,updatedAt:isoNow()};await compareAndSet(child(oradoresProgramacaoRef,id),rawSchedule[id]??null,next);rawSchedule[id]=next; item.reconfirmacao=reconfirmacao; renderSchedule() } catch { toast('Não foi possível alterar a reconfirmação') } }
async function notifySchedule(id:string):Promise<void>{const item=schedule()[id],speaker=item?speakers()[item.oradorId??'']:undefined;if(!item||!speaker||!openWhatsapp(speaker.telefone,scheduleMessage(item)))return;const avisadoEm=isoNow();try{await update(child(oradoresProgramacaoRef,id),{avisadoEm});item.avisadoEm=avisadoEm;rawSchedule[id]={...(rawSchedule[id] as TalkSchedule),avisadoEm}}catch{toast('O WhatsApp abriu, mas não foi possível registrar o aviso')}}

function blockedDate(date:string): boolean { return planning.excludedDates?.includes(date)===true || Object.values(events).some(item=>item.data===date&&item.tipo!=='informativo') }
async function createMonthSlots(): Promise<void> {
  const {start,end}=monthBounds(selectedMonth), startDate=new Date(`${start}T12:00:00Z`), endDate=new Date(`${end}T12:00:00Z`), sections:(readonly ['s2',number,string])[] = [['s2',planning.meetingDays?.weekendDow??0,planning.s2Time??'']]
  const patch:Record<string,unknown>={}
  for (const [section,dow,time] of sections) for (let date=new Date(startDate); date<=endDate; date.setUTCDate(date.getUTCDate()+1)) { const iso=date.toISOString().slice(0,10); if (date.getUTCDay()!==dow||blockedDate(iso)||Object.values(schedule()).some(item=>item.data===iso&&item.tipo!=='saida_orador'&&(item.secao??'s2')===section)) continue; const id=newSpeakerId('programacao'), local=Object.entries(congregations()).find(([,item])=>item.tipo==='local'&&(item.secao??'s2')===section); patch[id]={data:iso,tipo:'discurso_local',status:'por_definir',secao:section,horarioLocal:time,...(local?{localCongregacaoId:local[0],localCongregacaoNome:local[1].nome}:{}),updatedAt:isoNow()} }
  if (!Object.keys(patch).length) { toast('Todas as datas do mês já estão criadas'); return }
  try { await update(oradoresProgramacaoRef,patch); Object.assign(schedule(),patch);Object.assign(rawSchedule,structuredClone(patch)); toast(`${Object.keys(patch).length} data(s) criada(s)`); renderSchedule() } catch { toast('Não foi possível criar as datas') }
}

async function downloadSchedulePdf(): Promise<void> {
  if (downloadingPdf) return; downloadingPdf=true
  const button=document.getElementById('speakerSchedulePdf') as HTMLButtonElement|null; if(button){button.disabled=true;button.textContent='Preparando PDF...'}
  try { const docs=await import('./oradores-documents'); await docs.downloadSpeakersSchedulePdf({month:selectedMonth,schedule:Object.values(schedule()),speakers:speakers(),themes:themes(),congregations:congregations()}); toast('Download do PDF iniciado') } catch { toast('Não foi possível gerar o PDF') } finally { downloadingPdf=false; if(button){button.disabled=false;button.textContent='Baixar PDF'} }
}

async function publishSchedulePdf(): Promise<void> {
  if (publishingPdf) return
  publishingPdf=true
  const releaseUi=lockPublicationUi()
  try {
    const [{ createSpeakersSchedulePdf },{ publishAgendaModulePdf }]=await Promise.all([import('./oradores-documents'),import('./agenda-documents')])
    const bytes=await createSpeakersSchedulePdf({month:selectedMonth,schedule:Object.values(schedule()),speakers:speakers(),themes:themes(),congregations:congregations()})
    const {end}=monthBounds(selectedMonth)
    const sourceHash=await publicationHash(publicationSource(data,selectedMonth))
    await publishAgendaModulePdf(bytes,{sourceHash,modulo:'oradores',periodo:selectedMonth,inicio:`${selectedMonth}-01`,fim:end,origemPeriodoId:selectedMonth,nome:`programacao-oradores-${selectedMonth}.pdf`})
    toast('PDF de Oradores publicado no Quadro');void showPublicationStatus()
  } catch { toast('Não foi possível publicar o PDF') }
  finally { publishingPdf=false; releaseUi() }
}

function speakerEditor(): string {
  if (!editingId || !canEditPeople()) return ''
  const item=editingId==='new'?undefined:rawSpeakers[editingId]
  const masterId=item?resolveSpeakerMasterId(item,masterPeople,taskPeople):''
  const visitor=item?.tipo==='visitante'
  const options=Object.entries(masterPeople).filter(([id,p])=>id===masterId || p.active!==false && !Object.entries(rawSpeakers).some(([otherId,other])=>otherId!==editingId&&resolveSpeakerMasterId(other,masterPeople,taskPeople)===id))
    .sort((a,b)=>a[1].name.localeCompare(b[1].name,'pt-BR')).map(([id,p])=>option(id,p.name,masterId)).join('')
  return `<form id="speakerForm" class="form-panel"><h3>${item?'Editar orador':'Adicionar do cadastro Admin'}</h3>
    ${visitor?`<p>${esc(item.nome)} · Visitante</p><p class="form-help">Cadastro visitante existente. Novos visitantes podem ser informados na programação.</p>`:
      field('Pessoa do cadastro Admin',`<select name="masterId" ${masterId?'disabled':''}><option value="">Selecionar pessoa...</option>${masterId&&!masterPeople[masterId]?option(masterId,'Vínculo não encontrado no Admin',masterId):''}${options}</select>`)}
    <p id="speakerIdentity" class="form-help"></p>
    ${field('Números dos temas',`<input name="themeNumbers" type="text" inputmode="text" autocomplete="off" placeholder="1, 25, 38, 45" value="${esc(repertoireNumbers(item?.temaIds??[],themes()))}" aria-describedby="repertoireHelp repertoirePreview">`)}
    <p id="repertoireHelp" class="form-help">Separe os números por vírgulas. Retire um número para remover o tema. Deixar vazio remove todos os temas.</p>
    <div id="repertoirePreview" class="form-help" aria-live="polite"></div>
    <div class="oradores-check-grid">
      <label class="oradores-check"><input name="ativo" type="checkbox" ${item?.ativo!==false?'checked':''}> Ativo em Oradores</label>
      ${visitor?'':`<label class="oradores-check"><input name="aprovadoParaSaida" type="checkbox" ${item?.aprovadoParaSaida?'checked':''}> Aprovado para saída</label>
      <label class="oradores-check"><input name="podePresidir" type="checkbox" ${item?.podePresidir?'checked':''}> Pode presidir</label>
      <label class="oradores-check"><input name="sentinelaDirigente" type="checkbox" ${item?.sentinelaDirigente?'checked':''}> Dirigente de A Sentinela</label>
      <label class="oradores-check"><input name="sentinelaSubstituto" type="checkbox" ${item?.sentinelaSubstituto?'checked':''}> Substituto de A Sentinela</label>`}
    </div><div class="service-actions"><button class="btn btn-primary" type="submit">Salvar</button><button id="cancelSpeakerEdit" class="btn btn-ghost" type="button">Cancelar</button></div>
  </form>`
}

function renderSpeakers(): void {
  root().innerHTML=`${sectionTitle('Cadastro de oradores')}<p class="form-help">Oradores locais. Visitantes são selecionados na programação de discursos visitantes.</p><div class="service-actions">${canEditPeople()?'<button id="newSpeaker" class="btn btn-primary">Adicionar do cadastro Admin</button>':''}</div>
    ${speakerEditor()}${field('Buscar orador ou número de tema',`<input id="speakerSearch" type="search" placeholder="Nome ou número do tema" value="${esc(speakerQuery)}">`)}
    <div id="speakerResults" class="oradores-list"></div>`
  const list=():void=>{
    const rows=Object.entries(speakers()).filter(([,item])=>item.tipo==='local'&&matchesSpeaker(item,speakerQuery,themes())).sort((a,b)=>Number(b[1].ativo)-Number(a[1].ativo)||a[1].nome.localeCompare(b[1].nome,'pt-BR'))
    document.getElementById('speakerResults')!.innerHTML=rows.map(([id,item])=>`<article class="oradores-card"><div class="oradores-card-head"><div><strong>${esc(item.nome)}</strong><small>${esc(item.tipo==='local'?'Local':item.origemNome||'Visitante')} · ${esc(SPEAKER_ROLE_LABEL[item.funcao])}</small></div><span class="status-pill">${item.ativo?'Ativo':'Inativo'}</span></div>
      <div class="oradores-card-grid"><div><span>Telefone</span><strong>${esc(item.telefone||'Não informado')}</strong></div><div><span>Números dos temas no repertório</span><strong data-speaker-repertoire="${esc(id)}">${esc(repertoireNumbers(item.temaIds,themes())||'Nenhum tema')}</strong></div><div><span>Saída</span><strong>${item.aprovadoParaSaida?'Aprovado':'Não aprovado'}</strong></div><div><span>A Sentinela</span><strong>${item.sentinelaDirigente?'Dirigente':item.sentinelaSubstituto?'Substituto':'—'}</strong></div></div>
      ${item.tipo==='local'&&!item.masterId?'<p class="notice warning">Vincule esta pessoa ao cadastro Admin para habilitar a programação.</p>':''}
      ${canEditPeople()?`<button class="btn btn-ghost" data-edit-speaker="${esc(id)}">Editar</button>`:''}</article>`).join('')||empty('Nenhum orador encontrado.')
    document.querySelectorAll<HTMLButtonElement>('[data-edit-speaker]').forEach(button=>button.addEventListener('click',()=>{editingId=button.dataset.editSpeaker!;renderSpeakers()}))
  }
  list()
  document.getElementById('speakerSearch')?.addEventListener('input',event=>{speakerQuery=(event.target as HTMLInputElement).value;list()})
  document.getElementById('newSpeaker')?.addEventListener('click',()=>{editingId='new';renderSpeakers()})
  document.getElementById('cancelSpeakerEdit')?.addEventListener('click',()=>{editingId='';renderSpeakers()})
  const form=document.getElementById('speakerForm') as HTMLFormElement|null
  if (!form) return
  const original=rawSpeakers[editingId]
  const input=form.elements.namedItem('themeNumbers') as HTMLInputElement
  const preview=():void=>{
    const parsed=parseRepertoire(input.value,themes(),original?.temaIds??[])
    input.setCustomValidity(parsed.error)
    document.getElementById('repertoirePreview')!.innerHTML=parsed.error?esc(parsed.error):parsed.ids.length?parsed.ids.map(id=>`<div>${themes()[id]!.numero} — ${esc(themes()[id]!.titulo)}${themes()[id]!.ativo?'':' (inativo)'}</div>`).join(''):'O repertório ficará sem temas.'
  }
  input.addEventListener('input',preview)
  input.addEventListener('blur',()=>{const parsed=parseRepertoire(input.value,themes(),original?.temaIds??[]);if(!parsed.error)input.value=parsed.formatted})
  preview()
  const identity=():void=>{
    const mid=(form.elements.namedItem('masterId') as HTMLSelectElement|null)?.value??''
    const person=masterPeople[mid]
    document.getElementById('speakerIdentity')!.textContent=person?`${person.name} · WhatsApp: ${person.whatsapp||'não informado'}. Dados pessoais são editados no Admin.${person.active===false?' Pessoa inativa no Admin.':''}`:''
  }
  form.querySelector('[name="masterId"]')?.addEventListener('change',identity);identity()
  form.addEventListener('submit',event=>{event.preventDefault();void saveSpeaker(form)})
}

async function saveSpeaker(form:HTMLFormElement):Promise<void> {
  if (saving || !canEditPeople()) return
  const values=new FormData(form), previous=rawSpeakers[editingId], visitor=previous?.tipo==='visitante'
  const mid=previous?resolveSpeakerMasterId(previous,masterPeople,taskPeople)||String(values.get('masterId')??''):String(values.get('masterId')??'')
  if (!visitor && !masterPeople[mid]) {formError(form,'Selecione uma pessoa do cadastro Admin.');return}
  if (!visitor && Object.entries(rawSpeakers).some(([id,item])=>id!==editingId&&resolveSpeakerMasterId(item,masterPeople,taskPeople)===mid)) {formError(form,'Esta pessoa já está vinculada a Oradores.');return}
  const parsed=parseRepertoire(String(values.get('themeNumbers')??''),themes(),previous?.temaIds??[])
  if(parsed.error){formError(form,parsed.error);return}
  const missing=(previous?.temaIds??[]).filter(id=>!themes()[id])
  if(missing.length){formError(form,'Há temas antigos ausentes do catálogo. Regularize o catálogo antes de alterar este repertório para preservar os vínculos.');return}
  const dirigente=values.get('sentinelaDirigente')==='on', substituto=values.get('sentinelaSubstituto')==='on', active=values.get('ativo')==='on'
  if(dirigente&&substituto){formError(form,'Dirigente e substituto de A Sentinela devem ser pessoas diferentes.');return}
  if((dirigente||substituto)&&(!active||masterPeople[mid]?.active===false)){formError(form,'O dirigente e o substituto precisam estar ativos em Oradores e no Admin.');return}
  const id=previous?editingId:`orador_${mid}`
  if(!previous&&rawSpeakers[id]){formError(form,'Já existe um cadastro com este vínculo. Reabra o cadastro existente.');return}
  if(previous?.temaIds.length&&!parsed.ids.length&&!confirm('Remover todos os temas do repertório deste orador?'))return
  const person=masterPeople[mid]
  const item:Speaker={...(previous??{nome:person!.name,telefone:person!.whatsapp??'',tipo:'local',funcao:'publicador'}),...(!visitor?{masterId:mid}:{}),ativo:active,temaIds:parsed.ids,secao:previous?.secao??'s2',
    aprovadoParaSaida:!visitor&&values.get('aprovadoParaSaida')==='on',podePresidir:!visitor&&values.get('podePresidir')==='on',sentinelaDirigente:dirigente,sentinelaSubstituto:substituto}
  const next=structuredClone(speakerBaseline??{}) as Record<string,Speaker>
  next[id]={...next[id],...item}
  Object.entries(next).forEach(([otherId,other])=>{if(otherId!==id&&(other.secao??'s2')===(item.secao??'s2')){if(dirigente)other.sentinelaDirigente=false;if(substituto)other.sentinelaSubstituto=false}})
  saving=true
  const release=freezeForm(form)
  try {
    await compareAndSet(oradoresCadastroRef,speakerBaseline,next)
    speakerBaseline=structuredClone(next);rawSpeakers=normalizeSpeakersRoot({oradores:next}).oradores??{};hydrateSpeakers()
    dirty=false;editingId='';toast('Configuração do orador salva');renderSpeakers()
  } catch {formError(form,'Não foi possível salvar. Seu preenchimento foi mantido. Se outro administrador alterou o cadastro, copie suas alterações e recarregue o aplicativo.')}
  finally {saving=false;release()}
}

function themeEditor():string{if(!editingId)return'';const item=editingId==='new'?undefined:themes()[editingId];return`<form id="themeForm" class="form-panel"><h3>${item?'Editar tema':'Novo tema'}</h3><div class="module-form-grid">${field('Número',`<input name="numero" type="number" min="1" max="999" value="${item?.numero??''}" required>`)}${field('Título',`<input name="titulo" maxlength="180" value="${esc(item?.titulo)}" required>`)}</div><label class="oradores-check"><input name="ativo" type="checkbox" ${item?.ativo!==false?'checked':''}> Tema ativo</label><div class="service-actions"><button class="btn btn-primary">Salvar</button><button id="cancelThemeEdit" class="btn btn-ghost" type="button">Cancelar</button>${item?'<button id="deleteTheme" class="btn btn-danger" type="button">Excluir</button>':''}</div></form>`}
function themeUse(id:string) {return themeUsageIndex(data,today()).get(id)??{past:false,pending:false,lastPastDate:'',nextDate:''}}
async function downloadOperationalReport(button:HTMLButtonElement,generate:()=>Promise<Uint8Array>,filename:string):Promise<void>{
  if(button.disabled)return
  button.disabled=true
  try{downloadPdf(await generate(),filename);toast('Download do PDF iniciado')}catch{toast('Não foi possível gerar o PDF')}finally{button.disabled=false}
}
function renderThemes():void {
  root().innerHTML=`${sectionTitle('Temas')}<div class="service-actions"><button id="newTheme" class="btn btn-primary">Novo tema</button><button id="themesPdf" class="btn btn-ghost">Baixar PDF dos temas</button></div>${themeEditor()}
    ${field('Localizar tema',`<input id="themeSearch" type="search" value="${esc(themeQuery)}" placeholder="Digite o número ou parte do título">`)}
    <div class="service-actions">${Object.entries(THEME_FILTER_LABELS).map(([key,label])=>`<button class="btn btn-ghost" data-theme-filter="${key}">${label}</button>`).join('')}</div>
    <p id="themeCount" class="form-help"></p><div id="themeResults"></div>`
  const list=():void=>{
    const rows=filteredThemeRows(data,today(),themeFilter,themeQuery)
    document.getElementById('themeCount')!.textContent=`${rows.length} temas · ${THEME_FILTER_LABELS[themeFilter]}. Temas já programados estão ocupados.`
    document.querySelectorAll<HTMLButtonElement>('[data-theme-filter]').forEach(button=>{const active=button.dataset.themeFilter===themeFilter;button.setAttribute('aria-pressed',String(active));button.className='btn '+(active?'btn-primary':'btn-ghost')})
    document.getElementById('themeResults')!.innerHTML=rows.map(row=>`<article class="oradores-row"><div><strong>${row.theme.numero} — ${esc(row.theme.titulo)}</strong><small>${row.theme.ativo?'Ativo':'Inativo'} · ${row.lastPastDate?'Último uso: '+themeDate(row.lastPastDate):'Nunca usado'}${row.nextDate?' · Ocupado / próxima data: '+themeDate(row.nextDate):''}</small></div><button class="btn btn-ghost" data-edit-theme="${esc(row.id)}">Editar</button></article>`).join('')||empty('Nenhum tema encontrado neste filtro.')
    document.querySelectorAll<HTMLButtonElement>('[data-edit-theme]').forEach(button=>button.addEventListener('click',()=>{editingId=button.dataset.editTheme!;renderThemes()}))
  }
  document.getElementById('themeSearch')?.addEventListener('input',event=>{themeQuery=(event.target as HTMLInputElement).value;list()})
  document.querySelectorAll<HTMLButtonElement>('[data-theme-filter]').forEach(button=>button.addEventListener('click',()=>{themeFilter=button.dataset.themeFilter as ThemeFilter;list()}))
  document.getElementById('themesPdf')?.addEventListener('click',event=>{
    const rows=filteredThemeRows(data,today(),themeFilter,themeQuery),label=THEME_FILTER_LABELS[themeFilter],query=themeQuery
    void downloadOperationalReport(event.currentTarget as HTMLButtonElement,async()=>{const {createThemesReportPdf}=await import('./oradores-reports');return createThemesReportPdf(rows,label,query,today())},`temas-${themeFilter}.pdf`)
  })
  document.getElementById('newTheme')?.addEventListener('click',()=>{editingId='new';renderThemes()})
  document.getElementById('cancelThemeEdit')?.addEventListener('click',()=>{editingId='';renderThemes()})
  document.getElementById('themeForm')?.addEventListener('submit',event=>{event.preventDefault();void saveTheme(event.currentTarget as HTMLFormElement)})
  document.getElementById('deleteTheme')?.addEventListener('click',()=>void deleteTheme())
  if(editingId&&themeUse(editingId).past){
    const form=document.getElementById('themeForm') as HTMLFormElement
    for(const name of ['numero','titulo'])(form.elements.namedItem(name) as HTMLInputElement).readOnly=true
    form.insertAdjacentHTML('afterbegin','<p class="form-help">Tema já usado: número e título são preservados. Você pode alterar a situação.</p>')
  }
  list()
}
async function saveTheme(form:HTMLFormElement):Promise<void>{const values=new FormData(form),number=Number(values.get('numero')),title=String(values.get('titulo')).trim();if(!Number.isInteger(number)||number<1||number>999||!title){toast('Informe número e título válidos');return}if(Object.entries(themes()).some(([id,item])=>id!==editingId&&item.numero===number)){toast('Já existe um tema com este número');return}if(editingId!=='new'&&themeUse(editingId).past&&(themes()[editingId]?.numero!==number||themes()[editingId]?.titulo!==title)){formError(form,'Número e título de um tema já usado devem ser preservados.');return}const id=editingId==='new'?`tema_${String(number).padStart(3,'0')}`:editingId,item={numero:number,titulo:title,ativo:values.get('ativo')==='on'};try{await set(child(oradoresTemasRef,id),item);themes()[id]=item;dirty=false;editingId='';renderThemes()}catch{toast('Não foi possível salvar')}}
async function deleteTheme():Promise<void>{const id=editingId,item=themes()[id];if(!item||Object.values(schedule()).some(row=>row.temaId===id)||Object.values(data.historicoTemas??{}).some(row=>row.temaId===id)||Object.values(speakers()).some(row=>row.temaIds.includes(id))){toast('Tema com histórico deve ser inativado, não excluído');return}if(!confirm(`Excluir o tema ${item.numero}?`))return;try{await set(child(oradoresTemasRef,id),null);delete themes()[id];dirty=false;editingId='';renderThemes()}catch{toast('Não foi possível excluir')}}

function congregationEditor():string{if(!editingId)return'';const item=editingId==='new'?undefined:congregations()[editingId];return`<form id="congregationForm" class="form-panel"><h3>${item?'Editar congregação':'Nova congregação'}</h3><div class="module-form-grid">${field('Nome',`<input name="nome" value="${esc(item?.nome)}" required>`)}${field('Cidade',`<input name="cidade" value="${esc(item?.cidade)}">`)}${field('Tipo',`<select name="tipo">${option('visitante','Visitante',item?.tipo??'visitante')}${option('local','Local',item?.tipo??'visitante')}</select>`)}${field('Contato',`<input name="contato" value="${esc(item?.contato)}">`)}${field('Telefone',`<input name="telefone" inputmode="tel" value="${esc(item?.telefone)}">`)}${field('Dia da reunião',`<input name="diaReuniao" placeholder="Sábado" value="${esc(item?.diaReuniao)}">`)}${field('Horário',`<input name="horario" type="time" value="${esc(item?.horario)}">`)}${field('Endereço para impressão',`<input name="localizacao" value="${esc(item?.localizacao)}">`)}${field('Mapa (link HTTPS ou coordenadas)',`<input name="mapa" value="${esc(item?.mapa)}">`)}${field('Observações',`<textarea name="observacoes">${esc(item?.observacoes)}</textarea>`)}</div><label class="oradores-check"><input name="ativa" type="checkbox" ${item?.ativa!==false?'checked':''}> Congregação ativa</label><div class="service-actions"><button class="btn btn-primary">Salvar</button><button id="cancelCongregationEdit" class="btn btn-ghost" type="button">Cancelar</button>${item?'<button id="deleteCongregation" class="btn btn-danger" type="button">Excluir</button>':''}</div></form>`}
function renderCongregations():void{const rows=Object.entries(congregations()).sort((a,b)=>a[1].nome.localeCompare(b[1].nome,'pt-BR'));root().innerHTML=`${sectionTitle('Congregações')}<button id="newCongregation" class="btn btn-primary">Nova congregação</button>${congregationEditor()}<div class="oradores-list">${rows.map(([id,item])=>`<article class="oradores-card"><div class="oradores-card-head"><div><strong>${esc(item.nome)}</strong><small>${esc([item.tipo==='local'?'Local':'Visitante',item.cidade].filter(Boolean).join(' · '))}</small></div><span class="status-pill">${item.ativa?'Ativa':'Inativa'}</span></div><div class="oradores-card-grid"><div><span>Contato</span><strong>${esc(item.contato||'Não informado')}</strong></div><div><span>Telefone</span><strong>${esc(item.telefone||'Não informado')}</strong></div><div><span>Reunião</span><strong>${esc([item.diaReuniao,item.horario].filter(Boolean).join(' às ')||'Não informada')}</strong></div><div><span>Localização</span><strong>${esc(item.localizacao||'Não informada')}</strong></div></div><button class="btn btn-ghost" data-edit-congregation="${esc(id)}">Editar</button></article>`).join('')||empty('Nenhuma congregação cadastrada.')}</div>`;document.getElementById('newCongregation')?.addEventListener('click',()=>{editingId='new';renderCongregations()});document.getElementById('cancelCongregationEdit')?.addEventListener('click',()=>{editingId='';renderCongregations()});document.getElementById('congregationForm')?.addEventListener('submit',event=>{event.preventDefault();void saveCongregation(event.currentTarget as HTMLFormElement)});document.getElementById('deleteCongregation')?.addEventListener('click',()=>void deleteCongregation());document.querySelectorAll<HTMLButtonElement>('[data-edit-congregation]').forEach(button=>button.addEventListener('click',()=>{editingId=button.dataset.editCongregation!;renderCongregations()}))}
async function saveCongregation(form:HTMLFormElement):Promise<void>{const values=new FormData(form),name=String(values.get('nome')).trim();if(!name){toast('Informe o nome');return}const id=editingId==='new'?newSpeakerId('congregacao'):editingId,item:SpeakerCongregation={nome:name,cidade:String(values.get('cidade')).trim(),tipo:String(values.get('tipo')) as 'local'|'visitante',ativa:values.get('ativa')==='on',contato:String(values.get('contato')).trim(),telefone:phoneDigits(String(values.get('telefone'))),diaReuniao:String(values.get('diaReuniao')).trim(),horario:String(values.get('horario')),localizacao:cleanAddress(String(values.get('localizacao'))),mapa:cleanAddress(String(values.get('mapa') ?? '')),observacoes:String(values.get('observacoes')).trim(),secao:'s2'};try{await set(child(oradoresCongregacoesRef,id),item);congregations()[id]=item;dirty=false;editingId='';renderCongregations()}catch{toast('Não foi possível salvar')}}
async function deleteCongregation():Promise<void>{const id=editingId,item=congregations()[id];if(!item||Object.values(schedule()).some(row=>scheduleCongregationId(row)===id)){toast('Congregação com histórico deve ser inativada, não excluída');return}if(!confirm(`Excluir ${item.nome}?`))return;try{await set(child(oradoresCongregacoesRef,id),null);delete congregations()[id];dirty=false;editingId='';renderCongregations()}catch{toast('Não foi possível excluir')}}

function eventEditor():string{if(!editingId)return'';const item=editingId==='new'?undefined:events[editingId],types=item?.impactoTarefas?.tiposReuniao??[];return`<form id="speakerEventForm" class="form-panel"><h3>${item?'Editar evento':'Novo evento'}</h3><div class="module-form-grid">${field('Data',`<input name="data" type="date" value="${esc(item?.data??`${selectedMonth}-01`)}" required>`)}${field('Título',`<input name="titulo" value="${esc(item?.titulo)}" required>`)}${field('Tipo',`<select name="tipo">${Object.entries(EVENT_KIND_LABEL).map(([id,label])=>option(id,label,item?.tipo??'informativo')).join('')}</select>`)}${field('Descrição',`<textarea name="descricao">${esc(item?.descricao)}</textarea>`)}</div><label class="oradores-check"><input name="bloqueiaReuniao" type="checkbox" ${item?.impactoTarefas?.bloqueiaReuniao?'checked':''}> Bloqueia reunião no módulo Tarefas</label><div class="oradores-check-grid"><label class="oradores-check"><input name="tipoReuniao" type="checkbox" value="midweek" ${types.includes('midweek')?'checked':''}> Meio de semana</label><label class="oradores-check"><input name="tipoReuniao" type="checkbox" value="weekend" ${types.includes('weekend')?'checked':''}> Fim de semana</label></div><div class="service-actions"><button class="btn btn-primary">Salvar</button><button id="cancelEventEdit" class="btn btn-ghost" type="button">Cancelar</button>${item?'<button id="deleteEvent" class="btn btn-danger" type="button">Excluir</button>':''}</div></form>`}
function renderEvents():void{const rows=Object.entries(events).sort((a,b)=>a[1].data.localeCompare(b[1].data));root().innerHTML=`${sectionTitle('Eventos')}<button id="newSpeakerEvent" class="btn btn-primary">Novo evento</button>${eventEditor()}<div class="module-option-list">${rows.map(([id,item])=>`<article class="oradores-row"><div><strong>${esc(item.titulo)}</strong><small>${esc(formatSpeakerDate(item.data))} · ${esc(EVENT_KIND_LABEL[item.tipo])}${item.impactoTarefas?.bloqueiaReuniao?' · Bloqueia Tarefas':''}</small></div><button class="btn btn-ghost" data-edit-event="${esc(id)}">Editar</button></article>`).join('')||empty('Nenhum evento cadastrado.')}</div>`;document.getElementById('newSpeakerEvent')?.addEventListener('click',()=>{editingId='new';renderEvents()});document.getElementById('cancelEventEdit')?.addEventListener('click',()=>{editingId='';renderEvents()});document.getElementById('speakerEventForm')?.addEventListener('submit',event=>{event.preventDefault();void saveEvent(event.currentTarget as HTMLFormElement)});document.getElementById('deleteEvent')?.addEventListener('click',()=>void deleteEvent());document.querySelectorAll<HTMLButtonElement>('[data-edit-event]').forEach(button=>button.addEventListener('click',()=>{editingId=button.dataset.editEvent!;renderEvents()}))}
async function saveEvent(form:HTMLFormElement):Promise<void>{const values=new FormData(form),date=String(values.get('data')),title=String(values.get('titulo')).trim(),blocks=values.get('bloqueiaReuniao')==='on',selectedTypes=values.getAll('tipoReuniao').map(String);if(!validIsoDate(date)||!title){toast('Informe data e título válidos');return}if(blocks&&!selectedTypes.length){toast('Escolha qual reunião será bloqueada');return}const tiposReuniao=[...selectedTypes];const id=editingId==='new'?newSpeakerId('evento'):editingId,item:SpeakerEvent={data:date,titulo:title,descricao:String(values.get('descricao')).trim(),tipo:String(values.get('tipo')) as SpeakerEventKind,impactoTarefas:{bloqueiaReuniao:blocks,tiposReuniao}};try{await set(child(oradoresEventosRef,id),item);events[id]=item;dirty=false;editingId='';renderEvents()}catch{toast('Não foi possível salvar')}}
async function deleteEvent():Promise<void>{const id=editingId,item=events[id];if(!item||!confirm(`Excluir ${item.titulo}?`))return;try{await set(child(oradoresEventosRef,id),null);delete events[id];dirty=false;editingId='';renderEvents()}catch{toast('Não foi possível excluir')}}

function contextSelect(kind:'speaker'|'congregation'):string{if(kind==='speaker')return`<label class="form-field context-select"><span>Orador</span><select id="speakerContext">${Object.entries(speakers()).sort((a,b)=>a[1].nome.localeCompare(b[1].nome,'pt-BR')).map(([id,item])=>option(id,item.nome,selectedSpeakerId)).join('')}</select></label>`;return`<label class="form-field context-select"><span>Congregação</span><select id="congregationContext">${Object.entries(congregations()).filter(([,item])=>item.tipo==='visitante').sort((a,b)=>a[1].nome.localeCompare(b[1].nome,'pt-BR')).map(([id,item])=>option(id,item.nome,selectedCongregationId)).join('')}</select></label>`}
function renderAssignments():void{const speaker=speakers()[selectedSpeakerId],rows=Object.values(schedule()).filter(item=>item.data>=today()&&(item.oradorId===selectedSpeakerId||item.oradorSecundarioId===selectedSpeakerId)).sort((a,b)=>a.data.localeCompare(b.data));root().innerHTML=`${sectionTitle('Designações')}${contextSelect('speaker')}${speaker&&rows.length?'<button id="notifySpeakerAssignments" class="btn btn-primary">Abrir no WhatsApp</button>':''}<div class="oradores-list">${speaker?rows.map(item=>scheduleCard('',item).replace(/<div class="service-actions">[\s\S]*?<\/div><\/article>$/,'</article>')).join('')||empty(`${speaker.nome} não tem compromissos futuros.`):empty('Nenhum orador selecionado.')}</div>`;document.getElementById('speakerContext')?.addEventListener('change',event=>{selectedSpeakerId=(event.currentTarget as HTMLSelectElement).value;renderAssignments()});document.getElementById('notifySpeakerAssignments')?.addEventListener('click',()=>{if(speaker){const details=`*${speaker.nome}*\n\n${rows.map(item=>speakerAssignmentMessage(item,data)).join('\n\n')}`;openWhatsapp(speaker.telefone,applyMessageTemplate(messageSettings.meetingText,details,speaker.nome))}})}
function renderExchanges():void{const today=new Date().toISOString().slice(0,10),allRows=Object.values(schedule()).filter(item=>item.data>=today&&item.tipo!=='discurso_local').sort((a,b)=>a.data.localeCompare(b.data)),congregation=congregations()[selectedCongregationId],rows=allRows.filter(item=>scheduleCongregationId(item)===selectedCongregationId),incoming=allRows.filter(item=>item.tipo==='discurso_visitante').length,outgoing=allRows.filter(item=>item.tipo==='saida_orador').length,congregationCount=new Set(allRows.map(scheduleCongregationId).filter(Boolean)).size,next=allRows[0];root().innerHTML=`${sectionTitle('Intercâmbios')}<div class="service-summary"><div><strong>${incoming}</strong><span>Entradas</span></div><div><strong>${outgoing}</strong><span>Saídas</span></div><div><strong>${congregationCount}</strong><span>Congregações</span></div><div><strong>${next?esc(formatSpeakerDate(next.data)):'-'}</strong><span>Próximo intercâmbio</span></div></div>${contextSelect('congregation')}${congregation&&rows.length?'<button id="notifyCongregationExchanges" class="btn btn-primary">Abrir no WhatsApp</button>':''}<div class="oradores-list">${congregation?rows.map(item=>scheduleCard('',item).replace(/<div class="service-actions">[\s\S]*?<\/div><\/article>$/,'</article>')).join('')||empty(`Nenhum intercâmbio futuro com ${congregation.nome}.`):empty('Nenhuma congregação selecionada.')}</div>`;document.getElementById('congregationContext')?.addEventListener('change',event=>{selectedCongregationId=(event.currentTarget as HTMLSelectElement).value;renderExchanges()});document.getElementById('notifyCongregationExchanges')?.addEventListener('click',()=>{if(congregation){const details=rows.map(item=>`- ${formatSpeakerDate(item.data)}: ${item.tipo==='saida_orador'?'vai':'vem'} ${speakers()[item.oradorId??'']?.nome?.trim()||item.oradorNome?.trim()||'orador a definir'}`).join('\n');openWhatsapp(congregation.telefone,applyMessageTemplate(messageSettings.meetingText,details,congregation.contato||'irmãos'))}})}
function renderPending():void {
  const rows=speakerPendingItems(data,today())
  root().innerHTML=`${sectionTitle('Pendências')}<p class="form-help">Próximos 90 dias · ${rows.length} programação(ões) para resolver. Toque em uma pendência para ir à ação correspondente.</p><div class="oradores-list">${rows.map(item=>`<button class="oradores-pending severity-${item.severity}" data-pending-id="${esc(item.recordId)}" data-pending-action="${item.action}"><span><strong>${esc(item.title)}</strong><small>${esc(item.detail)}</small></span><span aria-hidden="true">›</span></button>`).join('')||empty('Tudo em dia nos próximos 90 dias.')}</div>`
  document.querySelectorAll<HTMLButtonElement>('[data-pending-id]').forEach(button=>button.addEventListener('click',()=>{
    const id=button.dataset.pendingId!,action=button.dataset.pendingAction!,item=schedule()[id]
    if(!item||!allowLeave())return
    selectedMonth=item.data.slice(0,7);localStorage.setItem('noroeste_oradores_month',selectedMonth)
    scheduleQuery='';scheduleFilter='';onlyFuture=false;scheduleDraft=null
    void openScreen('programacao').then(()=>{
      if(screen!=='programacao'||!schedule()[id])return
      if(action==='confirm'||action==='reconfirm'){
        const target=[...root().querySelectorAll<HTMLButtonElement>(action==='confirm'?'[data-confirm-schedule]':'[data-reconfirm-schedule]')].find(control=>(action==='confirm'?control.dataset.confirmSchedule:control.dataset.reconfirmSchedule)===id)
        target?.scrollIntoView({block:'center'});target?.focus()
      } else {
        editingId=id;renderSchedule()
        const target=root().querySelector<HTMLElement>(`#speakerScheduleForm [name="${action}"]`)
        target?.scrollIntoView({block:'center'});target?.focus()
      }
    })
  }))
}
function unavailableThemeIds():Set<string>{return new Set([...themeUsageIndex(data,today())].filter(([,use])=>use.past||use.pending).map(([id])=>id))}
function renderEmergency():void {
  const used=unavailableThemeIds()
  const existingId=emergencyDate?Object.entries(schedule()).find(([,item])=>item.data===emergencyDate&&item.tipo!=='saida_orador')?.[0]??'':''
  const rows=Object.entries(speakers()).filter(([,item])=>item.tipo==='local'&&item.ativo)
    .map(([id,item])=>({id,item,conflicts:emergencyDate?speakerConflicts(id,emergencyDate,data,masterPeople,taskPeople,taskPeriods,existingId):[],available:item.temaIds.filter(themeId=>themes()[themeId]?.ativo&&!used.has(themeId)).map(themeId=>themes()[themeId]!)}))
    .filter(row=>row.available.length).sort((a,b)=>a.conflicts.length-b.conflicts.length||a.item.nome.localeCompare(b.item.nome,'pt-BR'))
  root().innerHTML=`${sectionTitle('Substituições')}<button id="substitutionsPdf" class="btn btn-ghost">Baixar PDF de substituições</button>${emergencyDate?`<p class="form-help" id="substitutionContext">Substituição para ${themeDate(emergencyDate)}</p>`:''}<p class="form-help">Oradores ativos com temas que não foram usados nem estão programados.${emergencyDate?(canReadTasks()?'':' Designações de Tarefas não verificadas com seu acesso.'):' A data e os conflitos serão conferidos na programação.'}</p>
    <div class="oradores-list">${rows.map(row=>`<article class="oradores-card"><strong>${esc(row.item.nome)}</strong><small>${row.available.sort((a,b)=>a.numero-b.numero).map(theme=>`${theme.numero} — ${esc(theme.titulo)}`).join('<br>')}</small>
    ${emergencyDate?(row.conflicts.map(reason=>`<p class="notice warning">${esc(reason)}</p>`).join('')||'<p>Sem conflitos encontrados nesta data.</p>'):''}
    <button class="btn btn-ghost" data-emergency-speaker="${esc(row.id)}" ${row.conflicts.length?'disabled':''}>${emergencyDate?'Programar nesta data':'Escolher data e programar'}</button></article>`).join('')||empty('Nenhum orador tem tema disponível no momento.')}</div>`
  document.getElementById('substitutionsPdf')?.addEventListener('click',event=>{
    const reportRows=rows.map(row=>({name:row.item.nome,themes:[...row.available].sort((a,b)=>a.numero-b.numero)})),date=emergencyDate||today()
    void downloadOperationalReport(event.currentTarget as HTMLButtonElement,async()=>{const {createSubstitutionsReportPdf}=await import('./oradores-reports');return createSubstitutionsReportPdf(reportRows,date)},`substituicoes-${date}.pdf`)
  })
  document.querySelectorAll<HTMLButtonElement>('[data-emergency-speaker]').forEach(button=>button.addEventListener('click',()=>{
    const existing=Object.entries(schedule()).find(([,item])=>item.data===emergencyDate&&item.tipo!=='saida_orador')
    if(existing&&!confirm('Já existe uma reunião nesta data. Abrir a edição para substituir o orador?'))return
    screen='programacao';if(emergencyDate)selectedMonth=emergencyDate.slice(0,7);editingId=existing?.[0]??'new'
    scheduleDraft={tipo:'discurso_local',data:emergencyDate,oradorId:button.dataset.emergencySpeaker!,themeNumber:'',temaId:''};dirty=true;render()
  }))
}
