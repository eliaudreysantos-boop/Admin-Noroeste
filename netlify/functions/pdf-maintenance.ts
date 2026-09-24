import { getStore } from '@netlify/blobs'
import { randomUUID } from 'node:crypto'
import { appSession,json,objectBody,validCsrf } from '../lib/secure-session.ts'
import { adminDatabase } from '../lib/subscription-store.ts'
import { ACTIVITY_ROOT } from '../lib/activity.ts'
import { validStoragePath,canReadPublicStoragePath } from './storage-file.ts'
import { PDF_RETENTION_DAYS, pdfHasExpired } from '../../src/modules/pdf-expiry.ts'

const STORE='admin-noroeste-pdfs'
const PREFIX='agenda/documentos/'
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}
function referencedPaths(value:unknown):Set<string> {
  const paths=new Set<string>()
  for(const item of Object.values(record(value))) {
    const document=record(item),path=document['storagePath']
    if(typeof path==='string')paths.add(path)
    const url=document['url']
    if(typeof url==='string')try {
      const legacy=new URL(url,'https://local.invalid').searchParams.get('path')
      if(legacy&&validStoragePath(legacy))paths.add(legacy)
    }catch{/* Invalid legacy URL cannot identify a blob. */}
  }
  return paths
}
function ageStatus(createdAt:unknown,now:number):'retido'|'elegivel'|'desconhecido' {
  if(typeof createdAt!=='string')return 'desconhecido'
  const time=Date.parse(createdAt)
  if(!Number.isFinite(time)||time>now)return 'desconhecido'
  return pdfHasExpired(createdAt,now)?'elegivel':'retido'
}

export async function pdfMaintenanceResponse(request:Request,sessionFor=appSession,databaseFor=adminDatabase,storeFor=()=>getStore(STORE,{consistency:'strong'})):Promise<Response> {
  if(!['GET','POST'].includes(request.method))return json(405,{error:'Método não permitido.'})
  try {
    const session=await sessionFor(request)
    if(!session)return json(401,{error:'Sessão expirada.'})
    if(!session.usuario.apps.mestre)return json(403,{error:'Acesso restrito ao Admin.'})
    if(request.method==='POST'&&!validCsrf(request,session))return json(403,{error:'Validação da sessão ausente.'})
    const db=databaseFor(),store=storeFor()
    if(request.method==='GET') {
      const documentSnap=await db.ref('agenda/documentos').get()
      const referenced=referencedPaths(documentSnap.val())
      const blobs:{key:string;etag:string}[]=[]
      for await(const page of store.list({prefix:PREFIX,paginate:true})) {
        blobs.push(...page.blobs)
        if(blobs.length>2000)return json(413,{error:'Inventário muito grande. Nenhuma exclusão foi executada.'})
      }
      const now=Date.now()
      const files=[]
      for(let index=0;index<blobs.length;index+=40)files.push(...await Promise.all(blobs.slice(index,index+40).map(async blob=>{
        const metadata=await store.getMetadata(blob.key,{consistency:'strong'})
        const createdAt=metadata?.metadata?.['createdAt']
        const status=referenced.has(blob.key)?'ativo':ageStatus(createdAt,now)
        return {path:blob.key,etag:blob.etag,createdAt:typeof createdAt==='string'?createdAt:null,bytes:Number(metadata?.metadata?.['bytes'])||null,status}
      })))
      return json(200,{checkedAt:new Date(now).toISOString(),retentionDays:PDF_RETENTION_DAYS,files,health:{database:'ok',storage:'ok',version:process.env['COMMIT_REF']?.slice(0,12)||'desconhecida'}})
    }
    const body=await objectBody(request)
    const paths=body['paths']
    if(body['confirm']!=='EXCLUIR PDFs'||!Array.isArray(paths)||paths.length<1||paths.length>20||paths.some(path=>typeof path!=='string'||!validStoragePath(path)||!canReadPublicStoragePath(path))||new Set(paths).size!==paths.length)return json(400,{error:'Seleção ou confirmação inválida.'})
    const deleted:string[]=[],skipped:{path:string;reason:string}[]=[]
    for(const path of paths as string[]) {
      const current=referencedPaths((await db.ref('agenda/documentos').get()).val())
      if(current.has(path)){skipped.push({path,reason:'Arquivo passou a ser referenciado.'});continue}
      const metadata=await store.getMetadata(path,{consistency:'strong'})
      if(!metadata){skipped.push({path,reason:'Arquivo não encontrado.'});continue}
      if(ageStatus(metadata.metadata?.['createdAt'],Date.now())!=='elegivel'){skipped.push({path,reason:'Retenção não concluída ou data desconhecida.'});continue}
      // Recheck immediately before the irreversible operation.
      if(referencedPaths((await db.ref('agenda/documentos').get()).val()).has(path)){skipped.push({path,reason:'Arquivo passou a ser referenciado.'});continue}
      await store.delete(path)
      const id=randomUUID()
      await db.ref(`${ACTIVITY_ROOT}/mestre/${id}`).set({id,at:new Date().toISOString(),actorId:session.uid,actorName:session.usuario.nome,module:'mestre',action:'remover',paths:[path]})
      deleted.push(path)
    }
    return json(200,{deleted,skipped})
  } catch(error) {
    console.error('PDF maintenance failed:',error instanceof Error?error.message:'Unknown error')
    return json(503,{error:'Inventário ou limpeza indisponível. Recarregue antes de tentar novamente.'})
  }
}
export default (request:Request)=>pdfMaintenanceResponse(request)
