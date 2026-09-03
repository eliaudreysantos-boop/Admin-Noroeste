import { get, usuariosRef }           from './firebase'
import type { Usuario, AppPermissions, RawUsuarios } from './types'

const SESSION_KEY = 'noroeste_uid'

// ─── Leitura ───────────────────────────────────────────────────────────────

export async function loadUsuarios(): Promise<RawUsuarios> {
  const snap = await get(usuariosRef)
  if (!snap.exists()) return {}
  return snap.val() as RawUsuarios
}

// ─── Autenticação — por UID (novo padrão: select de usuário) ───────────────

export function loginByUid(
  usuarios: RawUsuarios,
  uid:      string,
  senha:    string,
): { uid: string; usuario: Usuario } | null {
  const usuario = usuarios[uid]
  if (!usuario || !usuario.ativo) return null
  if (usuario.senha !== senha)    return null
  return { uid, usuario }
}

// ─── Autenticação — legado (por nome digitado) ─────────────────────────────
// Mantida para compatibilidade. Preferir loginByUid.

export function login(
  usuarios: RawUsuarios,
  nome:     string,
  senha:    string,
): { uid: string; usuario: Usuario } | null {
  const nomeLower = nome.trim().toLowerCase()

  for (const [uid, usuario] of Object.entries(usuarios)) {
    if (
      usuario.nome.trim().toLowerCase() === nomeLower &&
      usuario.senha === senha &&
      usuario.ativo
    ) {
      return { uid, usuario }
    }
  }
  return null
}

// ─── Sessão ────────────────────────────────────────────────────────────────

export function saveSession(uid: string): void {
  sessionStorage.setItem(SESSION_KEY, uid)
}

export function loadSession(): string {
  return sessionStorage.getItem(SESSION_KEY) ?? ''
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY)
}

// ─── Permissões ────────────────────────────────────────────────────────────

export function hasModuleAccess(
  usuario: Usuario,
  modulo:  keyof AppPermissions,
): boolean {
  // apps.mestre = Admin → acesso total a todos os módulos
  if (usuario.apps.mestre) return true
  return usuario.apps[modulo] === true
}
