let csrfToken = ''

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
    this.name = 'ApiError'
  }
}

export function setCsrfToken(value: string): void {
  csrfToken = value
}

export function clearCsrfToken(): void {
  csrfToken = ''
}

export function currentCsrfToken(): string {
  return csrfToken
}

export async function apiJson<T>(name: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
  if (init.method && init.method !== 'GET' && csrfToken) headers.set('x-noroeste-csrf', csrfToken)
  const response = await fetch(`/.netlify/functions/${name}`, { ...init, headers, credentials:'include' })
  const value = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) throw new ApiError(String(value['error'] ?? 'Operacao indisponivel.'), response.status)
  return value as T
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 32_768
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

export async function uploadPdf(path: string, bytes: Uint8Array): Promise<string> {
  const response = await apiJson<{ url: string }>('storage-file', { method:'POST', body:JSON.stringify({ path, base64:bytesToBase64(bytes) }) })
  return response.url
}

export async function deleteStoredFile(path: string): Promise<void> {
  await apiJson('storage-file', { method:'DELETE', body:JSON.stringify({ path }) })
}
