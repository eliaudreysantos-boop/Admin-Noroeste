import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

const [backupPath, proposalPath, outputPath] = process.argv.slice(2)
if (!backupPath || !proposalPath || !outputPath) throw new Error('Informe backup, proposta e arquivo de resultado.')
if ([backupPath, proposalPath].some(path => resolve(path).toLowerCase() === resolve(outputPath).toLowerCase())) throw new Error('O resultado precisa de um caminho diferente das fontes.')
const source = readFileSync(backupPath)
const proposal = JSON.parse(readFileSync(proposalPath))
if (createHash('sha256').update(source).digest('hex') !== proposal.sourceSha256) throw new Error('O backup diverge da proposta.')
const result = JSON.parse(source)
const operations = [...proposal.identityOperations, ...proposal.operations]
const paths = operations.map(operation => operation.path)
if (paths.some((path, i) => paths.some((other, j) => i !== j && (other === path || other.startsWith(`${path}/`))))) throw new Error('Operacoes sobrepostas.')
for (const operation of operations) {
  const keys = operation.path.split('/')
  if (keys.some(key => !key || ['__proto__', 'constructor', 'prototype'].includes(key))) throw new Error('Caminho invalido.')
  const actual = keys.reduce((value, key) => value?.[key], result) ?? null
  if (!isDeepStrictEqual(actual, operation.expected)) throw new Error(`Valor anterior diverge: ${operation.path}`)
}
for (const operation of operations) {
  const keys = operation.path.split('/'), last = keys.pop()
  const parent = keys.reduce((value, key) => value[key] ??= {}, result)
  if (operation.proposed === null) delete parent[last]
  else parent[last] = structuredClone(operation.proposed)
}
function checkRetiredId(value) {
  if (value === 'm_e7a90dc0') throw new Error('Ainda existe referencia ao cadastro duplicado de Pedro.')
  if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
    if (key === 'm_e7a90dc0') throw new Error('Ainda existe chave com o cadastro duplicado de Pedro.')
    checkRetiredId(child)
  }
}
checkRetiredId(result)
for (const operation of proposal.operations) {
  if (new Set(operation.proposed.map(part => part.id)).size !== operation.proposed.length) throw new Error('Partes duplicadas.')
  for (const previous of Object.values(operation.expected)) {
    if (!isDeepStrictEqual(operation.proposed.find(part => part.id === previous.id), previous)) throw new Error('Parte existente alterada.')
  }
  for (const part of operation.proposed.filter(part => !Object.values(operation.expected).some(previous => previous.id === part.id))) {
    const profile = result.programacao.pessoas[part.assignedPersonId]
    if (!profile || !result.master.pessoas[profile.masterId]) throw new Error('Nova designacao sem vinculo central.')
    if (part.realizedPersonId) throw new Error('Realizacao nao pode ser inferida.')
  }
}
writeFileSync(outputPath, JSON.stringify(result, null, 2))
console.log(JSON.stringify({ outputPath, validatedOperations: operations.length, newAssignments: proposal.summary.partsProposed, retiredPedroReferences: 0 }))
