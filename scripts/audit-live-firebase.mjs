import { readFile } from 'node:fs/promises'

const base = process.env.FIREBASE_DATABASE_URL ?? 'https://oradoress2-default-rtdb.firebaseio.com'
const roots = ['master', 'usuarios', 'tarefas', 'limpeza', 'oradores', 'escala', 'programacao', 'secretario', 'servicoCampo', 'agenda/config', 'agenda/documentos', 'agenda/assinaturas']
const filePath = process.argv[2]
const expectedPath = process.argv[3]
const exportedRoot = filePath ? JSON.parse(await readFile(filePath, 'utf8')) : null
const valueAt = (root, path) => path.split('/').reduce((value, key) => value?.[key], root)
const entries = exportedRoot
  ? roots.map(key => [key, 200, valueAt(exportedRoot, key)])
  : await Promise.all(roots.map(async key => {
      const response = await fetch(`${base}/${key}.json`, { headers:{ accept:'application/json' } })
      return [key, response.status, response.ok ? await response.json() : null]
    }))
const data = Object.fromEntries(entries.filter(([, status]) => status === 200).map(([key, , value]) => [key, value]))
const count = value => value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).length : 0
const people = data.master?.pessoas ?? {}
const users = data.usuarios ?? {}
const programProfiles = data.programacao?.pessoas ?? data.programacao?.people ?? {}
const programs = data.programacao?.programs ?? data.programacao?.programas ?? data.programacao?.meetings ?? {}

const userSummary = Object.entries(users).map(([uid, user]) => ({
  uid,
  masterId:user?.masterId ?? '',
  nome:user?.nome ?? '',
  ativo:user?.ativo === true,
  admin:user?.apps?.mestre === true,
  servicoCampo:user?.apps?.servicoCampo === true,
}))
const invalidUsers = userSummary.filter(user => !user.masterId || !people[user.masterId])
const invalidTaskPeople = Object.entries(data.tarefas?.people ?? {})
  .filter(([, person]) => person?.masterId && !people[person.masterId]).map(([id]) => id)
const invalidScaleParticipants = Object.entries(data.escala?.participants ?? {})
  .filter(([id, person]) => {
    const masterId = person?.masterId ?? (people[id] ? id : '')
    return !masterId || !people[masterId]
  }).map(([id]) => id)
const invalidProgramProfiles = Object.entries(programProfiles)
  .filter(([id, person]) => {
    const masterId = person?.masterId ?? (people[id] ? id : '')
    return !masterId || !people[masterId]
  }).map(([id]) => id)

function normalizedJson(value) {
  if (Array.isArray(value)) return value.length ? value.map(normalizedJson) : undefined
  if (value === null || value === undefined) return undefined
  if (typeof value !== 'object') return value
  if ('.value' in value && Object.keys(value).every(key => key === '.value' || key === '.priority')) return normalizedJson(value['.value'])
  const entries = Object.entries(value).filter(([key]) => key !== '.priority').sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalizedJson(item)]).filter(([, item]) => item !== undefined)
  return entries.length ? Object.fromEntries(entries) : undefined
}

let comparison
if (expectedPath && exportedRoot) {
  const expected = JSON.parse(await readFile(expectedPath, 'utf8'))
  const actualNormalized = normalizedJson(exportedRoot)
  const expectedNormalized = normalizedJson(expected)
  const rootsToCompare = [...new Set([...Object.keys(actualNormalized), ...Object.keys(expectedNormalized)])].sort()
  const differentRoots = rootsToCompare.filter(key => JSON.stringify(actualNormalized[key]) !== JSON.stringify(expectedNormalized[key]))
  const differentPaths = []
  const collectDifferences = (actual, planned, path = '') => {
    if (differentPaths.length >= 100 || JSON.stringify(actual) === JSON.stringify(planned)) return
    if (!actual || !planned || typeof actual !== 'object' || typeof planned !== 'object' || Array.isArray(actual) || Array.isArray(planned)) {
      differentPaths.push(path || '/')
      return
    }
    const keys = [...new Set([...Object.keys(actual), ...Object.keys(planned)])].sort()
    keys.forEach(key => collectDifferences(actual[key], planned[key], `${path}/${key}`))
  }
  differentRoots.forEach(key => collectDifferences(actualNormalized[key], expectedNormalized[key], `/${key}`))
  comparison = { expected:expectedPath, equal:differentRoots.length === 0, differentRoots, differentPaths }
}

console.log(JSON.stringify({
  source:filePath ?? base,
  status:Object.fromEntries(entries.map(([key, status]) => [key, status])),
  counts:{
    people:count(people),
    users:count(users),
    secretaryReports:count(data.secretario?.relatorios),
    attendance:count(data.secretario?.assistencia ?? data.secretario?.assistencias),
    programs:count(programs),
    taskPeople:count(data.tarefas?.people),
    scaleParticipants:count(data.escala?.participants),
    programProfiles:count(programProfiles),
    publicDocuments:count(data['agenda/documentos']),
  },
  users:userSummary,
  invalid:{
    users:invalidUsers,
    taskPeople:invalidTaskPeople,
    scaleParticipants:invalidScaleParticipants,
    programProfiles:invalidProgramProfiles,
  },
  ...(comparison ? { comparison } : {}),
}, null, 2))
