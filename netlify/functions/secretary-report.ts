import type { PublisherCategory, SecretaryReport } from '../../src/modules/secretario-domain.ts'
import { canonicalReportId, isClosedMonth, isReportLate, matchingReports, records, reportCreatedBy, validSecretaryDate } from '../../src/modules/secretario-domain.ts'
import { adminDatabase } from '../lib/subscription-store.ts'
import { appSession, deviceSession, json, objectBody, validCsrf } from '../lib/secure-session.ts'

interface SecretaryReportIdentity {
  masterId: string
  createdBy: 'pessoa' | 'secretario'
  previousId: string
  csrfValid?: boolean
}

interface SecretaryReportStore {
  transaction(update: (current: unknown) => unknown | undefined, onComplete?: unknown, applyLocally?: boolean): Promise<{ committed: boolean }>
}

function validSubmissionId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value)
}

function cleanReport(value: Record<string, unknown>, masterId: string, category: SecretaryReport['categoria'], createdBy: 'pessoa' | 'secretario', previous?: SecretaryReport): SecretaryReport | null {
  const competence = String(value['competencia'] ?? '')
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competence)) return null
  const number = (item: unknown, maximum = 1000): number => Math.min(maximum, Math.max(0, Number(item) || 0))
  const today = new Intl.DateTimeFormat('en-CA', { timeZone:'America/Fortaleza', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date()).replace(/\//g, '-')
  const requestedDate = String(value['recebidoEm'] ?? '')
  const receivedAt = createdBy === 'secretario' && validSecretaryDate(requestedDate) ? requestedDate : today
  const id = canonicalReportId(masterId, competence)
  const auxiliary = category === 'pioneiro_auxiliar' || (createdBy === 'secretario' && value['pioneiroAuxiliar'] === true)
  const allowsHours = auxiliary || category === 'pioneiro_regular'
  return {
    id, masterId, competencia:competence, categoria:category,
    participou:value['participou'] !== false, estudos:number(value['estudos'], 100),
    horasCampo:allowsHours ? number(value['horasCampo']) : 0,
    horasAtividadeAprovada:createdBy === 'secretario' ? number(value['horasAtividadeAprovada']) : 0,
    creditoHoras:createdBy === 'secretario' ? number(value['creditoHoras']) : 0,
    pioneiroAuxiliar:auxiliary,
    observacoes:String(value['observacoes'] ?? '').trim().slice(0, 250),
    atrasado:isReportLate(competence, receivedAt) || (createdBy === 'secretario' && value['atrasado'] === true), recebidoEm:receivedAt, atualizadoEm:new Date().toISOString(),
    origem:previous?.origem ?? (createdBy === 'pessoa' ? 'minha_agenda' : 'secretario'),
    createdBy:previous ? reportCreatedBy(previous) : createdBy, lastEditedBy:createdBy,
    status:createdBy === 'pessoa' ? 'enviado' : 'revisado', revision:Math.max(0, Number(previous?.revision) || 0) + 1,
    ...(validSubmissionId(value['submissionId']) ? { submissionId:value['submissionId'] } : previous?.submissionId ? { submissionId:previous.submissionId } : {}),
  }
}

async function requestIdentity(request: Request, body: Record<string, unknown>): Promise<SecretaryReportIdentity | Response | null> {
  const mode = body['mode']
  if (mode === 'admin') {
    const session = await appSession(request)
    if (!session || (!session.usuario.apps.mestre && !session.usuario.apps.secretario)) return json(403, { error:'Acesso negado.' })
    return { masterId:String(body['masterId'] ?? ''), previousId:String(body['previousId'] ?? ''), createdBy:'secretario', csrfValid:validCsrf(request, session) }
  }
  const device = await deviceSession(request)
  const session = device ? null : await appSession(request)
  return { masterId:device?.masterId ?? session?.usuario.masterId ?? '', previousId:'', createdBy:'pessoa', csrfValid:session ? validCsrf(request, session) : undefined }
}

function defaultStore(): SecretaryReportStore {
  return adminDatabase().ref('secretario')
}

export async function secretaryReportResponse(
  request: Request,
  store: SecretaryReportStore = defaultStore(),
  identityResolver: (request: Request, body: Record<string, unknown>) => Promise<SecretaryReportIdentity | Response | null> = requestIdentity,
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error:'Método não permitido.' })
  const body = await objectBody(request)
  const identity = await identityResolver(request, body)
  if (identity instanceof Response) return identity
  if (!identity) return json(403, { error:'Aparelho não pareado.' })
  if (identity.csrfValid === false) return json(403, { error:'Validação da sessão ausente.' })
  const { masterId, createdBy, previousId } = identity
  if (!masterId) return json(403, { error:'Aparelho não pareado.' })
  if (!/^m_[A-Za-z0-9_-]+$/.test(masterId)) return json(400, { error:'Pessoa inválida.' })

  try {
    let resultReport: SecretaryReport | null = null
    const transaction = await store.transaction(current => {
      const root = records(current), publishers = records<Record<string, unknown>>(root['publicadores'])
      const publisher = Object.values(publishers).find(item => item['masterId'] === masterId && item['ativo'] !== false)
      if (!publisher) return
      const rawReport = records(body['report'])
      const competence = String(rawReport['competencia'] ?? '')
      if (isClosedMonth(competence, root['fechamentos'])) return
      const reports = records<SecretaryReport>(root['relatorios'])
      const existing = matchingReports(reports, masterId, competence)
      const submissionId = validSubmissionId(rawReport['submissionId']) ? rawReport['submissionId'] : ''
      const repeated = createdBy === 'pessoa' && submissionId ? existing.find(([, report]) => report.submissionId === submissionId)?.[1] : undefined
      if (repeated) { resultReport = repeated; return current }
      if (existing.some(([id]) => createdBy === 'pessoa' || id !== previousId)) return
      const previous = previousId ? reports[previousId] : undefined
      if (previousId && (!previous || previous.masterId !== masterId || previous.competencia !== competence)) return
      const rawCategory = String(publisher['categoria'] ?? 'publicador')
      const categories = new Set<PublisherCategory>(['publicador', 'pioneiro_auxiliar', 'pioneiro_regular', 'pioneiro_especial', 'missionario'])
      const category: PublisherCategory = categories.has(rawCategory as PublisherCategory) ? rawCategory as PublisherCategory : 'publicador'
      const report = cleanReport(rawReport, masterId, category, createdBy, previous)
      if (!report) return
      const nextReports = { ...reports, [report.id]:report }
      if (previousId && previousId !== report.id) delete nextReports[previousId]
      resultReport = report
      return { ...root, relatorios:nextReports }
    }, undefined, false)
    if (!transaction.committed || !resultReport) return json(409, { error:'O mês foi fechado ou já possui relatório.' })
    return json(200, { report:resultReport })
  } catch { return json(503, { error:'Não foi possível salvar o relatório.' }) }
}

export default (request: Request): Promise<Response> => secretaryReportResponse(request)
