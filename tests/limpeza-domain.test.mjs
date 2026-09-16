import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertCleaningPeriodEditable,
  cleaningGroupFor,
  generateCleaningPeriod,
  integratedCleaningMembers,
  periodBounds,
} from '../src/modules/limpeza-domain.ts'

test('integracao acompanha membros sem alterar origem e preserva exclusoes locais', () => {
  const members = ['m1', 'm2']
  assert.deepEqual(integratedCleaningMembers(members), ['m1', 'm2'])
  assert.deepEqual(integratedCleaningMembers([...members, 'm3'], ['m2']), ['m1', 'm3'])
  assert.deepEqual(integratedCleaningMembers(['m2', 'm3'], ['m2']), ['m3'])
  assert.deepEqual(members, ['m1', 'm2'])
})

const config = {
  ativa: true,
  grupos: 4,
  inicioRotacao: '2026-09-02',
  gruposConfig: {
    1: { nome: 'Salao do Reino', superintendenteMid: 'm1', ajudantesMid: ['m2'] },
    2: { nome: 'Taioca', superintendenteMid: 'm2', ajudantesMid: [] },
    3: { nome: 'Maria do Carmo', superintendenteMid: '', ajudantesMid: [] },
    4: { nome: 'Amelia', superintendenteMid: '', ajudantesMid: [] },
  },
}
const meetings = {
  meiaDeSemana: { diaSemana: 3, horario: '19:00' },
  fimDeSemana: { diaSemana: 0, horario: '18:00' },
}
const people = {
  m1: { name: 'Ana Responsavel', whatsapp: '', sex: 'F', role: 'publicador', active: true, limpeza: { grupo: 1 } },
  m2: { name: 'Bruno Ajudante', whatsapp: '', sex: 'M', role: 'publicador', active: true, limpeza: { grupo: 1 } },
  m3: { name: 'Inativo', whatsapp: '', sex: 'M', role: 'publicador', active: false, limpeza: { grupo: 1 } },
}

test('rotação é estável antes e depois do início', () => {
  assert.equal(cleaningGroupFor('2026-09-02', '2026-09-02', 4), 1)
  assert.equal(cleaningGroupFor('2026-09-09', '2026-09-02', 4), 2)
  assert.equal(cleaningGroupFor('2026-08-26', '2026-09-02', 4), 4)
})

test('bimestre de setembro inclui cinco semanas e a virada para novembro', () => {
  const period = generateCleaningPeriod('2026-09-15', 'bimester', config, meetings, people, 'Noroeste', '2026-09-01T12:00:00Z')
  assert.deepEqual(periodBounds('2026-09-15', 'bimester'), { id: '2026-09-bimester', inicio: '2026-09-01', fim: '2026-10-31' })
  assert.equal(period.semanas.length, 9)
  assert.deepEqual(period.semanas[0], {
    referencia: '2026-09-02', dataMeioSemana: '2026-09-02', dataFimSemana: '2026-09-06',
    grupo: 1, grupoNome: 'Salao do Reino', superintendenteMid: 'm1', ajudantesMid: ['m2'],
    membrosMid: ['m1', 'm2'],
  })
  assert.equal(period.semanas[8].dataFimSemana, '2026-11-01')
})

test('geração guarda membros ativos sem textos de publicação', () => {
  const period = generateCleaningPeriod('2026-09-01', 'month', config, meetings, people, 'Noroeste', '2026-09-01T12:00:00Z')
  assert.deepEqual(period.semanas[0].membrosMid, ['m1', 'm2'])
  assert.equal('textoAprovado' in period.semanas[0], false)
  assert.doesNotThrow(() => assertCleaningPeriodEditable(period))
  assert.throws(() => assertCleaningPeriodEditable({ ...period, publicado:true }), /Reabra/)
})

test('geração exige configuração ativa e dias de reunião', () => {
  assert.throws(() => generateCleaningPeriod('2026-09-01', 'month', { ...config, ativa: false }, meetings, people, 'Noroeste', ''), /Ative/)
  assert.throws(() => generateCleaningPeriod('2026-09-01', 'month', config, {}, people, 'Noroeste', ''), /dias das reunioes/)
})
