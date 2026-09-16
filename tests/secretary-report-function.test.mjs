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
