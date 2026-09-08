import test from 'node:test'
import assert from 'node:assert/strict'
import { canExportDocument, canViewCoordinatorCard, isCoordinator } from '../src/modules/coordenador-domain.ts'

const user = { nome: 'Coord', senha: 'x', ativo: true, secretarioPapel: 'coordenador', apps: { mestre: false, tarefas: true, limpeza: true, oradores: true, escala: true, programacao: true, secretario: true } }

test('somente perfil coordenador ativo abre a página', () => {
  assert.equal(isCoordinator(user), true)
  assert.equal(isCoordinator({ ...user, secretarioPapel: 'secretario' }), false)
  assert.equal(isCoordinator({ ...user, ativo: false }), false)
})

test('card e exportação exigem permissão do módulo', () => {
  assert.equal(canViewCoordinatorCard(user, 'limpeza'), true)
  assert.equal(canExportDocument(user, 'limpeza-pdf'), true)
  assert.equal(canExportDocument(user, 'tarefas-pdf'), true)
  assert.equal(canExportDocument({ ...user, apps: { ...user.apps, limpeza: false } }, 'limpeza-pdf'), false)
})
