import type { PublisherCategory, SecretaryReport } from '../../src/modules/secretario-domain.ts'
import { canonicalReportId, isClosedMonth, isReportLate, matchingReports, records, reportCreatedBy, validSecretaryDate } from '../../src/modules/secretario-domain.ts'
import { adminDatabase } from '../lib/subscription-store.ts'
import { appSession, deviceSession, json, objectBody, validCsrf } from '../lib/secure-session.ts'

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
    ...(typeof value['submissionId'] === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value['submissionId']) ? { submissionId:value['submissionId'] } : previous?.submissionId ? { submissionId:previous.submissionId } : {}),
  }
}

export default async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') return json(405, { error:'Método não permitido.' })
  const body = await objectBody(request)
  const mode = body['mode']
  let masterId = '', createdBy: 'pessoa' | 'secretario' = 'pessoa', previousId = ''
  if (mode === 'admin') {
    const session = await appSession(request)
    if (!session || (!session.usuario.apps.mestre && !session.usuario.apps.secretario)) return json(403, { error:'Acesso negado.' })
    if (!validCsrf(request, session)) return json(403, { error:'Validação da sessão ausente.' })
    masterId = String(body['masterId'] ?? '')
    previousId = String(body['previousId'] ?? '')
    createdBy = 'secretario'
  } else {
    const device = await deviceSession(request)
    const session = device ? null : await appSession(request)
    if (session && !validCsrf(request, session)) return json(403, { error:'Validação da sessão ausente.' })
    masterId = device?.masterId ?? session?.usuario.masterId ?? ''
    if (!masterId) return json(403, { error:'Aparelho não pareado.' })
  }
  if (!/^m_[A-Za-z0-9_-]+$/.test(masterId)) return json(400, { error:'Pessoa inválida.' })

  try {
    const reference = adminDatabase().ref('secretario')
    let resultReport: SecretaryReport | null = null
    const transaction = await reference.transaction(current => {
      const root = records(current), publishers = records<Record<string, unknown>>(root['publicadores'])
      const publisher = Object.values(publishers).find(item => item['masterId'] === masterId && item['ativo'] !== false)
      if (!publisher) return
      const competence = String(body['report'] && typeof body['report'] === 'object' ? (body['report'] as Record<string, unknown>)['competencia'] ?? '' : '')
      if (isClosedMonth(competence, root['fechamentos'])) return
      const reports = records<SecretaryReport>(root['relatorios'])
      if (matchingReports(reports, masterId, competence).some(([id]) => createdBy === 'pessoa' || id !== previousId)) return
      const previous = previousId ? reports[previousId] : undefined
      if (previousId && (!previous || previous.masterId !== masterId || previous.competencia !== competence)) return
      const rawCategory = String(publisher['categoria'] ?? 'publicador')
      const categories = new Set<PublisherCategory>(['publicador', 'pioneiro_auxiliar', 'pioneiro_regular', 'pioneiro_especial', 'missionario'])
      const category: PublisherCategory = categories.has(rawCategory as PublisherCategory) ? rawCategory as PublisherCategory : 'publicador'
      const report = cleanReport(records(body['report']), masterId, category, createdBy, previous)
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
