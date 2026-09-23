import type { RawRoot } from '../../src/types.ts'
import { collectAgendaEvents, collectAnnouncementEvents, eventsInFeedWindow } from '../../src/modules/individual-domain.ts'
import { loadPartialAgendaRoot } from '../lib/agenda-root.ts'
import { fortalezaToday } from '../../src/modules/civil-date.ts'
import { appSession, deviceSession, json } from '../lib/secure-session.ts'
import { publicAgendaConfig, publicAgendaDocuments, publicAgendaEvent, publicAnnouncementEvent } from '../lib/agenda-public.ts'

export default async (request: Request): Promise<Response> => {
  if (request.method !== 'GET') return json(405, { error:'Método não permitido.' })
  try {
    const query=new URL(request.url).searchParams
    const session = query.get('device')==='true' ? null : await appSession(request)
    const device = session ? null : await deviceSession(request)
    const masterId = session?.usuario.apps.mestre ? query.get('masterId') || session.usuario.masterId || '' : session?.usuario.masterId ?? device?.masterId ?? ''
    if (!masterId) return json(403, { error:'Identidade não pareada.' })
    const {root:partial,completedSources,failedSources}=await loadPartialAgendaRoot(query.get('sources')?.split(','))
    const root=partial as RawRoot
    const master = root.master?.pessoas ?? {}
    if (!master[masterId] || master[masterId].active === false) return json(403, { error:'Pessoa inativa ou não encontrada.' })
    const currentPerson = master[masterId]
    const today = fortalezaToday()
    const allowed=Object.fromEntries(['tarefas','oradores','limpeza','escala','servicoCampo'].map(source=>[source,completedSources.includes(source)]))
    const events = eventsInFeedWindow(collectAgendaEvents(root, masterId,allowed), today).map(publicAgendaEvent).filter(item => item !== null)
    const announcements = eventsInFeedWindow(collectAnnouncementEvents(root,allowed), today).map(publicAnnouncementEvent).filter(item => item !== null)
    return json(200, {
      masterId, person:{ name:currentPerson.name, active:currentPerson.active }, events, announcements,completedSources,failedSources,
      agenda:{ config:publicAgendaConfig(root.agenda?.config), documentos:publicAgendaDocuments(root.agenda?.documentos) },
    })
  } catch { return json(503, { error:'Não foi possível sincronizar a agenda.' }) }
}
