import './style.css'
import {
  loadUsuarios,
  loadCachedUserChoices,
  saveSession,
  loadSession,
  clearSession,
} from './auth'
import { initRouter, navigateBack } from './router'
import type { RawUsuarios, Usuario } from './types'

// ─── Elementos ──────────────────────────────────────────────────────────────

const loginOverlay  = document.getElementById('loginOverlay')!
const appShell      = document.getElementById('appShell')!
const selectUsuario = document.getElementById('selectUsuario') as HTMLSelectElement
const inputSenha    = document.getElementById('inputSenha')    as HTMLInputElement
const btnEntrar     = document.getElementById('btnEntrar')     as HTMLButtonElement
const btnSair       = document.getElementById('btnSair')       as HTMLButtonElement
const btnBack       = document.getElementById('btnBack')       as HTMLButtonElement
const bottomUser    = document.getElementById('bottomUser')!
const loginError    = document.getElementById('loginError')!
const statusBar     = document.getElementById('statusBar')!
const toast         = document.getElementById('toast')!

// ─── Toast ──────────────────────────────────────────────────────────────────

let _toastTimer: ReturnType<typeof setTimeout> | null = null

function showToast(msg: string, ms = 2800): void {
  toast.textContent = msg
  toast.classList.add('show')
  if (_toastTimer) clearTimeout(_toastTimer)
  _toastTimer = setTimeout(() => toast.classList.remove('show'), ms)
}

// ─── Status Firebase ────────────────────────────────────────────────────────

function setStatus(text: string): void {
  statusBar.textContent = text
}

// ─── Exibir app shell ────────────────────────────────────────────────────────

function showApp(usuario: Usuario): void {
  loginOverlay.classList.add('hidden')
  appShell.classList.remove('hidden')
  bottomUser.textContent = usuario.nome
}

// ─── Select de usuário ───────────────────────────────────────────────────────

/** Popula o <select> com usuários ativos ordenados por nome.
 *  Se não houver nenhum usuário ativo, mostra mensagem no lugar do select. */
function populateUsuarioSelect(usuarios: RawUsuarios): void {
  const ativos = Object.entries(usuarios)
    .filter(([, u]) => u.ativo)
    .sort(([, a], [, b]) => a.nome.localeCompare(b.nome, 'pt-BR'))

  if (ativos.length === 0) {
    const msg = document.createElement('p')
    msg.id = 'selectUsuarioEmpty'
    msg.textContent = 'Nenhum usuário ativo encontrado.'
    selectUsuario.replaceWith(msg)
    btnEntrar.disabled = true
    return
  }

  selectUsuario.innerHTML = ativos
    .map(([uid, u]) => `<option value="${uid}">${u.nome}</option>`)
    .join('')
  selectUsuario.disabled = false
}

// ─── Sessão restaurada ───────────────────────────────────────────────────────

async function tryRestoreSession(
  usuarios: RawUsuarios,
): Promise<boolean> {
  const uid = loadSession()
  if (!uid) return false

  const usuario = usuarios[uid]
  if (!usuario || !usuario.ativo) {
    clearSession()
    return false
  }

  showApp(usuario)
  initRouter(uid, usuario)
  return true
}

// ─── Login ──────────────────────────────────────────────────────────────────

function handleLogin(usuarios: RawUsuarios): void {
  const uid   = selectUsuario.value
  const senha = inputSenha.value

  if (!uid || !senha) {
    loginError.textContent = 'Selecione o usuário e digite a senha.'
    return
  }

  const usuario = usuarios[uid]

  if (!usuario || usuario.senha !== senha || !usuario.ativo) {
    loginError.textContent = 'Usuário ou senha inválidos.'
    inputSenha.value = ''
    inputSenha.focus()
    return
  }

  loginError.textContent = ''
  saveSession(uid)
  showApp(usuario)
  initRouter(uid, usuario)
  showToast(`Bem-vindo, ${usuario.nome}!`)
}

// ─── Botão Sair ──────────────────────────────────────────────────────────────

function handleSair(): void {
  clearSession()
  location.reload()
}

// ─── Botão Voltar ────────────────────────────────────────────────────────────

function handleBack(): void {
  navigateBack()
}

// ─── Bootstrap ──────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  setStatus('Carregando dados…')

  let usuarios: RawUsuarios = loadCachedUserChoices()
  if (Object.keys(usuarios).length > 0) populateUsuarioSelect(usuarios)

  try {
    usuarios = await Promise.race([
      loadUsuarios(),
      new Promise<RawUsuarios>((_, reject) => {
        setTimeout(() => reject(new Error('Tempo excedido ao carregar usuários')), 8000)
      }),
    ])
    setStatus('Conectado ao Firebase ✓')
  } catch (err) {
    setStatus('Erro de conexão com Firebase')
    console.error(err)
    if (Object.keys(usuarios).length === 0) {
      loginError.textContent = 'Não foi possível carregar os usuários. Verifique a conexão e tente novamente.'
    } else {
      loginError.textContent = 'Conexão lenta. A lista anterior está disponível; confirme o login quando a conexão voltar.'
    }
  }

  // Tenta restaurar sessão
  const restored = await tryRestoreSession(usuarios)
  if (restored) return

  // Exibe login
  loginOverlay.classList.remove('hidden')
  if (Object.keys(usuarios).length === 0) populateUsuarioSelect(usuarios)
  selectUsuario.focus()

  // Eventos de login
  btnEntrar.addEventListener('click', () => handleLogin(usuarios))

  inputSenha.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin(usuarios)
  })

  selectUsuario.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') inputSenha.focus()
  })

  selectUsuario.addEventListener('change', () => {
    loginError.textContent = ''
  })
}

// ─── Eventos globais ─────────────────────────────────────────────────────────

btnSair.addEventListener('click', handleSair)
btnBack.addEventListener('click', handleBack)

window.addEventListener('app-route-change', (event) => {
  const detail = (event as CustomEvent<{ canBack: boolean }>).detail
  btnBack.classList.toggle('hidden', !detail?.canBack)
})

// ─── Start ───────────────────────────────────────────────────────────────────

void init()

// ─── Service Worker (PWA) ─────────────────────────────────────────────────────

if ('serviceWorker' in navigator) {
  const isLocalDevelopment = location.hostname === '127.0.0.1' || location.hostname === 'localhost'
  if (!isLocalDevelopment) {
    void navigator.serviceWorker.register('/sw.js')
  } else {
    // Evita que o shell PWA publicado interfira no desenvolvimento local.
    void navigator.serviceWorker.getRegistrations()
      .then(registrations => Promise.all(registrations.map(registration => registration.unregister())))
  }
}
