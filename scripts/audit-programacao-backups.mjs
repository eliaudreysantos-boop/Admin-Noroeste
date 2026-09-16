import { readFileSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const [backupPath, androidPath, reportPath] = process.argv.slice(2)
if (!backupPath || !androidPath || !reportPath) throw new Error('Informe JSON atual, backup Android e caminho do relatorio.')
const backup = JSON.parse(readFileSync(backupPath, 'utf8'))
const db = new DatabaseSync(androidPath, { readOnly: true })
const profiles = backup.programacao.pessoas ?? {}
const people = backup.master.pessoas ?? {}
const programs = Object.values(backup.programacao.programs ?? {})
const partsOf = program => Object.values(program.parts ?? {})
const normalized = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
const roles = [
  ['presidente', 'idChairmanLAMM', /^(presidente|presidencia)/],
  ['oracao-inicial', 'idPrayerO', /oracao.*(inicial|abertura)/],
  ['oracao-final', 'idPrayerC', /oracao.*(final|encerramento)/],
  ['leitor', 'idReaderBS', /^leitor/],
]
const students = new Map(db.prepare('SELECT _id, FirstName, LastName FROM students').all()
  .map(row => [row._id, [row.FirstName, row.LastName].filter(Boolean).join(' ')]))
const weeks = db.prepare('SELECT * FROM midweek_assignments').all()
const civilDate = row => `${row.Year}-${String(row.Month + 1).padStart(2, '0')}-${String(row.Day).padStart(2, '0')}`
const byDate = new Map()
for (const program of programs) {
  const list = byDate.get(program.meetingDate) ?? []
  list.push(program)
  byDate.set(program.meetingDate, list)
}
const unlinkedProfiles = Object.entries(profiles).filter(([id, profile]) => !people[profile.masterId || id])
  .map(([id, profile]) => ({ profileId: id, masterId: profile.masterId || id, name: profile._nome_debug ?? '', references: programs.flatMap(program => partsOf(program)
    .filter(part => ['assignedPersonId', 'assistantPersonId', 'realizedPersonId', 'substitutePersonId'].some(field => part[field] === id))
    .map(part => ({ date: program.meetingDate, partId: part.id, title: part.title }))) }))
const missingWeeks = []
const comparisons = []
for (const week of weeks) {
  const date = civilDate(week)
  const current = byDate.get(date) ?? []
  if (!current.length) missingWeeks.push({ androidWeekId: week._id, date })
  for (const [role, field, pattern] of roles) {
    if (!(week[field] > 0)) continue
    const existing = current.flatMap(partsOf).filter(part => pattern.test(normalized(part.title)))
    const assigned = existing.filter(part => part.assignedPersonId)
    comparisons.push({ date, androidWeekId: week._id, role, androidStudentId: week[field], androidName: students.get(week[field]) ?? '',
      status: !current.length ? 'sem-semana' : !existing.length ? 'sem-parte' : !assigned.length ? 'sem-designado' : 'comparar-identidade',
      current: existing.map(part => {
        const profile = profiles[part.assignedPersonId]
        const masterId = profile?.masterId || part.assignedPersonId
        return { partId: part.id, profileId: part.assignedPersonId ?? null, masterId: masterId ?? null, name: people[masterId]?.name ?? profile?._nome_debug ?? '', linked: Boolean(people[masterId]) }
      }) })
  }
}
const report = {
  sources: { backupPath, androidPath },
  dateConvention: 'Android Month e baseado em zero; comparacao usa Day/Month/Year da reuniao.',
  summary: { currentPrograms: programs.length, androidWeeks: weeks.length, profiles: Object.keys(profiles).length, unlinkedProfiles: unlinkedProfiles.length, missingWeeks: missingWeeks.length,
    missingRolesInExistingWeeks: comparisons.filter(item => item.status === 'sem-parte').length,
    rolesWithoutAssignee: comparisons.filter(item => item.status === 'sem-designado').length },
  unlinkedProfiles, missingWeeks,
  duplicateDates: [...byDate].filter(([, items]) => items.length > 1).map(([date, items]) => ({ date, ids: items.map(item => item.id) })),
  comparisons,
  note: 'Relatorio somente de leitura. Nomes servem para revisao; nao autorizam vinculacao automatica. Diferencas nao comprovam perda: podem refletir edicoes e exclusoes posteriores.',
}
db.close()
writeFileSync(reportPath, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report.summary, null, 2))
