import './style.css'
import {
  loadUsuarios,
  saveSession,
  loadSession,
  clearSession,
} from './auth'
import { initRouter } from './router'
import type { RawUsuarios, Usuario } from './types'

// ─── Elementos ──────────────────────────────────────────────────────────────

const loginOverlay  = document.getElementById('loginOverlay')!
const appShell      = document.getElementById('appShell')!
const selectUsuario = document.getElementById('selectUsuario') as HTMLSelectElement
const inputSenha    = document.getElementById('inputSenha')    as HTMLInputElement
const btnEntrar     = document.getElementById('btnEntrar')     as HTMLButtonElement
const btnSair       = document.getElementById('btnSair')       as HTMLButtonElement
const btnMenu       = document.getElementById('btnMenu')       as HTMLButtonElement
const headerUser    = document.getElementById('headerUser')!
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
  headerUser.textContent = usuario.nome
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

// ─── Botão Menu (volta ao menu de módulos) ───────────────────────────────────

function handleMenu(): void {
  const uid = loadSession()
  if (!uid) return
  // Re-inicializa o router (exibe menu ou módulo único)
  // Precisamos dos dados em cache — recarrega página como fallback simples
  location.reload()
}

// ─── Bootstrap ──────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  setStatus('Carregando dados…')

  let usuarios: RawUsuarios = {}

  try {
    usuarios = await loadUsuarios()
    setStatus('Conectado ao Firebase ✓')
  } catch (err) {
    setStatus('Erro de conexão com Firebase')
    console.error(err)
    loginError.textContent = 'Sem conexão. Tente novamente.'
  }

  // Tenta restaurar sessão
  const restored = await tryRestoreSession(usuarios)
  if (restored) return

  // Exibe login
  loginOverlay.classList.remove('hidden')
  populateUsuarioSelect(usuarios)
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
btnMenu.addEventListener('click', handleMenu)

// ─── Start ───────────────────────────────────────────────────────────────────

void init()

// ─── Service Worker (PWA) ─────────────────────────────────────────────────────

if ('serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js')
}
