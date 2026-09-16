import { apiJson, ApiError } from './secure-api.ts'

export interface DatabaseReference { path: string }

export interface DataSnapshot<T = unknown> {
  exists(): boolean
  val(): T | null
}

const reference = (path: string): DatabaseReference => ({ path:path.replace(/^\/+|\/+$/g, '') })

export function child(parent: DatabaseReference, path: string): DatabaseReference {
  return reference(`${parent.path}/${path}`)
}

type ReadResult = { value?: unknown; error?: string; status?: number }
type PendingRead = { path: string; resolve(value: unknown): void; reject(reason: unknown): void }
let pendingReads: PendingRead[] = []

async function flushReads(): Promise<void> {
  const batch = pendingReads.splice(0, 24)
  if (pendingReads.length) queueMicrotask(() => { void flushReads() })
  const paths = [...new Set(batch.map(item => item.path))]
  try {
    const response = await apiJson<{ results: ReadResult[] }>(`database?paths=${encodeURIComponent(JSON.stringify(paths))}`)
    if (!Array.isArray(response.results) || response.results.length !== paths.length) throw new Error('Resposta de dados incompleta.')
    for (const item of batch) {
      const result = response.results[paths.indexOf(item.path)]!
      if (result.error) item.reject(new ApiError(result.error, result.status ?? 503))
      else if (!Object.prototype.hasOwnProperty.call(result, 'value')) item.reject(new Error('Resposta de dados incompleta.'))
      else item.resolve(result.value)
    }
  } catch (error) { batch.forEach(item => item.reject(error)) }
}

export async function get<T = unknown>(target: DatabaseReference): Promise<DataSnapshot<T>> {
  const value = await new Promise<unknown>((resolve, reject) => {
    pendingReads.push({ path:target.path, resolve, reject })
    // Reads issued together share one Function invocation, without retaining a data cache.
    if (pendingReads.length === 1) queueMicrotask(() => { void flushReads() })
  }) as T | null
  return { exists:() => value !== null && value !== undefined, val:() => value }
}

export async function set(target: DatabaseReference, value: unknown): Promise<void> {
  await apiJson(`database?path=${encodeURIComponent(target.path)}`, { method:'PUT', body:JSON.stringify({ value }) })
}

export async function compareAndSet(target: DatabaseReference, expected: unknown, value: unknown): Promise<void> {
  await apiJson(`database?path=${encodeURIComponent(target.path)}`, { method:'PUT', body:JSON.stringify({ expected, value }) })
}

export async function update(target: DatabaseReference, value: Record<string, unknown>): Promise<void> {
  await apiJson(`database?path=${encodeURIComponent(target.path)}`, { method:'PATCH', body:JSON.stringify({ value }) })
}

export async function compareAndUpdate(target: DatabaseReference, expected: Record<string, unknown>, value: Record<string, unknown>): Promise<void> {
  await apiJson(`database?path=${encodeURIComponent(target.path)}`, { method:'PATCH', body:JSON.stringify({ expected, value }) })
}

export async function remove(target: DatabaseReference): Promise<void> {
  await apiJson(`database?path=${encodeURIComponent(target.path)}`, { method:'DELETE' })
}

export const rootRef = reference('')
export const masterRef = reference('master')
export const pessoasRef = reference('master/pessoas')
export const pessoaRef = (mid: string): DatabaseReference => reference(`master/pessoas/${mid}`)
export const configRef = reference('master/config')
export const configCongregacaoRef = reference('master/config/congregacao')
export const configReunioesRef = reference('master/config/reunioes')
export const configLimpezaRef = reference('master/config/limpeza')
export const limpezaPeriodosRef = reference('limpeza/periodos')
export const limpezaRef = reference('limpeza')
export const configDesignacoesRef = reference('master/config/designacoes')
export const usuariosRef = reference('usuarios')
export const usuarioRef = (uid: string): DatabaseReference => reference(`usuarios/${uid}`)
export const tarefasPeopleRef = reference('tarefas/people')
export const tarefasPessoaRef = (pid: string): DatabaseReference => reference(`tarefas/people/${pid}`)
export const tarefasScaleRef = reference('tarefas/scale/periods')
export const tarefasDiscursosRef = reference('tarefas/discursos')
export const tarefasOradoresRef = reference('tarefas/discursos/oradores')
export const tarefasProgramacaoOradoresRef = reference('tarefas/discursos/programacao')
export const tarefasCongregacoesRef = reference('tarefas/discursos/congregacoes')
export const tarefasPlanejamentoRef = reference('tarefas/planning')
export const tarefasOradoresPublicacoesRef = reference('tarefas/planning/oradoresPublicacoes')
export const tarefasRef = reference('tarefas')
export const tarefasEventosRef = reference('tarefas/events')
export const escalaParticipantsRef = reference('escala/participants')
export const escalaParticipantRef = (eid: string): DatabaseReference => reference(`escala/participants/${eid}`)
export const escalaPubSnapshotsRef = reference('escala/publishedSnapshots')
export const escalaScalesRef = reference('escala/scales')
export const escalaTablesRef = reference('escala/tables')
export const escalaPublishedMonthRef = reference('escala/publishedMonth')
export const escalaPublishedMonthsRef = reference('escala/publishedMonths')
export const escalaSettingsRef = reference('escala/settings')
export const escalaRef = reference('escala')
export const programacaoRef = reference('programacao')
export const secretarioRef = reference('secretario')
export const secretarioPublicadoresRef = reference('secretario/publicadores')
export const secretarioGruposRef = reference('secretario/grupos')
export const servicoCampoRef = reference('servicoCampo')
export const agendaConfigRef = reference('agenda/config')
export const agendaDocumentsRef = reference('agenda/documentos')
