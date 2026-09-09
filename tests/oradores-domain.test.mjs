import test from 'node:test'
import assert from 'node:assert/strict'
import { allowedTheme, assignmentsForSpeaker, confirmationPatch, congregationIdOf, deriveStatus, eventBlocksLocal, meetingDatesForMonth, missingLocalTalkDates, needsReconfirmation, talkConflicts, themeHistory, watchtowerIssues } from '../src/modules/oradores-domain.ts'
import { availableSpeakerThemes } from '../src/modules/oradores-documents.ts'
import { scheduleRows, scheduleToAgendaEvents } from '../src/modules/oradores-documents.ts'

test('origem e destino seguem o tipo da programação', () => {
  assert.equal(congregationIdOf({ tipo: 'saida_orador', congregacaoDestinoId: 'destino', congregacaoOrigemId: 'origem' }), 'destino')
  assert.equal(congregationIdOf({ tipo: 'discurso_visitante', congregacaoDestinoId: 'destino', congregacaoOrigemId: 'origem' }), 'origem')
})
test('confirmação canônica mantém status e objeto compatíveis', () => {
  const patch = confirmationPatch('confirmado', '2026-09-06T12:00:00Z')
  assert.equal(patch.status, 'confirmado'); assert.equal(patch.confirmacao.status, true)
  assert.equal(deriveStatus({ status: 'por_definir', confirmacao: { status: true } }), 'confirmado')
})
test('tema precisa estar cadastrado e aprovado para o orador', () => {
  assert.equal(allowedTheme('t1', { temaIds: ['t1'] }, { t1: {} }), true)
  assert.equal(allowedTheme('t2', { temaIds: ['t1'] }, { t2: {} }), false)
})
test('histórico ignora saída e compromisso não confirmado', () => {
  const history = themeHistory({ a: { data: '2026-01-01', tipo: 'discurso_local', temaId: 't1', status: 'confirmado' }, b: { data: '2026-02-01', tipo: 'discurso_local', temaId: 't1', status: 'por_confirmar' }, c: { data: '2027-01-01', tipo: 'saida_orador', temaId: 't1' } }, '2026-09-06')
  assert.equal(history.t1.lastPerformed, '2026-01-01'); assert.deepEqual(history.t1.future, [])
})
test('conflitos usam vínculo por ID com Tarefas', () => {
  const errors = talkConflicts('p1', { data: '2026-09-12', tipo: 'discurso_local', oradorId: 'o1' }, {}, [{ date: '2026-09-12', assignments: { mic1: 'pessoa1' } }], { o1: { nome: 'Ana', pessoaId: 'pessoa1' } })
  assert.match(errors.join(' '), /Tarefas/)
})
test('eventos especiais bloqueiam discurso local e reconfirmação vence em sete dias', () => {
  assert.equal(eventBlocksLocal({ e: { data: '2026-09-12', tipo: 'celebracao' } }, '2026-09-12'), true)
  assert.equal(needsReconfirmation({ data: '2026-09-13', status: 'confirmado' }, '2026-09-06'), true)
  assert.equal(needsReconfirmation({ data: '2026-09-14', status: 'confirmado' }, '2026-09-06'), false)
})

test('Sentinela exige dirigente e substituto locais e diferentes', () => {
  assert.deepEqual(watchtowerIssues({
    d: { tipo: 'local', sentinelaDirigente: true },
    s: { tipo: 'local', sentinelaSubstituto: true },
    v: { tipo: 'visitante', sentinelaDirigente: true },
  }), [])
  assert.equal(watchtowerIssues({ d: { tipo: 'local', sentinelaDirigente: true, sentinelaSubstituto: true } }).length, 1)
})

test('designações futuras seguem o orador registrado no compromisso', () => {
  const talks = {
    normal: { data: '2026-09-20', oradorId: 'a' },
    editado: { data: '2026-09-21', oradorId: 'b' },
    passado: { data: '2026-08-01', oradorId: 'b' },
  }
  assert.deepEqual(assignmentsForSpeaker(talks, 'a', '2026-09-08').map(([id]) => id), ['normal'])
  assert.deepEqual(assignmentsForSpeaker(talks, 'b', '2026-09-08').map(([id]) => id), ['editado'])
})

test('PDF de temas disponíveis exclui temas usados ou já agendados', () => {
  const entries = availableSpeakerThemes({
    speakers: { o1: { nome: 'João', tipo: 'local', temaIds: ['t1', 't2', 't3'] } },
    themes: {
      t1: { numero: 1, titulo: 'Usado' },
      t2: { numero: 2, titulo: 'Agendado' },
      t3: { numero: 3, titulo: 'Livre' },
    },
    talks: {
      passado: { data: '2026-08-01', tipo: 'discurso_local', temaId: 't1', status: 'confirmado' },
      futuro: { data: '2026-10-01', tipo: 'discurso_local', temaId: 't2' },
    },
    today: '2026-09-09',
  })
  assert.deepEqual(entries, [{ nome: 'João', temas: [{ numero: 3, titulo: 'Livre', ultimoUso: 'Nunca' }] }])
})

test('calendário do coordenador inclui local, visitante e saída', () => {
  const rows = scheduleRows([
    ['local', { data: '2026-09-06', tipo: 'discurso_local', oradorId: 'a', temaNumero: 1, temaTitulo: 'Esperança' }],
    ['visitante', { data: '2026-09-13', tipo: 'discurso_visitante', oradorNome: 'Visitante', temaTitulo: 'Fé', congregacaoOrigemNome: 'Centro' }],
    ['saida', { data: '2026-09-20', tipo: 'saida_orador', oradorId: 'a', temaTitulo: 'Amor', congregacaoDestinoId: 'destino' }],
  ], { a: { nome: 'André' } }, { local: { nome: 'Noroeste', tipo: 'local' }, destino: { nome: 'Leste' } })
  const events = scheduleToAgendaEvents('Noroeste', rows)
  assert.equal(events.length, 3)
  assert.equal(events[0].location, 'Noroeste')
  assert.equal(events[1].title, 'Discurso público com visitante')
  assert.equal(events[2].location, 'Leste')
})

test('preenchimento de datas respeita exceções, eventos e programação existente', () => {
  const dates = meetingDatesForMonth('2026-09', 6, ['2026-09-19'], { evento: { data: '2026-09-26', tipo: 'celebracao' } })
  assert.deepEqual(dates, ['2026-09-05', '2026-09-12'])
  assert.deepEqual(missingLocalTalkDates({ existente: { data: '2026-09-05', tipo: 'discurso_local' } }, dates), ['2026-09-12'])
})
