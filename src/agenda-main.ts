import './style.css'
import { get, pessoasRef } from './firebase'
import type { MasterPessoa, Usuario } from './types'
import mountAgenda from './modules/individual'
import { sanitizeAgendaPeople } from './modules/individual-domain'
import { refreshServiceWorkerWeekly } from './pwa-sync'

const PERSON_KEY = 'noroeste_agenda_person'
const PEOPLE_KEY = 'noroeste_agenda_people_v2'
const PEOPLE_SYNC_KEY = 'noroeste_agenda_people_sync_v2'
const DAILY_SYNC_MS = 24 * 60 * 60 * 1000
const identity = document.getElementById('agendaIdentity')!
const shell = document.getElementById('agendaShell')!
const select = document.getElementById('agendaPerson') as HTMLSelectElement
const continueButton = document.getElementById('agendaContinue') as HTMLButtonElement
const error = document.getElementById('agendaError')!
const bottomUser = document.getElementById('bottomUser')!
let people: Record<string, MasterPessoa> = {}
let syncingPeople = false

function activePeople(): Array<[string, MasterPessoa]> {
  return Object.entries(people).filter(([, person]) => person.active !== false).sort(([, a], [, b]) => a.name.localeCompare(b.name, 'pt-BR'))
}

function renderPeople(): void {
  const active = activePeople()
  select.innerHTML = active.map(([id, person]) => `<option value="${id}">${person.name.replace(/[&<>"']/g, '')}</option>`).join('')
  select.disabled = active.length === 0
  continueButton.disabled = active.length === 0
}

function cachedPeople(): Record<string, MasterPessoa> {
  try { return JSON.parse(localStorage.getItem(PEOPLE_KEY) ?? '{}') as Record<string, MasterPessoa> }
  catch { return {} }
}

function openAgenda(masterId: string): void {
  const person = people[masterId]
  if (!person || person.active === false) return
  localStorage.setItem(PERSON_KEY, masterId)
  identity.classList.add('hidden')
  shell.classList.remove('hidden')
  bottomUser.textContent = person.name
  const usuario: Usuario = {
    nome: person.name,
    senha: '',
    ativo: true,
    masterId,
    apps: { mestre:false, tarefas:false, escala:false, programacao:false, secretario:false, individual:true },
  }
  mountAgenda({ uid:`agenda-${masterId}`, usuario })
}

async function init(): Promise<void> {
  people = cachedPeople()
  const saved = localStorage.getItem(PERSON_KEY) ?? ''
  if (Object.keys(people).length) {
    renderPeople()
    if (saved && people[saved]?.active !== false && shell.classList.contains('hidden')) openAgenda(saved)
  }
  const lastSync = Number(localStorage.getItem(PEOPLE_SYNC_KEY) ?? 0)
  if (Object.keys(people).length && Date.now() - lastSync < DAILY_SYNC_MS) return
  if (syncingPeople) return
  syncingPeople = true
  try {
    const snapshot = await get(pessoasRef)
    people = snapshot.exists() ? snapshot.val() as Record<string, MasterPessoa> : {}
    localStorage.setItem(PEOPLE_KEY, JSON.stringify(sanitizeAgendaPeople(people)))
    localStorage.setItem(PEOPLE_SYNC_KEY, String(Date.now()))
    renderPeople()
    if (saved && people[saved]?.active !== false) openAgenda(saved)
  } catch {
    if (!Object.keys(people).length) error.textContent = 'Nao foi possivel carregar as pessoas. Verifique a conexao.'
  } finally {
    syncingPeople = false
  }
}

continueButton.addEventListener('click', () => openAgenda(select.value))
document.getElementById('agendaChange')?.addEventListener('click', () => {
  localStorage.removeItem(PERSON_KEY)
  shell.classList.add('hidden')
  identity.classList.remove('hidden')
})

void init()

window.addEventListener('online', () => void init())
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void init() })

if ('serviceWorker' in navigator && location.hostname !== '127.0.0.1' && location.hostname !== 'localhost') {
  void navigator.serviceWorker.register('/agenda/sw.js', { scope:'/agenda/' }).then(registration => refreshServiceWorkerWeekly(registration, 'noroeste_agenda_shell_sync'))
}
