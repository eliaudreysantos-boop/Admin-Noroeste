import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeCachedUserChoices } from '../src/auth-domain.ts'

test('cache de login conserva apenas nome e estado ativo', () => {
  assert.deepEqual(sanitizeCachedUserChoices({
    m1: {
      nome:'Pessoa 1', ativo:true, senha:'senha-teste', masterId:'m1',
      apps:{ mestre:true }, secretarioPapel:'secretario',
    },
  }), { m1:{ nome:'Pessoa 1', ativo:true } })
})

test('cache de login rejeita registros invalidos e nao ativa valores aproximados', () => {
  assert.deepEqual(sanitizeCachedUserChoices({
    vazio:{ nome:'  ', ativo:true },
    texto:'Pessoa',
    inativo:{ nome:'Pessoa 2', ativo:1 },
  }), { inativo:{ nome:'Pessoa 2', ativo:false } })
})
