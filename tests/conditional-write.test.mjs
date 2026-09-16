import test from 'node:test'
import assert from 'node:assert/strict'
import { conditionalPatch, conditionalValue, validConditionalPatch } from '../netlify/lib/conditional-write.ts'

test('dois editores: somente quem conserva a versao atual pode gravar', () => {
  const original = { parts: [{ id: 'p', assignedPersonId: 'a' }] }
  const first = { parts: [{ id: 'p', assignedPersonId: 'b' }] }
  const second = { parts: [{ id: 'p', assignedPersonId: 'c' }] }
  assert.deepEqual(conditionalValue(original, structuredClone(original), first), first)
  assert.equal(conditionalValue(first, original, second), undefined)
  assert.deepEqual(conditionalValue(first, structuredClone(first), second), second)
})

test('duas sessoes preservam campos independentes e recusam conflito no mesmo campo', () => {
  const original = { active:true, groups:{ a:{ name:'A', members:['m1'] }, b:{ name:'B' } } }
  const first = conditionalPatch(original, { 'groups/a/name':'A' }, { 'groups/a/name':'Novo A' })
  const second = conditionalPatch(first, { 'groups/b/name':'B' }, { 'groups/b/name':'Novo B' })
  assert.equal(second.groups.a.name, 'Novo A')
  assert.equal(second.groups.b.name, 'Novo B')
  assert.equal(conditionalPatch(second, { 'groups/a/name':'A' }, { 'groups/a/name':'Sobrescrito' }), undefined)
  assert.equal(original.groups.a.name, 'A')
})

test('representacao Firebase de vazios nao cria falso conflito', () => {
  assert.deepEqual(conditionalValue({ name:'A' }, { name:'A', members:[], optional:null }, { name:'B' }), { name:'B' })
  assert.deepEqual(conditionalValue({ list:{ 0:'a', 1:'b' } }, { list:['a', 'b'] }, {}), {})
})

test('patch exige expectativas completas e caminhos nao sobrepostos', () => {
  assert.equal(validConditionalPatch({}, { a:1 }), false)
  assert.equal(validConditionalPatch({ a:null, 'a/b':null }, { a:1, 'a/b':2 }), false)
  assert.equal(validConditionalPatch({ 'a//b':null }, { 'a//b':1 }), false)
  assert.equal(validConditionalPatch({ 'constructor/x':null }, { 'constructor/x':1 }), false)
})

test('comparacao independe da ordem dos campos e protege criacao simultanea', () => {
  assert.deepEqual(conditionalValue({ a: 1, b: 2 }, { b: 2, a: 1 }, { a: 2 }), { a: 2 })
  assert.deepEqual(conditionalValue(null, null, { a: 1 }), { a: 1 })
  assert.equal(conditionalValue({ a: 1 }, null, { a: 2 }), undefined)
})
