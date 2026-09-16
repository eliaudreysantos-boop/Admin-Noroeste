import type { MasterPessoa, RawRoot } from '../../src/types.ts'
import { collectAgendaEvents, collectAnnouncementEvents, eventsInFeedWindow } from '../../src/modules/individual-domain.ts'
import type { SecretaryPublisher, SecretaryReport } from '../../src/modules/secretario-domain.ts'
import { adminDatabase } from '../lib/subscription-store.ts'
import { appSession, deviceSession, json } from '../lib/secure-session.ts'
import { publicAgendaConfig, publicAgendaDocuments, publicAgendaEvent, publicAnnouncementEvent } from '../lib/agenda-public.ts'

const paths = [
  'master/pessoas', 'tarefas/people', 'tarefas/scale/periods', 'tarefas/discursos/oradores',
  'tarefas/discursos/programacao', 'tarefas/discursos/congregacoes', 'limpeza/periodos',
  'escala/participants', 'escala/scales', 'escala/tables', 'escala/publishedMonth',
  'escala/publishedMonths', 'escala/publishedSnapshots', 'programacao', 'secretario',
  'agenda/config', 'agenda/documentos', 'servicoCampo', 'master/config', 'escala/settings',
] as const

export default async (request: Request): Promise<Response> => {
  if (request.method !== 'GET') return json(405, { error:'Método não permitido.' })
  try {
    const device = await deviceSession(request)
    const session = device ? null : await appSession(request)
    const masterId = device?.masterId ?? session?.usuario.masterId ?? ''
    if (!masterId) return json(403, { error:'Identidade não pareada.' })
    const values = await Promise.all(paths.map(path => adminDatabase().ref(path).get().then(snapshot => snapshot.exists() ? snapshot.val() as unknown : undefined)))
    const master = (values[0] ?? {}) as Record<string, MasterPessoa>
    if (!master[masterId] || master[masterId].active === false) return json(403, { error:'Pessoa inativa ou não encontrada.' })
    const safePeople = Object.fromEntries(Object.entries(master).map(([id, person]) => [id, { name:person.name, active:person.active, sex:person.sex, role:person.role, whatsapp:'', limpeza:{ grupo:null } }]))
    const secretary = (values[14] ?? {}) as Record<string, unknown>
    const publishers = (secretary['publicadores'] ?? {}) as Record<string, SecretaryPublisher>
    const reports = (secretary['relatorios'] ?? {}) as Record<string, SecretaryReport>
    const ownPublishers = Object.fromEntries(Object.entries(publishers).filter(([, item]) => item.masterId === masterId))
    const ownReports = Object.fromEntries(Object.entries(reports).filter(([, item]) => item.masterId === masterId))
    const root: RawRoot = {
      master:{ pessoas:safePeople, config:values[18] as NonNullable<RawRoot['master']>['config'] },
      tarefas:{ people:values[1], scale:{ periods:values[2] }, discursos:{ oradores:values[3], programacao:values[4], congregacoes:values[5] } },
      limpeza:{ periodos:values[6] },
      escala:{ participants:values[7], scales:values[8], tables:values[9], settings:values[19], publishedMonth:values[10], publishedMonths:values[11], publishedSnapshots:values[12] },
      programacao:values[13] as Record<string, unknown>,
      secretario:{ publicadores:ownPublishers, relatorios:ownReports, fechamentos:secretary['fechamentos'] ?? {} },
      agenda:{ config:values[15], documentos:values[16] },
      servicoCampo:values[17] as Record<string, unknown>,
    }
    const today = new Intl.DateTimeFormat('en-CA', { timeZone:'America/Fortaleza', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date()).replace(/\//g, '-')
    const events = eventsInFeedWindow(collectAgendaEvents(root, masterId), today).map(publicAgendaEvent).filter(item => item !== null)
    const announcements = eventsInFeedWindow(collectAnnouncementEvents(root), today).map(publicAnnouncementEvent).filter(item => item !== null)
    const currentPerson = safePeople[masterId]
    return json(200, {
      masterId, person:{ name:currentPerson.name, active:currentPerson.active }, events, announcements,
      secretary:{ publicadores:ownPublishers, relatorios:ownReports, fechamentos:secretary['fechamentos'] ?? {} },
      agenda:{ config:publicAgendaConfig(values[15]), documentos:publicAgendaDocuments(values[16]) },
    })
  } catch { return json(503, { error:'Não foi possível sincronizar a agenda.' }) }
}
