import { conditionalValue } from './conditional-write.ts'
const records = <T = unknown>(value: unknown): Record<string, T> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, T> : {}

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
