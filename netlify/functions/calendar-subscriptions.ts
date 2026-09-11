import type { AgendaSubscription } from '../../src/types.ts'
import { privateSubscriptionStore, type SubscriptionStore } from '../lib/subscription-store.ts'

const SOURCES = new Set(['tarefas', 'limpeza', 'escala', 'oradores', 'programacao', 'servicoCampo'])
const json = (status: number, value: unknown): Response => new Response(JSON.stringify(value), {
  status,
  headers:{ 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' },
})

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

export async function subscriptionsResponse(
  request: Request,
  store: SubscriptionStore = privateSubscriptionStore,
  tokenFactory: () => string = randomToken,
): Promise<Response> {
  if (!['POST', 'PATCH', 'DELETE'].includes(request.method)) return json(405, { error:'Método não permitido.' })
  const body = await requestBody(request)
  if (!validInstallation(body['installationId'])) return json(400, { error:'Instalação inválida.' })

  try {
    if (request.method === 'POST') {
      const tipo = body['tipo']
      if (tipo !== 'pessoal' && tipo !== 'quadro') return json(400, { error:'Tipo de assinatura inválido.' })
      const selectedModules = modules(body['modulos'])
      const masterId = typeof body['masterId'] === 'string' ? body['masterId'].trim() : ''
      if (tipo === 'pessoal' && !/^m_[A-Za-z0-9_-]+$/.test(masterId)) return json(400, { error:'Pessoa inválida.' })
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
  } catch {
    return json(503, { error:'Serviço de assinaturas indisponível.' })
  }
}

export default subscriptionsResponse
