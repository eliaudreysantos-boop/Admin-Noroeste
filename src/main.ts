import './style.css'
import {
  loadUsuarios,
  loginByUid,
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

// ─── Status ──────────────────────────────────────────────────────────────────

function setStatus(text: string): void {
  statusBar.textContent = text
}

// ─── Exibir app shell ────────────────────────────────────────────────────────

function showApp(usuario: Usuario): void {
  loginOverlay.classList.add('hidden')
  appShell.classList.remove('hidden')
  headerUser.textContent = usuario.nome
}

// ─── Popular select de usuários ─────────────────────────────────────────────

/** Popula o <select> com usuários ativos ordenados por nome.
 *  Se não houver nenhum usuário ativo, substitui o select por uma mensagem. */
function populateUsuarioSelect(usuarios: RawUsuarios): void {
  const ativos = Object.entries(usuarios)
    .filter(([, u]) => u.ativo)
    .sort(([, a], [, b]) => a.nome.localeCompare(b.nome, 'pt-BR'))

  if (ativos.length === 0) {
    // IA2: replaceWith — evita select vazio e confuso
    const msg = document.createElement('p')
    msg.id = 'selectUsuarioEmpty'
    msg.style.cssText = 'color:var(--danger);font-size:.85rem;margin:4px 0 12px'
    msg.textContent = 'Nenhum usuário ativo encontrado.'
    selectUsuario.replaceWith(msg)
    btnEntrar.disabled = true
    return
  }

  // Opção vazia inicial — evita enviar como o primeiro usuário por acidente
  selectUsuario.innerHTML =
    '<option value="">Selecione seu nome…</option>' +
    ativos.map(([uid, u]) => `<option value="${uid}">${u.nome}</option>`).join('')

  selectUsuario.disabled = false
  btnEntrar.disabled = false
}

// ─── Sessão restaurada ───────────────────────────────────────────────────────

async function tryRestoreSession(usuarios: RawUsuarios): Promise<boolean> {
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

  if (!uid) {
    loginError.textContent = 'Selecione seu nome.'
    selectUsuario.focus()
    return
  }

  if (!senha) {
    loginError.textContent = 'Digite a senha.'
    inputSenha.focus()
    return
  }

  // loginByUid centraliza a validação (ativo + senha)
  const result = loginByUid(usuarios, uid, senha)

  if (!result) {
    loginError.textContent = 'Senha incorreta.'
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

// ─── Botão Menu ──────────────────────────────────────────────────────────────

function handleMenu(): void {
  if (!loadSession()) return
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
    loginOverlay.classList.remove('hidden')
    return
  }

  // Tenta restaurar sessão existente
  const restored = await tryRestoreSession(usuarios)
  if (restored) return

  // Exibe tela de login com select populado
  loginOverlay.classList.remove('hidden')
  populateUsuarioSelect(usuarios)
  selectUsuario.focus()

  // ─── Eventos de login ────────────────────────────────────────────────────

  btnEntrar.addEventListener('click', () => handleLogin(usuarios))

  inputSenha.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin(usuarios)
  })

  selectUsuario.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') inputSenha.focus()
  })

  // IA2: limpa o erro ao trocar de usuário no select
  selectUsuario.addEventListener('change', () => {
    loginError.textContent = ''
  })
}

// ─── Eventos globais ─────────────────────────────────────────────────────────

btnSair.addEventListener('click', handleSair)
btnMenu.addEventListener('click', handleMenu)

// ─── Start ───────────────────────────────────────────────────────────────────

void init()
