import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createMasterId,
  linkIssueSource,
  masterIdReferencePaths,
  normalizeWhatsapp,
  personalUserConflict,
  sanitizeFailureReportValue,
  sharedWhatsappPeople,
  stableUserMasterId,
} from '../src/modules/mestre-domain.ts'

const person = (name, whatsapp) => ({
  name, whatsapp, sex: null, role: null, active: true, limpeza: { grupo: null },
})

test('gera masterId permanente sem depender do telefone', () => {
  assert.equal(createMasterId('123e4567-e89b-12d3-a456-426614174000'), 'm_123e4567e89b12d3a456426614174000')
  assert.equal(normalizeWhatsapp('(85) 99999-0000'), '5585999990000')
})

test('permite telefone compartilhado e ignora a própria pessoa na edição', () => {
  const people = { m1: person('Responsável', '5585999990000'), m2: person('Filho', '5585999990000') }
  assert.deepEqual(sharedWhatsappPeople(people, '5585999990000', 'm2').map(([id]) => id), ['m1'])
  assert.equal(sharedWhatsappPeople(people, '5585888880000', null).length, 0)
})

test('impede duas contas ativas para o mesmo masterId', () => {
  const users = {
    u1: { nome: 'Pessoa 1', senha: 'x', ativo: true, apps: { mestre: false, tarefas: false, escala: false, programacao: false, secretario: false, individual: true }, masterId: 'm1' },
    u2: { nome: 'Admin', senha: 'x', ativo: true, apps: { mestre: true, tarefas: true, escala: true, programacao: true, secretario: true, individual: false } },
  }
  assert.equal(personalUserConflict(users, 'm1', null), true)
  assert.equal(personalUserConflict(users, 'm1', 'u1'), false)
  assert.equal(personalUserConflict(users, 'm2', null), false)
})

test('mantém a identidade de uma conta já vinculada e permite reparar vínculo inválido', () => {
  const people = { m1: person('Pessoa 1', ''), m2: person('Pessoa 2', '') }
  assert.equal(stableUserMasterId({ masterId:'m1' }, 'm2', people), 'm1')
  assert.equal(stableUserMasterId({ masterId:'inexistente' }, 'm2', people), 'm2')
  assert.equal(stableUserMasterId(undefined, 'm2', people), 'm2')
})

test('localiza referências diretas de masterId em históricos e configurações aninhados', () => {
  const data = {
    tarefas:{ people:{ p1:{ masterId:'m1' } } },
    historico:[{ responsavel:{ masterId:'m1' } }, { masterId:'m2' }],
    config:{ ajudantes:['m1', 'm3'] },
  }
  assert.deepEqual(masterIdReferencePaths(data, 'm1'), [
    'tarefas/people/p1/masterId',
    'historico/0/responsavel/masterId',
    'config/ajudantes/0',
  ])
})

test('relatório remove credenciais e contatos inclusive em objetos aninhados', () => {
  const sanitized = sanitizeFailureReportValue({
    nome: 'Teste', senha: 'senha-teste', whatsapp: '5585', nested: { password: 'x', telefonePai: '5585', masterId: 'm1' },
  })
  assert.deepEqual(sanitized, { nome: 'Teste', nested: { masterId: 'm1' } })
})

test('relatório aponta o caminho real de coleções atuais e legadas', () => {
  const data = {
    secretario: { pessoas: { antigo: { masterId: 'm1' } }, publicadores: { atual: { masterId: 'm2' } }, relatorios:{ mensal:{ masterId:'m2', competencia:'2026-09' } } },
    programacao: { people: { legacy: { masterId: 'm3' } }, pessoas: { current: { masterId: 'm4' } } },
    servicoCampo: {
      leaders: { m5: true },
      periods: { '2026-09': { assignments: { saida1: { leaderId: 'm5' } } } },
    },
  }
  assert.equal(linkIssueSource(data, 'Secretário', 'antigo').path, 'desconhecido')
  assert.equal(linkIssueSource(data, 'Secretário', 'atual').path, 'desconhecido')
  assert.equal(linkIssueSource(data, 'Relatórios', 'mensal').path, 'desconhecido')
  assert.equal(linkIssueSource(data, 'Programação', 'legacy').path, 'desconhecido')
  assert.equal(linkIssueSource(data, 'Programação', 'current').path, 'desconhecido')
  assert.equal(linkIssueSource(data, 'Serviço de Campo', 'm5').path, 'servicoCampo/leaders/m5')
  assert.equal(linkIssueSource(data, 'Serviço de Campo', '2026-09/saida1').path, 'servicoCampo/periods/2026-09/assignments/saida1')
})
