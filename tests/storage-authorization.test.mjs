import test from 'node:test'
import assert from 'node:assert/strict'
import { canManageStoragePath, canReadPublicStoragePath, validStoragePath } from '../netlify/functions/storage-file.ts'

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

test('leitura pública inclui documentos da Agenda, mas não templates do Secretário', () => {
  assert.equal(canReadPublicStoragePath('agenda/documentos/admin/aviso.pdf'), true)
  assert.equal(canReadPublicStoragePath('agenda/documentos/modulos/limpeza/2026-09.pdf'), true)
  assert.equal(canReadPublicStoragePath('secretario/templates/s21.pdf'), false)
  assert.equal(canReadPublicStoragePath('agenda/documentos/modulos/secretario/s21.pdf'), false)
})
