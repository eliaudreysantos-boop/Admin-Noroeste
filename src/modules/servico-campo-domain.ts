export interface FieldServiceTemplate {
  id: string
  label: string
  dow: number
  time: string
  location: string
  active: boolean
  sortOrder: number
  leaderIds?: string[]
  date?: string
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

export function fieldServiceConflicts(assignments:FieldServiceAssignment[]):FieldServiceAssignment[] {
  return assignments.filter((item,index)=>Boolean(item.leaderId)&&assignments.some((other,otherIndex)=>otherIndex!==index&&other.leaderId===item.leaderId&&other.date===item.date&&other.time===item.time))
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

function existingCounts(periods: Record<string, FieldServicePeriod>, month: string, templateId: string): Record<string, number> {
  const counts: Record<string, number> = {}
  Object.values(periods).filter(period => validFieldServiceMonth(period.month) && period.month < month).forEach(period => {
    Object.values(period.assignments ?? {}).forEach(assignment => {
      if (assignment.templateId === templateId && assignment.leaderId) counts[assignment.leaderId] = (counts[assignment.leaderId] ?? 0) + 1
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
  const previous = input.existing?.assignments ?? {}
  const assignments: Record<string, FieldServiceAssignment> = Object.fromEntries(
    Object.entries(previous).filter(([, assignment]) => assignment.manual === true),
  )

  const templates = Object.values(input.templates).filter(template => template.active !== false && validFieldServiceTime(template.time) && template.location.trim()).sort((a, b) => (Number.isFinite(a.sortOrder) ? a.sortOrder : 0) - (Number.isFinite(b.sortOrder) ? b.sortOrder : 0) || a.dow - b.dow || a.time.localeCompare(b.time) || a.location.localeCompare(b.location, 'pt-BR'))
  for (const template of templates) {
    const counts = existingCounts(input.periods ?? {}, input.month, template.id)
    const templateLeaders = [...new Set((template.leaderIds ?? []).filter(id => leaders.includes(id)))]
    const dates = template.date
      ? (template.date.startsWith(`${input.month}-`) && /^\d{4}-\d{2}-\d{2}$/.test(template.date) && !Number.isNaN(Date.parse(`${template.date}T12:00:00Z`)) && new Date(`${template.date}T12:00:00Z`).toISOString().slice(0, 10) === template.date ? [template.date] : [])
      : datesForDow(input.month, template.dow)
    for (const date of dates) {
      const id = `${date}-${template.id}`
      const old = previous[id]
      if (old) {
        assignments[id] = { ...old, id, templateId:template.id, date, time:template.time, location:template.location, label:template.label || 'Saída de campo' }
        if (old.leaderId) {
          counts[old.leaderId] = (counts[old.leaderId] ?? 0) + 1
        }
        continue
      }
      const leaderId = templateLeaders.filter(id=>![...Object.values(assignments),...Object.values(previous)].some(item=>item.leaderId===id&&item.date===date&&item.time===template.time)).sort((a, b) => (counts[a] ?? 0) - (counts[b] ?? 0) || templateLeaders.indexOf(a) - templateLeaders.indexOf(b))[0] ?? ''
      assignments[id] = { id, templateId:template.id, date, time:template.time, location:template.location, label:template.label || 'Saída de campo', leaderId }
      if (leaderId) counts[leaderId] = (counts[leaderId] ?? 0) + 1
    }
  }
  return { month:input.month, assignments, published:false, generatedAt:input.now ?? new Date().toISOString() }
}

export function publishedFieldServiceAssignments(value: unknown): FieldServiceAssignment[] {
  if (!value || typeof value !== 'object') return []
  const periods = (value as { periods?: Record<string, FieldServicePeriod> }).periods ?? {}
  return Object.values(periods).filter(period => period.published === true && validFieldServiceMonth(period.month)).flatMap(period => Object.values(period.assignments ?? {}).filter(assignment => assignment.date.startsWith(`${period.month}-`))).filter(assignment => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(assignment.date) && validFieldServiceTime(assignment.time)).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.location.localeCompare(b.location, 'pt-BR'))
}
