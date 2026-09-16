import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarResponse } from '../netlify/functions/calendar.ts'

const token = 'a'.repeat(48)
process.env.FIREBASE_DATABASE_URL = 'https://database.test'
const root = {
  agenda:{ config:{ icsReminders:{ tarefas:['P1D'], servicoCampo:['P1D'], quadro:['P1D'] } } },
  master:{ pessoas:{ m1:{ name:'Ana', active:true }, m2:{ name:'Bruno', active:true } }, config:{ reunioes:{ meiaDeSemana:{ horario:'19:00' } } } },
  programacao:{ pessoas:{ m1:{ masterId:'m1' } }, programs:{ w:{ meetingDate:'2026-09-16', parts:[{ id:'p', title:'Leitura da Bíblia', assignedPersonId:'m1', confirmedAt:'2026-09-01' }] } } },
  escala:{ participants:{ e1:{ masterId:'m1' } }, publishedMonths:{ '2026-09':true }, settings:{ locals:{ l1:{ name:'Praça Central' } } }, tables:{ l1:{ '2026-09':{ rows:{ '2026-09-19':{ slots:{ '08:00':{ p1:'e1' } } } } } } } },
  tarefas:{
    people:{ p1:{ masterId:'m1' }, p2:{ masterId:'m2' } },
    scale:{ periods:{ '2026-09':{ locked:true, meetings:{ r:{ date:'2026-09-11', type:'midweek', assignments:{ leitor:'p1', mic1:'p2' } } } } } },
  },
  servicoCampo:{ periods:{ '2026-09':{ month:'2026-09', published:true, assignments:{ s1:{ id:'s1', templateId:'t', date:'2026-09-18', time:'16:00', location:'Salão', label:'Saída', leaderId:'m1' } } } } },
}

function fetcher() {
  return async url => {
    const path = new URL(url).pathname.replace(/^\//, '').replace(/\.json$/, '')
    const value = path.split('/').reduce((current, key) => current?.[key], root)
    return new Response(JSON.stringify(value ?? null), { status:200 })
  }
}

const store = subscription => ({ get:async () => subscription, set:async () => undefined })

test('feed pessoal valida token e devolve apenas a agenda vinculada', async () => {
  const response = await calendarResponse(new Request(`https://app.test/.netlify/functions/calendar?token=${token}`), fetcher(), store({ token, tipo:'pessoal', masterId:'m1', ativo:true, criadoEm:'2026-09-01' }))
  const body = await response.text()
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /text\/calendar/)
  assert.match(body, /SUMMARY:Leitor/)
  assert.doesNotMatch(body, /SUMMARY:Microfone 1/)
  assert.match(body, /TRIGGER:-P1D/)
  assert.match(body, /DTSTART;TZID=America\/Fortaleza:20260916T190000/)
  assert.match(body, /LOCATION:Praça Central/)
  assert.match(response.headers.get('content-disposition'), /inline.*\.ics/)
})

test('feed do quadro respeita os módulos escolhidos', async () => {
  const response = await calendarResponse(new Request(`https://app.test/.netlify/functions/calendar?token=${token}`), fetcher(), store({ token, tipo:'quadro', modulos:['tarefas'], ativo:true, criadoEm:'2026-09-01' }))
  const body = await response.text()
  assert.equal(response.status, 200)
  assert.match(body, /SUMMARY:Leitor/)
  assert.match(body, /SUMMARY:Microfone 1/)
})

test('feed rejeita token inválido e assinatura revogada', async () => {
  const invalid = await calendarResponse(new Request('https://app.test/.netlify/functions/calendar?token=curto'), fetcher(), store(null))
  const revoked = await calendarResponse(new Request(`https://app.test/.netlify/functions/calendar?token=${token}`), fetcher(), store({ token, tipo:'pessoal', masterId:'m1', ativo:false, criadoEm:'2026-09-01' }))
  assert.equal(invalid.status, 400)
  assert.equal(revoked.status, 410)
})

test('Serviço de Campo lembra o dirigente, mas não cria alarme no Quadro', async () => {
  const personal = await calendarResponse(new Request(`https://app.test/.netlify/functions/calendar?token=${token}`), fetcher(), store({ token, tipo:'pessoal', masterId:'m1', ativo:true, criadoEm:'2026-09-01' }))
  assert.match(await personal.text(), /TRIGGER:-P1D/)
  const board = await calendarResponse(new Request(`https://app.test/.netlify/functions/calendar?token=${token}`), fetcher(), store({ token, tipo:'quadro', modulos:['servicoCampo'], ativo:true, criadoEm:'2026-09-01' }))
  const body = await board.text()
  assert.match(body, /SUMMARY:Dirigente - Saída/)
  assert.doesNotMatch(body, /BEGIN:VALARM/)
})
