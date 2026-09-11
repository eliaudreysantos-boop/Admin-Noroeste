import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarResponse } from '../netlify/functions/calendar.ts'

const token = 'a'.repeat(48)
const root = {
  agenda:{ config:{ icsReminders:{ tarefas:['P1D'], quadro:[] } } },
  master:{ pessoas:{ m1:{ name:'Ana', active:true }, m2:{ name:'Bruno', active:true } } },
  tarefas:{
    people:{ p1:{ masterId:'m1' }, p2:{ masterId:'m2' } },
    scale:{ periods:{ '2026-09':{ locked:true, meetings:{ r:{ date:'2026-09-11', type:'midweek', assignments:{ leitor:'p1', mic1:'p2' } } } } } },
  },
}

function fetcher(subscription) {
  return async url => {
    if (url.includes('/agenda/assinaturas/')) return new Response(JSON.stringify(subscription), { status:200 })
    const path = new URL(url).pathname.replace(/^\//, '').replace(/\.json$/, '')
    const value = path.split('/').reduce((current, key) => current?.[key], root)
    return new Response(JSON.stringify(value ?? null), { status:200 })
  }
}

test('feed pessoal valida token e devolve apenas a agenda vinculada', async () => {
  const response = await calendarResponse(new Request(`https://app.test/.netlify/functions/calendar?token=${token}`), fetcher({ token, tipo:'pessoal', masterId:'m1', ativo:true, criadoEm:'2026-09-01' }))
  const body = await response.text()
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /text\/calendar/)
  assert.match(body, /SUMMARY:Leitor/)
  assert.doesNotMatch(body, /SUMMARY:Microfone 1/)
  assert.match(body, /TRIGGER:-P1D/)
})

test('feed do quadro respeita os módulos escolhidos', async () => {
  const response = await calendarResponse(new Request(`https://app.test/.netlify/functions/calendar?token=${token}`), fetcher({ token, tipo:'quadro', modulos:['tarefas'], ativo:true, criadoEm:'2026-09-01' }))
  const body = await response.text()
  assert.equal(response.status, 200)
  assert.match(body, /SUMMARY:Leitor/)
  assert.match(body, /SUMMARY:Microfone 1/)
})

test('feed rejeita token inválido e assinatura revogada', async () => {
  const invalid = await calendarResponse(new Request('https://app.test/.netlify/functions/calendar?token=curto'), fetcher(null))
  const revoked = await calendarResponse(new Request(`https://app.test/.netlify/functions/calendar?token=${token}`), fetcher({ token, tipo:'pessoal', masterId:'m1', ativo:false, criadoEm:'2026-09-01' }))
  assert.equal(invalid.status, 400)
  assert.equal(revoked.status, 410)
})
