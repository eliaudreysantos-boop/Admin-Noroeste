import { agendaToIcs, collectAgendaEvents, collectAnnouncementEvents, eventsInFeedWindow, type AgendaSource } from '../../src/modules/individual-domain.ts'
import type { AgendaConfig, AgendaSubscription } from '../../src/types.ts'

const DATABASE_URL = 'https://oradoress2-default-rtdb.firebaseio.com'
const SOURCES: AgendaSource[] = ['tarefas', 'limpeza', 'escala', 'oradores', 'programacao']

const json = (status: number, message: string): Response => new Response(JSON.stringify({ error:message }), {
  status,
  headers: { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' },
})

const fortalezaToday = (): string => new Intl.DateTimeFormat('en-CA', {
  timeZone:'America/Fortaleza', year:'numeric', month:'2-digit', day:'2-digit',
}).format(new Date()).replace(/\//g, '-')

function allowedSources(subscription: AgendaSubscription): Partial<Record<AgendaSource, boolean>> {
  if (subscription.tipo !== 'quadro') return {}
  const selected = new Set(subscription.modulos?.filter((value): value is AgendaSource => SOURCES.includes(value as AgendaSource)) ?? [])
  return Object.fromEntries(SOURCES.map(source => [source, selected.has(source)]))
}

function boardReminders(config: AgendaConfig): Partial<Record<AgendaSource, string[]>> {
  const values = config.icsReminders?.quadro ?? []
  return Object.fromEntries(SOURCES.map(source => [source, values]))
}

async function loadAgendaRoot(fetcher: typeof fetch): Promise<Record<string, unknown>> {
  const paths = [
    'master/pessoas',
    'tarefas/people', 'tarefas/scale/periods',
    'tarefas/discursos/oradores', 'tarefas/discursos/programacao', 'tarefas/discursos/congregacoes',
    'limpeza/periodos',
    'escala/participants', 'escala/scales', 'escala/tables', 'escala/publishedMonth', 'escala/publishedMonths', 'escala/publishedSnapshots',
    'programacao', 'agenda/config',
  ] as const
  const values = await Promise.all(paths.map(async path => {
    const response = await fetcher(`${DATABASE_URL}/${path}.json`)
    if (!response.ok) throw new Error(`Firebase indisponível em ${path}`)
    return response.json() as Promise<unknown>
  }))
  const value = (index: number): unknown => values[index] ?? undefined
  return {
    master:{ pessoas:value(0) },
    tarefas:{
      people:value(1),
      scale:{ periods:value(2) },
      discursos:{ oradores:value(3), programacao:value(4), congregacoes:value(5) },
    },
    limpeza:{ periodos:value(6) },
    escala:{
      participants:value(7), scales:value(8), tables:value(9), publishedMonth:value(10),
      publishedMonths:value(11), publishedSnapshots:value(12),
    },
    programacao:value(13),
    agenda:{ config:value(14) },
  }
}

export async function calendarResponse(request: Request, fetcher: typeof fetch = fetch): Promise<Response> {
  if (request.method !== 'GET') return json(405, 'Método não permitido.')
  const token = new URL(request.url).searchParams.get('token')?.trim() ?? ''
  if (!/^[a-f0-9]{48}$/.test(token)) return json(400, 'Token de calendário inválido.')

  const subscriptionResponse = await fetcher(`${DATABASE_URL}/agenda/assinaturas/${token}.json`)
  if (!subscriptionResponse.ok) return json(503, 'Não foi possível consultar a assinatura.')
  const subscription = await subscriptionResponse.json() as AgendaSubscription | null
  if (!subscription || subscription.token !== token) return json(404, 'Assinatura não encontrada.')
  if (!subscription.ativo) return json(410, 'Esta assinatura foi revogada.')
  if (subscription.tipo === 'pessoal' && !subscription.masterId) return json(422, 'Assinatura pessoal sem vínculo válido.')

  let root: Record<string, unknown>
  try { root = await loadAgendaRoot(fetcher) }
  catch { return json(503, 'Não foi possível montar o calendário.') }
  const config = ((root.agenda as Record<string, unknown> | undefined)?.config ?? {}) as AgendaConfig
  const events = subscription.tipo === 'pessoal'
    ? collectAgendaEvents(root, subscription.masterId!, allowedSources(subscription))
    : collectAnnouncementEvents(root, allowedSources(subscription))
  const reminders = subscription.tipo === 'quadro' ? boardReminders(config) : config.icsReminders
  const calendar = agendaToIcs(eventsInFeedWindow(events, fortalezaToday()), new Date().toISOString(), {
    reminders,
    namespace:`noroeste-${token.slice(0, 12)}`,
    calendarName:subscription.tipo === 'quadro' ? 'Quadro de anúncios Noroeste' : 'Minha agenda Noroeste',
  })
  return new Response(calendar, {
    status:200,
    headers: {
      'content-type':'text/calendar; charset=utf-8',
      'content-disposition':'inline; filename="agenda-noroeste.ics"',
      'cache-control':'private, max-age=300',
      'x-content-type-options':'nosniff',
    },
  })
}

export default calendarResponse
