import { cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'


function environment(): Record<string, string | undefined> {
  return ((globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {})
}

function adminApp(): App {
  const env = environment()
  const databaseURL = env['FIREBASE_DATABASE_URL']?.trim()
  const credentials = env['FIREBASE_SERVICE_ACCOUNT_JSON']?.trim()
  if (!databaseURL || !credentials) throw new Error('Credenciais privadas do calendário não configuradas.')
  const serviceAccount = JSON.parse(credentials) as ServiceAccount
  const name = 'noroeste-admin'
  const existing = getApps().find(app => app.name === name)
  return existing ?? initializeApp({
    credential:cert(serviceAccount),
    databaseURL,
  }, name)
}

export function adminDatabase() {
  return getDatabase(adminApp())
}
