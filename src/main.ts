import './style.css'
import {
  loadUsuarios,
  login,
  saveSession,
  loadSession,
  clearSession,
} from './auth'
import { initRouter } from './router'
import type { RawUsuarios, Usuario } from './types'

// ─── Elementos ──────────────────────────────────────────────────────────────

const loginOverlay = document.getElementById('loginOverlay')!
const appShell     = document.getElementById('appShell')!
const inputNome    = document.getElementById('inputNome')    as HTMLInputElement
const inputSenha   = document.getElementById('inputSenha')   as HTMLInputElement
const btnEntrar    = document.getElementById('btnEntrar')     as HTMLButtonElement
const btnSair      = document.getElementById('btnSair')       as HTMLButtonElement
const btnMenu      = document.getElementById('btnMenu')       as HTMLButtonElement
const headerUser   = document.getElementById('headerUser')!
const loginError   = document.getElementById('loginError')!
const statusBar    = document.getElementById('statusBar')!
const toast        = document.getElementById('toast')!

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
  const nome  = inputNome.value.trim()
  const senha = inputSenha.value

  if (!nome || !senha) {
    loginError.textContent = 'Preencha usuário e senha.'
    return
  }

  const result = login(usuarios, nome, senha)

  if (!result) {
    loginError.textContent = 'Usuário ou senha inválidos.'
    inputSenha.value = ''
    inputSenha.focus()
    return
  }

  loginError.textContent = ''
  saveSession(result.uid)
  showApp(result.usuario)
  initRouter(result.uid, result.usuario)
  showToast(`Bem-vindo, ${result.usuario.nome}!`)
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
  inputNome.focus()

  // Eventos de login
  btnEntrar.addEventListener('click', () => handleLogin(usuarios))

  inputSenha.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin(usuarios)
  })

  inputNome.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') inputSenha.focus()
  })
}

// ─── Eventos globais ─────────────────────────────────────────────────────────

btnSair.addEventListener('click', handleSair)
btnMenu.addEventListener('click', handleMenu)

// ─── Start ───────────────────────────────────────────────────────────────────

void init()
