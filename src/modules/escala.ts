import { child } from 'firebase/database'
import type { AppContext, RawPessoas } from '../types'
import {
  get, update,
  escalaRef, pessoasRef,
} from '../firebase'

// ─── Tipos locais (schema de escala/ não vive em types.ts — módulo lê o nó
// existente, migrado do app Escala TPL standalone).
//
// ⚠️ Corrigido em 2026-09-03 após leitura do código-fonte real do app
// (`src/dominio/tipos.ts`, `src/dados/mapeamento.ts`). Ver PLANO-v4.2.md
// § 4.4 e DECISOES-ARQUITETURA.md § 23 — a versão anterior confundia
// `scales/` (cadastro de locais) com a escala gerada (`tables/`). ──────────

interface EscalaParticipant {
  name:          string
  sex:           'M' | 'F'
  active:        boolean
  pioneer:       boolean
  withChild:     boolean   // não "child" — nome antigo, morto no app real
  sameSexOnly?:  boolean
  onlyWithId?:   string
  capPerMonth?:  number
  startFromDate?: string
  refFolgaDate?: string
  phone?:        string
  obs?:          string
  masterId?:     string    // vínculo com master/pessoas — a acrescentar na migração
  // Demais campos do app Escala TPL (legacyId, updatedAt, availabilityUpdatedAt
  // etc.) — preservados ao gravar, nunca reescritos por este módulo.
  [key: string]: unknown
}

type RawParticipants = Record<string, EscalaParticipant>

// `escala/scales/{localId}` — isto é o CADASTRO DO LOCAL, não a escala.
// Não existe "a escala do mês" sem escolher local primeiro — hoje são 4
// locais fixos, cada um com dias/horários próprios.
interface EscalaLocal {
  name:        string
  daysActive:  number[]   // 0 = domingo
  slots:       string[]   // horários, ex. '08:00'
  stepMinutes: number
  sortOrder:   number
}

type RawLocais = Record<string, EscalaLocal>

// `escala/tables/{localId}/{mes}` — A ESCALA GERADA DE VERDADE.
interface EscalaCelula {
  p1: string
  p2: string
}

interface EscalaTabela {
  slots: string[]
  rows:  Record<string, { dow: number; slots: Record<string, EscalaCelula> }>
}

interface EscalaSettings {
  groupWhatsAppLink?: string
}

// ─── Referências Firebase (sub-nós de escala/, via child()) ──────────────────

const participantsRef = child(escalaRef, 'participants')
const locaisRef       = child(escalaRef, 'scales')   // nome do nó no banco é "scales"
const settingsRef     = child(escalaRef, 'settings')

function participantRef(eid: string) {
  return child(escalaRef, `participants/${eid}`)
}
function tabelaRef(localId: string, mes: string) {
  return child(escalaRef, `tables/${localId}/${mes}`)
}

// ─── Constante — link externo do app Escala TPL standalone ───────────────────
// TODO: trocar pela URL real do app Escala TPL publicado no Netlify.
const ESCALA_EXTERNAL_URL = 'https://SEU-APP-ESCALA.netlify.app'

// ─── Estado do módulo ──────────────────────────────────────────────────────────

let participants: RawParticipants = {}
let pessoas:       RawPessoas      = {}
let locais:         RawLocais       = {}
let settings:         EscalaSettings = {}

let selectedLocalId = ''
let currentTabela: EscalaTabela | null = null
let loadingTabela = false

let activeTab: 'participantes' | 'escalaAtual' | 'config' = 'participantes'
let participantFilter = { nome: '', ativo: 'true', sex: '', pioneer: '' }

// ─── Utilitários gerais ────────────────────────────────────────────────────────

function toast(msg: string, ms = 2600): void {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = msg
  el.classList.add('show')
  setTimeout(() => el.classList.remove('show'), ms)
}

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7) // 'YYYY-MM'
}

function formatMonthLabel(mes: string): string {
  const [ano, m] = mes.split('-')
  const MESES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ]
  const idx = Number(m) - 1
  return `${MESES[idx] ?? m}/${ano}`
}

function formatDateBR(iso: string): string {
  const [ano, m, d] = iso.split('-')
  if (!ano || !m || !d) return iso
  return `${d}/${m}/${ano}`
}

function locaisEmOrdem(): [string, EscalaLocal][] {
  return Object.entries(locais).sort((a, b) => a[1].sortOrder - b[1].sortOrder)
}

function nomeParticipante(eid: string): string {
  return participants[eid]?.name ?? '—'
}

// ─── Mount ──────────────────────────────────────────────────────────────────────

export default function mount(_ctx: AppContext): void {
  activeTab = 'participantes'
  participantFilter = { nome: '', ativo: 'true', sex: '', pioneer: '' }
  selectedLocalId = ''
  currentTabela = null

  const root = document.getElementById('appContent')!
  root.innerHTML = `
    <div id="escalaRoot">
      <div id="escalaTabs" style="display:flex;gap:4px;margin-bottom:16px"></div>
      <div id="escalaContent"></div>
    </div>`

  renderTabBar()
  void loadAll()
}

// ─── Tabs ────────────────────────────────────────────────────────────────────────

function renderTabBar(): void {
  const bar = document.getElementById('escalaTabs')!
  const tabs: Array<{ id: typeof activeTab; label: string }> = [
    { id: 'participantes', label: 'Participantes' },
    { id: 'escalaAtual',   label: 'Escala atual'  },
    { id: 'config',        label: 'Config'        },
  ]
  bar.innerHTML = tabs.map(t =>
    `<button class="btn ${activeTab === t.id ? 'btn-primary' : 'btn-ghost'}"
      data-tab="${t.id}" style="flex:1;font-size:.82rem">${t.label}</button>`
  ).join('')
  bar.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset['tab'] as typeof activeTab))
  })
}

function switchTab(t: typeof activeTab): void {
  activeTab = t
  renderTabBar()
  renderContent()
  if (t === 'escalaAtual' && selectedLocalId && !currentTabela) void loadTabela()
}

async function loadAll(): Promise<void> {
  document.getElementById('escalaContent')!.innerHTML =
    '<p style="padding:24px;color:var(--ink-3);text-align:center">Carregando…</p>'
  try {
    const [partSnap, pessoasSnap, locaisSnap, settingsSnap] = await Promise.all([
      get(participantsRef),
      get(pessoasRef),
      get(locaisRef),
      get(settingsRef),
    ])
    participants = partSnap.exists()     ? (partSnap.val()     as RawParticipants) : {}
    pessoas      = pessoasSnap.exists()  ? (pessoasSnap.val()  as RawPessoas)       : {}
    locais       = locaisSnap.exists()   ? (locaisSnap.val()   as RawLocais)        : {}
    settings     = settingsSnap.exists() ? (settingsSnap.val() as EscalaSettings)   : {}

    const primeiroLocal = locaisEmOrdem()[0]
    if (primeiroLocal) selectedLocalId = primeiroLocal[0]
  } catch {
    toast('Erro ao carregar dados do Firebase')
  }
  renderContent()
}

async function loadTabela(): Promise<void> {
  if (!selectedLocalId) { currentTabela = null; return }
  loadingTabela = true
  renderContent()
  try {
    const snap = await get(tabelaRef(selectedLocalId, currentMonthKey()))
    currentTabela = snap.exists() ? (snap.val() as EscalaTabela) : null
  } catch {
    toast('Erro ao carregar a escala deste local')
    currentTabela = null
  }
  loadingTabela = false
  renderContent()
}

function renderContent(): void {
  if      (activeTab === 'participantes') renderParticipantes()
  else if (activeTab === 'escalaAtual')   renderEscalaAtual()
  else                                     renderConfig()
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA: PARTICIPANTES
// ─────────────────────────────────────────────────────────────────────────────

function renderParticipantes(): void {
  const mc = document.getElementById('escalaContent')!

  const todos = Object.entries(participants)
  const semVinculo = todos.filter(([, p]) => !p.masterId).length

  const filtered = todos.filter(([, p]) => {
    if (participantFilter.ativo   === 'true'  && !p.active)    return false
    if (participantFilter.ativo   === 'false' &&  p.active)    return false
    if (participantFilter.sex     && p.sex     !== participantFilter.sex) return false
    if (participantFilter.pioneer === 'true'  && !p.pioneer)   return false
    if (participantFilter.pioneer === 'false' &&  p.pioneer)   return false
    if (participantFilter.nome    && !p.name.toLowerCase().includes(participantFilter.nome.toLowerCase())) return false
    return true
  }).sort((a, b) => a[1].name.localeCompare(b[1].name, 'pt-BR'))

  mc.innerHTML = `
    ${semVinculo > 0 ? `
      <div style="background:#FDF3E3;border:1px solid #C8922A;
        border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:.8rem;color:var(--ink)">
        ⚠️ ${semVinculo} de ${todos.length} participantes sem vínculo com cadastro (masterId)
      </div>` : `
      <div style="background:#E3F5EB;border:1px solid #1A6B3C;border-radius:8px;
        padding:8px 12px;margin-bottom:10px;font-size:.8rem;color:#1A6B3C">
        ✓ Todos os ${todos.length} participantes vinculados
      </div>`}

    <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
      <input id="eFiltroNome" class="form-input" placeholder="Buscar nome…"
        value="${participantFilter.nome}" style="flex:2;min-width:120px">
      <select id="eFiltroSex" class="form-select" style="flex:1;min-width:90px">
        <option value="">M + F</option>
        <option value="M">Irmãos</option>
        <option value="F">Irmãs</option>
      </select>
      <select id="eFiltroPioneiro" class="form-select" style="flex:1;min-width:110px">
        <option value="">Todos</option>
        <option value="true">Pioneiros</option>
        <option value="false">Não pioneiros</option>
      </select>
      <select id="eFiltroAtivo" class="form-select" style="flex:1;min-width:90px">
        <option value="true">Ativos</option>
        <option value="false">Inativos</option>
        <option value="">Todos</option>
      </select>
    </div>

    <div style="font-size:.8rem;color:var(--ink-3);margin-bottom:10px">
      ${filtered.length} participante${filtered.length !== 1 ? 's' : ''} · Total: ${todos.length}
    </div>

    <div id="participantList">
      ${filtered.length
        ? filtered.map(([eid, p]) => participantCard(eid, p)).join('')
        : '<p style="color:var(--ink-3);text-align:center;padding:24px 0">Nenhum participante encontrado.</p>'}
    </div>`

  ;(document.getElementById('eFiltroSex')      as HTMLSelectElement).value = participantFilter.sex
  ;(document.getElementById('eFiltroPioneiro') as HTMLSelectElement).value = participantFilter.pioneer
  ;(document.getElementById('eFiltroAtivo')    as HTMLSelectElement).value = participantFilter.ativo

  document.getElementById('eFiltroNome')!.addEventListener('input', e => {
    participantFilter.nome = (e.target as HTMLInputElement).value
    renderParticipantes()
  })
  document.getElementById('eFiltroSex')!.addEventListener('change', e => {
    participantFilter.sex = (e.target as HTMLSelectElement).value
    renderParticipantes()
  })
  document.getElementById('eFiltroPioneiro')!.addEventListener('change', e => {
    participantFilter.pioneer = (e.target as HTMLSelectElement).value
    renderParticipantes()
  })
  document.getElementById('eFiltroAtivo')!.addEventListener('change', e => {
    participantFilter.ativo = (e.target as HTMLSelectElement).value
    renderParticipantes()
  })

  document.querySelectorAll<HTMLButtonElement>('[data-vincular]').forEach(btn => {
    btn.addEventListener('click', () => openVincularModal(btn.dataset['vincular']!))
  })
}

function participantCard(eid: string, p: EscalaParticipant): string {
  const badge = p.active
    ? `<span style="background:#E3F5EB;color:#1A6B3C;padding:1px 7px;border-radius:10px;font-size:.7rem;font-weight:600">Ativo</span>`
    : `<span style="background:#FEE;color:#B3261E;padding:1px 7px;border-radius:10px;font-size:.7rem;font-weight:600">Inativo</span>`

  const sexLabel = p.sex === 'M' ? 'Irmão' : p.sex === 'F' ? 'Irmã' : '—'
  const vinculado = p.masterId ? pessoas[p.masterId] : null

  return `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;
      padding:10px 12px;margin-bottom:6px;display:flex;align-items:center;gap:8px">
      <div style="width:34px;height:34px;border-radius:50%;background:#1A6B3C20;
        display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:700;
        color:#1A6B3C;flex-shrink:0">
        ${p.name.charAt(0).toUpperCase()}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${p.name}
        </div>
        <div style="font-size:.75rem;color:var(--ink-3);display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:1px">
          <span>${sexLabel}</span>
          ${p.pioneer   ? '<span>Pioneiro</span>'  : ''}
          ${p.withChild ? '<span>Com criança</span>' : ''}
          ${badge}
        </div>
        <div style="font-size:.72rem;color:${p.masterId ? 'var(--ink-3)' : '#B3261E'};margin-top:2px">
          ${p.masterId
            ? `Vinculado a: ${vinculado?.name ?? p.masterId}`
            : 'Sem vínculo com cadastro'}
        </div>
      </div>
      ${!p.masterId
        ? `<button class="btn btn-primary" data-vincular="${eid}" style="padding:5px 10px;font-size:.78rem">Vincular</button>`
        : ''}
    </div>`
}

function openVincularModal(eid: string): void {
  const p = participants[eid]
  if (!p) return

  const ativos = Object.entries(pessoas)
    .filter(([, m]) => m.active)
    .sort(([, a], [, b]) => a.name.localeCompare(b.name, 'pt-BR'))

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal">
      <h2>Vincular "${p.name}"</h2>
      <div class="form-group">
        <label class="form-label">Pessoa no cadastro (master/pessoas)</label>
        <select id="vMasterId" class="form-select">
          <option value="">Selecione…</option>
          ${ativos.map(([mid, m]) => `<option value="${mid}">${m.name}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;gap:8px;margin-top:4px">
        <button id="btnCancelVincular" class="btn btn-ghost" style="flex:1">Cancelar</button>
        <button id="btnSalvarVincular" class="btn btn-primary" style="flex:1">Vincular</button>
      </div>
    </div>`

  document.body.appendChild(overlay)

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
  document.getElementById('btnCancelVincular')!.addEventListener('click', () => overlay.remove())
  document.getElementById('btnSalvarVincular')!
    .addEventListener('click', () => void vincularMasterId(eid, overlay))
}

async function vincularMasterId(eid: string, overlay: HTMLElement): Promise<void> {
  const midSelecionado = (document.getElementById('vMasterId') as HTMLSelectElement).value
  if (!midSelecionado) { toast('Selecione uma pessoa'); return }

  try {
    // update() parcial — nunca set() do objeto inteiro do participante
    await update(participantRef(eid), { masterId: midSelecionado })
    participants[eid] = { ...participants[eid]!, masterId: midSelecionado }
    overlay.remove()
    toast('Vinculado com sucesso')
    renderParticipantes()
  } catch {
    toast('Erro ao vincular')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA: ESCALA ATUAL (somente leitura — por local, não existe "a escala do mês")
// ─────────────────────────────────────────────────────────────────────────────

function renderEscalaAtual(): void {
  const mc = document.getElementById('escalaContent')!
  const mesAtual = currentMonthKey()
  const opcoesLocal = locaisEmOrdem()

  if (opcoesLocal.length === 0) {
    mc.innerHTML = `
      <p style="color:var(--ink-3);text-align:center;padding:24px 0">
        Nenhum local cadastrado em escala/scales.
      </p>`
    return
  }

  mc.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
      <select id="eLocalSelect" class="form-select" style="flex:1;min-width:140px">
        ${opcoesLocal.map(([id, l]) =>
          `<option value="${id}" ${id === selectedLocalId ? 'selected' : ''}>${l.name}</option>`
        ).join('')}
      </select>
      <a href="${ESCALA_EXTERNAL_URL}" target="_blank" rel="noopener noreferrer"
        class="btn btn-ghost" style="font-size:.8rem;padding:5px 12px;text-decoration:none;white-space:nowrap">
        Ver no app Escala ↗
      </a>
    </div>
    <div style="font-size:.85rem;font-weight:600;margin-bottom:8px">
      ${formatMonthLabel(mesAtual)}
    </div>
    <div id="tabelaWrap">
      ${loadingTabela
        ? '<p style="padding:24px;color:var(--ink-3);text-align:center">Carregando…</p>'
        : renderTabelaHtml()}
    </div>
    <p style="font-size:.72rem;color:var(--ink-3);margin-top:10px">
      Somente leitura — a escala é gerada e editada no app Escala TPL.
    </p>`

  document.getElementById('eLocalSelect')!.addEventListener('change', e => {
    selectedLocalId = (e.target as HTMLSelectElement).value
    currentTabela = null
    void loadTabela()
  })
}

function renderTabelaHtml(): string {
  if (!currentTabela) {
    return `
      <p style="color:var(--ink-3);text-align:center;padding:24px 0">
        Nenhuma escala publicada para este local/mês ainda.
      </p>`
  }

  const datas = Object.keys(currentTabela.rows).sort()
  if (datas.length === 0) {
    return `
      <p style="color:var(--ink-3);text-align:center;padding:24px 0">
        Nenhuma escala publicada para este local/mês ainda.
      </p>`
  }

  const horarios = currentTabela.slots

  return `
    <div style="border:1px solid var(--border);border-radius:8px;overflow:auto">
      <table style="width:100%;border-collapse:collapse;font-size:.8rem">
        <thead>
          <tr style="background:var(--blue-light);text-align:left">
            <th style="padding:8px 10px;white-space:nowrap">Data</th>
            ${horarios.map(h => `<th style="padding:8px 10px;white-space:nowrap">${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${datas.map(data => {
            const linha = currentTabela!.rows[data]!
            return `
              <tr style="border-top:1px solid var(--border)">
                <td style="padding:8px 10px;white-space:nowrap;font-weight:600">${formatDateBR(data)}</td>
                ${horarios.map(h => {
                  const cel = linha.slots[h]
                  if (!cel || (!cel.p1 && !cel.p2)) return '<td style="padding:8px 10px;color:var(--ink-3)">—</td>'
                  const nomes = [cel.p1, cel.p2].filter(Boolean).map(nomeParticipante).join(' + ')
                  return `<td style="padding:8px 10px;white-space:nowrap">${nomes}</td>`
                }).join('')}
              </tr>`
          }).join('')}
        </tbody>
      </table>
    </div>`
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA: CONFIGURAÇÕES
// ─────────────────────────────────────────────────────────────────────────────

function renderConfig(): void {
  const mc = document.getElementById('escalaContent')!

  mc.innerHTML = `
    <div class="form-group">
      <label class="form-label">Link do grupo do WhatsApp</label>
      <input id="cGroupLink" class="form-input" placeholder="https://chat.whatsapp.com/…"
        value="${settings.groupWhatsAppLink ?? ''}">
    </div>
    <button id="btnSalvarConfig" class="btn btn-primary" style="margin-top:4px">Salvar</button>`

  document.getElementById('btnSalvarConfig')!
    .addEventListener('click', () => void saveConfig())
}

async function saveConfig(): Promise<void> {
  const link = (document.getElementById('cGroupLink') as HTMLInputElement).value.trim()

  try {
    await update(settingsRef, { groupWhatsAppLink: link })
    settings.groupWhatsAppLink = link
    toast('Configuração salva')
  } catch {
    toast('Erro ao salvar')
  }
}
