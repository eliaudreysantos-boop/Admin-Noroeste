import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createTaskSchedulePdf } from '../src/modules/tarefas-documents.ts'
import { createScaleSchedulePdf } from '../src/modules/escala-documents.ts'
import { createCleaningPdf } from '../src/modules/limpeza-documents.ts'
import { createFieldServicePdf } from '../src/modules/servico-campo-documents.ts'
import { canonicalMeetingType, assignmentForRole, TASK_ROLES } from '../src/modules/tarefas-domain.ts'
import { participantDirectoryForHistory } from '../src/modules/escala-domain.ts'

// Local, read-only audit. Never copies authentication or contact data into the report.
const [source, month = '2026-09', destination = 'output/firebase-pdfs'] = process.argv.slice(2)
if (!source || !/^\d{4}-\d{2}$/.test(month)) throw new Error('Uso: node scripts/validate-firebase-pdfs.mjs export.json AAAA-MM [pasta]')
const root = JSON.parse(await readFile(source, 'utf8'))
const out = resolve(destination)
await mkdir(out, { recursive:true })
const master = root.master?.pessoas ?? {}
const congregation = root.master?.config?.congregacao?.nome || 'Noroeste'
const taskPeople = Object.fromEntries(Object.entries(root.tarefas?.people ?? {}).map(([id, person]) => [id, { ...person, name:master[person.masterId]?.name || person.name || person.nome }]))
const meetings = Object.values(root.tarefas?.scale?.periods?.[month]?.meetings ?? {}).filter(meeting => canonicalMeetingType(meeting.type))
const scale = root.escala ?? {}
const profiles = Object.fromEntries(Object.entries(scale.participants ?? {}).map(([id, profile]) => {
  const person = master[profile.masterId || id]
  return [id, { ...profile, ...(person ? { name:person.name, active:profile.active !== false && person.active !== false } : { active:false }) }]
}))
const participants = participantDirectoryForHistory(profiles, scale.publishedSnapshots)
const missing = new Map()
for (const [localId, months] of Object.entries(scale.tables ?? {})) {
  for (const [date, row] of Object.entries(months[month]?.rows ?? {})) {
    for (const [time, pair] of Object.entries(row.slots ?? {})) {
      for (const id of [pair.p1, pair.p2].filter(Boolean)) {
        const masterId = profiles[id]?.masterId || id
        if (master[masterId]) continue
        const entry = missing.get(id) ?? { participantId:id, masterId, historicalName:participants[id]?.name ?? null, assignments:[] }
        entry.assignments.push({ local:scale.scales?.[localId]?.name || localId, date, time })
        missing.set(id, entry)
      }
    }
  }
}
const dates = new Map()
for (const [id, meeting] of Object.entries(root.tarefas?.scale?.periods?.[month]?.meetings ?? {})) {
  if (!canonicalMeetingType(meeting.type)) continue
  const key = `${meeting.date}:${canonicalMeetingType(meeting.type)}`
  dates.set(key, [...(dates.get(key) ?? []), { id, date:meeting.date, type:meeting.type,
    assignments:Object.fromEntries(TASK_ROLES.map(role => {
      const personId = assignmentForRole(meeting, role)
      return [role, personId ? taskPeople[personId]?.name || personId : null]
    })) }])
}
const report = { month, missingScalePeople:[...missing.values()], conflictingTaskMeetings:[...dates.values()].filter(items => items.length > 1), pdfs:[] }
const save = async (name, result) => {
  await writeFile(resolve(out, name+'.pdf'), result.bytes)
  report.pdfs.push({ name, pages:result.pages ?? 1, font:result.effectiveFontSize ?? null })
}
await save('tarefas', await createTaskSchedulePdf(meetings, congregation, taskPeople, 14))
await save('escala-tpl', await createScaleSchedulePdf({ month, locals:scale.scales ?? {}, tables:scale.tables ?? {}, participants, exclusions:scale.monthExclusions?.[month] ?? [], requestedFontPt:scale.settings?.printFontPt ?? 12 }))
const cleaning = Object.values(root.limpeza?.periodos ?? {}).find(period => period.inicio?.startsWith(month) && period.modo === 'bimester')
  ?? Object.values(root.limpeza?.periodos ?? {}).find(period => period.inicio?.startsWith(month))
if (cleaning) await save('limpeza', await createCleaningPdf(cleaning, { requestedFontSize:15 }))
const assignments = Object.values(root.servicoCampo?.periods?.[month]?.assignments ?? {})
if (assignments.length) await save('servico-de-campo', { bytes:await createFieldServicePdf({ month, assignments, people:master, congregation }) })
await writeFile(resolve(out, 'pendencias.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify({ pdfs:report.pdfs, missingScalePeople:report.missingScalePeople.length, conflictingTaskMeetings:report.conflictingTaskMeetings.length }, null, 2))
