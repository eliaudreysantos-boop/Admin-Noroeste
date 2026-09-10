import type {
  AppContext,
  MasterConfig,
  MasterPessoa,
  RawPessoas,
  RawUsuarios,
  Role,
  Sex,
  TipoDesignacao,
  Usuario,
} from '../types'
import {
  get, set, update, remove,
  pessoaRef, pessoasRef,
  usuarioRef, usuariosRef,
  configRef,
  configCongregacaoRef,
  configReunioesRef,
  configDesignacoesRef,
  rootRef,
} from '../firebase'
import { renderMenuCards, type ItemMenu } from '../ui/menu-cards'
import { coordinatorPermissions } from './coordenador-domain'

// ─── Estado do módulo ────────────────────────────────────────────────────────

let pessoas:   RawPessoas  = {}
let usuarios:  RawUsuarios = {}
let config:    MasterConfig = {}
let rootData:  Record<string, unknown> | null = null
let rootLoading = false
let rootLoadError = ''
let restoreCandidate: Record<string, unknown> | null = null
let restoreFileName = ''

type AdminTab = 'indice' | 'pessoas' | 'usuarios' | 'config' | 'vinculos' | 'dados'
let activeTab: AdminTab = 'indice'
let activeConfigSection: 'congregacao' | 'designacoes' = 'congregacao'

let pessoaFilter = { nome: '', role: '', ativo: 'true', sex: '' }

// ─── Constantes ──────────────────────────────────────────────────────────────

const DIAS_SEMANA = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']

const DESIGNACOES_TIPOS: TipoDesignacao[] = [
  'presidente','leitor','microfone','operador','auditorio','entrada',
  'limpeza-super','limpeza-ajudante','limpeza-grupo',
  'escala-campo','discurso-local','discurso-saida','programacao-parte',
]

const DESIGNACAO_LABELS: Record<TipoDesignacao, string> = {
  'presidente':        'Presidente',
  'leitor':            'Leitor',
  'microfone':         'Microfone',
  'operador':          'Operador AV',
  'auditorio':         'Auditório',
  'entrada':           'Entrada',
  'limpeza-super':     'Limpeza — Superintendente',
  'limpeza-ajudante':  'Limpeza — Ajudante',
  'limpeza-grupo':     'Limpeza — Grupo',
  'escala-campo':      'Escala de campo',
  'discurso-local':    'Discurso local',
  'discurso-saida':    'Discurso saída',
  'programacao-parte': 'Programação — parte',
}

// ─── Utilitários gerais ───────────────────────────────────────────────────────

function toast(msg: string, ms = 2600): void {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = msg
  el.classList.add('show')
  setTimeout(() => el.classList.remove('show'), ms)
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function records(value: unknown): Record<string, Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item && typeof item === 'object' && !Array.isArray(item)),
  ) as Record<string, Record<string, unknown>>
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function genId(prefix: string): string {
  // Usado apenas para UIDs de usuários (aleatório é correto para users)
  const arr = new Uint8Array(4)
  crypto.getRandomValues(arr)
  return prefix + Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function midFromWhatsapp(whatsapp: string): Promise<string> {
  // C6: mid = 'm_' + primeiros 8 hex do SHA-256 do whatsapp normalizado (13 dígitos)
  const wpp = normalizeWhatsapp(whatsapp)
  const enc = new TextEncoder().encode(wpp)
  const buf = await crypto.subtle.digest('SHA-256', enc)
  const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
  return `m_${hex.slice(0, 8)}`
}

function normalizeWhatsapp(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.startsWith('55') ? digits : `55${digits}`
}

function roleLabel(role: Role | null): string {
  const map: Record<string, string> = {
    'anciao': 'Ancião', 'servo-ministerial': 'Servo min.',
    'pioneiro': 'Pioneiro', 'batizado': 'Batizado', 'publicador': 'Publicador',
  }
  return role ? (map[role] ?? role) : '—'
}

function sexLabel(sex: Sex | null): string {
  return sex === 'M' ? 'M' : sex === 'F' ? 'F' : '—'
}

function appsList(apps: Usuario['apps']): string {
  const labels: Record<string, string> = {
    mestre:'Admin', tarefas:'Tarefas', limpeza:'Limpeza', oradores:'Oradores', escala:'Escala TPL',
    programacao:'Programação', secretario:'Secretário', individual:'Minha agenda',
  }
  return (Object.keys(apps) as Array<keyof typeof apps>)
    .filter(k => apps[k]).map(k => labels[k]).join(', ') || '—'
}

function appCheck(id: string, label: string, checked: boolean): string {
  return `<label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:4px 0">
    <input type="checkbox" id="uApp_${id}" ${checked ? 'checked' : ''}>
    <span style="font-size:.88rem">${label}</span>
  </label>`
}

function setLoading(btnId: string, loading: boolean, label = 'Salvar'): void {
  const btn = document.getElementById(btnId) as HTMLButtonElement | null
  if (!btn) return
  btn.disabled = loading
  btn.textContent = loading ? 'Salvando…' : label
}

// ─── Utilitários de config ────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(d: string): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function charCounter(textareaId: string, counterId: string, max = 250): void {
  const ta = document.getElementById(textareaId) as HTMLTextAreaElement | null
  const ct = document.getElementById(counterId)
  if (!ta || !ct) return
  const update = () => { ct.textContent = `${ta.value.length}/${max}` }
  ta.addEventListener('input', update)
  update()
}

function keepApprovalIfTextUnchanged(
  savedText: string | undefined,
  currentText: string,
  approvedAt: string | undefined,
): string {
  return savedText === currentText ? (approvedAt ?? '') : ''
}

// ─── Mount ───────────────────────────────────────────────────────────────────

export default function mount(_ctx: AppContext): void {
  activeTab = 'indice'
  activeConfigSection = 'congregacao'
  pessoaFilter = { nome: '', role: '', ativo: 'true', sex: '' }
  rootData = null
  rootLoadError = ''
  restoreCandidate = null
  restoreFileName = ''

  const root = document.getElementById('appContent')!
  root.innerHTML = `
    <div id="mestreRoot">
      <div id="mestreContent"></div>
    </div>`

  void loadAll()
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

function switchTab(t: typeof activeTab): void {
  activeTab = t
  if ((t === 'vinculos' || t === 'dados') && !rootData) {
    void loadRootData()
    return
  }
  renderContent()
}

async function loadRootData(force = false): Promise<void> {
  if (rootLoading || (rootData && !force)) return
  rootLoading = true
  rootLoadError = ''
  renderContent()
  try {
    const snap = await get(rootRef)
    rootData = snap.exists() ? objectValue(snap.val()) : {}
  } catch {
    rootLoadError = 'Não foi possível carregar os dados completos.'
    toast('Erro ao carregar dados para auditoria')
  } finally {
    rootLoading = false
    renderContent()
  }
}

async function loadAll(): Promise<void> {
  document.getElementById('mestreContent')!.innerHTML =
    '<p style="padding:24px;color:var(--ink-3);text-align:center">Carregando…</p>'
  try {
    const [pSnap, uSnap, cSnap] = await Promise.all([
      get(pessoasRef), get(usuariosRef), get(configRef),
    ])
    pessoas  = pSnap.exists()  ? (pSnap.val()  as RawPessoas)  : {}
    usuarios = uSnap.exists()  ? (uSnap.val()  as RawUsuarios) : {}
    config   = cSnap.exists()  ? (cSnap.val()  as MasterConfig): {}
  } catch {
    toast('Erro ao carregar dados do Firebase')
  }
  renderContent()
}

function renderContent(): void {
  if      (activeTab === 'indice')   renderIndex()
  else if (activeTab === 'pessoas')  renderPessoas()
  else if (activeTab === 'usuarios') renderUsuarios()
  else if (activeTab === 'config')   renderConfig()
  else if (activeTab === 'vinculos') renderVinculos()
  else                               renderDados()
}

function renderIndex(): void {
  const content = document.getElementById('mestreContent')
  if (!content) return
  content.innerHTML = '<div style="margin-bottom:14px"><h2 style="font-size:1.05rem;color:var(--blue-deep);margin-bottom:2px">Admin</h2></div><div id="mestreMenu"></div>'
  const items: ItemMenu[] = [
    { id: 'pessoas', titulo: 'Pessoas', subtitulo: 'Cadastros e dados da congregação', icone: '♙', corFundo: '#003F72' },
    { id: 'usuarios', titulo: 'Usuários', subtitulo: 'Acessos e módulos disponíveis', icone: '⚿', corFundo: '#006EB6' },
    { id: 'config', titulo: 'Configuração', subtitulo: 'Congregação, reuniões e designações', icone: '⚙', corFundo: '#5C6062' },
    { id: 'vinculos', titulo: 'Vínculos', subtitulo: 'IDs compartilhados entre os módulos', icone: '⌁', corFundo: '#1A6B3C' },
    { id: 'dados', titulo: 'Dados', subtitulo: 'Backup completo e restauração', icone: '▤', corFundo: '#B3261E' },
  ]
  renderMenuCards(content.querySelector<HTMLElement>('#mestreMenu')!, items, id => switchTab(id as typeof activeTab))
}

interface LinkIssue {
  module: string
  id: string
  kind: 'sem_vinculo' | 'orfao' | 'duplicado'
  detail: string
}

function linkCollections(data: Record<string, unknown>) {
  const tarefas = objectValue(data['tarefas'])
  const escala = objectValue(data['escala'])
  const secretario = objectValue(data['secretario'])
  const programacao = objectValue(data['programacao'])
  const discursos = objectValue(tarefas['discursos'])

  return {
    tarefas: records(tarefas['people']),
    escala: records(escala['participants']),
    oradores: records(discursos['oradores']),
    secretario: records(secretario['pessoas']),
    programacao: {
      ...records(programacao['people']),
      ...records(programacao['pessoas']),
    },
  }
}

function collectDirectLinkIssues(
  module: string,
  collection: Record<string, Record<string, unknown>>,
  required: (item: Record<string, unknown>) => boolean = () => true,
): LinkIssue[] {
  const issues: LinkIssue[] = []
  const byMaster = new Map<string, string[]>()

  Object.entries(collection).forEach(([id, item]) => {
    if (!required(item)) return
    const masterId = typeof item['masterId'] === 'string' ? item['masterId'].trim() : ''
    if (!masterId) {
      issues.push({ module, id, kind: 'sem_vinculo', detail: 'Sem masterId' })
      return
    }
    if (!pessoas[masterId]) {
      issues.push({ module, id, kind: 'orfao', detail: `masterId inexistente: ${masterId}` })
      return
    }
    const ids = byMaster.get(masterId) ?? []
    ids.push(id)
    byMaster.set(masterId, ids)
  })

  byMaster.forEach((ids, masterId) => {
    if (ids.length < 2) return
    ids.forEach(id => issues.push({
      module,
      id,
      kind: 'duplicado',
      detail: `${masterId} também está ligado a ${ids.filter(other => other !== id).join(', ')}`,
    }))
  })
  return issues
}

function collectLinkIssues(data: Record<string, unknown>): LinkIssue[] {
  const collections = linkCollections(data)
  const issues = [
    ...collectDirectLinkIssues('Tarefas', collections.tarefas, item => item['active'] !== false),
    ...collectDirectLinkIssues('Escala', collections.escala, item => item['active'] !== false),
    ...collectDirectLinkIssues('Secretário', collections.secretario),
    ...collectDirectLinkIssues('Programação', collections.programacao),
  ]

  Object.entries(usuarios).forEach(([uid, user]) => {
    if (user.secretarioPapel !== 'publicador') return
    if (!user.masterId) {
      issues.push({ module: 'Usuários', id: uid, kind: 'sem_vinculo', detail: 'Publicador sem masterId' })
    } else if (!pessoas[user.masterId]) {
      issues.push({ module: 'Usuários', id: uid, kind: 'orfao', detail: `masterId inexistente: ${user.masterId}` })
    }
  })

  Object.entries(collections.oradores).forEach(([id, orador]) => {
    if (orador['ativo'] === false || orador['tipo'] === 'visitante') return
    const directMaster = typeof orador['masterId'] === 'string' ? orador['masterId'] : ''
    if (directMaster) {
      if (!pessoas[directMaster]) issues.push({ module: 'Oradores', id, kind: 'orfao', detail: `masterId inexistente: ${directMaster}` })
      return
    }
    const pessoaId = typeof orador['pessoaId'] === 'string' ? orador['pessoaId'] : ''
    if (!pessoaId) {
      issues.push({ module: 'Oradores', id, kind: 'sem_vinculo', detail: 'Orador local sem pessoaId' })
      return
    }
    const tarefaPessoa = collections.tarefas[pessoaId]
    if (!tarefaPessoa) {
      issues.push({ module: 'Oradores', id, kind: 'orfao', detail: `pessoaId inexistente em Tarefas: ${pessoaId}` })
      return
    }
    const masterId = typeof tarefaPessoa['masterId'] === 'string' ? tarefaPessoa['masterId'] : ''
    if (!masterId || !pessoas[masterId]) {
      issues.push({ module: 'Oradores', id, kind: masterId ? 'orfao' : 'sem_vinculo', detail: masterId ? `masterId indireto inexistente: ${masterId}` : `Pessoa ${pessoaId} sem masterId` })
    }
  })

  return issues.sort((a, b) => a.module.localeCompare(b.module, 'pt-BR') || a.id.localeCompare(b.id))
}

function renderVinculos(): void {
  const mc = document.getElementById('mestreContent')!
  if (rootLoadError) {
    mc.innerHTML = `<div style="padding:18px;border:1px solid #E6B8B5;background:#FFF4F3;border-radius:8px;color:#B3261E;font-size:.84rem">${escapeHtml(rootLoadError)}<br><button id="btnRetryRoot" class="btn btn-ghost" type="button" style="margin-top:10px">Tentar novamente</button></div>`
    document.getElementById('btnRetryRoot')?.addEventListener('click', () => void loadRootData(true))
    return
  }
  if (rootLoading || !rootData) {
    mc.innerHTML = '<p style="padding:24px;color:var(--ink-3);text-align:center">Verificando vínculos...</p>'
    return
  }

  const issues = collectLinkIssues(rootData)
  const orphanCount = issues.filter(item => item.kind === 'orfao').length
  const missingCount = issues.filter(item => item.kind === 'sem_vinculo').length
  const duplicateCount = issues.filter(item => item.kind === 'duplicado').length
  const labels: Record<LinkIssue['kind'], string> = {
    sem_vinculo: 'Sem vínculo',
    orfao: 'ID órfão',
    duplicado: 'Vínculo duplicado',
  }

  mc.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px">
      <div style="font-size:.8rem;color:var(--ink-3)">${issues.length ? `${issues.length} item${issues.length === 1 ? '' : 's'} para revisar` : 'Todos os vínculos estão consistentes'}</div>
      <button id="btnRefreshLinks" class="btn btn-ghost" type="button">Atualizar</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">
      ${linkMetric('Sem vínculo', missingCount, '#C8922A')}
      ${linkMetric('IDs órfãos', orphanCount, '#B3261E')}
      ${linkMetric('Duplicados', duplicateCount, '#7E3AF2')}
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${issues.length ? issues.map(item => `
        <div style="border:1px solid var(--border);border-left:4px solid ${item.kind === 'orfao' ? '#B3261E' : item.kind === 'duplicado' ? '#7E3AF2' : '#C8922A'};border-radius:8px;padding:10px 12px">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
            <strong style="font-size:.84rem">${escapeHtml(item.module)}</strong>
            <span style="font-size:.7rem;font-weight:700;color:var(--ink-3)">${labels[item.kind]}</span>
          </div>
          <div style="font-family:monospace;font-size:.72rem;margin-top:4px;overflow-wrap:anywhere">${escapeHtml(item.id)}</div>
          <div style="font-size:.76rem;color:var(--ink-3);margin-top:3px">${escapeHtml(item.detail)}</div>
        </div>`).join('') : '<div style="padding:18px;border:1px solid #B7DEC7;background:#F1FAF4;border-radius:8px;color:#1A6B3C;font-size:.84rem">Nenhum vínculo ausente, órfão ou duplicado.</div>'}
    </div>`

  document.getElementById('btnRefreshLinks')?.addEventListener('click', () => void loadRootData(true))
}

function linkMetric(label: string, value: number, color: string): string {
  return `<div style="border:1px solid var(--border);border-radius:8px;padding:10px;background:var(--surface)"><div style="font-size:1.1rem;font-weight:800;color:${color}">${value}</div><div style="font-size:.68rem;color:var(--ink-3);margin-top:3px">${label}</div></div>`
}

interface BackupSummary {
  pessoas: number
  usuarios: number
  modulos: number
}

type BackupValidation =
  | { ok: true; data: Record<string, unknown>; summary: BackupSummary }
  | { ok: false; error: string }

function hasActiveAdmin(candidate: RawUsuarios): boolean {
  return Object.values(candidate).some(user => user.ativo && user.apps?.mestre === true)
}

function validateFirebaseValue(value: unknown, path = 'raiz'): string | null {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return null
  if (typeof value === 'number') return Number.isFinite(value) ? null : `${path} contém um número inválido.`
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const error = validateFirebaseValue(value[index], `${path}[${index}]`)
      if (error) return error
    }
    return null
  }
  if (!value || typeof value !== 'object') return `${path} contém um valor incompatível.`

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (!key || /[.#$\[\]\/]/.test(key)) return `${path} contém a chave inválida "${key}".`
    const error = validateFirebaseValue(child, `${path}.${key}`)
    if (error) return error
  }
  return null
}

function validateBackup(value: unknown): BackupValidation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'O arquivo precisa conter a raiz completa do banco.' }
  }
  const data = value as Record<string, unknown>
  const master = objectValue(data['master'])
  const backupPessoas = records(master['pessoas'])
  const backupUsuarios = records(data['usuarios'])

  if (!data['master'] || !master['pessoas']) {
    return { ok: false, error: 'O arquivo não contém master/pessoas.' }
  }
  if (!data['usuarios'] || Object.keys(backupUsuarios).length === 0) {
    return { ok: false, error: 'O arquivo não contém usuários.' }
  }

  for (const [uid, rawUser] of Object.entries(backupUsuarios)) {
    const apps = objectValue(rawUser['apps'])
    if (typeof rawUser['nome'] !== 'string' || typeof rawUser['senha'] !== 'string' ||
        typeof rawUser['ativo'] !== 'boolean' || !rawUser['apps'] || Array.isArray(rawUser['apps']) ||
        typeof apps['mestre'] !== 'boolean') {
      return { ok: false, error: `O usuário ${uid} não tem a estrutura esperada.` }
    }
  }

  if (!hasActiveAdmin(backupUsuarios as unknown as RawUsuarios)) {
    return { ok: false, error: 'O backup precisa manter ao menos um Admin ativo.' }
  }
  const firebaseError = validateFirebaseValue(data)
  if (firebaseError) return { ok: false, error: firebaseError }

  return {
    ok: true,
    data,
    summary: {
      pessoas: Object.keys(backupPessoas).length,
      usuarios: Object.keys(backupUsuarios).length,
      modulos: Object.keys(data).length,
    },
  }
}

function backupFileName(prefix = 'noroeste-backup'): string {
  return `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`
}

function downloadBackup(data: Record<string, unknown>, prefix?: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = backupFileName(prefix)
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function renderDados(): void {
  const mc = document.getElementById('mestreContent')!
  if (rootLoadError) {
    mc.innerHTML = `<div style="padding:18px;border:1px solid #E6B8B5;background:#FFF4F3;border-radius:8px;color:#B3261E;font-size:.84rem">${escapeHtml(rootLoadError)}<br><button id="btnRetryRoot" class="btn btn-ghost" type="button" style="margin-top:10px">Tentar novamente</button></div>`
    document.getElementById('btnRetryRoot')?.addEventListener('click', () => void loadRootData(true))
    return
  }
  if (rootLoading || !rootData) {
    mc.innerHTML = '<p style="padding:24px;color:var(--ink-3);text-align:center">Carregando dados...</p>'
    return
  }

  const validated = restoreCandidate ? validateBackup(restoreCandidate) : null
  mc.innerHTML = `
    <section style="padding-bottom:18px;border-bottom:1px solid var(--border);margin-bottom:18px">
      <h3 style="font-size:.95rem;margin:0 0 6px;color:var(--blue-deep)">Backup completo</h3>
      <p style="font-size:.8rem;color:var(--ink-3);margin:0 0 12px">Baixa uma cópia de todos os módulos e configurações.</p>
      <button id="btnDownloadBackup" class="btn btn-primary" type="button">Baixar backup</button>
    </section>
    <section>
      <h3 style="font-size:.95rem;margin:0 0 6px;color:var(--blue-deep)">Restaurar backup</h3>
      <p style="font-size:.8rem;color:var(--ink-3);margin:0 0 12px">A restauração substitui todos os dados atuais. Um backup de segurança será baixado antes da troca.</p>
      <label class="form-label" for="restoreFile">Arquivo JSON</label>
      <input id="restoreFile" class="form-input" type="file" accept="application/json,.json">
      ${validated?.ok ? `
        <div style="margin-top:10px;padding:10px 12px;border:1px solid #B7DEC7;background:#F1FAF4;border-radius:8px;font-size:.78rem;color:#1A6B3C">
          <strong>${escapeHtml(restoreFileName)}</strong><br>
          ${validated.summary.pessoas} pessoas, ${validated.summary.usuarios} usuários e ${validated.summary.modulos} áreas na raiz.
        </div>
        <div class="form-group" style="margin-top:12px">
          <label class="form-label" for="restorePhrase">Digite RESTAURAR para confirmar</label>
          <input id="restorePhrase" class="form-input" autocomplete="off" placeholder="RESTAURAR">
        </div>
        <button id="btnRestoreBackup" class="btn btn-danger" type="button" disabled>Restaurar todos os dados</button>` : ''}
    </section>`

  document.getElementById('btnDownloadBackup')?.addEventListener('click', () => downloadBackup(rootData!))
  document.getElementById('restoreFile')?.addEventListener('change', event => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0]
    if (file) void readRestoreFile(file)
  })
  const phrase = document.getElementById('restorePhrase') as HTMLInputElement | null
  const restoreButton = document.getElementById('btnRestoreBackup') as HTMLButtonElement | null
  phrase?.addEventListener('input', () => { if (restoreButton) restoreButton.disabled = phrase.value !== 'RESTAURAR' })
  restoreButton?.addEventListener('click', () => void restoreBackup())
}

async function readRestoreFile(file: File): Promise<void> {
  if (file.size > 20 * 1024 * 1024) {
    restoreCandidate = null
    restoreFileName = ''
    toast('O arquivo ultrapassa o limite de 20 MB')
    renderDados()
    return
  }
  try {
    const parsed = JSON.parse(await file.text()) as unknown
    const validation = validateBackup(parsed)
    if (!validation.ok) {
      restoreCandidate = null
      restoreFileName = ''
      toast(validation.error, 5000)
      renderDados()
      return
    }
    restoreCandidate = validation.data
    restoreFileName = file.name
    renderDados()
  } catch {
    restoreCandidate = null
    restoreFileName = ''
    toast('Não foi possível ler este arquivo JSON')
    renderDados()
  }
}

async function restoreBackup(): Promise<void> {
  if (!restoreCandidate || !rootData) return
  const phrase = document.getElementById('restorePhrase') as HTMLInputElement | null
  if (phrase?.value !== 'RESTAURAR') return
  if (!confirm('Restaurar este backup e substituir todos os dados atuais?')) return

  const button = document.getElementById('btnRestoreBackup') as HTMLButtonElement | null
  if (button) { button.disabled = true; button.textContent = 'Restaurando...' }
  try {
    downloadBackup(rootData, 'noroeste-antes-da-restauracao')
    await set(rootRef, restoreCandidate)
    restoreCandidate = null
    restoreFileName = ''
    rootData = null
    await loadAll()
    activeTab = 'dados'
    await loadRootData(true)
    toast('Backup restaurado com sucesso')
  } catch {
    toast('A restauração falhou; os dados atuais foram preservados', 5000)
    if (button) { button.disabled = false; button.textContent = 'Restaurar todos os dados' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA: PESSOAS
// ─────────────────────────────────────────────────────────────────────────────

function renderPessoas(): void {
  const mc = document.getElementById('mestreContent')!

  const filtered = Object.entries(pessoas).filter(([, p]) => {
    if (pessoaFilter.ativo === 'true'  && !p.active) return false
    if (pessoaFilter.ativo === 'false' &&  p.active) return false
    if (pessoaFilter.role  && p.role !== pessoaFilter.role) return false
    if (pessoaFilter.sex   && p.sex  !== pessoaFilter.sex)  return false
    if (pessoaFilter.nome  && !p.name.toLowerCase().includes(pessoaFilter.nome.toLowerCase())) return false
    return true
  }).sort((a, b) => a[1].name.localeCompare(b[1].name, 'pt-BR'))

  mc.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
      <input id="pFiltroNome" class="form-input" placeholder="Buscar nome…"
        value="${escapeHtml(pessoaFilter.nome)}" style="flex:2;min-width:120px">
      <select id="pFiltroRole" class="form-select" style="flex:2;min-width:120px">
        <option value="">Todas funções</option>
        <option value="anciao">Ancião</option>
        <option value="servo-ministerial">Servo ministerial</option>
        <option value="pioneiro">Pioneiro</option>
        <option value="batizado">Batizado</option>
        <option value="publicador">Publicador</option>
      </select>
      <select id="pFiltroSex" class="form-select" style="flex:1;min-width:90px">
        <option value="">M + F</option>
        <option value="M">Irmãos</option>
        <option value="F">Irmãs</option>
      </select>
      <select id="pFiltroAtivo" class="form-select" style="flex:1;min-width:90px">
        <option value="true">Ativos</option>
        <option value="false">Inativos</option>
        <option value="">Todos</option>
      </select>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <span style="font-size:.8rem;color:var(--ink-3)">
        ${filtered.length} pessoa${filtered.length !== 1 ? 's' : ''}
        · Total: ${Object.keys(pessoas).length}
      </span>
      <button id="btnAddPessoa" class="btn btn-primary" style="padding:5px 12px;font-size:.82rem">
        + Adicionar
      </button>
    </div>
    <div id="pessoaList">
      ${filtered.length
        ? filtered.map(([mid, p]) => pessoaCard(mid, p)).join('')
        : '<p style="color:var(--ink-3);text-align:center;padding:24px 0">Nenhuma pessoa encontrada.</p>'}
    </div>`

  ;(document.getElementById('pFiltroRole')  as HTMLSelectElement).value = pessoaFilter.role
  ;(document.getElementById('pFiltroSex')   as HTMLSelectElement).value = pessoaFilter.sex
  ;(document.getElementById('pFiltroAtivo') as HTMLSelectElement).value = pessoaFilter.ativo

  document.getElementById('pFiltroNome')!.addEventListener('input', e => {
    pessoaFilter.nome = (e.target as HTMLInputElement).value
    renderPessoas()
  })
  document.getElementById('pFiltroRole')!.addEventListener('change', e => {
    pessoaFilter.role = (e.target as HTMLSelectElement).value
    renderPessoas()
  })
  document.getElementById('pFiltroSex')!.addEventListener('change', e => {
    pessoaFilter.sex = (e.target as HTMLSelectElement).value
    renderPessoas()
  })
  document.getElementById('pFiltroAtivo')!.addEventListener('change', e => {
    pessoaFilter.ativo = (e.target as HTMLSelectElement).value
    renderPessoas()
  })
  document.getElementById('btnAddPessoa')!
    .addEventListener('click', () => openPessoaModal(null))

  document.querySelectorAll<HTMLButtonElement>('[data-edit-pessoa]').forEach(btn => {
    btn.addEventListener('click', () => openPessoaModal(btn.dataset['editPessoa']!))
  })
  document.querySelectorAll<HTMLButtonElement>('[data-del-pessoa]').forEach(btn => {
    btn.addEventListener('click', () => void deletePessoa(btn.dataset['delPessoa']!))
  })
}

function pessoaCard(mid: string, p: MasterPessoa): string {
  const badge = p.active
    ? `<span style="background:#E3F5EB;color:#1A6B3C;padding:1px 7px;border-radius:10px;font-size:.7rem;font-weight:600">Ativo</span>`
    : `<span style="background:#FEE;color:#B3261E;padding:1px 7px;border-radius:10px;font-size:.7rem;font-weight:600">Inativo</span>`
  return `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;
      padding:10px 12px;margin-bottom:6px;display:flex;align-items:center;gap:8px">
      <div style="width:34px;height:34px;border-radius:50%;background:var(--blue-light);
        display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:700;
        color:var(--blue-deep);flex-shrink:0">
        ${escapeHtml(p.name.charAt(0).toUpperCase())}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${escapeHtml(p.name)}
        </div>
        <div style="font-size:.75rem;color:var(--ink-3);display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:1px">
          <span>${roleLabel(p.role)}</span>
          <span>${sexLabel(p.sex)}</span>
          ${badge}
          ${p.limpeza?.grupo ? `<span>G${p.limpeza.grupo}</span>` : ''}
        </div>
      </div>
      <button class="btn btn-ghost" data-edit-pessoa="${escapeHtml(mid)}"
        style="padding:4px 10px;font-size:.78rem;flex-shrink:0">Editar</button>
      <button class="btn btn-danger" data-del-pessoa="${escapeHtml(mid)}"
        style="padding:4px 8px;font-size:.82rem;flex-shrink:0">✕</button>
    </div>`
}

function openPessoaModal(mid: string | null): void {
  const p = mid ? pessoas[mid] : null

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal">
      <h2>${mid ? 'Editar Pessoa' : 'Nova Pessoa'}</h2>
      <div class="form-group">
        <label class="form-label">Nome *</label>
        <input id="pNome" class="form-input" value="${escapeHtml(p?.name)}" placeholder="Nome">
      </div>
      <div class="form-group">
        <label class="form-label">WhatsApp
          <span style="color:var(--ink-3);font-weight:400;text-transform:none"> — 55 + DDD + número</span>
        </label>
        <input id="pWpp" class="form-input" value="${escapeHtml(p?.whatsapp)}"
          placeholder="5579999999999" inputmode="numeric">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group">
          <label class="form-label">Sexo</label>
          <select id="pSex" class="form-select">
            <option value="">—</option>
            <option value="M" ${p?.sex === 'M' ? 'selected' : ''}>Masculino</option>
            <option value="F" ${p?.sex === 'F' ? 'selected' : ''}>Feminino</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Função</label>
          <select id="pRole" class="form-select">
            <option value="">—</option>
            <option value="anciao"            ${p?.role === 'anciao'            ? 'selected' : ''}>Ancião</option>
            <option value="servo-ministerial" ${p?.role === 'servo-ministerial' ? 'selected' : ''}>Servo ministerial</option>
            <option value="pioneiro"          ${p?.role === 'pioneiro'          ? 'selected' : ''}>Pioneiro</option>
            <option value="batizado"          ${p?.role === 'batizado'          ? 'selected' : ''}>Batizado</option>
            <option value="publicador"        ${p?.role === 'publicador'        ? 'selected' : ''}>Publicador</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="pAtivo" ${(p?.active ?? true) ? 'checked' : ''}>
          <span class="form-label" style="margin:0">Ativo</span>
        </label>
      </div>
      <div style="display:flex;gap:8px;margin-top:4px">
        <button id="btnCancelPessoa" class="btn btn-ghost" style="flex:1">Cancelar</button>
        <button id="btnSalvarPessoa" class="btn btn-primary" style="flex:1">Salvar</button>
      </div>
    </div>`

  document.body.appendChild(overlay)
  ;(document.getElementById('pNome') as HTMLInputElement).focus()

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
  document.getElementById('btnCancelPessoa')!.addEventListener('click', () => overlay.remove())
  document.getElementById('btnSalvarPessoa')!
    .addEventListener('click', () => void savePessoa(mid, overlay))
}

async function savePessoa(mid: string | null, overlay: HTMLElement): Promise<void> {
  const name    = (document.getElementById('pNome')  as HTMLInputElement).value.trim()
  const wppRaw  = (document.getElementById('pWpp')   as HTMLInputElement).value.trim()
  const sexVal  = (document.getElementById('pSex')   as HTMLSelectElement).value
  const roleVal = (document.getElementById('pRole')  as HTMLSelectElement).value
  const ativo   = (document.getElementById('pAtivo') as HTMLInputElement).checked

  if (!name) { toast('Preencha o nome'); return }

  const wpp = wppRaw ? normalizeWhatsapp(wppRaw) : ''
  if (wpp && wpp.length < 12) { toast('WhatsApp inválido — mínimo 12 dígitos'); return }

  // C6: mid derivado do SHA-256 do whatsapp normalizado; fallback aleatório se sem tel
  const finalMid = mid ?? (wpp ? await midFromWhatsapp(wpp) : genId('m_'))
  const existing = mid ? pessoas[mid] : undefined

  const pessoa: MasterPessoa = {
    name,
    whatsapp: wpp,
    sex:     (sexVal  as Sex  | '') ? (sexVal  as Sex)  : null,
    role:    (roleVal as Role | '') ? (roleVal as Role) : null,
    active:  ativo,
    limpeza: existing?.limpeza ?? { grupo: null },
  }

  setLoading('btnSalvarPessoa', true)
  try {
    if (existing) await update(pessoaRef(finalMid), pessoa)
    else await set(pessoaRef(finalMid), pessoa)
    pessoas[finalMid] = existing ? { ...existing, ...pessoa } : pessoa
    rootData = null
    overlay.remove()
    toast(mid ? 'Pessoa atualizada ✓' : 'Pessoa adicionada ✓')
    renderPessoas()
  } catch {
    toast('Erro ao salvar — verifique a conexão')
    setLoading('btnSalvarPessoa', false)
  }
}

async function deletePessoa(mid: string): Promise<void> {
  const p = pessoas[mid]
  if (!p) return
  try {
    const snap = await get(rootRef)
    const freshRoot = snap.exists() ? objectValue(snap.val()) : {}
    const references = findMasterReferences(freshRoot, mid)
    if (references.length) {
      rootData = freshRoot
      activeTab = 'vinculos'
      renderContent()
      toast(`Não é possível remover: ${references.join(', ')}`, 5000)
      return
    }
  } catch {
    toast('Não foi possível verificar os vínculos. A pessoa não foi removida.', 5000)
    return
  }
  if (!confirm(`Remover "${p.name}" permanentemente? Esta ação não pode ser desfeita.`)) return
  try {
    await remove(pessoaRef(mid))
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete pessoas[mid]
    rootData = null
    toast('Pessoa removida')
    renderPessoas()
  } catch {
    toast('Erro ao remover')
  }
}

function findMasterReferences(data: Record<string, unknown>, mid: string): string[] {
  const collections = linkCollections(data)
  const found = new Set<string>()
  const labels: Record<string, string> = {
    tarefas: 'Tarefas', escala: 'Escala TPL', oradores: 'Oradores',
    secretario: 'Secretário', programacao: 'Programação',
  }
  Object.entries(collections).forEach(([module, collection]) => {
    Object.values(collection).forEach(item => {
      if (item['masterId'] === mid) found.add(labels[module] ?? module)
      if (module === 'oradores') {
        const pessoaId = typeof item['pessoaId'] === 'string' ? item['pessoaId'] : ''
        if (pessoaId && collections.tarefas[pessoaId]?.['masterId'] === mid) found.add('Oradores')
      }
    })
  })
  Object.values(records(data['usuarios'])).forEach(user => {
    if (user['masterId'] === mid) found.add('Usuários')
  })
  const limpeza = objectValue(objectValue(objectValue(data['master'])['config'])['limpeza'])
  Object.values(records(limpeza['gruposConfig'])).forEach(group => {
    if (group['superintendenteMid'] === mid || (Array.isArray(group['ajudantesMid']) && group['ajudantesMid'].includes(mid))) {
      found.add('Grupos de limpeza')
    }
  })
  return [...found]
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA: USUÁRIOS
// ─────────────────────────────────────────────────────────────────────────────

function renderUsuarios(): void {
  const mc = document.getElementById('mestreContent')!
  const list = Object.entries(usuarios)
    .sort((a, b) => a[1].nome.localeCompare(b[1].nome, 'pt-BR'))

  mc.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
      <button id="btnAddUsuario" class="btn btn-primary" style="padding:5px 12px;font-size:.82rem">
        + Adicionar
      </button>
    </div>
    <div id="usuarioList">
      ${list.length
        ? list.map(([uid, u]) => usuarioCard(uid, u)).join('')
        : '<p style="color:var(--ink-3);text-align:center;padding:24px 0">Nenhum usuário.</p>'}
    </div>`

  document.getElementById('btnAddUsuario')!
    .addEventListener('click', () => openUsuarioModal(null))
  document.querySelectorAll<HTMLButtonElement>('[data-edit-usuario]').forEach(btn => {
    btn.addEventListener('click', () => openUsuarioModal(btn.dataset['editUsuario']!))
  })
  document.querySelectorAll<HTMLButtonElement>('[data-del-usuario]').forEach(btn => {
    btn.addEventListener('click', () => void deleteUsuario(btn.dataset['delUsuario']!))
  })
}

function usuarioCard(uid: string, u: Usuario): string {
  const badge = u.ativo
    ? `<span style="background:#E3F5EB;color:#1A6B3C;padding:1px 7px;border-radius:10px;font-size:.7rem;font-weight:600">Ativo</span>`
    : `<span style="background:#FEE;color:#B3261E;padding:1px 7px;border-radius:10px;font-size:.7rem;font-weight:600">Inativo</span>`
  return `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;
      padding:10px 12px;margin-bottom:6px;display:flex;align-items:center;gap:8px">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:.9rem;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          ${escapeHtml(u.nome)} ${badge}
        </div>
        <div style="font-size:.75rem;color:var(--ink-3);margin-top:2px">Apps: ${escapeHtml(appsList(u.apps))}</div>
        ${u.secretarioPapel === 'coordenador' ? '<div style="font-size:.72rem;color:#006EB6;font-weight:700;margin-top:2px">Coordenador</div>' : ''}
        <div style="font-size:.7rem;color:var(--ink-3);margin-top:1px;font-family:monospace">${escapeHtml(uid)}</div>
      </div>
      <button class="btn btn-ghost" data-edit-usuario="${escapeHtml(uid)}"
        style="padding:4px 10px;font-size:.78rem;flex-shrink:0">Editar</button>
      <button class="btn btn-danger" data-del-usuario="${escapeHtml(uid)}"
        style="padding:4px 8px;font-size:.82rem;flex-shrink:0">✕</button>
    </div>`
}

function openUsuarioModal(uid: string | null): void {
  const u    = uid ? usuarios[uid] : undefined
  const apps = u?.apps ?? {
    mestre:false, tarefas:false, limpeza:false, escala:false,
    oradores:false, programacao:false, secretario:false,
  }

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal">
      <h2>${uid ? 'Editar Usuário' : 'Novo Usuário'}</h2>
      <div class="form-group">
        <label class="form-label">Nome *</label>
        <input id="uNome" class="form-input" value="${escapeHtml(u?.nome)}" placeholder="Nome de login">
      </div>
      <div class="form-group">
        <label class="form-label">Senha *</label>
        <input id="uSenha" class="form-input" type="password"
          value="${escapeHtml(u?.senha)}" placeholder="Senha" autocomplete="new-password">
      </div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="uAtivo" ${(u?.ativo ?? true) ? 'checked' : ''}>
          <span class="form-label" style="margin:0">Ativo</span>
        </label>
      </div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="uCoordenador" ${u?.secretarioPapel === 'coordenador' ? 'checked' : ''}>
          <span class="form-label" style="margin:0">Acesso do coordenador</span>
        </label>
        <p class="form-help">Acesso somente aos períodos e documentos dos módulos selecionados.</p>
      </div>
      <div class="form-group">
        <span class="form-label" style="display:block;margin-bottom:6px">Módulos</span>
        <div id="uAdminPermission">${appCheck('mestre', 'Admin', apps.mestre)}</div>
        ${appCheck('tarefas',     'Tarefas',      apps.tarefas)}
        ${appCheck('limpeza',     'Limpeza',      apps.limpeza ?? false)}
        ${appCheck('oradores',    'Oradores',     apps.oradores ?? false)}
        ${appCheck('escala',      'Escala TPL',   apps.escala)}
        ${appCheck('programacao', 'Programação',  apps.programacao)}
        ${appCheck('secretario',  'Secretário',   apps.secretario)}
        <div id="uAgendaPermission">${appCheck('individual', 'Minha agenda', apps.individual ?? false)}</div>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button id="btnCancelUsuario" class="btn btn-ghost" style="flex:1">Cancelar</button>
        <button id="btnSalvarUsuario" class="btn btn-primary" style="flex:1">Salvar</button>
      </div>
    </div>`

  document.body.appendChild(overlay)

  const syncCoordinator = () => {
    const enabled = (document.getElementById('uCoordenador') as HTMLInputElement).checked
    ;['mestre', 'individual'].forEach(app => { const input = document.getElementById(`uApp_${app}`) as HTMLInputElement; input.disabled = enabled; if (enabled) input.checked = false })
    document.getElementById('uAdminPermission')?.classList.toggle('hidden', enabled)
    document.getElementById('uAgendaPermission')?.classList.toggle('hidden', enabled)
  }
  document.getElementById('uCoordenador')!.addEventListener('change', syncCoordinator)
  syncCoordinator()

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
  document.getElementById('btnCancelUsuario')!.addEventListener('click', () => overlay.remove())
  document.getElementById('btnSalvarUsuario')!
    .addEventListener('click', () => void saveUsuario(uid, overlay))
}

async function saveUsuario(uid: string | null, overlay: HTMLElement): Promise<void> {
  const nome     = (document.getElementById('uNome')     as HTMLInputElement).value.trim()
  const senha    = (document.getElementById('uSenha')    as HTMLInputElement).value
  const ativo    = (document.getElementById('uAtivo')    as HTMLInputElement).checked
  const coordenador = (document.getElementById('uCoordenador') as HTMLInputElement).checked

  if (!nome)  { toast('Preencha o nome');  return }
  if (!senha) { toast('Preencha a senha'); return }

  const checkApp = (id: string) =>
    (document.getElementById(`uApp_${id}`) as HTMLInputElement).checked

  const selectedApps = {
    mestre: checkApp('mestre'), tarefas: checkApp('tarefas'), limpeza: checkApp('limpeza'),
    oradores: checkApp('oradores'), escala: checkApp('escala'), programacao: checkApp('programacao'),
    secretario: checkApp('secretario'), individual: checkApp('individual'),
  }
  const apps = coordenador ? coordinatorPermissions(selectedApps) : selectedApps
  if (coordenador && ![apps.tarefas, apps.limpeza, apps.oradores, apps.escala, apps.programacao, apps.secretario].some(Boolean)) { toast('Selecione ao menos um módulo para o Coordenador'); return }
  const existing = uid ? usuarios[uid] : undefined
  const usuario: Usuario = {
    ...(uid && usuarios[uid] ? usuarios[uid] : {}),
    nome, senha, ativo,
    apps,
    ...(coordenador ? { secretarioPapel: 'coordenador' as const } : existing?.secretarioPapel && existing.secretarioPapel !== 'coordenador' ? { secretarioPapel: existing.secretarioPapel } : {}),
  }
  if (coordenador) delete usuario.masterId
  else if (existing?.secretarioPapel === 'coordenador') delete usuario.secretarioPapel
  const finalUid = uid ?? genId('u_')
  const proposedUsuarios: RawUsuarios = { ...usuarios, [finalUid]: usuario }
  if (!hasActiveAdmin(proposedUsuarios)) {
    toast('Mantenha ao menos um usuário Admin ativo', 4000)
    return
  }
  setLoading('btnSalvarUsuario', true)

  try {
    await set(usuarioRef(finalUid), usuario)
    usuarios[finalUid] = usuario
    rootData = null
    overlay.remove()
    toast(uid ? 'Usuário atualizado ✓' : 'Usuário adicionado ✓')
    renderUsuarios()
  } catch {
    toast('Erro ao salvar')
    setLoading('btnSalvarUsuario', false)
  }
}

async function deleteUsuario(uid: string): Promise<void> {
  const u = usuarios[uid]
  if (!u) return
  const remainingUsuarios = Object.fromEntries(Object.entries(usuarios).filter(([id]) => id !== uid)) as RawUsuarios
  if (!hasActiveAdmin(remainingUsuarios)) {
    toast('Não é possível remover o último Admin ativo', 4000)
    return
  }
  if (!confirm(`Remover usuário "${u.nome}" permanentemente?`)) return
  try {
    await remove(usuarioRef(uid))
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete usuarios[uid]
    rootData = null
    toast('Usuário removido')
    renderUsuarios()
  } catch {
    toast('Erro ao remover')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA: CONFIG
// ─────────────────────────────────────────────────────────────────────────────

function renderConfig(): void {
  const mc = document.getElementById('mestreContent')!

  const secs: Array<{ id: typeof activeConfigSection; label: string }> = [
    { id: 'congregacao', label: 'Congregação' },
    { id: 'designacoes', label: 'Designações' },
  ]

  mc.innerHTML = `
    <div style="display:flex;gap:4px;margin-bottom:16px;background:var(--surface-2);
      border-radius:8px;padding:3px;border:1px solid var(--border)">
      ${secs.map(s => `
        <button class="btn ${activeConfigSection === s.id ? 'btn-primary' : 'btn-ghost'}"
          data-cfg-sec="${s.id}" style="flex:1;font-size:.78rem">${s.label}</button>`
      ).join('')}
    </div>
    <div id="configContent"></div>`

  mc.querySelectorAll<HTMLButtonElement>('[data-cfg-sec]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeConfigSection = btn.dataset['cfgSec'] as typeof activeConfigSection
      renderConfig()
    })
  })

  if (activeConfigSection === 'congregacao') renderConfigCongregacao()
  else renderConfigDesignacoes()
}

// ── Congregação ───────────────────────────────────────────────────────────────

function renderConfigCongregacao(): void {
  const el = document.getElementById('configContent')!
  const c  = config.congregacao ?? { nome:'', cidade:'', circuito:'', idioma:'pt-BR' }
  const r  = config.reunioes

  const diaOpts = (sel?: number) => DIAS_SEMANA
    .map((d, i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>${d}</option>`)
    .join('')

  const reuniaoCard = (id: string, label: string, dia?: number, hora?: string) => `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px">
      <div style="font-size:.82rem;font-weight:600;color:var(--ink-2);margin-bottom:10px">${label}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-group" style="margin:0">
          <label class="form-label">Dia</label>
          <select id="${id}Dia" class="form-select">${diaOpts(dia)}</select>
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Horário</label>
          <input id="${id}Hora" class="form-input" type="time" value="${escapeHtml(hora)}">
        </div>
      </div>
    </div>`

  el.innerHTML = `
    <div class="form-group">
      <label class="form-label">Nome da congregação</label>
      <input id="cNome" class="form-input" value="${escapeHtml(c.nome)}" placeholder="Congregação Noroeste">
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group">
        <label class="form-label">Cidade</label>
        <input id="cCidade" class="form-input" value="${escapeHtml(c.cidade)}" placeholder="Aracaju">
      </div>
      <div class="form-group">
        <label class="form-label">Circuito</label>
        <input id="cCircuito" class="form-input" value="${escapeHtml(c.circuito)}" placeholder="SE-01">
      </div>
    </div>

    <div style="font-size:.8rem;font-weight:600;color:var(--ink-2);margin:16px 0 10px;
      text-transform:uppercase;letter-spacing:.05em">Reuniões</div>

    ${reuniaoCard('ms',  'Meio de semana',      r?.meiaDeSemana?.diaSemana,  r?.meiaDeSemana?.horario)}
    ${reuniaoCard('fs',  'Fim de semana',       r?.fimDeSemana?.diaSemana,   r?.fimDeSemana?.horario)}

    <button id="btnSalvarCong" class="btn btn-primary btn-full" style="margin-top:8px">
      Salvar Congregação
    </button>`

  document.getElementById('btnSalvarCong')!
    .addEventListener('click', () => void saveConfigCongregacao())
}

async function saveConfigCongregacao(): Promise<void> {
  const v  = (id: string) => (document.getElementById(id) as HTMLInputElement).value.trim()
  const vi = (id: string) => parseInt((document.getElementById(id) as HTMLSelectElement).value, 10)

  const congregacao = { nome: v('cNome'), cidade: v('cCidade'), circuito: v('cCircuito'), idioma: 'pt-BR' }
  const reunioes = {
    meiaDeSemana:  { diaSemana: vi('msDia'),  horario: v('msHora')  },
    fimDeSemana:   { diaSemana: vi('fsDia'),  horario: v('fsHora')  },
  }

  setLoading('btnSalvarCong', true)
  try {
    await Promise.all([
      set(configCongregacaoRef, congregacao),
      set(configReunioesRef, reunioes),
    ])
    config.congregacao = congregacao
    config.reunioes    = reunioes
    toast('Congregação salva ✓')
  } catch {
    toast('Erro ao salvar')
  } finally {
    setLoading('btnSalvarCong', false, 'Salvar Congregação')
  }
}

// ── Config Designações ────────────────────────────────────────────────────────

function renderConfigDesignacoes(): void {
  const el   = document.getElementById('configContent')!
  const desig = config.designacoes ?? {}

  const cards = DESIGNACOES_TIPOS.map(tipo => {
    const d = desig[tipo] ?? { textoIcs: '', ativo: true, aprovadoEm: '' }
    return `
      <div style="background:var(--surface);border:1px solid var(--border);
        border-radius:8px;padding:12px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-size:.85rem;font-weight:600">${DESIGNACAO_LABELS[tipo]}</span>
          <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:.78rem;
            white-space:nowrap;margin-left:8px">
            <input type="checkbox" class="dAtivo" data-tipo="${tipo}" ${d.ativo ? 'checked' : ''}>
            Ativo
          </label>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
          <label class="form-label" style="margin:0;font-size:.78rem">Texto .ics</label>
          <span style="font-size:.72rem;color:var(--ink-3)" id="dCount_${tipo}">
            ${d.textoIcs.length}/250
          </span>
        </div>
        <textarea id="dTexto_${tipo}" class="form-input" rows="2"
          maxlength="250" style="resize:none;font-size:.82rem">${escapeHtml(d.textoIcs)}</textarea>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:5px">
          <span style="font-size:.72rem;color:var(--ink-3)">
            Aprovado: <strong>${d.aprovadoEm ? formatDate(d.aprovadoEm) : '—'}</strong>
          </span>
          <button class="btn btn-ghost dAprovar" data-tipo="${tipo}"
            style="font-size:.75rem;padding:3px 10px">✓ Aprovar</button>
        </div>
      </div>`
  }).join('')

  el.innerHTML = `
    <p style="font-size:.78rem;color:var(--ink-3);margin-bottom:12px">
      Texto que aparece no campo Observações do arquivo .ics exportado para o calendário (máx. 250 caracteres).
    </p>
    ${cards}
    <div style="position:sticky;bottom:8px;margin-top:4px">
      <button id="btnSalvarDesig" class="btn btn-primary btn-full">
        Salvar Designações
      </button>
    </div>`

  // Contadores de caracteres
  DESIGNACOES_TIPOS.forEach(tipo => charCounter(`dTexto_${tipo}`, `dCount_${tipo}`))

  // Aprovar individual
  el.querySelectorAll<HTMLButtonElement>('.dAprovar').forEach(btn => {
    btn.addEventListener('click', () => void approveDesignacao(btn.dataset['tipo'] as TipoDesignacao))
  })

  // Salvar tudo
  document.getElementById('btnSalvarDesig')!
    .addEventListener('click', () => void saveConfigDesignacoes())
}

async function approveDesignacao(tipo: TipoDesignacao): Promise<void> {
  const texto = (document.getElementById(`dTexto_${tipo}`) as HTMLTextAreaElement).value
  const ativo = (document.querySelector(`.dAtivo[data-tipo="${tipo}"]`) as HTMLInputElement)?.checked ?? true
  const hoje  = todayStr()
  try {
    await update(configDesignacoesRef, {
      [`${tipo}/textoIcs`]:   texto,
      [`${tipo}/ativo`]:      ativo,
      [`${tipo}/aprovadoEm`]: hoje,
    })
    if (!config.designacoes) config.designacoes = {}
    config.designacoes[tipo] = { textoIcs: texto, ativo, aprovadoEm: hoje }
    toast(`"${DESIGNACAO_LABELS[tipo]}" aprovado ✓`)
    renderConfigDesignacoes()
  } catch {
    toast('Erro ao aprovar')
  }
}

async function saveConfigDesignacoes(): Promise<void> {
  const result: Partial<Record<TipoDesignacao, { textoIcs: string; ativo: boolean; aprovadoEm: string }>> = {}

  for (const tipo of DESIGNACOES_TIPOS) {
    const textoIcs = (document.getElementById(`dTexto_${tipo}`) as HTMLTextAreaElement).value
    const ativo    = (document.querySelector(`.dAtivo[data-tipo="${tipo}"]`) as HTMLInputElement)?.checked ?? true
    const aprovadoEm = keepApprovalIfTextUnchanged(
      config.designacoes?.[tipo]?.textoIcs,
      textoIcs,
      config.designacoes?.[tipo]?.aprovadoEm,
    )
    result[tipo] = { textoIcs, ativo, aprovadoEm }
  }

  setLoading('btnSalvarDesig', true)
  try {
    await set(configDesignacoesRef, result)
    config.designacoes = result as Record<TipoDesignacao, { textoIcs: string; ativo: boolean; aprovadoEm: string }>
    toast('Designações salvas ✓')
  } catch {
    toast('Erro ao salvar')
  } finally {
    setLoading('btnSalvarDesig', false, 'Salvar Designações')
  }
}
