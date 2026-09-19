import test from 'node:test'
import assert from 'node:assert/strict'
import { monthBounds, normalizeSpeakersRoot, scheduleStatus, speakerPendingItems, scheduleBaseForEdit, isDuplicateSchedule, speakerLinkOptions } from '../src/modules/oradores-domain.ts'

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
