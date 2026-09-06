import test from 'node:test'
import assert from 'node:assert/strict'
import { accountingMonth, archiveCanBeDeleted, attendanceByMonth, isReportLate, monthsInServiceYear, serviceYearStart, summarizeCongregation } from '../src/modules/secretario-domain.ts'

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
