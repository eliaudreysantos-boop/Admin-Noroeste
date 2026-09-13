import { adminDatabase } from '../lib/subscription-store.ts'
import { appSession, json, objectBody, validCsrf } from '../lib/secure-session.ts'

export default async (request: Request): Promise<Response> => {
  if (request.method !== 'PATCH') return json(405, { error:'Método não permitido.' })
  const session = await appSession(request)
  if (!session || (!session.usuario.apps.mestre && !session.usuario.apps.limpeza)) return json(403, { error:'Acesso negado.' })
  if (!validCsrf(request, session)) return json(403, { error:'Validação da sessão ausente.' })
  const body = await objectBody(request), groups = body['groups']
  if (!groups || typeof groups !== 'object' || Array.isArray(groups)) return json(400, { error:'Grupos inválidos.' })
  const entries = Object.entries(groups as Record<string, unknown>)
  if (!entries.length || entries.length > 300) return json(400, { error:'Quantidade de alterações inválida.' })
  const patch: Record<string, number | null> = {}
  for (const [masterId, value] of entries) {
    if (!/^m_[A-Za-z0-9_-]+$/.test(masterId) || (value !== null && (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 99))) return json(400, { error:'Grupo inválido.' })
    patch[`${masterId}/limpeza/grupo`] = value === null ? null : Number(value)
  }
  try {
    await adminDatabase().ref('master/pessoas').update(patch)
    return json(200, { ok:true })
  } catch { return json(503, { error:'Não foi possível salvar os grupos.' }) }
}
