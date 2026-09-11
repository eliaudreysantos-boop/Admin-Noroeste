import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app'
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

function database() {
  const env = environment()
  const databaseURL = env['FIREBASE_DATABASE_URL']?.trim()
  const credentials = env['FIREBASE_SERVICE_ACCOUNT_JSON']?.trim()
  if (!databaseURL || !credentials) throw new Error('Credenciais privadas do calendário não configuradas.')
  const name = 'calendar-subscriptions'
  const existing = getApps().find(app => app.name === name)
  const app = existing ?? initializeApp({
    credential:cert(JSON.parse(credentials) as ServiceAccount),
    databaseURL,
  }, name)
  return getDatabase(app)
}

export const privateSubscriptionStore: SubscriptionStore = {
  async get(token) {
    const snapshot = await database().ref(`${PRIVATE_PATH}/${token}`).get()
    return snapshot.exists() ? snapshot.val() as AgendaSubscription : null
  },
  async set(token, value) {
    await database().ref(`${PRIVATE_PATH}/${token}`).set(value)
  },
}
