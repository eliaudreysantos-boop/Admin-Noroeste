import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TASK_ROLES,
  canShareMeeting,
  computeGeneration,
  eligibility,
  eventBlocksMeeting,
  isFolga,
  roleApplies,
  withCanonicalPeriod,
  canonicalMeetingType,
} from '../src/modules/tarefas-domain.ts'
import {
  buildTaskConfirmationMessage,
  buildTaskDayMessage,
  buildTaskPersonMessage,
  paginateItems,
  rowsPerPrintPage,
} from '../src/modules/tarefas-output.ts'

const basePerson = (overrides = {}) => ({
  name: 'Pessoa', active: true, rule: 'both', jovem: false,
  roles: { presidente: true, operador: true, leitor: true, entrada: true, auditorio: true, microfone: true },
  ...overrides,
})

const baseContext = (people, meeting = { date: '2026-09-12', type: 'weekend', assignments: {} }) => ({
  people,
  periods: { '2026-09': { meetings: { m1: meeting } } },
  events: {}, speakers: {}, talks: {},
})

test('meio de semana não aplica Presidente nem Leitor', () => {
  const context = baseContext({ p1: basePerson() })
  const meeting = { date: '2026-09-09', type: 'midweek' }
  assert.equal(eligibility('p1', 'presidente', meeting, {}, context).eligible, false)
  assert.equal(eligibility('p1', 'leitor', meeting, {}, context).eligible, false)
  assert.equal(eligibility('p1', 'mic1', meeting, {}, context).eligible, true)
})

test('registro especial continua uma única reunião de fim de semana sem Leitor', () => {
  const meeting = { date: '2026-09-12', type: 'weekend_merged' }
  assert.equal(roleApplies('presidente', meeting), true)
  assert.equal(roleApplies('leitor', meeting), false)
})

test('função-base precisa estar explicitamente habilitada', () => {
  const context = baseContext({ p1: basePerson({ roles: {} }) })
  assert.equal(eligibility('p1', 'operador1', { date: '2026-09-12', type: 'weekend' }, {}, context).reason, 'Pessoa não habilitada nesta função')
})

test('jovem recebe somente microfone e não forma dupla com outro jovem', () => {
  const people = { jovem1: basePerson({ jovem: true }), jovem2: basePerson({ jovem: true }) }
  const context = baseContext(people)
  const meeting = { date: '2026-09-12', type: 'weekend' }
  assert.equal(eligibility('jovem1', 'entrada', meeting, {}, context).reason, 'Jovem recebe somente microfone')
  assert.equal(eligibility('jovem2', 'mic2', meeting, { mic1: 'jovem1' }, context).reason, 'Dois jovens nos microfones')
})

test('folga usa a paridade do dia e evento respeita o tipo declarado', () => {
  assert.equal(isFolga(basePerson({ refFolgaDate: '2026-08-02' }), '2026-09-12'), true)
  assert.equal(eventBlocksMeeting(
    { data: '2026-09-12', impactoTarefas: { bloqueiaReuniao: true, tiposReuniao: ['weekend_s2'] } },
    { date: '2026-09-12', type: 'weekend' },
  ), true)
})

test('conflito de discurso é resolvido por IDs', () => {
  const context = baseContext({ p1: basePerson({ masterId: 'm1' }) })
  context.speakers = { o1: { pessoaId: 'p1', tipo: 'local' } }
  context.talks = { d1: { data: '2026-09-12', tipo: 'saida_orador', oradorId: 'o1' } }
  assert.equal(eligibility('p1', 'mic1', { date: '2026-09-12', type: 'weekend' }, {}, context).reason, 'Discurso na mesma data')
})

test('somente Presidente pode acumular exatamente uma função mecânica', () => {
  assert.equal(canShareMeeting('p1', 'operador1', { presidente: 'p1' }), true)
  assert.equal(canShareMeeting('p1', 'leitor', { presidente: 'p1' }), false)
  assert.equal(canShareMeeting('p1', 'mic2', { presidente: 'p1', mic1: 'p1' }), false)
})

test('geração é determinística, canônica e preserva edição manual', () => {
  const people = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [`p${index + 1}`, basePerson({ name: `Pessoa ${index + 1}` })]))
  const meeting = { date: '2026-09-12', type: 'weekend', assignments: { leitor: 'p8' }, manualEdits: { leitor: true } }
  const context = baseContext(people, meeting)
  const first = computeGeneration(context, '2026-09-01', null, '2026-09-01T12:00:00.000Z')
  const second = computeGeneration(context, '2026-09-01', null, '2026-09-01T12:00:00.000Z')
  assert.equal(first.aborted, false)
  assert.deepEqual(first.patch, second.patch)
  assert.equal(first.patch['2026-09/meetings/m1/assignments/leitor'], undefined)
  assert.equal(Object.keys(first.patch).some(key => /microfone1|microfone2/.test(key)), false)
  assert.equal(TASK_ROLES.every(role => role === 'leitor' || first.patch[`2026-09/meetings/m1/assignments/${role}`]), true)
})

test('período vazio recebe somente meio e fim de semana canônicos', () => {
  const result = withCanonicalPeriod(
    { '2026-11': { meetings: {} } },
    { periodMode: 'bimester', meetingDays: { midweekDow: 3, weekendDow: 6 }, excludedDates: ['2026-11-07'] },
    '2026-11-01',
  )
  assert.equal(result.periodId, '2026-11')
  const meetings = Object.values(result.periods['2026-11'].meetings)
  assert.equal(meetings.some(meeting => meeting.date === '2026-11-07'), false)
  assert.deepEqual(new Set(meetings.map(meeting => meeting.type)), new Set(['midweek', 'weekend']))
})

test('modo mensal limita as reuniões ao mês selecionado e mantém um fim de semana por data', () => {
  const result = withCanonicalPeriod(
    {},
    { periodMode: 'month', meetingDays: { midweekDow: 3, weekendDow: 6 } },
    '2026-09-01',
  )
  assert.equal(result.periodId, '2026-09')
  const meetings = Object.values(result.periods['2026-09'].meetings)
  assert.equal(meetings.every(meeting => meeting.date.startsWith('2026-09-')), true)
  const weekends = meetings.filter(meeting => meeting.type === 'weekend')
  assert.equal(new Set(weekends.map(meeting => meeting.date)).size, weekends.length)
})

test('preserva a antiga S2 como reunião única e ignora a antiga S1', () => {
  assert.equal(canonicalMeetingType('weekend'), 'weekend')
  assert.equal(canonicalMeetingType('weekend_s2'), 'weekend')
  assert.equal(canonicalMeetingType('weekend_s1'), null)
})

test('período travado e edição manual inválida abortam sem patch parcial', () => {
  const locked = baseContext({ p1: basePerson() })
  locked.periods['2026-09'].locked = true
  assert.deepEqual(computeGeneration(locked, '2026-09-01', null, '2026-09-01T12:00:00.000Z').patch, {})

  const invalid = baseContext(
    { p1: basePerson({ active: false }) },
    { date: '2026-09-12', type: 'weekend', assignments: { leitor: 'p1' }, manualEdits: { leitor: true } },
  )
  const result = computeGeneration(invalid, '2026-09-01', null, '2026-09-01T12:00:00.000Z')
  assert.equal(result.aborted, true)
  assert.deepEqual(result.patch, {})
})

test('geração de uma função não exige que as outras colunas já estejam preenchidas', () => {
  const context = baseContext({ p1: basePerson() }, { date: '2026-09-12', type: 'weekend', assignments: {} })
  const result = computeGeneration(context, '2026-09-01', 'mic1', '2026-09-01T12:00:00.000Z')
  assert.equal(result.aborted, false)
  assert.equal(result.patch['2026-09/meetings/m1/assignments/mic1'], 'p1')
  assert.equal(result.patch['2026-09/meetings/m1/assignments/leitor'], undefined)
})

test('mensagem individual reúne todas as designações em ordem cronológica', () => {
  const text = buildTaskPersonMessage('Ana', 'Olá, veja suas designações.', [
    { date: '2026-09-20', type: 'weekend', roles: ['mic1'] },
    { date: '2026-09-09', type: 'midweek', roles: ['entrada', 'auditorio'] },
  ])
  assert.match(text, /^Olá, Ana! Veja suas designações\./)
  assert.doesNotMatch(text, /Olá, Ana! Olá/i)
  assert.ok(text.indexOf('09/09/2026') < text.indexOf('20/09/2026'))
  assert.match(text, /Entrada, Auditório/)
})

test('mensagem do dia omite funções vazias e confirmação exige dados completos', () => {
  const day = buildTaskDayMessage('Segue a escala.', '2026-09-12', [{
    type: 'weekend', assignments: { presidente: 'Nome muito longo para validar que o texto permanece inteiro', mic1: 'Carlos' },
  }])
  assert.match(day, /Presidente: Nome muito longo/)
  assert.doesNotMatch(day, /Leitor:/)
  assert.equal(buildTaskConfirmationMessage('', '2026-09-12', ['mic1'], 'Confirma?'), '')
})

test('paginação mantém todos os itens e nunca cria página vazia', () => {
  const items = Array.from({ length: 37 }, (_, index) => index)
  const pageSize = rowsPerPrintPage(700, 80, 30, 32)
  const pages = paginateItems(items, pageSize)
  assert.equal(pages.flat().length, 37)
  assert.equal(pages.every(page => page.length > 0 && page.length <= pageSize), true)
  assert.equal(rowsPerPrintPage(10, 20, 20, 30), 1)
})
