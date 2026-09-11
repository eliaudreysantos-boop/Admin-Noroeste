import test from 'node:test'
import assert from 'node:assert/strict'
import { accountingMonth, activityByServiceYear, archiveCanBeDeleted, attendanceByMonth, canonicalReportId, duplicateReportGroups, isClosedMonth, isReportLate, matchingReports, monthsInServiceYear, normalizePersonalReport, pendingPublishers, preparePersonalReportCommit, publisherReportState, reportCreatedBy, reportLastEditedBy, serviceYearStart, summarizeCongregation } from '../src/modules/secretario-domain.ts'

const report = (id, overrides = {}) => ({ id, masterId: id, competencia: '2026-08', categoria: 'publicador', participou: true, estudos: 1, horasCampo: 0, horasAtividadeAprovada: 0, creditoHoras: 0, pioneiroAuxiliar: false, observacoes: '', atrasado: false, recebidoEm: '2026-09-03', atualizadoEm: '', ...overrides })

test('ano de serviço vai de setembro a agosto', () => {
  assert.equal(serviceYearStart('2026-08'), 2025); assert.equal(serviceYearStart('2026-09'), 2026)
  assert.deepEqual(monthsInServiceYear(2026), ['2026-09','2026-10','2026-11','2026-12','2027-01','2027-02','2027-03','2027-04','2027-05','2027-06','2027-07','2027-08'])
})

test('relatório atrasado conta no mês seguinte sem mudar a competência', () => {
  const late = report('late', { atrasado: true })
  assert.equal(accountingMonth(late), '2026-09'); assert.equal(late.competencia, '2026-08')
  assert.equal(isReportLate('2026-08', '2026-09-10'), false)
  assert.equal(isReportLate('2026-08', '2026-09-11'), true)
})

test('resumo exclui especial e missionário e separa horas elegíveis', () => {
  const reports = {
    p: report('p', { competencia: '2026-09', estudos: 2 }),
    a: report('a', { competencia: '2026-09', categoria: 'pioneiro_auxiliar', pioneiroAuxiliar: true, horasCampo: 15, horasAtividadeAprovada: 8 }),
    r: report('r', { competencia: '2026-09', categoria: 'pioneiro_regular', horasCampo: 50, creditoHoras: 10 }),
    e: report('e', { competencia: '2026-09', categoria: 'pioneiro_especial', horasCampo: 100 }),
    late: report('late', { atrasado: true }),
  }
  const attendance = { a1: { id: 'a1', data: '2026-09-06', tipo: 'fim_semana', quantidade: 80, atualizadoEm: '' }, a2: { id: 'a2', data: '2026-09-13', tipo: 'fim_semana', quantidade: 100, atualizadoEm: '' } }
  const result = summarizeCongregation('2026-09', reports, attendance)
  assert.deepEqual(result, { competencia: '2026-09', publicadores: 2, estudos: 5, auxiliares: 1, horasAuxiliares: 15, regulares: 1, horasRegulares: 50, estudosPublicadores: 3, estudosAuxiliares: 1, estudosRegulares: 1, atrasadosIncluidos: 1, mediaFimSemana: 90, enviadosEm: '' })
})

test('assistência calcula totais e médias e protege o único S-21', () => {
  const values = attendanceByMonth({ a: { id: 'a', data: '2026-09-03', tipo: 'meio_semana', quantidade: 81, atualizadoEm: '' }, b: { id: 'b', data: '2026-09-10', tipo: 'meio_semana', quantidade: 82, atualizadoEm: '' } }, 'meio_semana', 2026)
  assert.deepEqual(values[0], { month: '2026-09', meetings: 2, total: 163, average: 82 })
  assert.equal(archiveCanBeDeleted('one', { one: { tipo: 'S-21' } }), false)
  assert.equal(archiveCanBeDeleted('one', { one: { tipo: 'S-21' }, two: { tipo: 'S-21' } }), true)
})

test('relatório pessoal respeita a categoria, normaliza dados e identifica mês fechado', () => {
  const ordinary = normalizePersonalReport({ id:'p', masterId:'m1', competencia:'2026-09', categoria:'publicador', participou:true, estudos:-2, horasCampo:12, observacoes:' x '.repeat(100), recebidoEm:'2026-09-09', atualizadoEm:'' })
  const pioneer = normalizePersonalReport({ id:'a', masterId:'m2', competencia:'2026-09', categoria:'pioneiro_auxiliar', participou:true, estudos:'2', horasCampo:'14.5', observacoes:'ok', recebidoEm:'2026-09-11', atualizadoEm:'' })
  assert.equal(ordinary.estudos, 0); assert.equal(ordinary.horasCampo, 0); assert.equal(ordinary.observacoes.length, 250)
  assert.equal(ordinary.origem, 'minha_agenda'); assert.equal(pioneer.horasCampo, 14.5); assert.equal(pioneer.atrasado, false)
  assert.equal(ordinary.createdBy, 'pessoa'); assert.equal(ordinary.lastEditedBy, 'pessoa'); assert.equal(ordinary.revision, 1)
  assert.equal(isClosedMonth('2026-09', { '2026-09': { enviadoEm:'2026-10-11' } }), false)
  assert.equal(isClosedMonth('2026-09', { '2026-09': { fechadoEm:'2026-10-11' } }), true)
  assert.equal(isClosedMonth('2026-10', { '2026-09': { fechadoEm:'2026-10-11' } }), false)
})

test('relatório usa chave canônica e encontra duplicidades legadas sem ocultá-las', () => {
  assert.equal(canonicalReportId('m_123', '2026-09'), 'm_123__2026-09')
  assert.throws(() => canonicalReportId('m/123', '2026-09'))
  const reports = { antigo:report('antigo', { masterId:'m1' }), outro:report('outro', { masterId:'m1' }), unico:report('unico', { masterId:'m2' }) }
  assert.equal(matchingReports(reports, 'm1', '2026-08').length, 2)
  assert.deepEqual(duplicateReportGroups(reports), [{ masterId:'m1', competencia:'2026-08', ids:['antigo', 'outro'] }])
})

test('metadados legados inferem criador e último editor pela origem', () => {
  assert.equal(reportCreatedBy(report('p', { origem:'minha_agenda' })), 'pessoa')
  assert.equal(reportLastEditedBy(report('s', { origem:'secretario' })), 'secretario')
})

test('transação pessoal aceita apenas o primeiro envio da competência', () => {
  const item = report('m1__2026-08', { masterId:'m1', origem:'minha_agenda' })
  const first = preparePersonalReportCommit({}, item)
  assert.equal(first.ok, true)
  if (!first.ok) return
  assert.equal(first.value.relatorios[item.id], item)
  assert.deepEqual(preparePersonalReportCommit(first.value, item), { ok:false, reason:'existente' })
})

test('transação pessoal respeita relatório legado e mês fechado', () => {
  const item = report('m1__2026-08', { masterId:'m1', origem:'minha_agenda' })
  assert.deepEqual(preparePersonalReportCommit({ relatorios:{ legado:report('legado', { masterId:'m1' }) } }, item), { ok:false, reason:'existente' })
  assert.deepEqual(preparePersonalReportCommit({ fechamentos:{ '2026-08':{ fechadoEm:'2026-09-11' } } }, item), { ok:false, reason:'fechado' })
})

test('painel mensal diferencia recebido, atrasado, sem relatório e inativo', () => {
  const publisher = { id:'p1', masterId:'m1', categoria:'publicador', grupoId:'g1', ativo:true }
  assert.equal(publisherReportState(publisher, '2026-09', { r: report('r', { masterId:'m1', competencia:'2026-09' }) }), 'recebido')
  assert.equal(publisherReportState(publisher, '2026-09', { r: report('r', { masterId:'m1', competencia:'2026-09', atrasado:true }) }), 'atrasado')
  assert.equal(publisherReportState(publisher, '2026-09', {}), 'sem_relatorio')
  assert.equal(publisherReportState({ ...publisher, ativo:false }, '2026-09', {}), 'inativo')
})

test('fila de pendentes considera apenas publicadores ativos sem relatório da competência', () => {
  const publishers = { a:{ id:'a', masterId:'a', categoria:'publicador', grupoId:'g', ativo:true }, b:{ id:'b', masterId:'b', categoria:'publicador', grupoId:'g', ativo:true }, c:{ id:'c', masterId:'c', categoria:'publicador', grupoId:'g', ativo:false } }
  const result = pendingPublishers(publishers, '2026-09', { r:report('r', { masterId:'a', competencia:'2026-09' }) })
  assert.deepEqual(result.map(item => item.masterId), ['b'])
})

test('análise anual soma relatórios, estudos e horas por competência contábil', () => {
  const values = activityByServiceYear({ a:report('a', { competencia:'2026-09', estudos:2 }), b:report('b', { competencia:'2026-09', categoria:'pioneiro_auxiliar', pioneiroAuxiliar:true, horasCampo:15 }), c:report('c', { competencia:'2026-09', categoria:'pioneiro_regular', horasCampo:50 }) }, 2026)
  assert.deepEqual(values[0], { month:'2026-09', reports:3, participants:3, studies:4, auxiliaryHours:15, regularHours:50 })
})
