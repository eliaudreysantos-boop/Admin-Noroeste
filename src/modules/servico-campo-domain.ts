export interface FieldServiceTemplate {
  id: string
  label: string
  dow: number
  time: string
  location: string
  active: boolean
  sortOrder: number
  leaderIds?: string[]
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

export const validFieldServiceMonth = (month: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
export const validFieldServiceTime = (time: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(time)

export function datesForDow(month: string, dow: number): string[] {
  if (!validFieldServiceMonth(month) || !Number.isInteger(dow) || dow < 0 || dow > 6) return []
  const [year, monthNumber] = month.split('-').map(Number)
  const total = new Date(year, monthNumber, 0).getDate()
  const result: string[] = []
  for (let day = 1; day <= total; day += 1) {
    if (new Date(year, monthNumber - 1, day).getDay() !== dow) continue
    result.push(`${month}-${String(day).padStart(2, '0')}`)
  }
  return result
}

function existingCounts(periods: Record<string, FieldServicePeriod>, month: string): Record<string, number> {
  const counts: Record<string, number> = {}
  Object.values(periods).filter(period => validFieldServiceMonth(period.month) && period.month < month).forEach(period => {
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

  const templates = Object.values(input.templates).filter(template => template.active !== false && validFieldServiceTime(template.time) && template.location.trim()).sort((a, b) => (Number.isFinite(a.sortOrder) ? a.sortOrder : 0) - (Number.isFinite(b.sortOrder) ? b.sortOrder : 0) || a.dow - b.dow || a.time.localeCompare(b.time) || a.location.localeCompare(b.location, 'pt-BR'))
  const generatedKeys = new Set<string>()
  for (const template of templates) {
    const templateLeaders = (template.leaderIds?.length ? template.leaderIds.filter(id => leaders.includes(id)) : leaders)
    for (const date of datesForDow(input.month, template.dow)) {
      const occurrenceKey = `${date}|${template.time}|${template.location.trim().toLocaleLowerCase('pt-BR')}`
      if (generatedKeys.has(occurrenceKey)) continue
      generatedKeys.add(occurrenceKey)
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
      const available = templateLeaders.filter(id => !used.has(id))
      const candidates = available.length ? available : templateLeaders
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
  return Object.values(periods).filter(period => period.published === true && validFieldServiceMonth(period.month)).flatMap(period => Object.values(period.assignments ?? {}).filter(assignment => assignment.date.startsWith(`${period.month}-`))).filter(assignment => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(assignment.date) && validFieldServiceTime(assignment.time)).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.location.localeCompare(b.location, 'pt-BR'))
}
