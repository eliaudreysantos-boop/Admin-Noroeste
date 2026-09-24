import test from 'node:test'
import assert from 'node:assert/strict'
import { pdfMaintenanceResponse } from '../netlify/functions/pdf-maintenance.ts'

const old=new Date(Date.now()-100*86400_000).toISOString()
const fresh=new Date().toISOString()
const prefix='agenda/documentos/admin/'
function fixture(){
  const files=new Map([
    [`${prefix}active.pdf`,{createdAt:old,bytes:100}],
    [`${prefix}old.pdf`,{createdAt:old,bytes:100}],
    [`${prefix}fresh.pdf`,{createdAt:fresh,bytes:100}],
    [`${prefix}unknown.pdf`,{}],
  ])
  let documents={active:{storagePath:`${prefix}active.pdf`}}
  const log=[]
  const store={
    async *list(){yield {blobs:[...files.keys()].map(key=>({key,etag:'etag'}))}},
    async getMetadata(path){return files.has(path)?{metadata:files.get(path),etag:'etag'}:null},
    async delete(path){files.delete(path)},
  }
  const db={ref(path){return path==='agenda/documentos'?{async get(){return {val:()=>documents}}}:{async set(value){log.push(value)}}}}
  return {files,store,db,log,setDocuments(value){documents=value}}
}
const session=admin=>async()=>({uid:'admin',csrf:'csrf',usuario:{nome:'Admin',apps:{mestre:admin}}})
const request=(method,body)=>new Request('https://app.test/.netlify/functions/pdf-maintenance',{method,headers:{'x-noroeste-csrf':'csrf'},...(body?{body:JSON.stringify(body)}:{})})
test('inventário distingue ativos, retenção, elegíveis e data desconhecida',async()=>{
  const f=fixture()
  const response=await pdfMaintenanceResponse(request('GET'),session(true),()=>f.db,()=>f.store)
  assert.equal(response.status,200)
  const items=(await response.json()).files
  assert.deepEqual(Object.fromEntries(items.map(item=>[item.path,item.status])),{
    [`${prefix}active.pdf`]:'ativo',[`${prefix}old.pdf`]:'elegivel',[`${prefix}fresh.pdf`]:'retido',[`${prefix}unknown.pdf`]:'desconhecido',
  })
})
test('limpeza revalida referência e retenção no servidor',async()=>{
  const f=fixture()
  const paths=[`${prefix}active.pdf`,`${prefix}old.pdf`,`${prefix}fresh.pdf`,`${prefix}unknown.pdf`]
  const response=await pdfMaintenanceResponse(request('POST',{paths,confirm:'EXCLUIR PDFs'}),session(true),()=>f.db,()=>f.store)
  assert.equal(response.status,200)
  assert.deepEqual((await response.json()).deleted,[`${prefix}old.pdf`])
  assert.equal(f.files.has(`${prefix}old.pdf`),false)
  assert.equal(f.log.length,1)
})
test('limpeza exige Admin, CSRF e confirmação explícita',async()=>{
  const f=fixture(),body={paths:[`${prefix}old.pdf`],confirm:'EXCLUIR PDFs'}
  assert.equal((await pdfMaintenanceResponse(request('POST',body),session(false),()=>f.db,()=>f.store)).status,403)
  assert.equal((await pdfMaintenanceResponse(request('POST',{...body,confirm:'sim'}),session(true),()=>f.db,()=>f.store)).status,400)
  assert.equal(f.files.size,4)
})
