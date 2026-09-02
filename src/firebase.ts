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

// ─── Referências ───────────────────────────────────────────────────────────

export const rootRef: DatabaseReference =
  ref(db, '/')

export const masterRef: DatabaseReference =
  ref(db, 'master')

export const pessoasRef: DatabaseReference =
  ref(db, 'master/pessoas')

export function pessoaRef(mid: string): DatabaseReference {
  return ref(db, `master/pessoas/${mid}`)
}

export const usuariosRef: DatabaseReference =
  ref(db, 'usuarios')

export function usuarioRef(uid: string): DatabaseReference {
  return ref(db, `usuarios/${uid}`)
}

export const tarefasRef: DatabaseReference =
  ref(db, 'tarefas')

export const escalaRef: DatabaseReference =
  ref(db, 'escala')

export const programacaoRef: DatabaseReference =
  ref(db, 'programacao')

export const secretarioRef: DatabaseReference =
  ref(db, 'secretario')
