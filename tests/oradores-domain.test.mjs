import test from 'node:test'
import assert from 'node:assert/strict'
import { monthBounds, normalizeSpeakersRoot, scheduleStatus, speakerPendingItems, scheduleBaseForEdit, isDuplicateSchedule, speakerLinkOptions } from '../src/modules/oradores-domain.ts'
import { canonicalSpeaker, resolveSpeakerMasterId, repertoireNumbers, parseRepertoire, matchesSpeaker, speakerConflicts } from '../src/modules/oradores-editor-domain.ts'
import { hasSpeakerAssignment } from '../src/modules/tarefas-domain.ts'
import { collectAgendaEvents } from '../src/modules/individual-domain.ts'
import { filteredThemeRows, themeUsageIndex } from '../src/modules/oradores-themes.ts'

test('disponibilidade reúne histórico e agenda: saídas não ocupam, futuro e hoje ocupam',()=>{
  const root={temas:Object.fromEntries(['free','used','future','out','shared','s1'].map((id,i)=>[id,{numero:i+1,titulo:id,ativo:true}])),
    historicoTemas:{h:{temaId:'used',data:'2026-08-01'},shared:{temaId:'shared',data:'2025-01-01',secao:'s1',historicoCompartilhado:true}},
    programacao:{old:{temaId:'used',data:'2026-09-01',tipo:'discurso_local'},next:{temaId:'used',data:'2026-12-01',tipo:'discurso_visitante'},future:{temaId:'future',data:'2026-10-01',tipo:'discurso_local'},far:{temaId:'future',data:'2027-01-01',tipo:'discurso_local'},out:{temaId:'out',data:'2026-11-01',tipo:'saida_orador'},s1:{temaId:'s1',data:'2026-11-01',tipo:'discurso_local',secao:'s1'}}}
  assert.deepEqual(filteredThemeRows(root,'2026-09-22').map(row=>row.id),['free','out','s1'])
  const index=themeUsageIndex(root,'2026-09-22')
  assert.equal(index.get('used').lastPastDate,'2026-09-01')
  assert.equal(index.get('used').nextDate,'2026-12-01')
  assert.equal(index.get('future').nextDate,'2026-10-01')
  assert.equal(themeUsageIndex(root,'2026-10-01').get('future').pending,true)
  assert.equal(filteredThemeRows(root,'2026-09-22','pending','3')[0].id,'future')
  assert.equal(filteredThemeRows(root,'2026-09-22','used').length,2)
})

const catalog={ arbitrary:{numero:25,titulo:'Tema 25',ativo:true}, one:{numero:1,titulo:'Tema 1',ativo:true}, retired:{numero:38,titulo:'Tema 38',ativo:false} }
test('repertório por números resolve IDs reais, ordena, remove duplicados e permite esvaziar',()=>{
  assert.deepEqual(parseRepertoire('25, 1, 025',catalog),{ids:['one','arbitrary'],formatted:'1, 25',error:''})
  assert.deepEqual(parseRepertoire('  ',catalog),{ids:[],formatted:'',error:''})
  assert.equal(repertoireNumbers(['arbitrary','one','one'],catalog),'1, 25')
  for(const invalid of ['1 25','1,,25','-1','2.5','1,x','1,'])assert.ok(parseRepertoire(invalid,catalog).error,invalid)
  assert.match(parseRepertoire('99',catalog).error,/99.*não cadastrado/)
  assert.match(parseRepertoire('38',catalog).error,/inativo/)
  assert.equal(parseRepertoire('38',catalog,['retired']).error,'')
  assert.match(parseRepertoire('1',{...catalog,other:{numero:1,titulo:'Outro',ativo:true}}).error,/duplicado/)
})
test('identidade master prevalece, legado resolve por ID e nomes iguais não vinculam',()=>{
  const master={m:{name:'Nome central',whatsapp:'5585999999999',active:true,role:'servo-ministerial'}}
  const legacy={nome:'Nome central',pessoaId:'p',tipo:'local',ativo:true,telefone:'antigo',funcao:'anciao',temaIds:[]}
  assert.equal(resolveSpeakerMasterId(legacy,master,{p:{masterId:'m'}}),'m')
  assert.equal(resolveSpeakerMasterId({...legacy,pessoaId:''},master,{}),'')
  const hydrated=canonicalSpeaker(legacy,master,{p:{masterId:'m'}})
  assert.equal(hydrated.telefone,master.m.whatsapp)
  assert.equal(hydrated.funcao,'servo_ministerial')
  assert.equal(canonicalSpeaker(legacy,{m:{...master.m,active:false}},{p:{masterId:'m'}}).ativo,false)
  assert.equal(resolveSpeakerMasterId({...legacy,masterId:'missing'},master,{p:{masterId:'m'}}),'missing')
  assert.equal(legacy.telefone,'antigo')
})
test('busca de oradores encontra número exato e nome',()=>{
  const person={nome:'Orador Um',temaIds:['arbitrary']}
  assert.ok(matchesSpeaker(person,'025',catalog))
  assert.ok(matchesSpeaker(person,'ORADOR',catalog))
  assert.equal(matchesSpeaker(person,'2',catalog),false)
})
test('conflitos detectam identidade duplicada, segundo orador, tarefas e indisponibilidade',()=>{
  const person={nome:'Um',tipo:'local',masterId:'m',ativo:true,temaIds:[]}
  const root={oradores:{a:person,b:{...person}},programacao:{other:{data:'2026-11-01',oradorSecundarioId:'b'}}}
  const master={m:{name:'Um'}},tasks={p:{masterId:'m',unavailableDates:['2026-11-01']}}
  const reasons=speakerConflicts('a','2026-11-01',root,master,tasks,{x:{meetings:{d:{date:'2026-11-01',assignments:{leitor:'p'}}}}})
  assert.equal(reasons.length,3)
  assert.deepEqual(speakerConflicts('a','2026-11-02',root,master,tasks,{}),[])
  assert.deepEqual(speakerConflicts('a','2026-11-01',root,master,{}, {},'other'),[])
})
test('masterId direto mantém conflitos de Tarefas e Agenda pessoal sem depender de tarefas/people',()=>{
  const talks={oradores:{o:{nome:'Um',masterId:'m',pessoaId:'outro'}},programacao:{p:{data:'2026-11-01',tipo:'discurso_local',status:'confirmado',oradorId:'o'}}}
  assert.equal(hasSpeakerAssignment('t','2026-11-01',{people:{t:{masterId:'m'}},discursos:talks}),true)
  assert.equal(hasSpeakerAssignment('t','2026-11-01',{people:{t:{masterId:'outro'}},discursos:talks}),false)
  const root={master:{pessoas:{m:{name:'Um',active:true},outro:{name:'Outro',active:true}}},tarefas:{discursos:talks}}
  assert.equal(collectAgendaEvents(root,'m').filter(x=>x.source==='oradores').length,1)
  assert.equal(collectAgendaEvents(root,'outro').filter(x=>x.source==='oradores').length,0)
})

test('saídas distintas compartilham data, mas duplicatas e duas reuniões locais são recusadas', () => {
  const row={data:'2026-11-21',secao:'s2',tipo:'saida_orador',oradorId:'a',congregacaoDestinoId:'c'}
  assert.equal(isDuplicateSchedule(row,row.data,'saida_orador','b','c'),false)
  assert.equal(isDuplicateSchedule(row,row.data,'saida_orador','a','c'),true)
  assert.equal(isDuplicateSchedule({...row,tipo:'discurso_local'},row.data,'discurso_visitante','b','c'),true)
})

test('edição remove campos apagados sem perder metadados nem modificar o original', () => {
  const original={data:'2026-11-21',tipo:'discurso_local',status:'por_confirmar',temaId:'t',oradorId:'a',oradorSecundarioId:'b',observacoes:'texto',avisadoEm:'2026-09-01',localCongregacaoId:'local'}
  const result=scheduleBaseForEdit(original)
  for(const key of ['temaId','oradorId','oradorSecundarioId','observacoes']) assert.equal(key in result,false)
  assert.equal(result.avisadoEm,original.avisadoEm)
  assert.equal(result.localCongregacaoId,'local')
  assert.equal(original.temaId,'t')
})

test('seletor preserva vínculo central, inativo e ausente', () => {
  const people={p:{name:'Nome',masterId:'m'},inactive:{name:'Inativo',active:false}}
  assert.ok(speakerLinkOptions(people,'m').some(x=>x.value==='m'&&x.label==='Nome'))
  assert.ok(speakerLinkOptions(people,'inactive').some(x=>x.value==='inactive'))
  assert.ok(speakerLinkOptions(people,'legacy').some(x=>x.value==='legacy'))
})

test('orador local sem vínculo gera pendência de proteção', () => {
  const root=normalizeSpeakersRoot({oradores:{o:{nome:'Local',tipo:'local',ativo:true}}})
  assert.ok(speakerPendingItems(root).some(x=>x.id==='speaker-link-o'))
  root.oradores.o.pessoaId='p'
  assert.ok(!speakerPendingItems(root).some(x=>x.id==='speaker-link-o'))
})

test('normaliza os registros atuais sem perder os campos principais', () => {
  const root = normalizeSpeakersRoot({
    oradores:{ o1:{ nome:'João', tipo:'local', funcao:'anciao', ativo:true, temaIds:{ tema_001:true } } },
    temas:{ tema_001:{ numero:1, titulo:'Esperança', ativo:true } },
    programacao:{ p1:{ data:'2026-09-20', tipo:'discurso_local', oradorId:'o1', confirmacao:{ status:true, confirmadoEm:'2026-09-01' } } },
  })
  assert.equal(root.oradores.o1.nome, 'João')
  assert.deepEqual(root.oradores.o1.temaIds, ['tema_001'])
  assert.equal(scheduleStatus(root.programacao.p1), 'confirmado')
})

test('pendências preservam falta de orador, tema e reconfirmação', () => {
  const root = normalizeSpeakersRoot({ programacao:{
    vazio:{ data:'2026-09-20', tipo:'discurso_local', status:'por_definir' },
    perto:{ data:'2026-09-21', tipo:'discurso_local', status:'confirmado', oradorNome:'José', temaTitulo:'Tema', confirmacao:{ status:true } },
  } })
  const pending = speakerPendingItems(root, '2026-09-19')
  assert.ok(pending.some(item => item.title === 'Sem orador'))
  assert.ok(pending.some(item => item.title === 'Sem tema'))
  assert.ok(pending.some(item => item.title.startsWith('Reconfirmar')))
})

test('limites mensais usam o calendário real', () => {
  assert.deepEqual(monthBounds('2028-02'), { start:'2028-02-01', end:'2028-02-29' })
})
