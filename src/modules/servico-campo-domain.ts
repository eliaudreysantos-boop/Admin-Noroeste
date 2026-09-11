export interface FieldServiceTemplate {
  id: string
  label: string
  dow: number
  time: string
  location: string
  active: boolean
  sortOrder: number
  importedFromEscala?: boolean
}

export interface FieldServiceAssignment {
  id: string
  templateId: string
  date: string
  time: string
  location: string
  label: string
  leaderId: string
  manual?: boolean
}

export interface FieldServicePeriod {
  month: string
  assignments: Record<string, FieldServiceAssignment>
  published: boolean
  generatedAt?: string
  publishedAt?: string
}

interface EscalaLocalLike {
  active?: boolean
  name?: string
  daysActive?: number[]
  slots?: string[]
  startTime?: string
  start?: string
}

export interface FieldServiceSuggestion {
  id: string
  dow: number
  time: string
  location: string
}

const validMonth = (month: string): boolean => /^\d{4}-\d{2}$/.test(month)
const validTime = (time: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(time)

export function datesForDow(month: string, dow: number): string[] {
  if (!validMonth(month) || !Number.isInteger(dow) || dow < 0 || dow > 6) return []
  const [year, monthNumber] = month.split('-').map(Number)
  const total = new Date(year, monthNumber, 0).getDate()
  const result: string[] = []
  for (let day = 1; day <= total; day += 1) {
    if (new Date(year, monthNumber - 1, day).getDay() !== dow) continue
    result.push(`${month}-${String(day).padStart(2, '0')}`)
  }
  return result
}

export function suggestionsFromEscala(locals: Record<string, EscalaLocalLike>): FieldServiceSuggestion[] {
  const result: FieldServiceSuggestion[] = []
  Object.entries(locals)
    .filter(([, local]) => local.active !== false)
    .sort((a, b) => String(a[1].name ?? a[0]).localeCompare(String(b[1].name ?? b[0]), 'pt-BR'))
    .forEach(([localId, local]) => {
      const location = String(local.name ?? localId).trim()
      const times = [...new Set((local.slots?.length ? local.slots : [String(local.startTime ?? local.start ?? '')]).filter(validTime))].sort()
      const days = [...new Set((local.daysActive ?? []).filter(dow => Number.isInteger(dow) && dow >= 0 && dow <= 6))].sort()
      for (const dow of days) for (const time of times) result.push({ id:`${localId}|${dow}|${time}`, dow, time, location })
    })
  return result
}

function existingCounts(periods: Record<string, FieldServicePeriod>, month: string): Record<string, number> {
  const counts: Record<string, number> = {}
  Object.values(periods).filter(period => period.month !== month).forEach(period => {
    Object.values(period.assignments ?? {}).forEach(assignment => {
      if (assignment.leaderId) counts[assignment.leaderId] = (counts[assignment.leaderId] ?? 0) + 1
    })
  })
  return counts
}

export function generateFieldServicePeriod(input: {
  month: string
  templates: Record<string, FieldServiceTemplate>
  leaderIds: string[]
  periods?: Record<string, FieldServicePeriod>
  existing?: FieldServicePeriod
  now?: string
}): FieldServicePeriod {
  const leaders = [...new Set(input.leaderIds.filter(Boolean))]
  const counts = existingCounts(input.periods ?? {}, input.month)
  leaders.forEach(id => { counts[id] ??= 0 })
  const previous = input.existing?.assignments ?? {}
  const assignments: Record<string, FieldServiceAssignment> = Object.fromEntries(
    Object.entries(previous).filter(([, assignment]) => assignment.manual === true),
  )
  const usedByDate = new Map<string, Set<string>>()
  Object.values(assignments).forEach(assignment => {
    if (!assignment.leaderId) return
    counts[assignment.leaderId] = (counts[assignment.leaderId] ?? 0) + 1
    const used = usedByDate.get(assignment.date) ?? new Set<string>(); used.add(assignment.leaderId); usedByDate.set(assignment.date, used)
  })

  const templates = Object.values(input.templates).filter(template => template.active !== false && validTime(template.time) && template.location.trim()).sort((a, b) => a.sortOrder - b.sortOrder || a.dow - b.dow || a.time.localeCompare(b.time) || a.location.localeCompare(b.location, 'pt-BR'))
  for (const template of templates) {
    for (const date of datesForDow(input.month, template.dow)) {
      const id = `${date}-${template.id}`
      const old = previous[id]
      if (old) {
        assignments[id] = { ...old, id, templateId:template.id, date, time:template.time, location:template.location, label:template.label || 'Saída de campo' }
        if (old.leaderId) {
          counts[old.leaderId] = (counts[old.leaderId] ?? 0) + 1
          const used = usedByDate.get(date) ?? new Set<string>(); used.add(old.leaderId); usedByDate.set(date, used)
        }
        continue
      }
      const used = usedByDate.get(date) ?? new Set<string>()
      const available = leaders.filter(id => !used.has(id))
      const candidates = available.length ? available : leaders
      const leaderId = [...candidates].sort((a, b) => (counts[a] ?? 0) - (counts[b] ?? 0) || leaders.indexOf(a) - leaders.indexOf(b))[0] ?? ''
      assignments[id] = { id, templateId:template.id, date, time:template.time, location:template.location, label:template.label || 'Saída de campo', leaderId }
      if (leaderId) { counts[leaderId] = (counts[leaderId] ?? 0) + 1; used.add(leaderId); usedByDate.set(date, used) }
    }
  }
  return { month:input.month, assignments, published:false, generatedAt:input.now ?? new Date().toISOString() }
}

export function publishedFieldServiceAssignments(value: unknown): FieldServiceAssignment[] {
  if (!value || typeof value !== 'object') return []
  const periods = (value as { periods?: Record<string, FieldServicePeriod> }).periods ?? {}
  return Object.values(periods).filter(period => period.published === true).flatMap(period => Object.values(period.assignments ?? {})).filter(assignment => /^\d{4}-\d{2}-\d{2}$/.test(assignment.date) && validTime(assignment.time)).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.location.localeCompare(b.location, 'pt-BR'))
}
