import { appSession, json, objectBody, validCsrf } from '../lib/secure-session.ts'
import { adminDatabase } from '../lib/subscription-store.ts'
import { removeUnusedParticipant, transitionMonth } from '../lib/workflow-transitions.ts'
import { validSecretaryMonth } from '../../src/modules/secretario-domain.ts'

export default async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') return json(405, { error:'Método não permitido.' })
  try {
    const session = await appSession(request)
    if (!session || !validCsrf(request, session)) return json(403, { error:'Sessão inválida.' })
    const body = await objectBody(request), action = body['action']
    if (!['close-month', 'reopen-month', 'remove-participant'].includes(String(action))) return json(400, { error:'Operação inválida.' })
    const removing = action === 'remove-participant'
    if (!session.usuario.apps.mestre && (removing || !session.usuario.apps.secretario)) return json(403, { error:'Acesso negado.' })
    const key = String(body['key'] ?? '')
    if (removing ? !/^[A-Za-z0-9_-]+$/.test(key) : !validSecretaryMonth(key)) return json(400, { error:'Identificador inválido.' })
    let applied = false
    const now = new Date().toISOString()
    const result = await adminDatabase().ref(removing ? 'escala' : 'secretario').transaction(current => {
      const next = removing ? removeUnusedParticipant(current, key, body['expected']) : transitionMonth(current, key, body['expected'], action === 'close-month', now)
      applied = next !== undefined
      return next ?? current
    }, undefined, false)
    if (!result.committed || !applied) return json(409, { error:removing ? 'O participante mudou ou possui designações. Recarregue e confira antes de remover.' : 'Os dados da competência mudaram. Recarregue e confira os totais antes de continuar.' })
    return json(200, removing ? { ok:true } : { closing:result.snapshot.child(`fechamentos/${key}`).val() })
  } catch { return json(503, { error:'Não foi possível concluir a operação.' }) }
}
