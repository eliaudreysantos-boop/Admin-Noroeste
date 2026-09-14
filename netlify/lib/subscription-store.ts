import { cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'
import type { AgendaSubscription } from '../../src/types.ts'

export interface SubscriptionStore {
  get(token: string): Promise<AgendaSubscription | null>
  set(token: string, value: AgendaSubscription): Promise<void>
}

const PRIVATE_PATH = 'agendaAssinaturasPrivadas'

function environment(): Record<string, string | undefined> {
  return ((globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {})
}

export function adminApp(): App {
  const env = environment()
  const databaseURL = env['FIREBASE_DATABASE_URL']?.trim()
  const credentials = env['FIREBASE_SERVICE_ACCOUNT_JSON']?.trim()
  if (!databaseURL || !credentials) throw new Error('Credenciais privadas do calendário não configuradas.')
  const serviceAccount = JSON.parse(credentials) as ServiceAccount
  const name = 'calendar-subscriptions'
  const existing = getApps().find(app => app.name === name)
  return existing ?? initializeApp({
    credential:cert(serviceAccount),
    databaseURL,
  }, name)
}

export function adminDatabase() {
  return getDatabase(adminApp())
}

export const privateSubscriptionStore: SubscriptionStore = {
  async get(token) {
    const snapshot = await adminDatabase().ref(`${PRIVATE_PATH}/${token}`).get()
    return snapshot.exists() ? snapshot.val() as AgendaSubscription : null
  },
  async set(token, value) {
    await adminDatabase().ref(`${PRIVATE_PATH}/${token}`).set(value)
  },
}
