import test from 'node:test'
import assert from 'node:assert/strict'
import { allowedTheme, assignmentsForSpeaker, confirmationPatch, congregationIdOf, deriveStatus, emergencyCandidates, eventBlocksLocal, needsReconfirmation, realizedSpeakerId, talkConflicts, themeHistory, watchtowerIssues } from '../src/modules/oradores-domain.ts'

test('origem e destino seguem o tipo da programação', () => {
  assert.equal(congregationIdOf({ tipo: 'saida_orador', congregacaoDestinoId: 'destino', congregacaoOrigemId: 'origem' }), 'destino')
  assert.equal(congregationIdOf({ tipo: 'discurso_visitante', congregacaoDestinoId: 'destino', congregacaoOrigemId: 'origem' }), 'origem')
})
test('confirmação canônica mantém status e objeto compatíveis', () => {
  const patch = confirmationPatch('confirmado', '2026-09-06T12:00:00Z')
  assert.equal(patch.status, 'confirmado'); assert.equal(patch.confirmacao.status, true)
  assert.equal(deriveStatus({ status: 'por_definir', confirmacao: { status: true } }), 'confirmado')
})
test('desistência não entra como participação realizada', () => {
  assert.equal(realizedSpeakerId({ oradorId: 'original', desistiu: true }), '')
  assert.equal(realizedSpeakerId({ oradorId: 'original', substitutoId: 'sub', desistiu: true }), 'sub')
  assert.equal(realizedSpeakerId({ oradorId: 'original', substitutoId: 'sub' }), 'sub')
})
test('tema precisa estar ativo e aprovado para o orador', () => {
  assert.equal(allowedTheme('t1', { temaIds: ['t1'] }, { t1: { ativo: true } }), true)
  assert.equal(allowedTheme('t2', { temaIds: ['t1'] }, { t2: { ativo: true } }), false)
})
test('histórico ignora saída e desistência', () => {
  const history = themeHistory({ a: { data: '2026-01-01', tipo: 'discurso_local', temaId: 't1', status: 'confirmado' }, b: { data: '2026-02-01', tipo: 'discurso_local', temaId: 't1', desistiu: true }, c: { data: '2027-01-01', tipo: 'saida_orador', temaId: 't1' } }, '2026-09-06')
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

test('emergência filtra conflitos e temas recentes', () => {
  const talk = { data: '2026-09-20', tipo: 'discurso_local', oradorId: 'original', desistiu: true }
  const candidates = emergencyCandidates('alvo', talk, {
    alvo: talk,
    antigo: { data: '2026-08-01', tipo: 'discurso_local', oradorId: 'outro', temaId: 'recente', status: 'confirmado' },
  }, [{ date: '2026-09-20', assignments: { mic1: 'p2' } }], {
    original: { ativo: true, tipo: 'local', pessoaId: 'p0', temaIds: ['livre'] },
    livre: { ativo: true, tipo: 'local', pessoaId: 'p1', temaIds: ['livre', 'recente'] },
    ocupado: { ativo: true, tipo: 'local', pessoaId: 'p2', temaIds: ['livre'] },
    visitante: { ativo: true, tipo: 'visitante', pessoaId: 'p3', temaIds: ['livre'] },
  }, { livre: { ativo: true }, recente: { ativo: true } }, '2026-09-07')
  assert.deepEqual(candidates, [{ speakerId: 'livre', themeIds: ['livre'] }])
})

test('Sentinela exige dirigente e substituto locais, ativos e diferentes', () => {
  assert.deepEqual(watchtowerIssues({
    d: { tipo: 'local', ativo: true, sentinelaDirigente: true },
    s: { tipo: 'local', ativo: true, sentinelaSubstituto: true },
    v: { tipo: 'visitante', ativo: true, sentinelaDirigente: true },
  }), [])
  assert.equal(watchtowerIssues({ d: { tipo: 'local', ativo: true, sentinelaDirigente: true, sentinelaSubstituto: true } }).length, 1)
})

test('designações futuras passam ao substituto sem apagar o original', () => {
  const talks = {
    normal: { data: '2026-09-20', oradorId: 'a' },
    troca: { data: '2026-09-21', oradorId: 'a', desistiu: true, substitutoId: 'b' },
    passado: { data: '2026-08-01', oradorId: 'b' },
  }
  assert.deepEqual(assignmentsForSpeaker(talks, 'a', '2026-09-08').map(([id]) => id), ['normal'])
  assert.deepEqual(assignmentsForSpeaker(talks, 'b', '2026-09-08').map(([id]) => id), ['troca'])
})
