import { readFile } from 'node:fs/promises'
import { planEscalaIdMigration } from '../src/modules/escala-migration.ts'

const backupPath = process.argv[2]
if (!backupPath) {
  throw new Error('Informe o caminho do backup JSON.')
}

const database = JSON.parse(await readFile(backupPath, 'utf8'))
const plan = planEscalaIdMigration(database.escala ?? {})

console.log(JSON.stringify({
  stats: plan.stats,
  conflicts: plan.conflicts,
  canApply: plan.canApply,
}, null, 2))

if (!plan.canApply) process.exitCode = 2
