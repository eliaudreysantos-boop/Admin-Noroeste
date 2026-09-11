import test from 'node:test'
import assert from 'node:assert/strict'
import { datesForDow, generateFieldServicePeriod, publishedFieldServiceAssignments, suggestionsFromEscala } from '../src/modules/servico-campo-domain.ts'

test('gera todas as ocorrências mensais e permite várias saídas no mesmo dia', () => {
  const period = generateFieldServicePeriod({
    month:'2026-09',
    templates:{
      a:{ id:'a', label:'Saída', dow:0, time:'08:30', location:'Salão', active:true, sortOrder:0 },
      b:{ id:'b', label:'Grupo', dow:0, time:'08:30', location:'Casa de Ana', active:true, sortOrder:1 },
    },
    leaderIds:['m1', 'm2', 'm3'], now:'2026-09-01T00:00:00.000Z',
  })
  assert.equal(datesForDow('2026-09', 0).length, 4)
  assert.equal(Object.values(period.assignments).filter(item => item.date === '2026-09-06').length, 2)
  assert.notEqual(period.assignments['2026-09-06-a'].leaderId, period.assignments['2026-09-06-b'].leaderId)
})

test('rodízio aceita qualquer tamanho de grupo e preserva edições manuais', () => {
  const template = { id:'a', label:'Saída', dow:1, time:'18:00', location:'Salão', active:true, sortOrder:0 }
  const existing = generateFieldServicePeriod({ month:'2026-09', templates:{ a:template }, leaderIds:['m1'], now:'x' })
  existing.assignments['2026-09-07-a'].leaderId = 'm9'
  existing.assignments.extra = { id:'extra', templateId:'', date:'2026-09-08', time:'16:00', location:'Casa', label:'Especial', leaderId:'m2', manual:true }
  const regenerated = generateFieldServicePeriod({ month:'2026-09', templates:{ a:template }, leaderIds:['m1', 'm2'], existing, now:'y' })
  assert.equal(regenerated.assignments['2026-09-07-a'].leaderId, 'm9')
  assert.equal(regenerated.assignments.extra.manual, true)
})

test('sugestões leem locais, dias e horários ativos da Escala TPL', () => {
  const suggestions = suggestionsFromEscala({ praca:{ name:'Praça', active:true, daysActive:[1, 3], slots:['08:00', '16:00'] }, antigo:{ active:false, daysActive:[2], slots:['10:00'] } })
  assert.equal(suggestions.length, 4)
  assert.deepEqual(suggestions[0], { id:'praca|1|08:00', dow:1, time:'08:00', location:'Praça' })
})

test('adapter público retorna somente períodos publicados', () => {
  const assignment = { id:'a', templateId:'t', date:'2026-09-07', time:'18:00', location:'Salão', label:'Saída', leaderId:'m1' }
  const values = publishedFieldServiceAssignments({ periods:{ a:{ month:'2026-09', published:false, assignments:{ a:assignment } }, b:{ month:'2026-10', published:true, assignments:{ b:{ ...assignment, id:'b', date:'2026-10-05' } } } } })
  assert.deepEqual(values.map(item => item.id), ['b'])
})
