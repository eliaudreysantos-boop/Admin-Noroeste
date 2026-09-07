import type { EscalaAvailability, EscalaParticipant, EscalaTables } from './escala-domain'

export interface EscalaMigrationData {
  participants?: Record<string, EscalaParticipant>
  availability?: EscalaAvailability
  tables?: EscalaTables
  [key: string]: unknown
}

export interface EscalaMigrationConflict {
  masterId: string
  field: string
  values: unknown[]
  legacyIds: string[]
}

export interface EscalaMigrationPlan {
  migrated: EscalaMigrationData
  idMap: Record<string, string>
  conflicts: EscalaMigrationConflict[]
  stats: {
    legacyProfiles: number
    canonicalProfiles: number
    duplicateProfilesMerged: number
    availabilityEntriesMerged: number
    tableReferencesRemapped: number
  }
  canApply: boolean
}

const IDENTITY_FIELDS = new Set(['name', 'phone', 'sex', 'masterId', 'legacyId'])
const MERGED_FIELDS = new Set([
  'active', 'availabilityUpdatedAt', 'onlyWithId', 'updatedAt', 'sortOrder',
  'pioneer', 'withChild', 'child', 'sameSexOnly', 'sameSex',
])

function distinct(values: unknown[]): unknown[] {
  const seen = new Set<string>()
  return values.filter(value => {
    const key = JSON.stringify(value)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function latestValue(profiles: EscalaParticipant[], field: 'availabilityUpdatedAt' | 'updatedAt'): string | number | null | undefined {
  return profiles.map(profile => profile[field]).filter(value => value !== undefined && value !== null && value !== '')
    .sort((a, b) => String(b).localeCompare(String(a)))[0]
}

function remap(id: string | undefined, idMap: Record<string, string>): string {
  return id ? (idMap[id] ?? id) : ''
}

export function planEscalaIdMigration(data: EscalaMigrationData): EscalaMigrationPlan {
  const sourceParticipants = data.participants ?? {}
  const groups = new Map<string, Array<[string, EscalaParticipant]>>()
  const idMap: Record<string, string> = {}
  const conflicts: EscalaMigrationConflict[] = []

  for (const [legacyId, profile] of Object.entries(sourceParticipants)) {
    const masterId = profile.masterId || legacyId
    idMap[legacyId] = masterId
    const group = groups.get(masterId) ?? []
    group.push([legacyId, profile])
    groups.set(masterId, group)
  }

  const participants: Record<string, EscalaParticipant> = {}
  for (const [masterId, entries] of groups) {
    const profiles = entries.map(([, profile]) => profile)
    const legacyIds = entries.map(([id]) => id)
    const result: EscalaParticipant = {
      masterId,
      active: profiles.some(profile => profile.active !== false),
      pioneer: profiles.some(profile => profile.pioneer === true),
      withChild: profiles.some(profile => profile.withChild === true || profile.child === true),
      sameSexOnly: profiles.some(profile => profile.sameSexOnly === true || profile.sameSex === true),
    }
    const fields = new Set(profiles.flatMap(profile => Object.keys(profile)))

    for (const field of fields) {
      if (IDENTITY_FIELDS.has(field) || MERGED_FIELDS.has(field)) continue
      const values = distinct(profiles.map(profile => profile[field]).filter(value => value !== undefined))
      if (values.length === 1) result[field] = values[0]
      else if (values.length > 1) conflicts.push({ masterId, field, values, legacyIds })
    }

    result.availabilityUpdatedAt = latestValue(profiles, 'availabilityUpdatedAt')
    result.updatedAt = latestValue(profiles, 'updatedAt')
    const partners = distinct(profiles.map(profile => remap(profile.onlyWithId, idMap)).filter(Boolean)) as string[]
    if (partners.length === 1) result.onlyWithId = partners[0]
    else if (partners.length > 1) conflicts.push({ masterId, field: 'onlyWithId', values: partners, legacyIds })
    participants[masterId] = result
  }

  let availabilityEntriesMerged = 0
  const availability: EscalaAvailability = {}
  for (const [localId, byPerson] of Object.entries(data.availability ?? {})) {
    availability[localId] = {}
    for (const [legacyId, marks] of Object.entries(byPerson)) {
      const masterId = remap(legacyId, idMap)
      const target = availability[localId]![masterId] ?? {}
      for (const [slot, enabled] of Object.entries(marks)) {
        if (enabled && target[slot] !== true) availabilityEntriesMerged += 1
        target[slot] = target[slot] === true || enabled === true
      }
      availability[localId]![masterId] = target
    }
  }

  let tableReferencesRemapped = 0
  const tables = structuredClone(data.tables ?? {})
  for (const byMonth of Object.values(tables)) {
    for (const table of Object.values(byMonth)) {
      for (const row of Object.values(table.rows ?? {})) {
        for (const cell of Object.values(row.slots ?? {})) {
          const nextP1 = remap(cell.p1, idMap), nextP2 = remap(cell.p2, idMap)
          if (nextP1 !== cell.p1) tableReferencesRemapped += 1
          if (nextP2 !== cell.p2) tableReferencesRemapped += 1
          cell.p1 = nextP1; cell.p2 = nextP2
        }
      }
    }
  }

  const migrated = structuredClone(data)
  migrated.participants = participants
  migrated.availability = availability
  migrated.tables = tables
  return {
    migrated, idMap, conflicts,
    stats: {
      legacyProfiles: Object.keys(sourceParticipants).length,
      canonicalProfiles: Object.keys(participants).length,
      duplicateProfilesMerged: Object.keys(sourceParticipants).length - Object.keys(participants).length,
      availabilityEntriesMerged,
      tableReferencesRemapped,
    },
    canApply: conflicts.length === 0,
  }
}
