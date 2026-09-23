import { randomBytes } from 'node:crypto'
import { adminDatabase } from '../lib/subscription-store.ts'
import { appSession, json, objectBody, validCsrf } from '../lib/secure-session.ts'
import { pairingKey } from '../lib/agenda-pairing.ts'

export default async (request:Request):Promise<Response> => {
  if (request.method !== 'POST') return json(405,{error:'Método não permitido.'})
  try {
    const session = await appSession(request)
    if (!session?.usuario.apps.mestre || !validCsrf(request,session)) return json(403,{error:'Acesso negado.'})
    const body = await objectBody(request), masterId = String(body['masterId'] ?? '')
    if (!/^[A-Za-z0-9_-]+$/.test(masterId)) return json(400,{error:'Pessoa inválida.'})
    const person = (await adminDatabase().ref(`master/pessoas/${masterId}`).get()).val()
    if (!person || person.active === false) return json(400,{error:'Selecione uma pessoa ativa.'})
    const code = randomBytes(8).toString('hex').toUpperCase(), expiresAt = Date.now()+600_000
    await adminDatabase().ref(`agendaPareamentosPrivados/${pairingKey(code)}`).set({masterId,expiresAt,createdBy:session.uid})
    return json(200,{code,expiresAt,name:person.name})
  } catch { return json(503,{error:'Não foi possível gerar o código.'}) }
}
