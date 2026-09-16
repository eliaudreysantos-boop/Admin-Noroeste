import test from 'node:test'
import assert from 'node:assert/strict'
import { secretaryReportResponse } from '../netlify/functions/secretary-report.ts'

function memoryStore(initial = {}) {
  const state = structuredClone(initial)
  return {
    state,
    store:{
      async transaction(update) {
        const next = update(structuredClone(state.secretario ?? {}))
        if (next === undefined) return { committed:false }
        state.secretario = structuredClone(next)
        return { committed:true }
      },
    },
  }
}

// Both requests read the same revision before one commits; the loser retries.
function concurrentStore(initial) {
  const state = structuredClone(initial)
  let revision = 0, attempts = 0
  return {
    state,
    get attempts() { return attempts },
    store:{
      async transaction(update) {
        for (;;) {
          const readRevision = revision
          attempts += 1
          const next = update(structuredClone(state.secretario))
          if (next === undefined) return { committed:false }
          await new Promise(resolve => setImmediate(resolve))
          if (readRevision !== revision) continue
          state.secretario = structuredClone(next)
          revision += 1
          return { committed:true }
        }
      },
    },
  }
}

function request(report) {
  return new Request('https://app.test/.netlify/functions/secretary-report', {
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body:JSON.stringify({ report }),
  })
}

const identity = async () => ({ masterId:'m_1', previousId:'', createdBy:'pessoa' })
const baseSecretary = { publicadores:{ pub:{ id:'pub', masterId:'m_1', ativo:true, categoria:'publicador' } }, relatorios:{}, fechamentos:{} }

test('envio repetido com a mesma submissionId devolve o relatório oficial sem duplicar', async () => {
  const memory = memoryStore({ secretario:baseSecretary })
  const report = { competencia:'2026-09', participou:true, estudos:2, submissionId:'envio-1' }
  const first = await secretaryReportResponse(request(report), memory.store, identity)
  const second = await secretaryReportResponse(request(report), memory.store, identity)
  const firstBody = await first.json()
  const secondBody = await second.json()
  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
  assert.equal(firstBody.report.id, 'm_1__2026-09')
  assert.equal(secondBody.report.id, 'm_1__2026-09')
  assert.equal(Object.keys(memory.state.secretario.relatorios).length, 1)
})

test('envio concorrente com submissionId diferente não sobrescreve relatório existente', async () => {
  const memory = memoryStore({ secretario:baseSecretary })
  const first = await secretaryReportResponse(request({ competencia:'2026-09', participou:true, estudos:1, submissionId:'envio-1' }), memory.store, identity)
  const second = await secretaryReportResponse(request({ competencia:'2026-09', participou:false, estudos:0, submissionId:'envio-2' }), memory.store, identity)
  assert.equal(first.status, 200)
  assert.equal(second.status, 409)
  assert.equal(memory.state.secretario.relatorios['m_1__2026-09'].participou, true)
})

test('competência fechada continua recusando o envio da Minha Agenda', async () => {
  const memory = memoryStore({ secretario:{ ...baseSecretary, fechamentos:{ '2026-09':{ fechadoEm:'2026-10-10' } } } })
  const response = await secretaryReportResponse(request({ competencia:'2026-09', participou:true, estudos:1, submissionId:'envio-1' }), memory.store, identity)
  assert.equal(response.status, 409)
  assert.deepEqual(memory.state.secretario.relatorios, {})
})

const secretaryIdentity = async () => ({ masterId:'m_1', previousId:'', createdBy:'secretario', csrfValid:true })

for (const first of ['agenda', 'secretario']) {
  test(`disputa simultanea: ${first} grava primeiro e o outro preserva o registro`, async () => {
    const memory = concurrentStore({ secretario:baseSecretary })
    const submit = actor => secretaryReportResponse(request({ competencia:'2026-09', participou:true, estudos:actor === 'agenda' ? 2 : 5, submissionId:actor }), memory.store, actor === 'agenda' ? identity : secretaryIdentity)
    const second = first === 'agenda' ? 'secretario' : 'agenda'
    const responses = await Promise.all([submit(first), submit(second)])
    assert.deepEqual(responses.map(response => response.status), [200, 409])
    assert.equal(memory.attempts, 3)
    const reports = Object.values(memory.state.secretario.relatorios)
    assert.equal(reports.length, 1)
    assert.equal(reports[0].estudos, first === 'agenda' ? 2 : 5)
    assert.equal(reports[0].revision, 1)
  })
}

test('reenvios simultaneos da mesma submissao retornam o mesmo registro', async () => {
  const memory = concurrentStore({ secretario:baseSecretary })
  const report = { competencia:'2026-09', participou:true, estudos:2, submissionId:'retry-1' }
  const responses = await Promise.all([1, 2].map(() => secretaryReportResponse(request(report), memory.store, identity)))
  assert.deepEqual(responses.map(response => response.status), [200, 200])
  const bodies = await Promise.all(responses.map(response => response.json()))
  assert.deepEqual(bodies[0].report, bodies[1].report)
  assert.equal(memory.attempts, 3)
  assert.equal(Object.keys(memory.state.secretario.relatorios).length, 1)
  assert.equal(bodies[0].report.revision, 1)
})

test('fechamento durante o envio aborta a repeticao da transacao', async () => {
  const state = structuredClone(baseSecretary)
  const store = { async transaction(update) {
    assert.ok(update(structuredClone(state)))
    state.fechamentos['2026-09'] = { fechadoEm:'2026-10-10' }
    assert.equal(update(structuredClone(state)), undefined)
    return { committed:false }
  } }
  const response = await secretaryReportResponse(request({ competencia:'2026-09', participou:true, submissionId:'closing-1' }), store, identity)
  assert.equal(response.status, 409)
  assert.deepEqual(state.relatorios, {})
})

test('reenvio apos revisao do Secretario devolve a revisao sem restaurar valores antigos', async () => {
  const memory = memoryStore({ secretario:baseSecretary })
  const report = { competencia:'2026-09', participou:true, estudos:2, submissionId:'original-1' }
  await secretaryReportResponse(request(report), memory.store, identity)
  const editIdentity = async () => ({ ...await secretaryIdentity(), previousId:'m_1__2026-09' })
  const edited = await secretaryReportResponse(request({ competencia:'2026-09', participou:true, estudos:7 }), memory.store, editIdentity)
  assert.equal(edited.status, 200)
  const retry = await secretaryReportResponse(request(report), memory.store, identity)
  assert.equal(retry.status, 200)
  const body = await retry.json()
  assert.equal(body.report.estudos, 7)
  assert.equal(body.report.revision, 2)
  assert.equal(body.report.lastEditedBy, 'secretario')
})
