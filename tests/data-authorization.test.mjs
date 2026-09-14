import test from 'node:test'
import assert from 'node:assert/strict'
import { canAccessData, canMutateData, containsPrivateRoot, normalizeDataPath, withoutPrivateRoots } from '../netlify/lib/data-authorization.ts'

const apps = overrides => ({ mestre:false, tarefas:false, limpeza:false, oradores:false, escala:false, programacao:false, secretario:false, servicoCampo:false, individual:false, ...overrides })

test('sessão comum acessa somente os módulos autorizados', () => {
  assert.equal(canAccessData('tarefas/scale', apps({ tarefas:true }), true), true)
  assert.equal(canAccessData('secretario/relatorios', apps({ tarefas:true }), false), false)
  assert.equal(canAccessData('usuarios', apps({ tarefas:true }), false), false)
  assert.equal(canAccessData('master/pessoas', apps({ tarefas:true }), false), true)
  assert.equal(canAccessData('master/pessoas', apps({ tarefas:true }), true), false)
})

test('Limpeza lê somente os dados auxiliares necessários do Secretário', () => {
  const cleaning = apps({ limpeza:true })
  assert.equal(canAccessData('secretario/grupos', cleaning, false), true)
  assert.equal(canAccessData('secretario/publicadores', cleaning, false), true)
  assert.equal(canAccessData('secretario/relatorios', cleaning, false), false)
  assert.equal(canAccessData('tarefas/planning', cleaning, false), true)
})

test('cada módulo altera somente as próprias mensagens da Agenda', () => {
  const tasks = apps({ tarefas:true })
  assert.equal(canAccessData('agenda/config/moduleWhatsApp/tarefas', tasks, true), true)
  assert.equal(canAccessData('agenda/config/moduleWhatsApp/limpeza', tasks, true), false)
  assert.equal(canAccessData('agenda/config/icsReminders/tarefas', tasks, true), false)
})

test('Oradores acessa somente sua área compartilhada dentro de Tarefas', () => {
  const speakers = apps({ oradores:true })
  assert.equal(canAccessData('tarefas/discursos', speakers, true), true)
  assert.equal(canAccessData('tarefas/events', speakers, true), true)
  assert.equal(canAccessData('tarefas/scale/periods', speakers, false), true)
  assert.equal(canAccessData('tarefas/scale/periods', speakers, true), false)
  assert.equal(canAccessData('tarefas/planning/oradoresPublicacoes', speakers, true), true)
  assert.equal(canAccessData('tarefas/planning/engineRules', speakers, true), false)
})

test('publicação de PDF respeita o módulo da sessão', () => {
  const tarefas = apps({ tarefas:true })
  const own = { modulo:'tarefas', tipo:'modulo', storagePath:'agenda/documentos/modulos/tarefas/2026-09.pdf' }
  const other = { modulo:'oradores', tipo:'modulo', storagePath:'agenda/documentos/modulos/oradores/2026-09.pdf' }
  assert.equal(canMutateData('agenda/documentos', 'PATCH', { 'modulo-tarefas-2026-09':own }, tarefas), true)
  assert.equal(canMutateData('agenda/documentos', 'PATCH', { 'modulo-oradores-2026-09':other }, tarefas), false)
  assert.equal(canMutateData('agenda/documentos', 'DELETE', undefined, tarefas), false)
  assert.equal(canMutateData('agenda/documentos/modulo-oradores-2026-09', 'PUT', own, tarefas), false)
})

test('raízes privadas são removidas do backup e nunca aceitas na restauração', () => {
  const value = { master:{}, agendaAssinaturasPrivadas:{ token:{} }, appSessoesPrivadas:{ session:{} } }
  assert.deepEqual(withoutPrivateRoots(value), { master:{} })
  assert.equal(containsPrivateRoot(value), true)
  assert.equal(normalizeDataPath('../usuarios'), null)
})
