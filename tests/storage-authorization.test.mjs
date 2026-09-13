import test from 'node:test'
import assert from 'node:assert/strict'
import { canManageStoragePath, validStoragePath } from '../netlify/functions/storage-file.ts'

const apps = overrides => ({ mestre:false, tarefas:false, limpeza:false, oradores:false, escala:false, programacao:false, secretario:false, servicoCampo:false, individual:false, ...overrides })

test('Storage aceita somente os caminhos PDF usados pelo app', () => {
  assert.equal(validStoragePath('agenda/documentos/modulos/tarefas/2026-09.pdf'), true)
  assert.equal(validStoragePath('agenda/documentos/../../usuarios.pdf'), false)
  assert.equal(canManageStoragePath('qualquer/caminho.pdf', apps({ mestre:true })), false)
  assert.equal(canManageStoragePath('agenda/documentos/admin/aviso.pdf', apps({ mestre:true })), true)
})

test('permissão de módulo não publica PDF em nome de outro módulo', () => {
  const tarefas = apps({ tarefas:true })
  assert.equal(canManageStoragePath('agenda/documentos/modulos/tarefas/2026-09.pdf', tarefas), true)
  assert.equal(canManageStoragePath('agenda/documentos/modulos/oradores/2026-09.pdf', tarefas), false)
  assert.equal(canManageStoragePath('secretario/templates/s21.pdf', tarefas), false)
  assert.equal(canManageStoragePath('secretario/templates/outro.pdf', apps({ secretario:true })), false)
})
