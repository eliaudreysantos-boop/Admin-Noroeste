import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { resolve } from 'node:path'

const [backupPath, androidPath, outputPath] = process.argv.slice(2)
if (!backupPath || !androidPath || !outputPath) throw new Error('Informe backup atual, Android e arquivo de proposta.')
if ([backupPath, androidPath].some(path => resolve(path).toLowerCase() === resolve(outputPath).toLowerCase())) throw new Error('O relatorio nao pode sobrescrever uma fonte.')
const source = readFileSync(backupPath)
const backup = JSON.parse(source)
const db = new DatabaseSync(androidPath, { readOnly: true })
const profiles = backup.programacao.pessoas
const masters = backup.master.pessoas
const programs = backup.programacao.programs
const identityOperations = []
// Equivalences explicitly confirmed by the user; central names remain authoritative.
const approved = [
  { studentId: 3, profileId: 'prog_817c0902', masterId: 'm_abecd2f2' },
  { studentId: 4, profileId: 'prog_tmp_23e690dd', masterId: 'm_9ec3efa4' },
  { studentId: 88, profileId: 'prog_e7a90dc0', masterId: 'm_0332b824' },
  { studentId: 147, profileId: 'prog_b62e9870', masterId: 'm_b62e9870' },
  { studentId: 82, profileId: 'prog_tmp_4d82bc1c', masterId: 'm_d6ea2766' },
]
for (const link of approved) {
  if (!masters[link.masterId]) throw new Error(`Cadastro central ausente: ${link.masterId}`)
  const existing = profiles[link.profileId]
  if (existing) {
    if (existing.masterId !== link.masterId) identityOperations.push({ path: `programacao/pessoas/${link.profileId}/masterId`, expected: existing.masterId ?? null, proposed: link.masterId })
    profiles[link.profileId] = { ...existing, masterId: link.masterId }
  } else {
    const profile = { masterId: link.masterId, active: true, permissions: ['oracao-final'] }
    identityOperations.push({ path: `programacao/pessoas/${link.profileId}`, expected: null, proposed: profile })
    profiles[link.profileId] = profile
  }
}
// Preserve module-local IDs and histories; change only Pedro's central reference.
for (const [id, person] of Object.entries(backup.tarefas?.people ?? {})) {
  if (person.masterId === 'm_e7a90dc0') identityOperations.push({ path: `tarefas/people/${id}/masterId`, expected: person.masterId, proposed: 'm_0332b824' })
}
if (masters.m_e7a90dc0) identityOperations.push({ path: 'master/pessoas/m_e7a90dc0', expected: masters.m_e7a90dc0, proposed: null })
const roles = [
  { key: 'presidente', field: 'idChairmanLAMM', title: 'Presidente', section: 'tesouros' },
  { key: 'oracao-inicial', field: 'idPrayerO', title: 'Oração inicial', section: 'tesouros' },
  { key: 'oracao-final', field: 'idPrayerC', title: 'Oração final', section: 'vida-crista' },
  { key: 'leitor', field: 'idReaderBS', title: 'Leitor do estudo bíblico', section: 'vida-crista' },
]
const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
const dateOf = row => `${row.Year}-${String(row.Month + 1).padStart(2, '0')}-${String(row.Day).padStart(2, '0')}`
const students = new Map(db.prepare('SELECT _id, FirstName, LastName FROM students').all().map(row => [row._id, [row.FirstName, row.LastName].filter(Boolean).join(' ')]))
const weeks = db.prepare('SELECT * FROM midweek_assignments').all()
const evidence = new Map()
// Only source IDs preserved by the prior migration establish recovery links.
for (const week of weeks) {
  const current = Object.values(programs).find(item => item.meetingDate === dateOf(week))
  if (!current) continue
  for (const role of roles) {
    if (!(week[role.field] > 0)) continue
    const part = Object.values(current.parts ?? {}).find(item => item.id === `legacy-${week._id}-${role.key}`)
    const profileId = part?.assignedPersonId
    const masterId = profiles[profileId]?.masterId
    if (!masterId || !masters[masterId]) continue
    const links = evidence.get(week[role.field]) ?? new Map()
    const dates = links.get(profileId) ?? new Set()
    dates.add(current.meetingDate)
    links.set(profileId, dates)
    evidence.set(week[role.field], links)
  }
}
const confirmed = new Map()
for (const [studentId, links] of evidence) {
  if (links.size !== 1) continue
  const [profileId, dates] = [...links][0]
  if (dates.size >= 2) confirmed.set(studentId, { profileId, masterId: profiles[profileId].masterId, evidenceDates: [...dates].sort() })
}
for (const link of approved) confirmed.set(link.studentId, { profileId: link.profileId, masterId: link.masterId, evidence: 'Confirmacao expressa do usuario', evidenceDates: [] })
const operations = [], pending = [], ignoredWeeks = [], ignoredHistoricalAssignments = []
for (const week of weeks) {
  const date = dateOf(week)
  const matches = Object.entries(programs).filter(([, item]) => item.meetingDate === date)
  if (matches.length !== 1) {
    if (!matches.length) ignoredWeeks.push({ date, androidWeekId: week._id, reason: 'Ignorar por instrucao do usuario; nao recriar.' })
    else pending.push({ date, reason: 'data-duplicada', androidWeekId: week._id })
    continue
  }
  const [key, current] = matches[0]
  const originalParts = current.parts ?? []
  const parts = structuredClone(Object.values(originalParts))
  for (const role of roles) {
    const studentId = week[role.field]
    if (!(studentId > 0)) continue
    const match = parts.find(part => part.id === `legacy-${week._id}-${role.key}` || norm(part.title) === norm(role.title)
      || (role.key === 'leitor' && /^leitor\b/.test(norm(part.title))))
    if (match?.assignedPersonId || match?.realizedPersonId || match?.substitutePersonId) continue
    if (date < '2026-09-15') {
      ignoredHistoricalAssignments.push({ date, role: role.key, androidStudentId: studentId, reason: 'Designacoes antigas irrelevantes conforme instrucao do usuario.' })
      continue
    }
    const link = confirmed.get(studentId)
    if (!link || current.type === 'assembleia' || current.type === 'celebracao') {
      pending.push({ date, role: role.key, androidStudentId: studentId, androidName: students.get(studentId), reason: !link ? 'vinculo-sem-evidencia-suficiente' : 'semana-especial' })
      continue
    }
    if (match) {
      // A cleared current assignment may be an intentional edit.
      pending.push({ date, role: role.key, androidStudentId: studentId, androidName: students.get(studentId), suggestedLink: link, reason: 'designacao-vazia-requer-revisao' })
      continue
    }
    const part = { id: `${current.id}-manual-${role.key}`, title: role.title, section: role.section, durationMinutes: 1, assignedPersonId: link.profileId, roomId: 'main', status: 'programado' }
    if (role.key === 'presidente' || role.key === 'oracao-inicial') parts.splice(role.key === 'presidente' ? 0 : 1, 0, part)
    else parts.push(part)
  }
  if (JSON.stringify(Object.values(originalParts)) !== JSON.stringify(parts)) operations.push({ path: `programacao/programs/${key}/parts`, expected: originalParts, proposed: parts })
}
const candidateLinks = Object.entries(profiles).filter(([id, profile]) => !masters[profile.masterId || id]).map(([id, profile]) => {
  const tokens = norm(profile._nome_debug).split(/\W+/).filter(token => token.length > 2)
  const candidates = Object.entries(masters).map(([masterId, person]) => {
    const nameTokens = norm(person.name).split(/\W+/)
    const common = tokens.filter(token => nameTokens.includes(token))
    return { masterId, name: person.name, commonTokens: common, score: common.length + (tokens[0] === nameTokens[0] ? 2 : 0) }
  }).filter(item => item.score >= 2).sort((a, b) => b.score - a.score).slice(0, 3)
  return { profileId: id, legacyName: profile._nome_debug, candidates, status: 'revisao-humana-necessaria' }
})
const proposal = { format: 'PROPOSTA-NAO-IMPORTAR-NA-RAIZ', sourceSha256: createHash('sha256').update(source).digest('hex'), androidSha256: createHash('sha256').update(readFileSync(androidPath)).digest('hex'),
  notes: ['Nenhuma gravacao remota.', 'Antes de aplicar, comparar expected com os dados atuais.', 'Nao sobrescrever divergencias nem restaurar automaticamente campos esvaziados.', 'Datas passadas nao provam realizacao; nenhum realizadoPersonId e criado.', 'Candidatos por nome nao integram as operacoes propostas.'],
  summary: { confirmedStudentLinks: confirmed.size, identityOperations: identityOperations.length, periodsProposed: operations.length, partsProposed: operations.reduce((n, op) => n + op.proposed.length - Object.values(op.expected).length, 0), pending: pending.length, ignoredWeeks: ignoredWeeks.length, ignoredHistoricalAssignments: ignoredHistoricalAssignments.length, profilesToReview: candidateLinks.length },
  confirmedLinks: [...confirmed].map(([studentId, link]) => ({ studentId, androidName: students.get(studentId), canonicalName: masters[link.masterId].name, ...link })), identityOperations, operations, pending, ignoredWeeks, ignoredHistoricalAssignments, candidateLinks }
db.close()
writeFileSync(outputPath, JSON.stringify(proposal, null, 2))
console.log(JSON.stringify(proposal.summary, null, 2))
