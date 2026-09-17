import type { RawRoot } from '../../src/types.ts'
import { collectAgendaEvents, collectAnnouncementEvents, eventsInFeedWindow } from '../../src/modules/individual-domain.ts'
import { loadAgendaRoot } from '../lib/agenda-root.ts'
import { appSession, deviceSession, json } from '../lib/secure-session.ts'
import { publicAgendaConfig, publicAgendaDocuments, publicAgendaEvent, publicAnnouncementEvent } from '../lib/agenda-public.ts'

export default async (request: Request): Promise<Response> => {
  if (request.method !== 'GET') return json(405, { error:'Método não permitido.' })
  try {
    const device = await deviceSession(request)
    const session = device ? null : await appSession(request)
    const masterId = device?.masterId ?? session?.usuario.masterId ?? ''
    if (!masterId) return json(403, { error:'Identidade não pareada.' })
    const root = await loadAgendaRoot() as RawRoot
    const master = root.master?.pessoas ?? {}
    if (!master[masterId] || master[masterId].active === false) return json(403, { error:'Pessoa inativa ou não encontrada.' })
    const currentPerson = master[masterId]
    const today = new Intl.DateTimeFormat('en-CA', { timeZone:'America/Fortaleza', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date()).replace(/\//g, '-')
    const events = eventsInFeedWindow(collectAgendaEvents(root, masterId), today).map(publicAgendaEvent).filter(item => item !== null)
    const announcements = eventsInFeedWindow(collectAnnouncementEvents(root), today).map(publicAnnouncementEvent).filter(item => item !== null)
    return json(200, {
      masterId, person:{ name:currentPerson.name, active:currentPerson.active }, events, announcements,
      agenda:{ config:publicAgendaConfig(root.agenda?.config), documentos:publicAgendaDocuments(root.agenda?.documentos) },
    })
  } catch { return json(503, { error:'Não foi possível sincronizar a agenda.' }) }
}
