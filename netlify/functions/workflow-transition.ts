import { appSession, json, objectBody, validCsrf } from '../lib/secure-session.ts'
import { adminDatabase } from '../lib/subscription-store.ts'
import { removeUnusedParticipant } from '../lib/workflow-transitions.ts'
import { activityEntry,appendActivity } from '../lib/activity.ts'

export default async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') return json(405, { error:'Método não permitido.' })
  try {
    const session = await appSession(request)
    if (!session || !validCsrf(request, session)) return json(403, { error:'Sessão inválida.' })
    const body = await objectBody(request), action = body['action']
    if (action !== 'remove-participant') return json(400, { error:'Operação inválida.' })
    if (!session.usuario.apps.mestre) return json(403, { error:'Acesso negado.' })
    const key = String(body['key'] ?? '')
    if (!/^[A-Za-z0-9_-]+$/.test(key)) return json(400, { error:'Identificador inválido.' })
    const entry=activityEntry(session,'remover',`escala/participants/${key}`)
    let applied = false
    const result = await adminDatabase().ref('/').transaction(current => {
      if(current===null){applied=false;return null}
      const next = removeUnusedParticipant(current.escala, key, body['expected'])
      applied = next !== undefined
      return next===undefined?undefined:appendActivity(current,{...current,escala:next},entry)
    }, undefined, false)
    if (!result.committed || !applied) return json(409, { error:'O participante mudou ou possui designações. Recarregue e confira antes de remover.' })
    return json(200, { ok:true })
  } catch { return json(503, { error:'Não foi possível concluir a operação.' }) }
}
