import { initializeApp }                        from 'firebase/app'
import {
  getDatabase,
  ref,
  get,
  set,
  update,
  remove,
  type DatabaseReference,
} from 'firebase/database'

export { get, set, update, remove }

// ─── Config ────────────────────────────────────────────────────────────────

const firebaseConfig = {
  apiKey:            'AIzaSyCh7kQN-MyRuScl98PwAM71_9aC89ra8sM',
  authDomain:        'oradoress2.firebaseapp.com',
  databaseURL:       'https://oradoress2-default-rtdb.firebaseio.com',
  projectId:         'oradoress2',
  storageBucket:     'oradoress2.firebasestorage.app',
  messagingSenderId: '772512696802',
  appId:             '1:772512696802:web:96f718fa2ccbbaa65d91bb',
}

const app = initializeApp(firebaseConfig)
const db  = getDatabase(app)

// ─── Referências — master ──────────────────────────────────────────────────

export const rootRef: DatabaseReference =
  ref(db, '/')

export const masterRef: DatabaseReference =
  ref(db, 'master')

export const pessoasRef: DatabaseReference =
  ref(db, 'master/pessoas')

export function pessoaRef(mid: string): DatabaseReference {
  return ref(db, `master/pessoas/${mid}`)
}

// ─── Referências — master/config ───────────────────────────────────────────

export const configRef: DatabaseReference =
  ref(db, 'master/config')

export const configCongregacaoRef: DatabaseReference =
  ref(db, 'master/config/congregacao')

export const configReunioesRef: DatabaseReference =
  ref(db, 'master/config/reunioes')

export const configLimpezaRef: DatabaseReference =
  ref(db, 'master/config/limpeza')

export const configDesignacoesRef: DatabaseReference =
  ref(db, 'master/config/designacoes')

// ─── Referências — usuarios ────────────────────────────────────────────────

export const usuariosRef: DatabaseReference =
  ref(db, 'usuarios')

export function usuarioRef(uid: string): DatabaseReference {
  return ref(db, `usuarios/${uid}`)
}

// ─── Referências — outros nós ──────────────────────────────────────────────

export const tarefasPeopleRef: DatabaseReference =
  ref(db, 'tarefas/people')

export function tarefasPessoaRef(pid: string): DatabaseReference {
  return ref(db, `tarefas/people/${pid}`)
}

export const tarefasScaleRef: DatabaseReference =
  ref(db, 'tarefas/scale/periods')

export const tarefasDiscursosRef: DatabaseReference =
  ref(db, 'tarefas/discursos')

export const tarefasPlanejamentoRef: DatabaseReference =
  ref(db, 'tarefas/planning')

export const escalaParticipantsRef: DatabaseReference =
  ref(db, 'escala/participants')

export function escalaParticipantRef(eid: string): DatabaseReference {
  return ref(db, `escala/participants/${eid}`)
}

export const escalaPubSnapshotsRef: DatabaseReference =
  ref(db, 'escala/publishedSnapshots')

export const escalaSettingsRef: DatabaseReference =
  ref(db, 'escala/settings')

export const escalaRef: DatabaseReference =
  ref(db, 'escala')

export const programacaoRef: DatabaseReference =
  ref(db, 'programacao')

export const secretarioRef: DatabaseReference =
  ref(db, 'secretario')
