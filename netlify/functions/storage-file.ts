import { getStorage } from 'firebase-admin/storage'
import type { AppPermissions } from '../../src/types.ts'
import { adminApp } from '../lib/subscription-store.ts'
import { appSession, json, objectBody, validCsrf } from '../lib/secure-session.ts'

const MAX_PDF_BYTES = 4 * 1024 * 1024
const MODULES: Record<string, keyof AppPermissions> = {
  tarefas:'tarefas', limpeza:'limpeza', oradores:'oradores', escala:'escala',
  servicoCampo:'servicoCampo',
}

export function validStoragePath(path: string): boolean {
  return path.length <= 240 && /^[A-Za-z0-9/_-]+\.pdf$/.test(path) && !path.includes('//') && !path.includes('..')
}

export function canManageStoragePath(path: string, apps: AppPermissions): boolean {
  if (/^secretario\/templates\/(s21|s88|s3)\.pdf$/.test(path)) return apps.mestre || apps.secretario === true
  if (/^agenda\/documentos\/admin\/[A-Za-z0-9._-]+\.pdf$/.test(path)) return apps.mestre === true
  const match = path.match(/^agenda\/documentos\/modulos\/([^/]+)\//)
  const permission = match ? MODULES[match[1] ?? ''] : undefined
  return Boolean(permission && (apps.mestre || apps[permission] === true))
}

function decodePdf(value: unknown): Uint8Array | null {
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_PDF_BYTES * 4 / 3) + 8) return null
  try {
    const binary = atob(value)
    if (binary.length < 5 || binary.length > MAX_PDF_BYTES || !binary.startsWith('%PDF-')) return null
    return Uint8Array.from(binary, char => char.charCodeAt(0))
  } catch { return null }
}

export default async (request: Request): Promise<Response> => {
  if (!['POST', 'DELETE'].includes(request.method)) return json(405, { error:'Método não permitido.' })
  let session
  try { session = await appSession(request) } catch { return json(503, { error:'Sessão indisponível.' }) }
  if (!session) return json(401, { error:'Sessão expirada.' })
  if (!validCsrf(request, session)) return json(403, { error:'Validação da sessão ausente.' })
  const body = await objectBody(request), path = String(body['path'] ?? '')
  if (!validStoragePath(path) || !canManageStoragePath(path, session.usuario.apps)) return json(403, { error:'Arquivo não autorizado.' })

  try {
    const bucket = getStorage(adminApp()).bucket(), file = bucket.file(path)
    if (request.method === 'DELETE') {
      await file.delete({ ignoreNotFound:true })
      return json(200, { ok:true })
    }
    const bytes = decodePdf(body['base64'])
    if (!bytes) return json(400, { error:'PDF inválido ou maior que 4 MB.' })
    const token = crypto.randomUUID()
    await file.save(bytes, {
      resumable:false,
      contentType:'application/pdf',
      metadata:{ cacheControl:'public,max-age=3600', metadata:{ firebaseStorageDownloadTokens:token } },
    })
    const url = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(path)}?alt=media&token=${encodeURIComponent(token)}`
    return json(200, { url })
  } catch { return json(503, { error:'Armazenamento de PDF indisponível.' }) }
}
