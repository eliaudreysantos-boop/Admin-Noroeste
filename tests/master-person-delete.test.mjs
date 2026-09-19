import test from 'node:test'
import assert from 'node:assert/strict'
import { deleteUnreferencedMasterPerson } from '../netlify/lib/master-person-delete.ts'

test('exclusão preserva a raiz e recusa vínculo criado antes de repetir a transação',()=>{
  const root={master:{pessoas:{m1:{name:'Pessoa'},m2:{name:'Outra'}}},tarefas:{people:{}}}
  const next=deleteUnreferencedMasterPerson(root,'m1')
  assert.equal(next.master.pessoas.m1,undefined)
  assert.ok(root.master.pessoas.m1)
  assert.deepEqual(next.master.pessoas.m2,root.master.pessoas.m2)
  root.tarefas.people.p1={masterId:'m1'}
  assert.equal(deleteUnreferencedMasterPerson(root,'m1'),undefined)
})

test('exclusão detecta identidade usada como chave e histórico aninhado',()=>{
  for(const extra of [{servicoCampo:{leaders:{m1:true}}},{escala:{publishedSnapshots:{month:{participants:{p:{masterId:'m1'}}}}}}]) {
    assert.equal(deleteUnreferencedMasterPerson({master:{pessoas:{m1:{name:'Pessoa'}}},...extra},'m1'),undefined)
  }
})
