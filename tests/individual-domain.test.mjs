import test from 'node:test'
import assert from 'node:assert/strict'
import { agendaMessage, agendaToIcs, collectAgendaEvents, upcomingAgendaEvents } from '../src/modules/individual-domain.ts'

const root = {
  tarefas: {
    people: { task1: { masterId: 'm1' }, task2: { masterId: 'm2' } },
    scale: { periods: { '2026-09': { meetings: { a: { date:'2026-09-09', type:'midweek', assignments:{ leitor:'task1', mic1:'task2' }, avisados:{} } } } } },
    discursos: { oradores:{ o1:{ pessoaId:'task1' } }, programacao:{ p1:{ data:'2026-09-13', tipo:'saida_orador', oradorId:'o1', temaTitulo:'Esperança', congregacaoDestinoNome:'Centro' } } },
  },
  limpeza: { periodos:{ p:{ semanas:[{ dataMeioSemana:'2026-09-10', grupo:2, grupoNome:'Grupo 2', membrosMid:['m1'], textoAprovado:'Levar luvas.' }] } } },
  escala: { participants:{ e1:{ masterId:'m1' } }, settings:{ locals:{ l1:{ name:'Praça' } } }, tables:{ l1:{ '2026-09':{ rows:{ '2026-09-12':{ slots:{ '08:00':{ p1:'e1', p2:'e2' } } } } } } } },
  programacao: { pessoas:{ m1:{ masterId:'m1' } }, programs:{ w:{ meetingDate:'2026-09-16', parts:[{ id:'x', title:'Leitura da Bíblia', assignedPersonId:'m1', confirmedAt:'2026-09-01' }] } } },
}

test('agrega apenas atribuicoes do masterId solicitado', () => {
  const events = collectAgendaEvents(root, 'm1')
  assert.deepEqual(events.map(event => event.source), ['tarefas', 'limpeza', 'escala', 'oradores', 'programacao'])
  assert.equal(events.some(event => event.title === 'Microfone 1'), false)
})

test('respeita permissao por fonte e limita observacao aprovada', () => {
  const copy = structuredClone(root); copy.limpeza.periodos.p.semanas[0].textoAprovado = 'x'.repeat(300)
  const events = collectAgendaEvents(copy, 'm1', { oradores:false, escala:false })
  assert.equal(events.some(event => event.source === 'oradores' || event.source === 'escala'), false)
  assert.equal(events.find(event => event.source === 'limpeza').note.length, 250)
})

test('ICS preserva data civil, horario, local e escape', () => {
  const event = { id:'a,1', source:'escala', date:'2026-09-12', time:'08:00', title:'Campo, manhã', detail:'Dupla; confirmada', location:'Praça', status:'futuro' }
  const ics = agendaToIcs([event], '2026-09-06T12:00:00.000Z')
  assert.match(ics, /DTSTART;TZID=America\/Fortaleza:20260912T080000/)
  assert.match(ics, /SUMMARY:Campo\\, manhã/)
  assert.match(ics, /DESCRIPTION:Dupla\\; confirmada/)
})

test('proximos compromissos ignora realizados e eventos anteriores', () => {
  const events = [
    { id:'past', source:'tarefas', date:'2026-09-01', title:'Passado', detail:'', status:'futuro' },
    { id:'done', source:'tarefas', date:'2026-09-10', title:'Realizado', detail:'', status:'realizado' },
    { id:'waiting', source:'tarefas', date:'2026-09-10', title:'Confirmar', detail:'', status:'confirmacao-pendente' },
    { id:'changed', source:'tarefas', date:'2026-10-01', title:'Alterado', detail:'', status:'alterado' },
  ]
  assert.deepEqual(upcomingAgendaEvents(events, '2026-09-10').map(event => event.id), ['waiting', 'changed'])
})

test('mensagem cronologica usa somente os eventos recebidos', () => {
  const events = collectAgendaEvents(root, 'm1').slice(0, 2)
  const message = agendaMessage(events)
  assert.match(message, /09\/09\/2026/)
  assert.doesNotMatch(message, /Microfone/)
})

test('sem vinculo canonico nao retorna dados por nome', () => {
  assert.deepEqual(collectAgendaEvents(root, ''), [])
  assert.deepEqual(collectAgendaEvents(root, 'nome parecido'), [])
})
