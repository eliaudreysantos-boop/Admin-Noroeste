import { planEscalaIdMigration } from '../src/modules/escala-migration.ts'

const DATABASE_URL = process.env.FIREBASE_DATABASE_URL
if (!DATABASE_URL) {
  throw new Error('Defina FIREBASE_DATABASE_URL para executar a migracao.')
}
const EXPECTED = {
  legacyProfiles: 57,
  canonicalProfiles: 54,
  duplicateProfilesMerged: 3,
  availabilityEntriesMerged: 72,
  tableReferencesRemapped: 1282,
}

if (process.env.CONFIRM_ESCALA_MIGRATION !== 'APPLY') {
  throw new Error('Defina CONFIRM_ESCALA_MIGRATION=APPLY para executar a escrita.')
}

const response = await fetch(`${DATABASE_URL}/escala.json`, {
  headers: { 'X-Firebase-ETag': 'true' },
})
if (!response.ok) throw new Error(`Falha ao ler Escala: HTTP ${response.status}`)

const etag = response.headers.get('etag')
if (!etag) throw new Error('Firebase nao retornou ETag; migracao cancelada.')

const source = await response.json()
const plan = planEscalaIdMigration(source ?? {})
const statsMatch = Object.entries(EXPECTED).every(
  ([key, value]) => plan.stats[key] === value,
)

if (!plan.canApply || !statsMatch) {
  console.error(JSON.stringify({ stats: plan.stats, conflicts: plan.conflicts }, null, 2))
  throw new Error('A previa atual diverge da previa aprovada; migracao cancelada.')
}

const write = await fetch(`${DATABASE_URL}/escala.json`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'If-Match': etag,
  },
  body: JSON.stringify(plan.migrated),
})

if (write.status === 412) throw new Error('A Escala mudou durante a migracao; nenhuma escrita foi aplicada.')
if (!write.ok) throw new Error(`Falha ao aplicar migracao: HTTP ${write.status}`)

console.log(JSON.stringify({ applied: true, stats: plan.stats }, null, 2))
