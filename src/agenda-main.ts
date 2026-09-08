import './style.css'
import { get, pessoasRef } from './firebase'
import type { MasterPessoa, Usuario } from './types'
import mountAgenda from './modules/individual'

const PERSON_KEY = 'noroeste_agenda_person'
const identity = document.getElementById('agendaIdentity')!
const shell = document.getElementById('agendaShell')!
const select = document.getElementById('agendaPerson') as HTMLSelectElement
const continueButton = document.getElementById('agendaContinue') as HTMLButtonElement
const error = document.getElementById('agendaError')!
const bottomUser = document.getElementById('bottomUser')!
let people: Record<string, MasterPessoa> = {}

function openAgenda(masterId: string): void {
  const person = people[masterId]
  if (!person?.active) return
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
  try {
    const snapshot = await get(pessoasRef)
    people = snapshot.exists() ? snapshot.val() as Record<string, MasterPessoa> : {}
    const active = Object.entries(people).filter(([, person]) => person.active).sort(([, a], [, b]) => a.name.localeCompare(b.name, 'pt-BR'))
    select.innerHTML = active.map(([id, person]) => `<option value="${id}">${person.name.replace(/[&<>"']/g, '')}</option>`).join('')
    select.disabled = active.length === 0
    continueButton.disabled = active.length === 0
    const saved = localStorage.getItem(PERSON_KEY) ?? ''
    if (saved && people[saved]?.active) openAgenda(saved)
  } catch {
    error.textContent = 'Nao foi possivel carregar as pessoas. Verifique a conexao.'
  }
}

continueButton.addEventListener('click', () => openAgenda(select.value))
document.getElementById('agendaChange')?.addEventListener('click', () => {
  localStorage.removeItem(PERSON_KEY)
  shell.classList.add('hidden')
  identity.classList.remove('hidden')
})

void init()

if ('serviceWorker' in navigator && location.hostname !== '127.0.0.1' && location.hostname !== 'localhost') {
  void navigator.serviceWorker.register('/agenda/sw.js', { scope:'/agenda/' })
}
