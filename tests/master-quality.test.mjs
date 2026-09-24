import test from 'node:test'
import assert from 'node:assert/strict'
import { auditMasterQuality } from '../src/modules/master-quality.ts'

test('auditoria aponta dados inconsistentes sem expor telefones',()=>{
  const person=(name,whatsapp,active=true)=>({name,whatsapp,active,sex:null,role:null,limpeza:{grupo:null}})
  const issues=auditMasterQuality({a:person('A','5585999999999'),b:person('B','5585999999999'),c:person('', '123')},{u:{ativo:true,masterId:'ausente'}})
  assert.ok(issues.some(item=>item.kind==='duplicado'))
  assert.ok(issues.some(item=>item.kind==='telefone'))
  assert.ok(issues.some(item=>item.kind==='cadastro'))
  assert.ok(issues.some(item=>item.kind==='acesso'))
  assert.equal(JSON.stringify(issues).includes('5585999999999'),false)
})
