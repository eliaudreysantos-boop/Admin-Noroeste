import { appSession, json, objectBody, validCsrf } from '../lib/secure-session.ts'
import { adminDatabase } from '../lib/subscription-store.ts'
import { readBatch } from '../lib/database-reads.ts'
import { canAccessData, canMutateData, containsPrivateRoot, normalizeDataPath, withoutPrivateRoots } from '../lib/data-authorization.ts'

export default async (request: Request): Promise<Response> => {
  if (!['GET', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return json(405, { error:'Método não permitido.' })
  let session
  try { session = await appSession(request) } catch { return json(503, { error:'Sessão indisponível.' }) }
  if (!session) return json(401, { error:'Sessão expirada.' })
  const batchPaths = new URL(request.url).searchParams.get('paths')
  if (request.method === 'GET' && batchPaths !== null) {
    const results = await readBatch(batchPaths, session.usuario.apps, async path => {
      const snapshot = await adminDatabase().ref(path || '/').get()
      return snapshot.exists() ? snapshot.val() as unknown : null
    })
    return results ? json(200, { results }) : json(400, { error:'Lote de leituras invalido.' })
  }
  const rawPath = new URL(request.url).searchParams.get('path') ?? ''
  const path = normalizeDataPath(rawPath)
  if (path === null) return json(400, { error:'Caminho inválido.' })
  const write = request.method !== 'GET'
  if (!canAccessData(path, session.usuario.apps, write)) return json(403, { error:'Acesso negado.' })
  if (write && !validCsrf(request, session)) return json(403, { error:'Validação da sessão ausente.' })

  try {
    const reference = adminDatabase().ref(path || '/')
    if (request.method === 'GET') {
      const snapshot = await reference.get()
      const value = snapshot.exists() ? snapshot.val() as unknown : null
      return json(200, { value:path ? value : withoutPrivateRoots(value) })
    }
    if (request.method === 'DELETE') {
      if (!canMutateData(path, request.method, undefined, session.usuario.apps)) return json(403, { error:'Alteração não autorizada.' })
      await reference.remove()
    }
    else {
      const body = await objectBody(request)
      const value = body['value']
      if (!canMutateData(path, request.method, value, session.usuario.apps)) return json(403, { error:'Alteração não autorizada.' })
      if (!path && containsPrivateRoot(value)) return json(400, { error:'Backup contém caminhos privados.' })
      if (request.method === 'PUT') await reference.set(value ?? null)
      else {
        if (!value || typeof value !== 'object' || Array.isArray(value) || containsPrivateRoot(value)) return json(400, { error:'Atualização inválida.' })
        await reference.update(value as Record<string, unknown>)
      }
    }
    return json(200, { ok:true })
  } catch { return json(503, { error:'Operação de dados indisponível.' }) }
}
