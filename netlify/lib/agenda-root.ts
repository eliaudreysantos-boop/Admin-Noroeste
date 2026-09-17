import { adminDatabase } from './subscription-store.ts'

const PATHS = [
  'master/pessoas', 'master/config', 'tarefas/people', 'tarefas/scale/periods',
  'limpeza/periodos', 'escala/participants', 'escala/scales', 'escala/tables',
  'escala/settings', 'escala/publishedMonth', 'escala/publishedMonths',
  'escala/publishedSnapshots', 'servicoCampo', 'agenda/config', 'agenda/documentos',
] as const

export async function loadAgendaRoot(
  read: (path: string) => Promise<unknown> = async path => {
    const snapshot = await adminDatabase().ref(path).get()
    return snapshot.exists() ? snapshot.val() as unknown : undefined
  },
): Promise<Record<string, unknown>> {
  const values = await Promise.all(PATHS.map(read))
  const root: Record<string, unknown> = {}
  PATHS.forEach((path, index) => {
    const keys = path.split('/')
    let parent = root
    for (const key of keys.slice(0, -1)) parent = (parent[key] ??= {}) as Record<string, unknown>
    parent[keys[keys.length - 1]] = values[index]
  })
  return root
}
