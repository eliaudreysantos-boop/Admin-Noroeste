import type { Usuario } from '../../src/types.ts'
import { adminDatabase } from '../lib/subscription-store.ts'
import { json } from '../lib/secure-session.ts'

export default async (request: Request): Promise<Response> => {
  if (request.method !== 'GET') return json(405, { error:'Método não permitido.' })
  try {
    const snapshot = await adminDatabase().ref('usuarios').get()
    const users = snapshot.exists() ? snapshot.val() as Record<string, Usuario> : {}
    const choices = Object.fromEntries(Object.entries(users).filter(([, user]) => user.ativo).map(([uid, user]) => [uid, { nome:String(user.nome ?? ''), ativo:true }]))
    return json(200, choices)
  } catch { return json(503, { error:'Não foi possível carregar os usuários.' }) }
}
