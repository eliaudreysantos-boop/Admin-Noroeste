import { appSession,json } from '../lib/secure-session.ts'
import { adminDatabase } from '../lib/subscription-store.ts'
import { ACTIVITY_ROOT } from '../lib/activity.ts'
import { ACTIVITY_MODULES,activityAllowed,type ActivityEntry } from '../../src/modules/activity-domain.ts'

export async function activityResponse(request:Request,sessionFor=appSession,database=adminDatabase):Promise<Response>{
  if(request.method!=='GET')return json(405,{error:'Método não permitido.'})
  try {
    const session=await sessionFor(request)
    if(!session)return json(401,{error:'Sessão expirada.'})
    const module=new URL(request.url).searchParams.get('module')??''
    if(module&&!activityAllowed(session.usuario.apps,module))return json(403,{error:'Acesso negado.'})
    const modules=ACTIVITY_MODULES.filter(m=>activityAllowed(session.usuario.apps,m)&&(!module||module===m))
    const groups=await Promise.all(modules.map(async m=>Object.values((await database().ref(`${ACTIVITY_ROOT}/${m}`).get()).val()??{}) as ActivityEntry[]))
    return json(200,{entries:groups.flat().sort((a,b)=>b.at.localeCompare(a.at)||b.id.localeCompare(a.id)),limitPerModule:500})
  }catch{return json(503,{error:'Não foi possível consultar o histórico.'})}
}
export default (request:Request)=>activityResponse(request)
