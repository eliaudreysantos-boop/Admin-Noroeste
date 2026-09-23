import type { MasterPessoa } from '../../src/types.ts'
import { randomBytes } from 'node:crypto'
import { pairingKey, consumePairing } from '../lib/agenda-pairing.ts'
import { adminDatabase } from '../lib/subscription-store.ts'
import { clearDeviceCookie, clearLoginFailures, destroyDeviceSession, deviceSession, json, loginAttemptAllowed, objectBody, recordLoginFailure, verifyAdminPassword, reservePairingAttempt, renewDeviceCookie, renewDeviceSession, type DeviceSession } from '../lib/secure-session.ts'

async function revokeInstallationSubscriptions(installationId: string): Promise<void> {
  if (!installationId) return
  const root = adminDatabase().ref('agendaAssinaturasPrivadas')
  const snapshot = await root.get()
  if (!snapshot.exists()) return
  const revokedAt = new Date().toISOString(), patch: Record<string, unknown> = {}
  snapshot.forEach(item => {
    const value = item.val() as { installationId?: string; ativo?: boolean }
    if (value.installationId !== installationId || value.ativo === false) return
    patch[`${item.key}/ativo`] = false; patch[`${item.key}/revogadoEm`] = revokedAt
  })
  if (Object.keys(patch).length) await root.update(patch)
}

export async function agendaDeviceResponse(request: Request, resolveSession = deviceSession): Promise<Response> {
  if (request.method === 'GET') {
    try {
      const paired = await resolveSession(request)
      if (!paired) return json(200,{people:{},masterId:''})
      const person = (await adminDatabase().ref(`master/pessoas/${paired.masterId}`).get()).val() as MasterPessoa|null
      if (!person || person.active === false) return json(200,{people:{},masterId:''})
      await renewDeviceSession(paired)
      return json(200, { people:{[paired.masterId]:{name:person.name,active:true}}, masterId:paired.masterId }, {'set-cookie':renewDeviceCookie(paired)})
    } catch { return json(503, { error:'Não foi possível carregar as pessoas.' }) }
  }
  if (request.method === 'POST') {
    const body = await objectBody(request)
    const masterId = String(body['masterId'] ?? ''), installationId = String(body['installationId'] ?? '')
    if (!/^[a-f0-9]{32,64}$/.test(installationId)) return json(400, { error:'Instalação inválida.' })
    try {
      const previous = await resolveSession(request)
      if (previous) {
        if (previous.masterId === masterId && previous.installationId === installationId) return json(200, { masterId })
        return json(409, { error:'Desbloqueie o aparelho com a senha Admin antes de trocar a pessoa.' })
      }
      const code=String(body['code'] ?? '').replace(/[\s-]/g,'').toUpperCase()
      if (!/^[A-F0-9]{16}$/.test(code)) return json(400,{error:'Informe o código fornecido pelo Admin.'})
      if (!await reservePairingAttempt(request,installationId)) return json(429,{error:'Muitas tentativas. Aguarde 10 minutos.'})
      const key=pairingKey(code), token=randomBytes(32).toString('hex'), now=Date.now()
      let created:DeviceSession|null=null
      const result=await adminDatabase().ref('/').transaction(current=>{
        created=null
        if(current===null)return null // Bootstrap the Firebase transaction's cold cache.
        const next=consumePairing(current,key,token,installationId,now)
        if(next)created=next.agendaDispositivosPrivados[token]
        return next
      },undefined,false)
      if (!result.committed || !created) return json(400,{error:'Código inválido, vencido ou já utilizado.'})
      const session=created as DeviceSession
      const person=result.snapshot.val().master.pessoas[session.masterId]
      return json(200,{masterId:session.masterId,person:{name:person.name,active:true}},{'set-cookie':renewDeviceCookie(session)})
    } catch (error) { console.error('Agenda device pairing failed:', error instanceof Error ? error.message : 'Unknown error'); return json(503, { error:'Não foi possível parear o aparelho.' }) }
  }
  if (request.method === 'DELETE') {
    const body = await objectBody(request)
    try {
      const scope = 'agenda-admin'
      if (!await loginAttemptAllowed(request, scope)) return json(429, { error:'Muitas tentativas. Aguarde 30 segundos.' })
      if (!await verifyAdminPassword(String(body['adminPassword'] ?? ''))) { await recordLoginFailure(request, scope); return json(401, { error:'Senha Admin inválida.' }) }
      await clearLoginFailures(request, scope)
      const previous = await resolveSession(request)
      if (previous) await revokeInstallationSubscriptions(previous.installationId)
      await destroyDeviceSession(request)
      return json(200, { ok:true }, { 'set-cookie':clearDeviceCookie() })
    } catch (error) { console.error('Agenda device unlock failed:', error instanceof Error ? error.message : 'Unknown error'); return json(503, { error:'Não foi possível desbloquear o aparelho.' }) }
  }
  return json(405, { error:'Método não permitido.' })
}

export default (request: Request): Promise<Response> => agendaDeviceResponse(request)
