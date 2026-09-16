import test from 'node:test'
import assert from 'node:assert/strict'
import { agendaMessage, agendaToIcs, announcementMessage, boardCleaningMessage, boardMeetingDates, boardMeetingEvents, boardMeetingMessage, boardMeetingWhatsappMessage, collectAgendaEvents, collectAnnouncementEvents, eventsInFeedWindow, normalizeAgendaPeople, sanitizeAgendaPeople, upcomingAgendaEvents, validAgendaDate, validAgendaTime } from '../src/modules/individual-domain.ts'

test('ICS inclui fuso e dobra linhas UTF-8 sem perder texto nem identificador', () => {
  const title = 'Reunião com designação e oração '.repeat(12)
  const event = { id:'programacao:parte1', source:'programacao', date:'2026-09-17', time:'19:30', title, detail:'Detalhes', status:'futuro' }
  const first = agendaToIcs([event], '2026-09-16T12:00:00.000Z')
  assert.match(first, /BEGIN:VTIMEZONE\r\nTZID:America\/Fortaleza/)
  assert.match(first, /TZOFFSETTO:-0300/)
  assert.ok(first.split('\r\n').every(line => Buffer.byteLength(line) <= 75))
  assert.ok(first.replace(/\r\n /g, '').includes(`SUMMARY:${title}\r\n`))
  assert.match(first, /DTSTART;TZID=America\/Fortaleza:20260917T193000/)
  const updated = agendaToIcs([{ ...event, title:'Atualizado' }], '2026-09-17T12:00:00.000Z')
  assert.equal(first.match(/UID:[^\r]+/)[0], updated.match(/UID:[^\r]+/)[0])
  const empty = agendaToIcs([], '2026-09-16T12:00:00.000Z')
  assert.doesNotMatch(empty, /\r\n\r\n/)
})

const root = {
  master: { pessoas:{ m1:{ name:'Ana', active:true }, m2:{ name:'Bruno', active:true } } },
  tarefas: {
    people: { task1: { masterId: 'm1' }, task2: { masterId: 'm2' } },
    scale: { periods: { '2026-09': { locked:true, meetings: { a: { date:'2026-09-09', type:'midweek', assignments:{ leitor:'task1', mic1:'task2' } } } } } },
    discursos: { oradores:{ o1:{ pessoaId:'task1' } }, programacao:{ p1:{ data:'2026-09-13', tipo:'saida_orador', oradorId:'o1', temaTitulo:'Esperança', congregacaoDestinoNome:'Centro' } } },
  },
  limpeza: { periodos:{ p:{ publicado:true, semanas:[{ dataMeioSemana:'2026-09-10', dataFimSemana:'2026-09-13', grupo:2, grupoNome:'Grupo 2', membrosMid:['m1'] }] } } },
  escala: { participants:{ e1:{ masterId:'m1' } }, publishedMonths:{ '2026-09':true }, settings:{ locals:{ l1:{ name:'Praça' } } }, tables:{ l1:{ '2026-09':{ rows:{ '2026-09-12':{ slots:{ '08:00':{ p1:'e1', p2:'e2' } } } } } } } },
  programacao: { pessoas:{ m1:{ masterId:'m1' } }, settings:{ meetingTime:'19:30', rooms:[{ id:'main', name:'Salão principal' }] }, programs:{ w:{ meetingDate:'2026-09-16', parts:[{ id:'x', title:'Leitura da Bíblia', assignedPersonId:'m1', confirmedAt:'2026-09-01' }] } } },
  servicoCampo:{ periods:{ '2026-09':{ month:'2026-09', published:true, assignments:{ s1:{ id:'s1', templateId:'t1', date:'2026-09-17', time:'16:00', location:'Salão do Reino', label:'Saída de campo', leaderId:'m1' } } } } },
}

test('Vida e Ministerio usa horario central e omite semanas sem reuniao na Agenda e Quadro', () => {
  const data = structuredClone(root)
  data.master.config = { reunioes: { meiaDeSemana: { horario: '19:00' } } }
  delete data.programacao.settings.meetingTime
  assert.equal(collectAgendaEvents(data, 'm1').find(event => event.source === 'programacao').time, '19:00')
  for (const type of ['assembleia', 'celebracao']) {
    data.programacao.programs.w.type = type
    assert.equal(collectAgendaEvents(data, 'm1').some(event => event.source === 'programacao'), false)
    assert.equal(collectAnnouncementEvents(data).some(event => event.source === 'programacao'), false)
  }
})

test('cache de identidades remove telefone e grupo de limpeza', () => {
  const people = sanitizeAgendaPeople({ m1:{ name:'Ana', whatsapp:'5585999999999', active:true, sex:'F', role:'publicador', limpeza:{ grupo:3 } } })
  assert.deepEqual(people.m1, { name:'Ana', whatsapp:'', active:true, sex:'F', role:'publicador', limpeza:{ grupo:null } })
})

test('lista de pessoas ausente ou malformada vira coleção vazia', () => {
  assert.deepEqual(normalizeAgendaPeople(undefined), {})
  assert.deepEqual(normalizeAgendaPeople(null), {})
  assert.deepEqual(normalizeAgendaPeople([]), {})
  assert.deepEqual(normalizeAgendaPeople({ semNome:{ active:true }, m1:{ name:'Ana', active:true } }), { m1:{ name:'Ana', active:true } })
})

test('agrega apenas atribuicoes do masterId solicitado', () => {
  const events = collectAgendaEvents(root, 'm1')
  assert.deepEqual(events.map(event => event.source), ['tarefas', 'limpeza', 'escala', 'oradores', 'limpeza', 'programacao', 'servicoCampo'])
  assert.equal(events.some(event => event.title === 'Microfone 1'), false)
  assert.equal(events.find(event => event.source === 'tarefas')?.status, 'futuro')
  assert.equal(events.find(event => event.source === 'escala')?.title, 'Escala TPL')
  assert.match(events.find(event => event.source === 'escala')?.detail ?? '', /Carrinho/)
})

test('respeita permissao por fonte e limita observacao aprovada', () => {
  const copy = structuredClone(root); copy.tarefas.discursos.programacao.p1.observacoes = 'x'.repeat(300)
  const events = collectAgendaEvents(copy, 'm1', { escala:false })
  assert.equal(events.some(event => event.source === 'escala'), false)
  assert.equal(events.find(event => event.source === 'oradores').note.length, 250)
})

test('Serviço de Campo só publica dirigente de mês fechado para o Quadro', () => {
  const draft = structuredClone(root)
  draft.servicoCampo.periods['2026-09'].published = false
  assert.equal(collectAgendaEvents(draft, 'm1').some(event => event.source === 'servicoCampo'), false)
  const events = collectAnnouncementEvents(root, { tarefas:false, limpeza:false, escala:false, oradores:false, programacao:false })
  assert.equal(events.length, 1)
  assert.equal(events[0].people[0], 'Ana')
})

test('ICS preserva data civil, horario, local e escape', () => {
  const event = { id:'a,1', source:'escala', date:'2026-09-12', time:'08:00', title:'Campo, manhã', detail:'Dupla; confirmada', location:'Praça', status:'futuro' }
  const ics = agendaToIcs([event], '2026-09-06T12:00:00.000Z')
  assert.match(ics, /DTSTART;TZID=America\/Fortaleza:20260912T080000/)
  assert.match(ics, /SUMMARY:Campo\\, manhã/)
  assert.match(ics, /DESCRIPTION:Dupla\\; confirmada/)
  assert.match(ics, /DURATION:PT1H/)
  assert.match(ics, /METHOD:PUBLISH/)
})

test('datas e horários impossíveis não entram na agenda nem no ICS', () => {
  assert.equal(validAgendaDate('2026-02-28'), true)
  assert.equal(validAgendaDate('2026-02-31'), false)
  assert.equal(validAgendaTime('23:59'), true)
  assert.equal(validAgendaTime('24:00'), false)
  const invalid = { id:'x', source:'tarefas', date:'2026-02-31', time:'24:00', title:'Inválido', detail:'', status:'futuro' }
  assert.doesNotMatch(agendaToIcs([invalid], '2026-09-01T12:00:00.000Z'), /BEGIN:VEVENT/)
  assert.deepEqual(eventsInFeedWindow([invalid], '2026-09-01'), [])
})

test('ICS aplica no máximo dois lembretes configurados por módulo', () => {
  const event = { id:'lembrete', source:'tarefas', date:'2026-09-12', title:'Leitura', detail:'Reunião', status:'futuro' }
  const ics = agendaToIcs([event], '2026-09-01T12:00:00.000Z', { reminders:{ tarefas:['P7D', 'P1D', 'PT1H'] } })
  assert.equal((ics.match(/BEGIN:VALARM/g) ?? []).length, 2)
  assert.match(ics, /TRIGGER:-P7D/)
  assert.match(ics, /TRIGGER:-P1D/)
  assert.match(ics, /DTEND;VALUE=DATE:20260913/)
})

test('janela da assinatura mantém dois meses anteriores e doze seguintes', () => {
  const event = date => ({ id:date, source:'tarefas', date, title:date, detail:'', status:'futuro' })
  const result = eventsInFeedWindow([event('2026-07-09'), event('2026-07-10'), event('2027-09-10'), event('2027-09-11')], '2026-09-10')
  assert.deepEqual(result.map(item => item.date), ['2026-07-10', '2027-09-10'])
})

test('agenda ignora tarefas e escala ainda não publicadas', () => {
  const copy = structuredClone(root)
  copy.tarefas.scale.periods['2026-09'].locked = false
  copy.escala.publishedMonths['2026-09'] = false
  const events = collectAgendaEvents(copy, 'm1')
  assert.equal(events.some(event => event.source === 'tarefas'), false)
  assert.equal(events.some(event => event.source === 'escala'), false)
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

test('vida e ministério mostra horário, sala, ajudante e substituto na agenda pessoal', () => {
  const copy = structuredClone(root)
  copy.programacao.programs.w.parts = [
    { id:'a', title:'Iniciando conversas', section:'ministerio', assignedPersonId:'outra', assistantPersonId:'m1', reference:'lmd lição 1' },
    { id:'b', title:'Leitura da Bíblia', assignedPersonId:'outra', substitutePersonId:'m1' },
  ]
  const events = collectAgendaEvents(copy, 'm1').filter(event => event.source === 'programacao')
  assert.deepEqual(events.map(event => event.title), ['Ajudante - Iniciando conversas', 'Substituto - Leitura da Bíblia'])
  assert.equal(events[0].time, '19:30')
  assert.equal(events[0].location, 'Salão principal')
  assert.equal(events[0].note, 'lmd lição 1')
  assert.equal(events[1].status, 'alterado')
})

test('quadro de anúncios agrupa designações por pessoa e por origem', () => {
  const announcements = collectAnnouncementEvents(root)
  assert.equal(announcements.some(item => item.source === 'programacao' && item.people.includes('Ana')), true)
  assert.equal(announcements.some(item => item.source === 'tarefas' && item.people.includes('Ana')), true)
  assert.equal(announcements.some(item => item.source === 'tarefas' && item.people.includes('Bruno')), true)
})

test('dados das reuniões selecionam datas futuras e módulos conforme o tipo', () => {
  const events = [...collectAnnouncementEvents(root),
    { id:'tarefas:weekend', source:'tarefas', date:'2026-09-13', title:'Presidente', detail:'Reunião do fim de semana', status:'futuro', people:['Ana'] },
    { id:'tarefas:midweek', source:'tarefas', date:'2026-09-16', title:'Microfone 1', detail:'Reunião do meio de semana', status:'futuro', people:['Bruno'] },
    { id:'limpeza:midweek', source:'limpeza', date:'2026-09-16', title:'Limpeza - Grupo 1', detail:'Limpeza após a reunião do meio de semana', status:'futuro', people:['Ana'] },
  ]
  const dates = boardMeetingDates(events, '2026-09-10')
  assert.deepEqual(dates.map(item => [item.date, item.kind]), [
    ['2026-09-10', 'midweek'],
    ['2026-09-13', 'weekend'],
    ['2026-09-16', 'midweek'],
  ])
  const weekend = boardMeetingEvents(events, dates[1])
  assert.equal(weekend.some(item => item.source === 'oradores' && item.title === 'Discurso em outra congregação'), true)
  assert.equal(weekend.some(item => item.source === 'tarefas'), true)
  assert.equal(weekend.some(item => item.source === 'limpeza'), true)
  assert.equal(weekend.some(item => item.source === 'programacao'), false)
  const midweek = boardMeetingEvents(events, dates[2])
  assert.equal(midweek.some(item => item.source === 'programacao'), true)
  assert.equal(midweek.some(item => item.source === 'tarefas'), true)
  assert.equal(midweek.some(item => item.source === 'limpeza'), true)
  assert.equal(midweek.some(item => item.source === 'oradores'), false)
  const weekendMessage = boardMeetingMessage(weekend, dates[1])
  assert.match(weekendMessage, /^ORADORES/m)
  assert.match(weekendMessage, /^TAREFAS/m)
  assert.match(weekendMessage, /^LIMPEZA/m)
  assert.match(boardCleaningMessage(weekend), /^LIMPEZA/m)
  assert.match(boardCleaningMessage(weekend), /Limpeza semanal do Salão do Reino/)
  assert.doesNotMatch(boardMeetingWhatsappMessage(weekend, dates[1]), /LIMPEZA/)
  const midweekMessage = boardMeetingMessage(midweek, dates[2])
  assert.match(midweekMessage, /^TAREFAS/m)
  assert.match(midweekMessage, /^VIDA E MINISTÉRIO/m)
})

test('quadro inclui discursos visitantes sem vínculo com o cadastro central', () => {
  const copy = structuredClone(root)
  copy.tarefas.discursos.oradores.visitante = { nome:'Carlos Visitante', tipo:'visitante' }
  copy.tarefas.discursos.programacao.visitante = { data:'2026-09-20', tipo:'discurso_visitante', oradorId:'visitante', temaTitulo:'Esperança', congregacaoOrigemNome:'Centro' }
  const event = collectAnnouncementEvents(copy).find(item => item.id === 'oradores:visitante')
  assert.equal(event?.people[0], 'Carlos Visitante')
  assert.equal(event?.location, 'Centro')
  assert.equal(event?.note, undefined)
})

test('quadro não publica orador local órfão apenas pelo nome', () => {
  const copy = structuredClone(root)
  copy.tarefas.people.taskOrphan = { name:'Gabriel', masterId:'m-inexistente' }
  copy.tarefas.discursos.oradores.orphan = { nome:'Gabriel', tipo:'local', pessoaId:'taskOrphan', masterId:'m-inexistente' }
  copy.tarefas.discursos.programacao.orphan = { data:'2026-09-20', tipo:'discurso_local', oradorId:'orphan', temaTitulo:'Tema órfão' }
  assert.equal(collectAnnouncementEvents(copy).some(item => item.id === 'oradores:orphan'), false)
})

test('compartilhamento do quadro usa somente dados públicos', () => {
  const events = collectAnnouncementEvents(root)
  events[0].note = 'Observação administrativa sigilosa'
  const message = announcementMessage(events)
  assert.match(message, /Quadro de anúncios Noroeste/)
  assert.match(message, /Ana/)
  assert.doesNotMatch(message, /Observação administrativa/)
})
