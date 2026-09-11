import test from 'node:test'
import assert from 'node:assert/strict'
import { validateBackup, validateFirebaseValue } from '../src/modules/mestre-backup-domain.ts'

const validBackup = () => ({
  master: { pessoas: { m1: { name: 'Ana', whatsapp: '', active: true } } },
  usuarios: { admin: { nome: 'Admin', senha: '42754', ativo: true, apps: { mestre: true } } },
  tarefas: { people: {} },
})

test('aceita backup completo com Admin ativo e resume as áreas', () => {
  const result = validateBackup(validBackup())
  assert.equal(result.ok, true)
  if (result.ok) assert.deepEqual(result.summary, { pessoas: 1, usuarios: 1, modulos: 3 })
})

test('recusa backup sem Admin ativo ou sem estrutura de usuário', () => {
  const noAdmin = validBackup(); noAdmin.usuarios.admin.apps.mestre = false
  assert.match(validateBackup(noAdmin).error, /Admin ativo/)
  const badUser = validBackup(); delete badUser.usuarios.admin.senha
  assert.match(validateBackup(badUser).error, /estrutura esperada/)
})

test('recusa dados sem raiz necessária e chaves incompatíveis com Firebase', () => {
  assert.match(validateBackup({ usuarios: {} }).error, /master\/pessoas/)
  const invalidKey = validBackup(); invalidKey.tarefas['chave.invalida'] = true
  assert.match(validateBackup(invalidKey).error, /chave inválida/)
  assert.match(validateFirebaseValue({ 'a/b': true }) ?? '', /chave inválida/)
})

test('recusa pessoas malformadas e contas pessoais inconsistentes', () => {
  const base = {
    master: { pessoas: { m1: { name: 'Pessoa', whatsapp: '', active: true } } },
    usuarios: { admin: { nome: 'Admin', senha: 'x', ativo: true, apps: { mestre: true } } },
  }
  assert.equal(validateBackup({ ...base, master: { pessoas: { m1: { whatsapp: '', active: true } } } }).ok, false)
  assert.equal(validateBackup({ ...base, usuarios: { ...base.usuarios, pessoa: { nome: 'Pessoa', senha: 'x', ativo: true, apps: { mestre: false, individual: true }, masterId: 'inexistente' } } }).ok, false)
  assert.equal(validateBackup({ ...base, usuarios: {
    ...base.usuarios,
    pessoa1: { nome: 'Pessoa 1', senha: 'x', ativo: true, apps: { mestre: false, individual: true }, masterId: 'm1' },
    pessoa2: { nome: 'Pessoa 2', senha: 'x', ativo: true, apps: { mestre: false, individual: true }, masterId: 'm1' },
  } }).ok, false)
})
