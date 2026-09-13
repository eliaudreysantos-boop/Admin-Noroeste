import type { AgendaSubscription } from '../../src/types.ts'
import { privateSubscriptionStore, type SubscriptionStore } from '../lib/subscription-store.ts'
import { appSession, deviceSession, validCsrf } from '../lib/secure-session.ts'

const SOURCES = new Set(['tarefas', 'limpeza', 'escala', 'oradores', 'programacao', 'servicoCampo'])
const json = (status: number, value: unknown, headers: Record<string, string> = {}): Response => new Response(JSON.stringify(value), {
  status,
  headers:{ 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', ...headers },
})

function storeErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('não configuradas')) return 'configuration-missing'
  if (error instanceof SyntaxError) return 'credentials-invalid'
  if (/credential|invalid_grant|unauthorized/i.test(message)) return 'authentication-failed'
  if (/permission|denied/i.test(message)) return 'permission-denied'
  return 'store-unavailable'
}

function randomToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function validInstallation(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{32,64}$/.test(value)
}

function validToken(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{48}$/.test(value)
}

function modules(value: unknown): AgendaSubscription['modulos'] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter(item => typeof item === 'string' && SOURCES.has(item)))] as AgendaSubscription['modulos']
}

async function requestBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json() as unknown
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  } catch { return {} }
}

export interface SubscriptionIdentity {
  masterId: string
  installationId: string
  canChoosePerson: boolean
  csrfValid?: boolean
}

async function requestIdentity(request: Request): Promise<SubscriptionIdentity | null> {
  const device = await deviceSession(request)
  if (device) return { masterId:device.masterId, installationId:device.installationId, canChoosePerson:false }
  const session = await appSession(request)
  if (!session) return null
  return { masterId:session.usuario.masterId ?? '', installationId:'', canChoosePerson:session.usuario.apps.mestre === true, csrfValid:validCsrf(request, session) }
}

export async function subscriptionsResponse(
  request: Request,
  store: SubscriptionStore = privateSubscriptionStore,
  tokenFactory: () => string = randomToken,
  identityResolver: (request: Request) => Promise<SubscriptionIdentity | null> = requestIdentity,
): Promise<Response> {
  if (!['POST', 'PATCH', 'DELETE'].includes(request.method)) return json(405, { error:'Método não permitido.' })
  const body = await requestBody(request)
  if (!validInstallation(body['installationId'])) return json(400, { error:'Instalação inválida.' })

  try {
    const identity = await identityResolver(request)
    if (!identity) return json(401, { error:'Identidade não autorizada.' })
    if (identity.csrfValid === false) return json(403, { error:'Validação da sessão ausente.' })
    if (identity.installationId && identity.installationId !== body['installationId']) return json(403, { error:'Instalação não autorizada.' })
    if (request.method === 'POST') {
      const tipo = body['tipo']
      if (tipo !== 'pessoal' && tipo !== 'quadro') return json(400, { error:'Tipo de assinatura inválido.' })
      const selectedModules = modules(body['modulos'])
      const masterId = typeof body['masterId'] === 'string' ? body['masterId'].trim() : ''
      if (tipo === 'pessoal' && !/^m_[A-Za-z0-9_-]+$/.test(masterId)) return json(400, { error:'Pessoa inválida.' })
      if (tipo === 'pessoal' && !identity.canChoosePerson && identity.masterId !== masterId) return json(403, { error:'Pessoa não autorizada.' })
      if (tipo === 'quadro' && !selectedModules?.length) return json(400, { error:'Selecione ao menos um módulo.' })
      const token = tokenFactory()
      if (!validToken(token)) return json(500, { error:'Não foi possível criar um token seguro.' })
      const record: AgendaSubscription = {
        token, tipo, installationId:body['installationId'], ativo:true, criadoEm:new Date().toISOString(),
        ...(tipo === 'pessoal' ? { masterId } : { modulos:selectedModules }),
      }
      await store.set(token, record)
      return json(201, record)
    }

    if (!validToken(body['token'])) return json(400, { error:'Token inválido.' })
    const current = await store.get(body['token'])
    if (!current) return json(404, { error:'Assinatura não encontrada.' })
    if (current.installationId !== body['installationId']) return json(403, { error:'Esta instalação não controla a assinatura.' })
    if (current.tipo === 'pessoal' && !identity.canChoosePerson && current.masterId !== identity.masterId) return json(403, { error:'Pessoa não autorizada.' })
    if (!current.ativo) return json(410, { error:'Assinatura revogada.' })

    if (request.method === 'DELETE') {
      const next = { ...current, ativo:false, revogadoEm:new Date().toISOString() }
      await store.set(current.token, next)
      return json(200, next)
    }

    if (current.tipo !== 'quadro') return json(400, { error:'A assinatura pessoal não possui seleção de módulos.' })
    const selectedModules = modules(body['modulos'])
    if (!selectedModules?.length) return json(400, { error:'Selecione ao menos um módulo.' })
    const next = { ...current, modulos:selectedModules }
    await store.set(current.token, next)
    return json(200, next)
  } catch (error) {
    console.error('Calendar subscription store failed:', error instanceof Error ? error.message : 'Unknown error')
    return json(503, { error:'Serviço de assinaturas indisponível.' }, { 'x-calendar-error':storeErrorCode(error) })
  }
}

export default (request: Request): Promise<Response> => subscriptionsResponse(request)
