import type { MasterPessoa } from '../../src/types.ts'
import { adminDatabase } from '../lib/subscription-store.ts'
import { clearDeviceCookie, clearLoginFailures, createDeviceSession, destroyDeviceSession, deviceSession, json, loginAttemptAllowed, objectBody, recordLoginFailure, verifyAdminPassword } from '../lib/secure-session.ts'

async function publicPeople(): Promise<Record<string, Pick<MasterPessoa, 'name' | 'active'>>> {
  const snapshot = await adminDatabase().ref('master/pessoas').get()
  const people = snapshot.exists() ? snapshot.val() as Record<string, MasterPessoa> : {}
  return Object.fromEntries(Object.entries(people).filter(([, person]) => person.active !== false).map(([id, person]) => [id, { name:String(person.name ?? ''), active:true }]))
}

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
      const [people, paired] = await Promise.all([publicPeople(), resolveSession(request)])
      const masterId = paired && people[paired.masterId] ? paired.masterId : ''
      return json(200, { people, masterId })
    } catch { return json(503, { error:'Não foi possível carregar as pessoas.' }) }
  }
  if (request.method === 'POST') {
    const body = await objectBody(request)
    const masterId = String(body['masterId'] ?? ''), installationId = String(body['installationId'] ?? '')
    if (!/^m_[A-Za-z0-9_-]+$/.test(masterId) || !/^[a-f0-9]{32,64}$/.test(installationId)) return json(400, { error:'Identidade ou instalação inválida.' })
    try {
      const previous = await resolveSession(request)
      if (previous) {
        if (previous.masterId === masterId && previous.installationId === installationId) return json(200, { masterId })
        return json(409, { error:'Desbloqueie o aparelho com a senha Admin antes de trocar a pessoa.' })
      }
      const person = await adminDatabase().ref(`master/pessoas/${masterId}`).get()
      if (!person.exists() || (person.val() as MasterPessoa).active === false) return json(404, { error:'Pessoa indisponível.' })
      await revokeInstallationSubscriptions(installationId)
      await destroyDeviceSession(request)
      const created = await createDeviceSession(masterId, installationId)
      return json(200, { masterId }, { 'set-cookie':created.cookie })
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
