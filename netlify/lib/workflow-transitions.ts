import { closureSnapshot, records, reportLastEditedBy, type SecretaryReport } from '../../src/modules/secretario-domain.ts'
import { conditionalValue } from './conditional-write.ts'

export function transitionMonth(current: unknown, month: string, expected: unknown, close: boolean, now: string): Record<string, unknown> | undefined {
  const root = records(current)
  if (conditionalValue(closureSnapshot(root, month), expected, true) !== true) return undefined
  const closings = records<Record<string, unknown>>(root['fechamentos']), previous = closings[month] ?? {}
  if (Boolean(previous['fechadoEm']) === close) return undefined
  const closing = close ? { ...previous, fechadoEm:now, enviadoEm:now } : { ...previous, fechadoEm:null, reabertoEm:now }
  const reports = Object.fromEntries(Object.entries(records<SecretaryReport>(root['relatorios'])).map(([id, report]) => [id, report.competencia === month ? { ...report, status:close ? 'fechado' : reportLastEditedBy(report) === 'secretario' ? 'revisado' : 'enviado' } : report]))
  return { ...root, fechamentos:{ ...closings, [month]:closing }, relatorios:reports }
}

export function removeUnusedParticipant(current: unknown, id: string, expected: unknown): Record<string, unknown> | undefined {
  const root = records(current), profiles = records<Record<string, unknown>>(root['participants'])
  if (!profiles[id] || conditionalValue(profiles[id], expected, true) !== true) return undefined
  const used = (value: unknown): boolean => {
    if (!value || typeof value !== 'object') return false
    const object = value as Record<string, unknown>
    return object['p1'] === id || object['p2'] === id || Object.values(object).some(used)
  }
  if (used(root['tables']) || used(root['publishedSnapshots'])) return undefined
  const participants = Object.fromEntries(Object.entries(profiles).filter(([key]) => key !== id).map(([key, profile]) => {
    const next = { ...profile }
    if (next['onlyWithId'] === id) delete next['onlyWithId']
    return [key, next]
  }))
  const availability = Object.fromEntries(Object.entries(records(root['availability'])).map(([key, value]) => [key, Object.fromEntries(Object.entries(records(value)).filter(([person]) => person !== id))]))
  return { ...root, participants, availability }
}
