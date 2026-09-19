import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const [oldPath, newPath, outputPath] = process.argv.slice(2)
assert.ok(oldPath && newPath && outputPath, 'Informe banco antigo, novo e destino.')
assert.ok(![oldPath, newPath].some(path => resolve(path) === resolve(outputPath)), 'Preserve os arquivos originais.')
const read = async path => JSON.parse(await readFile(path, 'utf8'))
const oldBank = await read(oldPath), newBank = await read(newPath)
const source = oldBank.discursos?.programacao
assert.ok(source && newBank.tarefas?.discursos?.programacao, 'Estrutura de programação não encontrada.')
const selected = Object.fromEntries(Object.entries(source).filter(([, item]) => item.secao === 's2'))
assert.ok(Object.keys(selected).length, 'Nenhuma programação S2 encontrada.')
const result = structuredClone(newBank)
result.tarefas.discursos.programacao = structuredClone(selected)
const untouched = structuredClone(result)
untouched.tarefas.discursos.programacao = newBank.tarefas.discursos.programacao
assert.deepEqual(untouched, newBank, 'Somente a programação pode mudar.')
await writeFile(outputPath, JSON.stringify(result, null, 2) + '\n', { flag:'wx' })
const saved = await read(outputPath)
assert.deepEqual(saved.tarefas.discursos.programacao, selected)
assert.deepEqual(await read(oldPath), oldBank)
assert.deepEqual(await read(newPath), newBank)
console.log(JSON.stringify({ output:resolve(outputPath), records:Object.keys(selected).length, unknownSection:Object.entries(source).filter(([, item]) => !item.secao).map(([id, item]) => ({ id, data:item.data, orador:item.oradorNome })), originalsPreserved:true, otherDataPreserved:true }, null, 2))
