import './style.css'
import {
  loadUsuarios,
  loadCachedUserChoices,
  saveSession,
  loadSession,
  clearSession,
} from './auth'
import { initRouter, navigateBack, navigateModuleIndex } from './router'
import type { RawUsuarios, Usuario } from './types'
import { animateKpis } from './ui/animations'
import { refreshServiceWorkerWeekly } from './pwa-sync'

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

let usuariosDisponiveis: RawUsuarios = {}
let carregandoUsuarios = true

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
    selectUsuario.innerHTML = '<option value="">Nenhum usuário disponível</option>'
    selectUsuario.disabled = true
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

function handleLogin(): void {
  const uid   = selectUsuario.value
  const senha = inputSenha.value

  if (!uid || !senha) {
    loginError.textContent = 'Selecione o usuário e digite a senha.'
    inputSenha.classList.add('field-error')
    setTimeout(() => inputSenha.classList.remove('field-error'), 1000)
    return
  }

  const usuario = usuariosDisponiveis[uid]

  if (carregandoUsuarios && !usuario?.senha) {
    loginError.textContent = 'Carregando os dados do usuário. Tente novamente em instantes.'
    return
  }

  if (!usuario || usuario.senha !== senha || !usuario.ativo) {
    loginError.textContent = 'Usuário ou senha inválidos.'
    inputSenha.classList.add('field-error')
    setTimeout(() => inputSenha.classList.remove('field-error'), 1000)
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

document.addEventListener('click', event => {
  const target = event.target as HTMLElement
  if (target.closest('[data-module-index]')) navigateModuleIndex()
})

const kpiObserver = new MutationObserver(() => animateKpis(document))
kpiObserver.observe(document.getElementById('appContent')!, { childList: true, subtree: true })

// ─── Bootstrap ──────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  setStatus('Carregando dados…')

  usuariosDisponiveis = loadCachedUserChoices()
  if (Object.keys(usuariosDisponiveis).length > 0) populateUsuarioSelect(usuariosDisponiveis)

  // Os campos ficam utilizáveis antes da resposta do Firebase chegar.
  btnEntrar.addEventListener('click', () => handleLogin())
  inputSenha.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin()
  })
  selectUsuario.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') inputSenha.focus()
  })
  selectUsuario.addEventListener('change', () => {
    loginError.textContent = ''
  })

  const usuariosPromise = loadUsuarios()

  try {
    usuariosDisponiveis = await Promise.race([
      usuariosPromise,
      new Promise<RawUsuarios>((_, reject) => {
        setTimeout(() => reject(new Error('Tempo excedido ao carregar usuários')), 8000)
      }),
    ])
    carregandoUsuarios = false
    setStatus('Conectado ao Firebase ✓')
  } catch (err) {
    setStatus('Erro de conexão com Firebase')
    console.error(err)
    if (Object.keys(usuariosDisponiveis).length === 0) {
      loginError.textContent = 'Não foi possível carregar os usuários. Verifique a conexão e tente novamente.'
    } else {
      loginError.textContent = 'Conexão lenta. A lista anterior está disponível; confirme o login quando a conexão voltar.'
    }
  }

  // O timeout informa lentidao, mas nao cancela a leitura. Quando o Firebase
  // responder, recupera automaticamente o login sem exigir recarregar a pagina.
  void usuariosPromise.then(usuarios => {
    usuariosDisponiveis = usuarios
    populateUsuarioSelect(usuariosDisponiveis)
    carregandoUsuarios = false
    loginError.textContent = ''
    setStatus('Conectado ao Firebase ✓')
  }).catch(() => {
    carregandoUsuarios = false
  })

  // Tenta restaurar sessão
  const restored = await tryRestoreSession(usuariosDisponiveis)
  if (restored) return

  // Exibe login
  loginOverlay.classList.remove('hidden')
  if (Object.keys(usuariosDisponiveis).length === 0) populateUsuarioSelect(usuariosDisponiveis)
  selectUsuario.focus()
}

// ─── Eventos globais ─────────────────────────────────────────────────────────

btnSair.addEventListener('click', handleSair)
btnBack.addEventListener('click', handleBack)

window.addEventListener('app-route-change', (event) => {
  const detail = (event as CustomEvent<{ canBack: boolean }>).detail
  const canBack = detail?.canBack === true
  btnBack.classList.toggle('hidden', !canBack)
  btnSair.classList.toggle('hidden', canBack)
})

// ─── Start ───────────────────────────────────────────────────────────────────

void init()

// ─── Service Worker (PWA) ─────────────────────────────────────────────────────

if ('serviceWorker' in navigator) {
  const isLocalDevelopment = location.hostname === '127.0.0.1' || location.hostname === 'localhost'
  if (!isLocalDevelopment) {
    void navigator.serviceWorker.register('/sw.js').then(registration => refreshServiceWorkerWeekly(registration, 'noroeste_admin_shell_sync'))
  } else {
    // Evita que o shell PWA publicado interfira no desenvolvimento local.
    void navigator.serviceWorker.getRegistrations()
      .then(registrations => Promise.all(registrations.map(registration => registration.unregister())))
    if ('caches' in window) {
      void caches.keys().then(keys => Promise.all(
        keys.filter(key => key.startsWith('noroeste-admin-')).map(key => caches.delete(key)),
      ))
    }
  }
}
