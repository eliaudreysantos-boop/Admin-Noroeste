export type PublisherCategory = 'publicador' | 'pioneiro_auxiliar' | 'pioneiro_regular' | 'pioneiro_especial' | 'missionario'
export type MeetingKind = 'meio_semana' | 'fim_semana'
export type ReportOrigin = 'minha_agenda' | 'secretario'
export type PublisherReportState = 'recebido' | 'atrasado' | 'sem_relatorio' | 'inativo'

export interface SecretaryGroup { id: string; nome: string; superintendenteMasterId: string; ativo: boolean }
export interface SecretaryPublisher { id: string; masterId: string; categoria: PublisherCategory; grupoId: string; ativo: boolean; reativado?: boolean; surdo?: boolean; cego?: boolean; preso?: boolean }
export interface SecretaryReport {
  id: string; masterId: string; competencia: string; categoria: PublisherCategory
  participou: boolean; estudos: number; horasCampo: number; horasAtividadeAprovada: number
  creditoHoras: number; pioneiroAuxiliar: boolean; observacoes: string; atrasado: boolean
  recebidoEm: string; atualizadoEm: string; origem: ReportOrigin
}
export interface SecretaryAttendance { id: string; data: string; tipo: MeetingKind; quantidade: number; atualizadoEm: string }
export interface CongregationReportSummary {
  competencia: string; publicadores: number; estudos: number; auxiliares: number
  horasAuxiliares: number; regulares: number; horasRegulares: number
  estudosPublicadores: number; estudosAuxiliares: number; estudosRegulares: number
  atrasadosIncluidos: number; mediaFimSemana: number; enviadosEm: string
}

export const CATEGORY_LABELS: Record<PublisherCategory, string> = {
  publicador: 'Publicador', pioneiro_auxiliar: 'Pioneiro auxiliar', pioneiro_regular: 'Pioneiro regular',
  pioneiro_especial: 'Pioneiro especial', missionario: 'Missionário em campo',
}

export function records<T>(value: unknown): Record<string, T> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, T> : {}
}
export interface MonthlyActivitySummary { month: string; reports: number; participants: number; studies: number; auxiliaryHours: number; regularHours: number }

export function isClosedMonth(competence: string, closings: unknown): boolean {
  const closing = records<Record<string, unknown>>(closings)[competence]
  return Boolean(closing?.['fechadoEm'])
}

export function normalizePersonalReport(input: {
  id: string; masterId: string; competencia: string; categoria: PublisherCategory; participou: boolean
  estudos: unknown; horasCampo?: unknown; observacoes?: unknown; recebidoEm: string; atualizadoEm: string
}): SecretaryReport {
  const number = (value: unknown): number => Math.max(0, Number(value) || 0)
  const allowsHours = ['pioneiro_auxiliar', 'pioneiro_regular'].includes(input.categoria)
  return {
    id: input.id, masterId: input.masterId, competencia: input.competencia, categoria: input.categoria,
    participou: input.participou, estudos: number(input.estudos), horasCampo: allowsHours ? number(input.horasCampo) : 0,
    horasAtividadeAprovada: 0, creditoHoras: 0, pioneiroAuxiliar: input.categoria === 'pioneiro_auxiliar',
    observacoes: String(input.observacoes ?? '').trim().slice(0, 250), atrasado: isReportLate(input.competencia, input.recebidoEm),
    recebidoEm: input.recebidoEm, atualizadoEm: input.atualizadoEm, origem: 'minha_agenda',
  }
}

export function publisherReportState(publisher: SecretaryPublisher, competence: string, reportList: Record<string, SecretaryReport>): PublisherReportState {
  if (!publisher.ativo) return 'inativo'
  const report = Object.values(reportList).find(item => item.masterId === publisher.masterId && item.competencia === competence)
  if (!report) return 'sem_relatorio'
  return report.atrasado ? 'atrasado' : 'recebido'
}

export function pendingPublishers(publisherList: Record<string, SecretaryPublisher>, competence: string, reportList: Record<string, SecretaryReport>): SecretaryPublisher[] {
  return Object.values(publisherList).filter(publisher => publisherReportState(publisher, competence, reportList) === 'sem_relatorio')
}

export function nextMonth(month: string): string {
  const [year, value] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, value, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export function accountingMonth(report: SecretaryReport): string {
  return report.atrasado ? nextMonth(report.competencia) : report.competencia
}

export function isReportLate(competence: string, receivedDate: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(competence) || !/^\d{4}-\d{2}-\d{2}$/.test(receivedDate)) return false
  return receivedDate > `${nextMonth(competence)}-10`
}

export function serviceYearStart(month: string): number {
  const [year, value] = month.split('-').map(Number)
  return value >= 9 ? year : year - 1
}

export function monthsInServiceYear(startYear: number): string[] {
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(startYear, 8 + index, 1))
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  })
}

export function summarizeCongregation(
  competence: string,
  reports: Record<string, SecretaryReport>,
  attendance: Record<string, SecretaryAttendance>,
  sentAt = '',
): CongregationReportSummary {
  const included = Object.values(reports).filter(report =>
    accountingMonth(report) === competence && !['pioneiro_especial', 'missionario'].includes(report.categoria),
  )
  const active = included.filter(report => report.participou)
  const auxiliaries = active.filter(report => report.pioneiroAuxiliar || report.categoria === 'pioneiro_auxiliar')
  const regulars = active.filter(report => report.categoria === 'pioneiro_regular')
  const ordinary = active.filter(report => report.categoria === 'publicador' && !report.pioneiroAuxiliar)
  const weekend = Object.values(attendance).filter(item => item.data.startsWith(competence) && item.tipo === 'fim_semana')
  return {
    competencia: competence,
    publicadores: ordinary.length,
    estudos: included.reduce((sum, report) => sum + Math.max(0, report.estudos || 0), 0),
    auxiliares: auxiliaries.length,
    horasAuxiliares: auxiliaries.reduce((sum, report) => sum + Math.max(0, report.horasCampo || 0), 0),
    regulares: regulars.length,
    horasRegulares: regulars.reduce((sum, report) => sum + Math.max(0, report.horasCampo || 0), 0),
    estudosPublicadores: ordinary.reduce((sum, report) => sum + Math.max(0, report.estudos || 0), 0),
    estudosAuxiliares: auxiliaries.reduce((sum, report) => sum + Math.max(0, report.estudos || 0), 0),
    estudosRegulares: regulars.reduce((sum, report) => sum + Math.max(0, report.estudos || 0), 0),
    atrasadosIncluidos: included.filter(report => report.atrasado).length,
    mediaFimSemana: weekend.length ? Math.round(weekend.reduce((sum, item) => sum + item.quantidade, 0) / weekend.length) : 0,
    enviadosEm: sentAt,
  }
}

export function attendanceByMonth(attendance: Record<string, SecretaryAttendance>, kind: MeetingKind, serviceYear: number): Array<{ month: string; meetings: number; total: number; average: number }> {
  return monthsInServiceYear(serviceYear).map(month => {
    const values = Object.values(attendance).filter(item => item.tipo === kind && item.data.startsWith(month))
    const total = values.reduce((sum, item) => sum + Math.max(0, item.quantidade || 0), 0)
    return { month, meetings: values.length, total, average: values.length ? Math.round(total / values.length) : 0 }
  })
}

export function activityByServiceYear(reports: Record<string, SecretaryReport>, startYear: number): MonthlyActivitySummary[] {
  return monthsInServiceYear(startYear).map(month => {
    const items = Object.values(reports).filter(report => accountingMonth(report) === month && !['pioneiro_especial', 'missionario'].includes(report.categoria))
    const participants = items.filter(report => report.participou)
    return {
      month, reports: items.length, participants: participants.length,
      studies: items.reduce((sum, report) => sum + Math.max(0, report.estudos || 0), 0),
      auxiliaryHours: participants.filter(report => report.categoria === 'pioneiro_auxiliar' || report.pioneiroAuxiliar).reduce((sum, report) => sum + Math.max(0, report.horasCampo || 0), 0),
      regularHours: participants.filter(report => report.categoria === 'pioneiro_regular').reduce((sum, report) => sum + Math.max(0, report.horasCampo || 0), 0),
    }
  })
}

export function publisherReports(masterId: string, reports: Record<string, SecretaryReport>, startYear: number): SecretaryReport[] {
  const months = new Set(monthsInServiceYear(startYear))
  return Object.values(reports).filter(report => report.masterId === masterId && months.has(report.competencia))
}

export function archiveCanBeDeleted(id: string, archives: Record<string, { tipo?: string }>): boolean {
  if (archives[id]?.tipo !== 'S-21') return true
  return Object.values(archives).filter(item => item.tipo === 'S-21').length > 1
}
