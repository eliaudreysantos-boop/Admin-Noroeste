import { loadAgendaRoot } from '../lib/agenda-root.ts'
import { agendaToIcs, collectAgendaEvents, collectAnnouncementEvents, eventsInFeedWindow, type AgendaSource } from '../../src/modules/individual-domain.ts'
import type { AgendaConfig, AgendaSubscription } from '../../src/types.ts'
import { privateSubscriptionStore, type SubscriptionStore } from '../lib/subscription-store.ts'

const SOURCES: AgendaSource[] = ['tarefas', 'limpeza', 'escala', 'servicoCampo']

function configuredDatabaseUrl(): string {
  return ((globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env?.['FIREBASE_DATABASE_URL'] ?? '').trim().replace(/\/$/, '')
}

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
  return Object.fromEntries(SOURCES.map(source => [source, source === 'servicoCampo' ? [] : values]))
}

export async function calendarResponse(request: Request, fetcher: typeof fetch = fetch, store: SubscriptionStore = privateSubscriptionStore, databaseURL = configuredDatabaseUrl()): Promise<Response> {
  if (request.method !== 'GET') return json(405, 'Método não permitido.')
  const token = new URL(request.url).searchParams.get('token')?.trim() ?? ''
  if (!/^[a-f0-9]{48}$/.test(token)) return json(400, 'Token de calendário inválido.')

  let subscription: AgendaSubscription | null
  try { subscription = await store.get(token) }
  catch { return json(503, 'Não foi possível consultar a assinatura.') }
  if (!subscription || subscription.token !== token) return json(404, 'Assinatura não encontrada.')
  if (!subscription.ativo) return json(410, 'Esta assinatura foi revogada.')
  if (subscription.tipo === 'pessoal' && !subscription.masterId) return json(422, 'Assinatura pessoal sem vínculo válido.')

  let root: Record<string, unknown>
  try {
    if (fetcher === fetch) root = await loadAgendaRoot()
    else {
      if (!/^https:\/\/[A-Za-z0-9.-]+$/.test(databaseURL)) return json(503, 'Banco do calendário não configurado.')
      root = await loadAgendaRoot(async path => {
        const response = await fetcher(`${databaseURL}/${path}.json`)
        if (!response.ok) throw new Error('Agenda unavailable')
        return response.json()
      })
    }
  }
  catch { return json(503, 'Não foi possível montar o calendário.') }
  if (subscription.tipo === 'pessoal') {
    const people = ((root.master as Record<string, unknown> | undefined)?.pessoas ?? {}) as Record<string, { active?: boolean }>
    if (!people[subscription.masterId!] || people[subscription.masterId!]?.active === false) return json(410, 'A pessoa desta assinatura não está ativa.')
  }
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

export default (request: Request): Promise<Response> => calendarResponse(request)
