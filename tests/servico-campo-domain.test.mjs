import test from 'node:test'
import assert from 'node:assert/strict'
import { datesForDow, generateFieldServicePeriod, publishedFieldServiceAssignments, validFieldServiceMonth, validFieldServiceTime } from '../src/modules/servico-campo-domain.ts'

test('valida competência e horário sem aceitar normalizações do Date', () => {
  assert.equal(validFieldServiceMonth('2026-12'), true)
  assert.equal(validFieldServiceMonth('2026-13'), false)
  assert.equal(validFieldServiceTime('23:59'), true)
  assert.equal(validFieldServiceTime('24:00'), false)
  assert.deepEqual(datesForDow('2026-99', 0), [])
})

test('gera todas as ocorrências mensais e permite várias saídas no mesmo dia', () => {
  const period = generateFieldServicePeriod({
    month:'2026-09',
    templates:{
      a:{ id:'a', label:'Saída', dow:0, time:'08:30', location:'Salão', active:true, sortOrder:0, leaderIds:['m1', 'm3'] },
      b:{ id:'b', label:'Grupo', dow:0, time:'08:30', location:'Casa de Ana', active:true, sortOrder:1, leaderIds:['m2'] },
    },
    leaderIds:['m1', 'm2', 'm3'], now:'2026-09-01T00:00:00.000Z',
  })
  assert.equal(datesForDow('2026-09', 0).length, 4)
  assert.equal(Object.values(period.assignments).filter(item => item.date === '2026-09-06').length, 2)
  assert.notEqual(period.assignments['2026-09-06-a'].leaderId, period.assignments['2026-09-06-b'].leaderId)
})

test('rodízio aceita qualquer tamanho de grupo e preserva edições manuais', () => {
  const template = { id:'a', label:'Saída', dow:1, time:'18:00', location:'Salão', active:true, sortOrder:0, leaderIds:['m1', 'm2'] }
  const existing = generateFieldServicePeriod({ month:'2026-09', templates:{ a:template }, leaderIds:['m1'], now:'x' })
  existing.assignments['2026-09-07-a'].leaderId = 'm9'
  existing.assignments.extra = { id:'extra', templateId:'', date:'2026-09-08', time:'16:00', location:'Casa', label:'Especial', leaderId:'m2', manual:true }
  const regenerated = generateFieldServicePeriod({ month:'2026-09', templates:{ a:template }, leaderIds:['m1', 'm2'], existing, now:'y' })
  assert.equal(regenerated.assignments['2026-09-07-a'].leaderId, 'm9')
  assert.equal(regenerated.assignments.extra.manual, true)
})

test('adapter público retorna somente períodos publicados', () => {
  const assignment = { id:'a', templateId:'t', date:'2026-09-07', time:'18:00', location:'Salão', label:'Saída', leaderId:'m1' }
  const values = publishedFieldServiceAssignments({ periods:{ a:{ month:'2026-09', published:false, assignments:{ a:assignment } }, b:{ month:'2026-10', published:true, assignments:{ b:{ ...assignment, id:'b', date:'2026-10-05' } } } } })
  assert.deepEqual(values.map(item => item.id), ['b'])
})

test('cada saída recorrente pode ter seu próprio rodízio', () => {
  const period = generateFieldServicePeriod({
    month:'2026-09',
    templates:{ a:{ id:'a', label:'Segunda', dow:1, time:'18:00', location:'Salão', active:true, sortOrder:0, leaderIds:['m2'] } },
    leaderIds:['m1', 'm2'],
  })
  assert.equal(Object.values(period.assignments).every(item => item.leaderId === 'm2'), true)
})

test('meses futuros não alteram o rodízio de um mês anterior', () => {
  const template = { id:'a', label:'Saída', dow:1, time:'18:00', location:'Salão', active:true, sortOrder:0, leaderIds:['m1', 'm2'] }
  const future = { month:'2026-10', published:true, assignments:{ f:{ id:'f', templateId:'a', date:'2026-10-05', time:'18:00', location:'Salão', label:'Saída', leaderId:'m1' } } }
  const period = generateFieldServicePeriod({ month:'2026-09', templates:{ a:template }, leaderIds:['m1', 'm2'], periods:{ future } })
  assert.equal(period.assignments['2026-09-07-a'].leaderId, 'm1')
})

test('arranjos distintos podem compartilhar data horario e local', () => {
  const base = { label:'Saída', dow:0, time:'08:30', location:'Salão', active:true, sortOrder:0 }
  const period = generateFieldServicePeriod({ month:'2026-09', templates:{ a:{ ...base, id:'a' }, b:{ ...base, id:'b', sortOrder:1 }, c:{ ...base, id:'c', time:'09:30', sortOrder:2 } }, leaderIds:['m1', 'm2'] })
  assert.equal(Object.values(period.assignments).filter(item => item.date === '2026-09-06').length, 3)
})

test('rodizio e historico de um arranjo nao interferem no outro', () => {
  const a = { id:'a', label:'Saida', dow:1, time:'08:00', location:'Salao', active:true, sortOrder:0, leaderIds:['m1', 'm2'] }
  const b = { ...a, id:'b', sortOrder:1, date:'2026-09-07' }
  const input = { month:'2026-09', leaderIds:['m1', 'm2'], templates:{ a } }
  const alone = generateFieldServicePeriod(input)
  const together = generateFieldServicePeriod({ ...input, templates:{ a, b } })
  assert.deepEqual(Object.values(together.assignments).filter(item => item.templateId === 'a'), Object.values(alone.assignments))
  assert.equal(Object.values(together.assignments).filter(item => item.templateId === 'b').length, 1)
  assert.equal(generateFieldServicePeriod({ ...input, templates:{ a:{ ...a, leaderIds:['nao-aprovado'] } } }).assignments['2026-09-07-a'].leaderId, '')
  assert.equal(generateFieldServicePeriod({ ...input, templates:{ a:{ ...a, leaderIds:[] } } }).assignments['2026-09-07-a'].leaderId, '')
})

test('adapter público ignora item fora da competência declarada', () => {
  const values = publishedFieldServiceAssignments({ periods:{ september:{ month:'2026-09', published:true, assignments:{ wrong:{ id:'wrong', templateId:'t', date:'2026-10-05', time:'18:00', location:'Salão', label:'Saída', leaderId:'m1' } } } } })
  assert.deepEqual(values, [])
})
