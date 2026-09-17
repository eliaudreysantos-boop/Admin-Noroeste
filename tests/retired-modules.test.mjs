import test from 'node:test'
import { readFile, access } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { canAccessData, canMutateData, withoutPrivateRoots } from '../netlify/lib/data-authorization.ts'
import { activeData, preserveArchivedTasks } from '../netlify/lib/retired-data.ts'
import { loadAgendaRoot } from '../netlify/lib/agenda-root.ts'
import { parseAgendaUiPreferences } from '../src/modules/individual-preferences.ts'

test('modulos retirados nao podem ser lidos ou alterados nem por sessao Admin', () => {
  const apps = { mestre:true }
  for (const path of ['programacao', 'secretario/relatorios', 'oradores', 'tarefas/discursos/oradores']) {
    assert.equal(canAccessData(path, apps, false), false)
    assert.equal(canAccessData(path, apps, true), false)
    assert.equal(canMutateData('', 'PATCH', { [path]:null }, apps), false)
  }
  assert.equal(canMutateData('tarefas', 'DELETE', null, apps), false)
})

test('leituras da Agenda nao consultam mais os modulos retirados', async () => {
  const calls = []
  await loadAgendaRoot(async path => { calls.push(path); return null })
  assert.ok(calls.includes('limpeza/periodos'))
  assert.ok(calls.includes('tarefas/scale/periods'))
  assert.equal(calls.some(path => /secretario|programacao|discursos/.test(path)), false)
})

test('backup operacional omite dados aposentados sem alterar a origem', () => {
  const source = { master:{ pessoas:{} }, tarefas:{ people:{ p:{} }, discursos:{ historico:true } }, secretario:{ relatorios:{} }, programacao:{}, oradores:{} }
  const before = structuredClone(source)
  assert.deepEqual(withoutPrivateRoots(source), { master:{ pessoas:{} }, tarefas:{ people:{ p:{} } } })
  assert.deepEqual(source, before)
  assert.deepEqual(activeData('tarefas', source.tarefas), { people:{ p:{} } })
})

test('restauracao de Tarefas conserva o historico arquivado ate revisao da exclusao', () => {
  const archived = { historico:{ registro:'preservar' } }
  assert.deepEqual(preserveArchivedTasks({ people:{ antigo:{} }, discursos:archived }, { people:{ novo:{} }, discursos:{ indevido:true } }), { people:{ novo:{} }, discursos:archived })
  assert.deepEqual(preserveArchivedTasks({ discursos:archived }, null), { discursos:archived })
})

test('preferencias antigas de Relatorio e fontes removidas migram para telas ativas', () => {
  const prefs = parseAgendaUiPreferences(JSON.stringify({ screen:'relatorio', personal:{ source:'oradores' }, board:{ subscriptionModules:['programacao', 'limpeza'] } }), '2026-09')
  assert.equal(prefs.screen, 'agenda')
  assert.equal(prefs.personal.source, 'todas')
  assert.deepEqual(prefs.board.subscriptionModules, ['limpeza'])
  assert.equal('report' in prefs, false)
})

test('rotas e artefatos operacionais nao carregam os modulos retirados', async () => {
  const router = await readFile(new URL('../src/router.ts', import.meta.url), 'utf8')
  for (const module of ['oradores', 'programacao', 'secretario']) {
    assert.equal(router.includes(`import('./modules/${module}`), false)
    for (const suffix of ['', '-domain', '-documents']) {
      await assert.rejects(access(new URL(`../src/modules/${module}${suffix}.ts`, import.meta.url)))
    }
  }
  await assert.rejects(access(new URL('../netlify/functions/secretary-report.ts', import.meta.url)))
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  for (const dependency of ['docx', 'exceljs', 'jszip']) assert.equal(dependency in packageJson.dependencies, false)
})
