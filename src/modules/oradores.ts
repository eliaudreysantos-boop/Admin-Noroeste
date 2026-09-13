import type { AppContext, RawPessoas } from '../types'
import { get, pessoasRef, update, tarefasDiscursosRef, tarefasEventosRef, tarefasOradoresPublicacoesRef, tarefasPlanejamentoRef, tarefasScaleRef } from '../firebase'
import { renderMenuCards, type ItemMenu } from '../ui/menu-cards'
import { moduleBackButton, moduleTitle } from '../ui/module-header'
import { allowedTheme, assignmentsForSpeaker, confirmationPatch, deriveStatus, eventBlocksLocal, meetingDatesForMonth, missingLocalTalkDates, needsReconfirmation, talkConflicts, themeHistory, watchtowerIssues, type Congregation, type Speaker, type Talk, type Theme } from './oradores-domain'
import { availableSpeakerThemes, createSchedulePdf, downloadSchedulePdf, downloadThemeCatalogPdf, type SchedulePdfRow, type ThemeCatalogRow } from './oradores-documents'
import { PublicationPreviewGate } from './pdf-publication-preview'

interface LegacyOrador extends Speaker {}
interface LegacyProgramacao extends Talk {}
interface LegacyTema extends Theme {}
interface LegacyCongregacao extends Congregation {}
interface LegacyEvento { data?: string; tipo?: string; titulo?: string; observacoes?: string; impactoTarefas?: { bloqueiaReuniao?: boolean; tiposReuniao?: string[] } }
interface LegacyDiscursos {
  oradores?: Record<string, LegacyOrador>
  programacao?: Record<string, LegacyProgramacao>
  temas?: Record<string, LegacyTema>
  congregacoes?: Record<string, LegacyCongregacao>
  eventos?: Record<string, LegacyEvento>
  pendenciasIgnoradas?: Record<string, string>
}

let discursos: LegacyDiscursos = {}
let pessoas: RawPessoas = {}
let taskMeetings: { id: string; date?: string; type?: string; assignments?: Record<string, unknown> }[] = []
let oradoresPlanning: { meetingDays?: { weekendDow?: number }; weekendDow?: number; excludedDates?: string[] | Record<string, unknown>; oradoresPublicacoes?: Record<string, { publicadoEm?: string }> } = {}
type OradoresTab = 'indice' | 'resumo' | 'cadastro' | 'programacao' | 'designacoes' | 'emergencia' | 'temas' | 'congregacoes' | 'intercambios' | 'eventos' | 'pendencias'
let activeTab: OradoresTab = 'indice'
const speakerSchedulePreview = new PublicationPreviewGate()

function speakerSchedulePreviewInput(rows: SchedulePdfRow[]): unknown {
  return { congregation:localCongregationName(), period:selectedProgramacaoPeriod, rows }
}
const ORADORES_DESIGNATION_SPEAKER_KEY = 'noroeste:oradores:designation-speaker'
const ORADORES_PERIOD_KEY = 'noroeste:oradores:period'
const ORADORES_FUTURE_KEY = 'noroeste:oradores:only-future'
const ORADORES_CONGREGATION_KEY = 'noroeste:oradores:congregation'
const ORADORES_AVAILABLE_DAYS_KEY = 'noroeste:oradores:available-days'
let selectedSpeakerId = localStorage.getItem(ORADORES_DESIGNATION_SPEAKER_KEY) ?? ''
let selectedProgramacaoPeriod = localStorage.getItem(ORADORES_PERIOD_KEY) ?? todayStr().slice(0, 7)
let onlyFutureProgramacao = localStorage.getItem(ORADORES_FUTURE_KEY) === 'true'
let selectedCongregationId = localStorage.getItem(ORADORES_CONGREGATION_KEY) ?? ''
let availableDaysHorizon = Number(localStorage.getItem(ORADORES_AVAILABLE_DAYS_KEY) ?? '90')
let programTypeFilter: 'todos' | 'discurso_local' | 'discurso_visitante' | 'saida_orador' = 'todos'
let programStatusFilter: 'todos' | 'confirmado' | 'por_confirmar' | 'por_definir' = 'todos'
let themeFilter: 'disponiveis' | 'usados' | 'todos' = 'todos'
let pendingFilter: 'todas' | 'programacao' | 'cadastro' | 'congregacoes' | 'confirmacoes' = 'todas'
let showIgnoredPending = false

function toast(msg: string, ms = 2600): void {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = msg
  el.classList.add('show')
  setTimeout(() => el.classList.remove('show'), ms)
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

function todayStr(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function canonicalTalkType(value?: string): 'discurso_local' | 'discurso_visitante' | 'saida_orador' {
  if (value === 'saida_orador') return value
  if (value === 'visitante' || value === 'discurso_visitante') return 'discurso_visitante'
  return 'discurso_local'
}

export default function mount(_ctx: AppContext): void {
  const el = document.getElementById('appContent')
  if (!el) return

  el.innerHTML = `
    <div id="oradoresRoot">
      <p style="padding:24px;color:var(--ink-3);text-align:center">Carregando...</p>
    </div>`

  activeTab = 'indice'
  void loadOradores()
}

async function loadOradores(): Promise<void> {
  try {
    const [snap, peopleSnap, scaleSnap, planningSnap] = await Promise.all([get(tarefasDiscursosRef), get(pessoasRef), get(tarefasScaleRef), get(tarefasPlanejamentoRef)])
    discursos = snap.exists() ? (snap.val() as LegacyDiscursos) : {}
    pessoas = peopleSnap.exists() ? peopleSnap.val() as RawPessoas : {}
    const periods = scaleSnap.exists() ? scaleSnap.val() as Record<string, { meetings?: Record<string, { date?: string; type?: string; assignments?: Record<string, unknown> }> }> : {}
    taskMeetings = Object.entries(periods).flatMap(([periodId, period]) => Object.entries(period.meetings ?? {}).map(([meetingId, meeting]) => ({ ...meeting, id: `${periodId}/${meetingId}` })))
    oradoresPlanning = planningSnap.exists() ? planningSnap.val() as typeof oradoresPlanning : {}
  } catch {
    toast('Erro ao carregar Oradores')
  }
  render()
}

function oradorNome(id: string, orador?: LegacyOrador): string {
  return pessoas[orador?.pessoaId ?? '']?.name ?? orador?.nome ?? orador?.name ?? id
}

function render(): void {
  const el = document.getElementById('oradoresRoot')
  if (!el) return

  const hoje = todayStr()
  const programacoesFuturas = Object.values(discursos.programacao ?? {}).filter(p => !p.data || p.data >= hoje).length
  const aConfirmar = Object.values(discursos.programacao ?? {}).filter(p => deriveStatus(p) !== 'confirmado' && (!p.data || p.data >= hoje)).length

  el.innerHTML = `
    ${moduleTitle('Oradores', '#5C6062')}

    ${activeTab === 'indice' || activeTab === 'resumo' ? '<div id="oradoresMenu"></div>' : `${moduleBackButton()}${renderTabContent(activeTab)}`}`

  if (activeTab === 'indice' || activeTab === 'resumo') {
    const menu = el.querySelector<HTMLElement>('#oradoresMenu')
    if (menu) {
      const items: ItemMenu[] = [
        { id: 'programacao', titulo: 'Programação', subtitulo: `${programacoesFuturas} compromisso${programacoesFuturas === 1 ? '' : 's'} futuro${programacoesFuturas === 1 ? '' : 's'}`, icone: '▣', corFundo: '#7E3AF2' },
        { id: 'designacoes', titulo: 'Designações por orador', subtitulo: 'Agenda individual por orador', icone: '☷', corFundo: '#003F72' },
        { id: 'cadastro', titulo: 'Cadastro', subtitulo: 'Oradores da congregação', icone: '♙', corFundo: '#003F72' },
        { id: 'emergencia', titulo: 'Emergência', subtitulo: 'Temas disponíveis para copiar', icone: '!', corFundo: '#B83E18' },
        { id: 'temas', titulo: 'Temas', subtitulo: 'Catálogo dos discursos públicos', icone: '▤', corFundo: '#1A6B3C' },
        { id: 'congregacoes', titulo: 'Congregações', subtitulo: 'Locais, visitantes e intercâmbios', icone: '⌂', corFundo: '#006EB6' },
        { id: 'intercambios', titulo: 'Intercâmbios', subtitulo: 'Entradas, saídas e confirmações', icone: '⇄', corFundo: '#7E3AF2' },
        { id: 'eventos', titulo: 'Eventos', subtitulo: 'Datas sem discurso público local', icone: '◆', corFundo: '#8A5B00' },
        { id: 'pendencias', titulo: 'Pendências', subtitulo: `${aConfirmar} compromisso${aConfirmar === 1 ? '' : 's'} a confirmar`, icone: '!', corFundo: '#B3261E' },
      ]
      renderMenuCards(menu, items, id => { activeTab = id as OradoresTab; render() })
    }
  }

  el.querySelectorAll<HTMLButtonElement>('[data-oradores-tab]').forEach(button => {
    button.addEventListener('click', () => { activeTab = button.dataset['oradoresTab'] as OradoresTab; render() })
  })
  el.querySelector<HTMLButtonElement>('[data-add-orador]')?.addEventListener('click', () => openOradorModal(null))
  el.querySelector<HTMLButtonElement>('[data-copy-approved-speakers]')?.addEventListener('click', () => void copyApprovedSpeakersText())
  el.querySelector<HTMLButtonElement>('[data-copy-emergency-themes]')?.addEventListener('click', () => void copyEmergencyThemesText())
  el.querySelector<HTMLButtonElement>('[data-download-theme-catalog]')?.addEventListener('click', () => void downloadThemeCatalog())
  el.querySelectorAll<HTMLButtonElement>('[data-edit-orador]').forEach(button => {
    button.addEventListener('click', () => openOradorModal(button.dataset['editOrador'] ?? null))
  })
  el.querySelectorAll<HTMLButtonElement>('[data-view-orador]').forEach(button => {
    button.addEventListener('click', () => openOradorDetail(button.dataset['viewOrador'] ?? ''))
  })
  el.querySelectorAll<HTMLButtonElement>('[data-delete-orador]').forEach(button => {
    button.addEventListener('click', () => void deleteOrador(button.dataset['deleteOrador'] ?? ''))
  })
  el.querySelector<HTMLButtonElement>('[data-add-programacao]')?.addEventListener('click', () => openProgramacaoModal(null))
  el.querySelector<HTMLButtonElement>('[data-download-programacao]')?.addEventListener('click', () => void downloadProgramacaoPdf())
  el.querySelector<HTMLButtonElement>('[data-publish-programacao]')?.addEventListener('click', () => void toggleProgramacaoPublication())
  el.querySelector<HTMLButtonElement>('[data-fill-programacao-dates]')?.addEventListener('click', () => void fillProgramacaoDates())
  el.querySelector<HTMLSelectElement>('[data-programacao-period]')?.addEventListener('change', event => {
    selectedProgramacaoPeriod = (event.target as HTMLSelectElement).value
    localStorage.setItem(ORADORES_PERIOD_KEY, selectedProgramacaoPeriod)
    render()
  })
  el.querySelector<HTMLInputElement>('[data-programacao-only-future]')?.addEventListener('change', event => {
    onlyFutureProgramacao = (event.target as HTMLInputElement).checked
    localStorage.setItem(ORADORES_FUTURE_KEY, String(onlyFutureProgramacao))
    render()
  })
  el.querySelector<HTMLSelectElement>('[data-programacao-type]')?.addEventListener('change', event => { programTypeFilter = (event.target as HTMLSelectElement).value as typeof programTypeFilter; render() })
  el.querySelector<HTMLSelectElement>('[data-programacao-status]')?.addEventListener('change', event => { programStatusFilter = (event.target as HTMLSelectElement).value as typeof programStatusFilter; render() })
  el.querySelectorAll<HTMLButtonElement>('[data-edit-programacao]').forEach(button => {
    button.addEventListener('click', () => openProgramacaoModal(button.dataset['editProgramacao'] ?? null))
  })
  el.querySelectorAll<HTMLButtonElement>('[data-delete-programacao]').forEach(button => {
    button.addEventListener('click', () => void deleteProgramacao(button.dataset['deleteProgramacao'] ?? ''))
  })
  el.querySelectorAll<HTMLButtonElement>('[data-programacao-confirm]').forEach(button => {
    button.addEventListener('click', () => void setProgramacaoConfirmation(button.dataset['programacaoConfirm'] ?? '', false))
  })
  el.querySelectorAll<HTMLButtonElement>('[data-programacao-reconfirm]').forEach(button => {
    button.addEventListener('click', () => void setProgramacaoConfirmation(button.dataset['programacaoReconfirm'] ?? '', true))
  })
  el.querySelectorAll<HTMLButtonElement>('[data-programacao-unconfirm]').forEach(button => button.addEventListener('click', () => void undoProgramacaoConfirmation(button.dataset['programacaoUnconfirm'] ?? '')))
  el.querySelectorAll<HTMLButtonElement>('[data-programacao-request]').forEach(button => button.addEventListener('click', () => openProgramacaoConfirmationDraft(button.dataset['programacaoRequest'] ?? '')))
  el.querySelector<HTMLButtonElement>('[data-add-tema]')?.addEventListener('click', () => openTemaModal(null))
  el.querySelector<HTMLSelectElement>('[data-theme-filter]')?.addEventListener('change', event => { themeFilter = (event.target as HTMLSelectElement).value as typeof themeFilter; render() })
  el.querySelectorAll<HTMLButtonElement>('[data-edit-tema]').forEach(button => {
    button.addEventListener('click', () => openTemaModal(button.dataset['editTema'] ?? null))
  })
  el.querySelectorAll<HTMLButtonElement>('[data-delete-tema]').forEach(button => {
    button.addEventListener('click', () => void deleteTema(button.dataset['deleteTema'] ?? ''))
  })
  el.querySelector<HTMLButtonElement>('[data-add-congregacao]')?.addEventListener('click', () => openCongregacaoModal(null))
  el.querySelector<HTMLSelectElement>('[data-congregation-select]')?.addEventListener('change', event => {
    selectedCongregationId = (event.target as HTMLSelectElement).value
    localStorage.setItem(ORADORES_CONGREGATION_KEY, selectedCongregationId)
    render()
  })
  el.querySelectorAll<HTMLButtonElement>('[data-pendencia-resolver]').forEach(button => {
    resolvePending(button.dataset['pendenciaResolver'] ?? '')
  })
  el.querySelectorAll<HTMLButtonElement>('[data-pendencia-ignore]').forEach(button => {
    void ignorePending(button.dataset['pendenciaIgnore'] ?? '')
  })
  el.querySelectorAll<HTMLButtonElement>('[data-pendencia-reactivate]').forEach(button => {
    void reactivatePending(button.dataset['pendenciaReactivate'] ?? '')
  })
  el.querySelector<HTMLSelectElement>('[data-available-days]')?.addEventListener('change', event => {
    availableDaysHorizon = Number((event.target as HTMLSelectElement).value)
    localStorage.setItem(ORADORES_AVAILABLE_DAYS_KEY, String(availableDaysHorizon))
    render()
  })
  el.querySelector<HTMLButtonElement>('[data-send-available-dates]')?.addEventListener('click', openAvailableDatesDraft)
  el.querySelector<HTMLButtonElement>('[data-send-exchanges]')?.addEventListener('click', openExchangeDraft)
  el.querySelectorAll<HTMLButtonElement>('[data-exchange-confirm]').forEach(button => button.addEventListener('click', () => void setProgramacaoConfirmation(button.dataset['exchangeConfirm'] ?? '', false)))
  el.querySelectorAll<HTMLButtonElement>('[data-exchange-unconfirm]').forEach(button => button.addEventListener('click', () => void undoProgramacaoConfirmation(button.dataset['exchangeUnconfirm'] ?? '')))
  el.querySelector<HTMLSelectElement>('[data-pending-filter]')?.addEventListener('change', event => { pendingFilter = (event.target as HTMLSelectElement).value as typeof pendingFilter; render() })
  el.querySelector<HTMLInputElement>('[data-show-ignored]')?.addEventListener('change', event => { showIgnoredPending = (event.target as HTMLInputElement).checked; render() })
  el.querySelectorAll<HTMLButtonElement>('[data-edit-congregacao]').forEach(button => {
    button.addEventListener('click', () => openCongregacaoModal(button.dataset['editCongregacao'] ?? null))
  })
  el.querySelectorAll<HTMLButtonElement>('[data-delete-congregacao]').forEach(button => {
    button.addEventListener('click', () => void deleteCongregacao(button.dataset['deleteCongregacao'] ?? ''))
  })
  el.querySelector<HTMLButtonElement>('[data-add-evento]')?.addEventListener('click', () => openEventoModal(null))
  el.querySelectorAll<HTMLButtonElement>('[data-edit-evento]').forEach(button => button.addEventListener('click', () => openEventoModal(button.dataset['editEvento'] ?? null)))
  el.querySelectorAll<HTMLButtonElement>('[data-delete-evento]').forEach(button => button.addEventListener('click', () => void deleteEvento(button.dataset['deleteEvento'] ?? '')))
  el.querySelector<HTMLSelectElement>('#designationSpeaker')?.addEventListener('change', event => { selectedSpeakerId = (event.target as HTMLSelectElement).value; localStorage.setItem(ORADORES_DESIGNATION_SPEAKER_KEY, selectedSpeakerId); render() })
}

function renderTabContent(tab: OradoresTab): string {
  if (tab === 'cadastro') return cadastroView()
  if (tab === 'programacao') return programacaoView()
  if (tab === 'designacoes') return designacoesView()
  if (tab === 'emergencia') return emergenciaView()
  if (tab === 'temas') return temasView()
  if (tab === 'congregacoes') return congregacoesView()
  if (tab === 'intercambios') return intercambiosView()
  if (tab === 'eventos') return eventosView()
  return pendenciasView()
}

function talkPlace(talk: LegacyProgramacao): string {
  const type = canonicalTalkType(talk.tipo)
  if (type === 'discurso_local') return 'Nossa congregação'
  const congregationId = type === 'saida_orador' ? talk.congregacaoDestinoId ?? talk.congregacaoId : talk.congregacaoOrigemId ?? talk.congregacaoId
  return discursos.congregacoes?.[congregationId ?? '']?.nome ?? (type === 'saida_orador' ? 'Destino não informado' : 'Origem não informada')
}

function designacoesView(): string {
  const speakers = Object.entries(discursos.oradores ?? {}).sort(([idA, a], [idB, b]) => oradorNome(idA, a).localeCompare(oradorNome(idB, b), 'pt-BR'))
  if (!selectedSpeakerId || !discursos.oradores?.[selectedSpeakerId]) selectedSpeakerId = speakers[0]?.[0] ?? ''
  const entries = assignmentsForSpeaker(discursos.programacao ?? {}, selectedSpeakerId, todayStr())
  return `<div style="margin-top:14px"><div class="form-group"><label class="form-label">Orador</label><select id="designationSpeaker" class="form-select">${speakers.map(([id, item]) => `<option value="${escapeHtml(id)}" ${id === selectedSpeakerId ? 'selected' : ''}>${escapeHtml(oradorNome(id, item))}</option>`).join('')}</select></div><div class="module-option-list">${entries.length ? entries.map(([, talk]) => `<div class="module-menu-btn" style="cursor:default"><div style="flex:1"><div class="mod-label">${escapeHtml(formatDate(talk.data))} · ${escapeHtml(talkPlace(talk))}</div><div class="mod-desc">Tema ${escapeHtml(talk.temaNumero ?? '')} ${escapeHtml(talk.temaTitulo ?? 'a definir')} · ${deriveStatus(talk) === 'confirmado' ? 'Confirmado' : 'A confirmar'}</div></div></div>`).join('') : '<p class="empty-state">Nenhuma designação futura para este orador.</p>'}</div></div>`
}

function intercambiosView(): string {
  const contextId = selectedCongregationId
  const congregationOptions = Object.entries(discursos.congregacoes ?? {}).filter(([, congregation]) => congregation.tipo !== 'local' && congregation.ativa !== false).sort(([, a], [, b]) => String(a.nome).localeCompare(String(b.nome), 'pt-BR')).map(([id, congregation]) => `<option value="${escapeHtml(id)}" ${id === contextId ? 'selected' : ''}>${escapeHtml(congregation.nome ?? id)}</option>`).join('')
  const rows = Object.entries(discursos.programacao ?? {}).filter(([, talk]) => {
    if (!talk.data || talk.data < todayStr() || canonicalTalkType(talk.tipo) === 'discurso_local') return false
    const congregationId = canonicalTalkType(talk.tipo) === 'saida_orador' ? talk.congregacaoDestinoId ?? talk.congregacaoId : talk.congregacaoOrigemId ?? talk.congregacaoId
    return Boolean(congregationId) && (!contextId || congregationId === contextId)
  }).sort(([, a], [, b]) => String(a.data).localeCompare(String(b.data)))
  const renderRows = (entries: Array<[string, LegacyProgramacao]>, heading: string) => `<section style="margin-top:14px"><h3 style="font-size:.9rem;color:#5C6062;margin-bottom:6px">${heading}</h3><div class="module-option-list">${entries.length ? entries.map(([id, talk]) => {
    const outgoing = canonicalTalkType(talk.tipo) === 'saida_orador'
    const congregationId = outgoing ? talk.congregacaoDestinoId ?? talk.congregacaoId : talk.congregacaoOrigemId ?? talk.congregacaoId
    const congregation = discursos.congregacoes?.[congregationId ?? '']
    const speaker = discursos.oradores?.[talk.oradorId ?? '']
    const near = exchangeDaysUntil(talk.data ?? '') <= 21 && deriveStatus(talk) !== 'confirmado'
    const status = deriveStatus(talk)
    const time = outgoing ? congregation?.horario || talk.horarioLocal : talk.horarioLocal || Object.values(discursos.congregacoes ?? {}).find(item => item.tipo === 'local')?.horario
    return `<div class="module-menu-btn" style="cursor:default${near ? ';border-color:#D6A100;background:#FFF9E8' : ''}"><div class="mod-icon" style="background:#7E3AF220;color:#7E3AF2">${outgoing ? '→' : '←'}</div><div style="flex:1"><div class="mod-label">${escapeHtml(congregation?.nome ?? 'congregação não informada')}${near ? ' · menos de 21 dias' : ''}</div><div class="mod-desc">${escapeHtml(formatDate(talk.data))}${time ? ` · ${escapeHtml(time)}` : ''} · ${escapeHtml(talk.oradorNome ?? oradorNome(talk.oradorId ?? '', speaker))} · ${escapeHtml(talk.temaTitulo ?? 'tema a definir')} · ${status === 'confirmado' ? 'Confirmado' : status === 'por_definir' ? 'Por definir' : 'A confirmar'}${talk.intercambioAvisadoEm ? ` · WhatsApp aberto em ${escapeHtml(formatDate(talk.intercambioAvisadoEm.slice(0, 10)))}` : ''}</div></div><div class="oradores-card-actions">${status === 'confirmado' ? `<button class="btn btn-ghost" data-exchange-unconfirm="${escapeHtml(id)}">Desfazer</button>` : `<button class="btn btn-ghost" data-exchange-confirm="${escapeHtml(id)}">Confirmar</button>`}</div></div>`
  }).join('') : '<p class="empty-state">Nenhum compromisso futuro.</p>'}</div></section>`
  const entradas = rows.filter(([, talk]) => canonicalTalkType(talk.tipo) === 'discurso_visitante')
  const saidas = rows.filter(([, talk]) => canonicalTalkType(talk.tipo) === 'saida_orador')
  const nearCount = rows.filter(([, talk]) => exchangeDaysUntil(talk.data ?? '') <= 21 && deriveStatus(talk) !== 'confirmado').length
  return `<div style="margin-top:14px"><div class="oradores-section-head"><h3>Intercâmbios</h3><button class="btn btn-primary" type="button" data-send-exchanges ${contextId ? '' : 'disabled'}>Enviar por WhatsApp</button></div>${nearCount ? `<div class="notice warning">${nearCount} compromisso(s) nos próximos 21 dias ainda precisam de confirmação.</div>` : ''}<div class="form-group"><label class="form-label">Congregação</label><select class="form-select" data-congregation-select><option value="">Todas</option>${congregationOptions}</select></div>${renderRows(entradas, 'Entradas')} ${renderRows(saidas, 'Saídas')}</div>`
}

function mapsHref(value?: string): string {
  const location = String(value ?? '').trim()
  if (!location) return ''
  if (/^https?:\/\//i.test(location)) return location
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
}

function exchangeDaysUntil(value: string): number {
  const now = new Date(`${todayStr()}T12:00:00`).getTime()
  const date = new Date(`${value}T12:00:00`).getTime()
  return Math.round((date - now) / 86_400_000)
}

const EVENT_LABELS: Record<string, string> = {
  congresso_assembleia: 'Congresso ou assembleia', visita_superintendente: 'Visita do superintendente',
  reuniao_especial: 'Reunião especial', celebracao: 'Celebração',
}

function eventBlocksDiscursoLocal(tipo: string | undefined): boolean {
  return ['congresso_assembleia', 'visita_superintendente', 'reuniao_especial', 'celebracao'].includes(String(tipo ?? ''))
}

function eventosView(): string {
  const rows = Object.entries(discursos.eventos ?? {}).sort(([, a], [, b]) => String(a.data ?? '').localeCompare(String(b.data ?? '')))
  return `<div style="margin-top:14px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px"><div><h3 style="font-size:.95rem;color:#5C6062">Eventos</h3><p style="font-size:.75rem;color:var(--ink-3)">O tipo do evento informa quando o discurso local fica impedido.</p></div><button class="btn btn-primary" type="button" data-add-evento>Adicionar</button></div><div class="module-option-list">${rows.length ? rows.map(([id, event]) => `<div class="module-menu-btn" style="cursor:default"><div style="flex:1"><div class="mod-label">${escapeHtml(event.titulo || EVENT_LABELS[event.tipo ?? ''] || 'Evento')}</div><div class="mod-desc">${escapeHtml(formatDate(event.data))}${eventBlocksDiscursoLocal(event.tipo) ? ' · Impede discurso local' : ''}</div></div><button class="btn btn-ghost" data-edit-evento="${escapeHtml(id)}">Editar</button><button class="btn btn-danger" data-delete-evento="${escapeHtml(id)}">Excluir</button></div>`).join('') : '<p class="empty-state">Nenhum evento especial cadastrado.</p>'}</div></div>`
}

function openEventoModal(id: string | null): void {
  const current = id ? discursos.eventos?.[id] : undefined
  const overlay = document.createElement('div'); overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal"><h2>${id ? 'Editar evento' : 'Novo evento'}</h2><div class="form-group"><label class="form-label">Data</label><input id="eventData" class="form-input" type="date" value="${escapeHtml(current?.data ?? '')}"></div><div class="form-group"><label class="form-label">Tipo</label><select id="eventType" class="form-select">${Object.entries(EVENT_LABELS).map(([value, label]) => `<option value="${value}" ${current?.tipo === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div class="form-group"><label class="form-label">Reuniões de Tarefas afetadas</label><div id="eventMeetings" style="border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:.82rem"></div></div><div class="form-group"><label class="form-label">Título opcional</label><input id="eventTitle" class="form-input" value="${escapeHtml(current?.titulo ?? '')}"></div><div class="form-group"><label class="form-label">Observações</label><textarea id="eventObs" class="form-input">${escapeHtml(current?.observacoes ?? '')}</textarea></div><div style="display:flex;gap:8px"><button id="eventCancel" class="btn btn-ghost">Cancelar</button><button id="eventSave" class="btn btn-primary">Salvar</button></div></div>`
  const renderMeetings = () => {
    const date = (overlay.querySelector('#eventData') as HTMLInputElement).value
    const selectedTypes = new Set(current?.impactoTarefas?.tiposReuniao ?? [])
    const meetings = taskMeetings.filter(meeting => meeting.date === date)
    const meetingKind = (type?: string): 'midweek' | 'weekend' => /meio|mid/.test(String(type ?? '').toLowerCase()) ? 'midweek' : 'weekend'
    const byType = [...new Set(meetings.map(meeting => meetingKind(meeting.type)))]
    const host = overlay.querySelector('#eventMeetings')!
    host.innerHTML = byType.length ? byType.map(type => {
      const count = meetings.filter(meeting => meetingKind(meeting.type) === type).length
      const label = type === 'midweek' ? 'Reunião do meio de semana' : 'Reunião do fim de semana'
      return `<label style="display:flex;gap:8px;padding:5px 0"><input type="checkbox" data-event-meeting-type="${escapeHtml(type)}" ${selectedTypes.has(type) ? 'checked' : ''}> ${escapeHtml(count > 1 ? `${label} (${count} registros)` : label)}</label>`
    }).join('') : '<span style="color:var(--ink-3)">Nenhuma reunião gerada no Tarefas para esta data.</span>'
  }
  renderMeetings()
  document.body.appendChild(overlay)
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove() })
  overlay.querySelector('#eventData')?.addEventListener('change', renderMeetings)
  overlay.querySelector('#eventCancel')?.addEventListener('click', () => overlay.remove())
  overlay.querySelector('#eventSave')?.addEventListener('click', () => void saveEvento(id, overlay))
}

async function saveEvento(id: string | null, overlay: HTMLElement): Promise<void> {
  const data = (overlay.querySelector('#eventData') as HTMLInputElement).value
  if (!data) { toast('Informe a data do evento'); return }
  const tiposReuniao = [...new Set(Array.from(overlay.querySelectorAll<HTMLInputElement>('[data-event-meeting-type]:checked')).map(input => input.dataset['eventMeetingType']).filter((type): type is string => Boolean(type)))]
  const record: LegacyEvento = { data, tipo: (overlay.querySelector('#eventType') as HTMLSelectElement).value, titulo: (overlay.querySelector('#eventTitle') as HTMLInputElement).value.trim(), observacoes: (overlay.querySelector('#eventObs') as HTMLTextAreaElement).value.trim(), impactoTarefas: tiposReuniao.length ? { bloqueiaReuniao: true, tiposReuniao } : undefined }
  const finalId = id ?? `e_${Date.now().toString(36)}`
  try {
    await Promise.all([update(tarefasDiscursosRef, { [`eventos/${finalId}`]: record }), update(tarefasEventosRef, { [finalId]: record })])
    discursos.eventos = { ...(discursos.eventos ?? {}), [finalId]: record }; overlay.remove(); toast('Evento salvo'); render()
  } catch { toast('Não foi possível salvar o evento') }
}

async function deleteEvento(id: string): Promise<void> {
  if (!id || !discursos.eventos?.[id] || !window.confirm('Excluir este evento?')) return
  try {
    await Promise.all([update(tarefasDiscursosRef, { [`eventos/${id}`]: null }), update(tarefasEventosRef, { [id]: null })])
    const next = { ...(discursos.eventos ?? {}) }; delete next[id]; discursos.eventos = next; toast('Evento excluído'); render()
  } catch { toast('Não foi possível excluir o evento') }
}

function congregacoesView(): string {
  const rows = Object.entries(discursos.congregacoes ?? {}).sort(([, a], [, b]) => (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR'))
  if (!selectedCongregationId || !discursos.congregacoes?.[selectedCongregationId]) selectedCongregationId = rows[0]?.[0] ?? ''
  const selected = discursos.congregacoes?.[selectedCongregationId]
  const dates = availableCongregationDates()
  const selector = rows.map(([id, congregation]) => `<option value="${escapeHtml(id)}" ${id === selectedCongregationId ? 'selected' : ''}>${escapeHtml(congregation.nome ?? id)}</option>`).join('')
  const mapsLink = mapsHref(selected?.localizacao)
  const missingLocal = !rows.some(([, congregation]) => congregation.tipo === 'local' && congregation.ativa !== false)
  const selectedCard = selected ? `<div class="form-panel"><strong>${escapeHtml(selected.nome ?? '')}${selected.ativa === false ? ' · Inativa' : ''}</strong><p class="form-help">${escapeHtml([selected.cidade, selected.diaReuniao, selected.horario].filter(Boolean).join(' · ') || 'Dados de reunião não informados')}</p><p class="form-help">Contato: ${escapeHtml(selected.contato || '—')} · ${escapeHtml(formatPhone(selected.telefone))}</p>${selected.observacoes ? `<p class="form-help">Endereço: ${escapeHtml(selected.observacoes)}</p>` : ''}${mapsLink ? `<a href="${escapeHtml(mapsLink)}" target="_blank" rel="noopener noreferrer">Abrir no Maps</a>` : ''}</div>` : ''
  const list = rows.map(([id, congregation]) => `<div class="secretary-row"><div><strong>${escapeHtml(congregation.nome ?? id)}${congregation.ativa === false ? ' · Inativa' : ''}</strong><small>${escapeHtml(congregation.cidade ?? 'Cidade não informada')} · ${congregation.tipo === 'local' ? 'Local' : 'Visitante'}</small></div><div class="oradores-card-actions"><button class="btn btn-ghost" type="button" data-edit-congregacao="${escapeHtml(id)}">Editar</button><button class="btn btn-danger" type="button" data-delete-congregacao="${escapeHtml(id)}">Excluir</button></div></div>`).join('')
  return `<div style="margin-top:14px"><div class="oradores-section-head"><h3>Congregações</h3><button class="btn btn-primary" type="button" data-add-congregacao>Adicionar</button></div>${missingLocal ? '<div class="notice warning">Cadastre uma congregação local para cabeçalhos, horários e datas livres.</div>' : ''}${rows.length ? `<div class="form-group"><label class="form-label">Congregação consultada</label><select class="form-select" data-congregation-select>${selector}</select></div>${selectedCard}<div class="module-form-grid"><div class="form-group"><label class="form-label">Alcance das datas livres</label><select class="form-select" data-available-days><option value="90" ${availableDaysHorizon === 90 ? 'selected' : ''}>Próximos 3 meses</option><option value="180" ${availableDaysHorizon === 180 ? 'selected' : ''}>Próximos 6 meses</option><option value="365" ${availableDaysHorizon === 365 ? 'selected' : ''}>Próximo ano</option></select></div><div class="form-group" style="display:flex;align-items:end"><button class="btn btn-primary" type="button" data-send-available-dates ${selected?.tipo === 'local' ? 'disabled' : ''}>Enviar datas livres</button></div></div><div class="module-option-list">${dates.length ? dates.map(date => `<div class="module-menu-btn" style="cursor:default"><span>${escapeHtml(formatDate(date))}</span></div>`).join('') : '<p class="empty-state">Nenhuma data livre neste alcance.</p>'}</div><div class="module-option-list" style="margin-top:14px">${list}</div>` : '<p class="empty-state">Nenhuma congregação cadastrada.</p>'}</div>`
}

function availableCongregationDates(): string[] {
  const weekendDow = oradoresPlanning.meetingDays?.weekendDow ?? oradoresPlanning.weekendDow
  if (typeof weekendDow !== 'number') return []
  const today = todayStr()
  const end = new Date(`${today}T12:00:00`)
  end.setDate(end.getDate() + availableDaysHorizon)
  const months = new Set<string>()
  const cursor = new Date(`${today.slice(0, 7)}-01T12:00:00`)
  while (cursor <= end) { months.add(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`); cursor.setMonth(cursor.getMonth() + 1) }
  const dates = [...months].flatMap(month => meetingDatesForMonth(month, weekendDow, excludedProgramacaoDates(), discursos.eventos ?? {}))
  return missingLocalTalkDates(discursos.programacao ?? {}, dates).filter(date => date >= today && date <= `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`)
}

function openCongregacaoModal(id: string | null): void {
  const current = id ? discursos.congregacoes?.[id] : undefined
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal"><h2>${id ? 'Editar congregação' : 'Nova congregação'}</h2><div class="form-group"><label class="form-label" for="congNome">Nome</label><input id="congNome" class="form-input" value="${escapeHtml(current?.nome ?? '')}"></div><div class="form-group"><label class="form-label" for="congCidade">Cidade</label><input id="congCidade" class="form-input" value="${escapeHtml(current?.cidade ?? '')}"></div><div class="module-form-grid"><div class="form-group"><label class="form-label" for="congTipo">Tipo</label><select id="congTipo" class="form-select"><option value="visitante" ${current?.tipo !== 'local' ? 'selected' : ''}>Visitante</option><option value="local" ${current?.tipo === 'local' ? 'selected' : ''}>Local</option></select></div><div class="form-group"><label class="form-label" for="congAtiva">Situação</label><select id="congAtiva" class="form-select"><option value="true" ${current?.ativa !== false ? 'selected' : ''}>Ativa</option><option value="false" ${current?.ativa === false ? 'selected' : ''}>Inativa</option></select></div></div><div class="form-group"><label class="form-label" for="congContato">Contato</label><input id="congContato" class="form-input" value="${escapeHtml(current?.contato ?? '')}"></div><div class="form-group"><label class="form-label" for="congTelefone">Telefone do contato</label><input id="congTelefone" class="form-input" type="tel" value="${escapeHtml(current?.telefone ?? '')}"></div><div class="module-form-grid"><div class="form-group"><label class="form-label" for="congDia">Dia da reunião</label><input id="congDia" class="form-input" value="${escapeHtml(current?.diaReuniao ?? '')}" placeholder="Domingo"></div><div class="form-group"><label class="form-label" for="congHorario">Horário</label><input id="congHorario" class="form-input" type="time" value="${escapeHtml(current?.horario ?? '')}"></div></div><div class="form-group"><label class="form-label" for="congLocal">Link do Maps</label><input id="congLocal" class="form-input" value="${escapeHtml(current?.localizacao ?? '')}"></div><div class="form-group"><label class="form-label" for="congObs">Endereço</label><textarea id="congObs" class="form-input">${escapeHtml(current?.observacoes ?? '')}</textarea></div><div style="display:flex;gap:8px;margin-top:8px"><button id="cancelCong" class="btn btn-ghost" type="button" style="flex:1">Cancelar</button><button id="saveCong" class="btn btn-primary" type="button" style="flex:1">Salvar</button></div></div>`
  document.body.appendChild(overlay)
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove() })
  overlay.querySelector('#cancelCong')?.addEventListener('click', () => overlay.remove())
  overlay.querySelector('#saveCong')?.addEventListener('click', () => void saveCongregacao(id, overlay))
}

async function saveCongregacao(id: string | null, overlay: HTMLElement): Promise<void> {
  const nome = (overlay.querySelector('#congNome') as HTMLInputElement).value.trim()
  if (!nome) { toast('Preencha o nome da congregação'); return }
  const record: LegacyCongregacao = { ...(id ? discursos.congregacoes?.[id] : {}), nome, cidade: (overlay.querySelector('#congCidade') as HTMLInputElement).value.trim(), tipo: (overlay.querySelector('#congTipo') as HTMLSelectElement).value, ativa: (overlay.querySelector('#congAtiva') as HTMLSelectElement).value === 'true', contato: (overlay.querySelector('#congContato') as HTMLInputElement).value.trim(), telefone: (overlay.querySelector('#congTelefone') as HTMLInputElement).value.trim(), diaReuniao: (overlay.querySelector('#congDia') as HTMLInputElement).value.trim(), horario: (overlay.querySelector('#congHorario') as HTMLInputElement).value, localizacao: (overlay.querySelector('#congLocal') as HTMLInputElement).value.trim(), observacoes: (overlay.querySelector('#congObs') as HTMLTextAreaElement).value.trim() }
  if (record.tipo === 'local' && record.ativa !== false && Object.entries(discursos.congregacoes ?? {}).some(([otherId, congregation]) => otherId !== id && congregation.tipo === 'local' && congregation.ativa !== false)) { toast('Já existe uma congregação local ativa'); return }
  const finalId = id ?? `c_${Date.now().toString(36)}`
  try { await update(tarefasDiscursosRef, { [`congregacoes/${finalId}`]: record }); discursos.congregacoes = { ...(discursos.congregacoes ?? {}), [finalId]: record }; overlay.remove(); toast(id ? 'Congregação atualizada' : 'Congregação adicionada'); render() } catch { toast('Erro ao salvar congregação') }
}

async function deleteCongregacao(id: string): Promise<void> {
  if (!id || !discursos.congregacoes?.[id]) return
  if (Object.values(discursos.programacao ?? {}).some(p => p.congregacaoId === id || p.congregacaoOrigemId === id || p.congregacaoDestinoId === id)) { toast('Esta congregação está vinculada a uma programação; inative em vez de excluir'); return }
  if (!window.confirm(`Excluir a congregação "${discursos.congregacoes[id].nome ?? id}"?`)) return
  try { await update(tarefasDiscursosRef, { [`congregacoes/${id}`]: null }); const next = { ...(discursos.congregacoes ?? {}) }; delete next[id]; discursos.congregacoes = next; toast('Congregação excluída'); render() } catch { toast('Erro ao excluir congregação') }
}

function cadastroView(): string {
  const rows = Object.entries(discursos.oradores ?? {}).sort(([idA, a], [idB, b]) => oradorNome(idA, a).localeCompare(oradorNome(idB, b), 'pt-BR'))
  const availableBySpeaker = new Map(availableSpeakerThemes({ speakers: discursos.oradores ?? {}, themes: discursos.temas ?? {}, talks: discursos.programacao ?? {}, today: todayStr() }).map(entry => [entry.nome, entry.temas.length]))
  const approvedText = approvedSpeakersText()
  return `<div style="margin-top:14px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:2px"><div><h3 style="font-size:.95rem;color:#5C6062">Cadastro</h3><p style="font-size:.75rem;color:var(--ink-3)">Lista única de oradores locais e visitantes.</p></div><button class="btn btn-primary" type="button" data-add-orador style="padding:6px 10px;font-size:.78rem;white-space:nowrap">Adicionar</button></div><div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px;margin:12px 0"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px"><div><h3 style="font-size:.9rem;color:#5C6062;margin:0">Aprovados para saída</h3><p class="form-help" style="margin:2px 0 0">Texto para copiar: nome e números dos discursos do repertório.</p></div><button class="btn btn-ghost" type="button" data-copy-approved-speakers>Copiar texto</button></div><pre style="white-space:pre-wrap;margin:0;font-family:inherit;font-size:.82rem;line-height:1.45;color:var(--ink-2)">${escapeHtml(approvedText || 'Nenhum orador aprovado para saída.')}</pre></div><div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:0 12px">${rows.length ? rows.map(([id, o]) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)"><div style="flex:1;min-width:0"><strong>${escapeHtml(oradorNome(id, o))}${o.ativo === false ? ' · Inativo' : ''}</strong><div style="font-size:.75rem;color:var(--ink-3)">${o.tipo === 'visitante' ? 'Visitante' : 'Local'} · ${o.pessoaId ? 'Vinculado ao Admin' : 'Cadastro manual'} · ${o.temaIds?.length ?? 0} no repertório · ${availableBySpeaker.get(oradorNome(id, o)) ?? 0} disponíveis${o.aprovadoParaSaida ? ' · Aprovado para saída' : ''}</div></div><button class="btn btn-ghost" type="button" data-view-orador="${escapeHtml(id)}" style="padding:4px 8px;font-size:.72rem">Ver</button></div>`).join('') : '<p style="padding:16px 0;color:var(--ink-3);text-align:center;font-size:.82rem">Nenhum orador cadastrado.</p>'}</div></div>`
}

function approvedSpeakersText(): string {
  return Object.entries(discursos.oradores ?? {})
    .filter(([, speaker]) => speaker.aprovadoParaSaida && speaker.ativo !== false)
    .sort(([idA, a], [idB, b]) => oradorNome(idA, a).localeCompare(oradorNome(idB, b), 'pt-BR'))
    .map(([id, speaker]) => {
      const themes = (speaker.temaIds ?? [])
        .map(themeId => discursos.temas?.[themeId])
        .filter((theme): theme is LegacyTema => Boolean(theme))
        .sort((a, b) => Number(a.numero ?? 0) - Number(b.numero ?? 0))
        .map(theme => String(theme.numero ?? '').trim())
        .filter(Boolean)
        .join(', ')
      return `${oradorNome(id, speaker)}: ${themes || 'sem temas no repertório'}`
    })
    .join('\n')
}

async function copyApprovedSpeakersText(): Promise<void> {
  const text = approvedSpeakersText()
  if (!text) { toast('Nenhum orador aprovado para saída'); return }
  try {
    await navigator.clipboard.writeText(text)
    toast('Texto copiado')
  } catch { toast('Não foi possível copiar') }
}

function emergencyThemesText(): string {
  return availableSpeakerThemes({ speakers: discursos.oradores ?? {}, themes: discursos.temas ?? {}, talks: discursos.programacao ?? {}, today: todayStr() })
    .map(entry => `${entry.nome}: ${entry.temas.map(theme => String(theme.numero).padStart(3, '0')).join(', ')}`)
    .join('\n')
}

function emergenciaView(): string {
  const text = emergencyThemesText()
  return `<div style="margin-top:14px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px"><div><h3 style="font-size:.95rem;color:#5C6062;margin:0">Emergência</h3><p class="form-help" style="margin:2px 0 0">Oradores locais com temas disponíveis para uso imediato.</p></div><button class="btn btn-ghost" type="button" data-copy-emergency-themes>Copiar texto</button></div><div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px"><pre style="white-space:pre-wrap;margin:0;font-family:inherit;font-size:.84rem;line-height:1.5;color:var(--ink-2)">${escapeHtml(text || 'Nenhum orador com tema disponível no momento.')}</pre></div></div>`
}

async function copyEmergencyThemesText(): Promise<void> {
  const text = emergencyThemesText()
  if (!text) { toast('Nenhum tema disponível para emergência'); return }
  try {
    await navigator.clipboard.writeText(text)
    toast('Texto de emergência copiado')
  } catch { toast('Não foi possível copiar') }
}

function newOradorId(): string {
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  return `o_${Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('')}`
}

function formatPhone(value: string | undefined): string {
  const digits = String(value ?? '').replace(/\D/g, '')
  const local = digits.startsWith('55') ? digits.slice(2) : digits
  return local.length === 11 ? `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}` : value || 'Não informado'
}

function speakerPhone(speaker: LegacyOrador | undefined): string {
  return pessoas[speaker?.pessoaId ?? '']?.whatsapp ?? speaker?.telefone ?? ''
}

function openOradorDetail(id: string): void {
  const speaker = discursos.oradores?.[id]
  if (!speaker) return
  const themes = (speaker.temaIds ?? []).map(themeId => discursos.temas?.[themeId]).filter((theme): theme is LegacyTema => Boolean(theme)).sort((a, b) => Number(a.numero) - Number(b.numero))
  const congregation = discursos.congregacoes?.[speaker.congregacaoId ?? '']
  const overlay = document.createElement('div'); overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal"><h2>${escapeHtml(oradorNome(id, speaker))}</h2><div class="program-summary"><div><strong>${speaker.tipo === 'visitante' ? 'Visitante' : 'Local'}</strong><span>Tipo</span></div><div><strong>${themes.length}</strong><span>Temas</span></div><div><strong>${speaker.ativo === false ? 'Inativo' : 'Ativo'}</strong><span>Situação</span></div></div><div class="form-panel"><p><strong>Telefone:</strong> ${escapeHtml(formatPhone(speakerPhone(speaker)))}</p>${congregation ? `<p><strong>Congregação:</strong> ${escapeHtml(congregation.nome)}</p>` : ''}<p><strong>Repertório:</strong> ${escapeHtml(themes.map(theme => String(theme.numero).padStart(3, '0')).join(', ') || 'Nenhum tema')}</p><p><strong>Responsabilidades:</strong> ${escapeHtml([speaker.aprovadoParaSaida ? 'Aprovado para saída' : '', speaker.podePresidir ? 'Pode presidir' : '', speaker.sentinelaDirigente ? 'Dirigente da Sentinela' : '', speaker.sentinelaSubstituto ? 'Substituto da Sentinela' : ''].filter(Boolean).join(' · ') || 'Nenhuma')}</p></div><div class="pdf-preview-actions"><button class="btn btn-danger" id="detailDeleteSpeaker" type="button">Excluir</button><button class="btn btn-ghost" id="detailCloseSpeaker" type="button">Fechar</button><button class="btn btn-primary" id="detailEditSpeaker" type="button">Editar</button></div></div>`
  document.body.appendChild(overlay)
  document.getElementById('detailCloseSpeaker')?.addEventListener('click', () => overlay.remove())
  document.getElementById('detailEditSpeaker')?.addEventListener('click', () => { overlay.remove(); openOradorModal(id) })
  document.getElementById('detailDeleteSpeaker')?.addEventListener('click', () => { overlay.remove(); void deleteOrador(id) })
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove() })
}

function openOradorModal(id: string | null): void {
  const current = id ? discursos.oradores?.[id] : undefined
  const linked = new Set(Object.entries(discursos.oradores ?? {}).filter(([other]) => other !== id).map(([, item]) => item.pessoaId).filter(Boolean))
  const personOptions = Object.entries(pessoas).filter(([mid, person]) => person.active !== false && (!linked.has(mid) || mid === current?.pessoaId)).sort(([, a], [, b]) => a.name.localeCompare(b.name, 'pt-BR')).map(([mid, person]) => `<option value="${escapeHtml(mid)}" ${current?.pessoaId === mid ? 'selected' : ''}>${escapeHtml(person.name)}</option>`).join('')
  const congregationOptions = Object.entries(discursos.congregacoes ?? {}).filter(([, congregation]) => congregation.tipo !== 'local').sort(([, a], [, b]) => String(a.nome).localeCompare(String(b.nome), 'pt-BR')).map(([congregationId, congregation]) => `<option value="${escapeHtml(congregationId)}" ${current?.congregacaoId === congregationId ? 'selected' : ''}>${escapeHtml(congregation.nome ?? congregationId)}</option>`).join('')
  const themeChecks = Object.entries(discursos.temas ?? {}).sort(([, a], [, b]) => Number(a.numero ?? 0) - Number(b.numero ?? 0)).map(([themeId, theme]) => `<label style="display:flex;gap:8px;padding:6px 0"><input type="checkbox" data-orador-theme="${escapeHtml(themeId)}" ${current?.temaIds?.includes(themeId) ? 'checked' : ''}> ${escapeHtml(`${theme.numero ?? ''} ${theme.titulo ?? ''}`.trim())}</label>`).join('')
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal"><h2>${id ? 'Editar orador' : 'Adicionar orador'}</h2><div class="module-form-grid"><div class="form-group"><label class="form-label" for="oradorTipo">Tipo</label><select id="oradorTipo" class="form-select"><option value="local" ${current?.tipo !== 'visitante' ? 'selected' : ''}>Local</option><option value="visitante" ${current?.tipo === 'visitante' ? 'selected' : ''}>Visitante</option></select></div><div class="form-group"><label class="form-label" for="oradorAtivo">Situação</label><select id="oradorAtivo" class="form-select"><option value="true" ${current?.ativo !== false ? 'selected' : ''}>Ativo</option><option value="false" ${current?.ativo === false ? 'selected' : ''}>Inativo</option></select></div></div><div class="form-group"><label class="form-label" for="oradorPessoa">Pessoa do cadastro Admin</label><select id="oradorPessoa" class="form-select"><option value="">Sem vínculo central</option>${personOptions}</select><p class="form-help">Nome e telefone das pessoas vinculadas são editados somente no Admin.</p></div><div class="form-group"><label class="form-label" for="oradorNomeManual">Nome manual do visitante</label><input id="oradorNomeManual" class="form-input" value="${escapeHtml(current?.pessoaId ? '' : current?.nome ?? current?.name ?? '')}" placeholder="Use apenas para visitante sem cadastro"></div><div class="form-group"><label class="form-label" for="oradorCongregacao">Congregação de origem</label><select id="oradorCongregacao" class="form-select"><option value="">Não informada</option>${congregationOptions}</select></div><div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px"><label><input id="oradorSaida" type="checkbox" ${current?.aprovadoParaSaida ? 'checked' : ''}> Aprovado para saídas</label><label><input id="oradorPreside" type="checkbox" ${current?.podePresidir ? 'checked' : ''}> Pode presidir</label><label><input id="oradorSentinela" type="checkbox" ${current?.sentinelaDirigente ? 'checked' : ''}> Dirigente da Sentinela</label><label><input id="oradorSentinelaSub" type="checkbox" ${current?.sentinelaSubstituto ? 'checked' : ''}> Substituto da Sentinela</label></div><div class="form-group"><label class="form-label">Temas aprovados</label><div style="max-height:220px;overflow:auto;border:1px solid var(--border);padding:6px 10px;border-radius:8px">${themeChecks || '<p class="empty-state">Nenhum tema cadastrado.</p>'}</div></div><div style="display:flex;gap:8px;margin-top:8px"><button id="cancelOrador" class="btn btn-ghost" type="button" style="flex:1">Cancelar</button><button id="saveOrador" class="btn btn-primary" type="button" style="flex:1">Salvar</button></div></div>`
  document.body.appendChild(overlay)
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove() })
  overlay.querySelector('#cancelOrador')?.addEventListener('click', () => overlay.remove())
  overlay.querySelector('#saveOrador')?.addEventListener('click', () => void saveOrador(id, overlay))
}

async function saveOrador(id: string | null, overlay: HTMLElement): Promise<void> {
  const pessoaId = (overlay.querySelector('#oradorPessoa') as HTMLSelectElement).value
  const tipo = (overlay.querySelector('#oradorTipo') as HTMLSelectElement).value
  const nomeManual = (overlay.querySelector('#oradorNomeManual') as HTMLInputElement).value.trim()
  if (tipo === 'local' && (!pessoaId || !pessoas[pessoaId])) { toast('Orador local precisa ser uma pessoa do Admin'); return }
  if (tipo === 'visitante' && !pessoaId && !nomeManual) { toast('Informe o nome do visitante'); return }
  const sentinelaDirigente = (overlay.querySelector('#oradorSentinela') as HTMLInputElement).checked
  const sentinelaSubstituto = (overlay.querySelector('#oradorSentinelaSub') as HTMLInputElement).checked
  if (sentinelaDirigente && sentinelaSubstituto) { toast('A mesma pessoa não pode ser dirigente e substituto da Sentinela'); return }
  if (tipo === 'visitante' && (sentinelaDirigente || sentinelaSubstituto)) { toast('As responsabilidades da Sentinela exigem orador local'); return }
  if (pessoaId && Object.entries(discursos.oradores ?? {}).some(([otherId, speaker]) => otherId !== id && speaker.pessoaId === pessoaId)) { toast('Esta pessoa já está vinculada a outro orador'); return }
  const temaIds = Array.from(overlay.querySelectorAll<HTMLInputElement>('[data-orador-theme]:checked')).map(input => input.dataset['oradorTheme']!).filter(Boolean)
  const record: LegacyOrador = {
    ...(id ? discursos.oradores?.[id] : {}),
    pessoaId: pessoaId || undefined,
    nome: pessoaId ? undefined : nomeManual,
    tipo,
    congregacaoId: (overlay.querySelector('#oradorCongregacao') as HTMLSelectElement).value || undefined,
    ativo: (overlay.querySelector('#oradorAtivo') as HTMLSelectElement).value === 'true',
    aprovadoParaSaida: (overlay.querySelector('#oradorSaida') as HTMLInputElement).checked,
    podePresidir: (overlay.querySelector('#oradorPreside') as HTMLInputElement).checked,
    sentinelaDirigente,
    sentinelaSubstituto,
    temaIds,
  }
  if (pessoaId) { delete record.nome; delete record.name }
  delete record.telefone
  delete (record as Record<string, unknown>).funcao
  const finalId = id ?? newOradorId()
  try {
    const patch: Record<string, unknown> = { [`oradores/${finalId}`]: record }
    Object.entries(discursos.oradores ?? {}).forEach(([otherId, other]) => {
      if (otherId === finalId) return
      if (sentinelaDirigente && other.sentinelaDirigente) patch[`oradores/${otherId}/sentinelaDirigente`] = false
      if (sentinelaSubstituto && other.sentinelaSubstituto) patch[`oradores/${otherId}/sentinelaSubstituto`] = false
    })
    await update(tarefasDiscursosRef, patch)
    Object.entries(discursos.oradores ?? {}).forEach(([otherId, other]) => {
      if (otherId === finalId) return
      if (sentinelaDirigente) other.sentinelaDirigente = false
      if (sentinelaSubstituto) other.sentinelaSubstituto = false
    })
    discursos.oradores = { ...(discursos.oradores ?? {}), [finalId]: record }
    overlay.remove()
    toast(id ? 'Orador atualizado' : 'Orador adicionado')
    render()
  } catch { toast('Erro ao salvar o orador') }
}

async function deleteOrador(id: string): Promise<void> {
  if (!id || !discursos.oradores?.[id]) return
  if (!window.confirm(`Excluir o orador "${oradorNome(id, discursos.oradores[id])}"?`)) return
  try {
    await update(tarefasDiscursosRef, { [`oradores/${id}`]: null })
    const next = { ...(discursos.oradores ?? {}) }
    delete next[id]
    discursos.oradores = next
    toast('Orador excluído')
    render()
  } catch { toast('Erro ao excluir o orador') }
}

function programacaoView(): string {
  const today = todayStr()
  const rows = filteredProgramEntries()
  const monthOptions = programacaoMonthOptions().map(month => `<option value="${month}" ${month === selectedProgramacaoPeriod ? 'selected' : ''}>${formatMonth(month)}</option>`).join('')
  const typeColor: Record<string, string> = { discurso_local:'#003F72', discurso_visitante:'#1A6B3C', saida_orador:'#7E3AF2' }
  const typeLabel: Record<string, string> = { discurso_local:'Local', discurso_visitante:'Visitante', saida_orador:'Saída' }
  const published = Boolean(oradoresPlanning.oradoresPublicacoes?.[selectedProgramacaoPeriod])
  return `<div style="margin-top:14px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:2px"><div><h3 style="font-size:.95rem;color:#5C6062">Programação</h3><p style="font-size:.75rem;color:var(--ink-3)">Compromissos, confirmações e datas de reunião.</p></div><button class="btn btn-primary" type="button" data-add-programacao style="padding:6px 10px;font-size:.78rem;white-space:nowrap">Adicionar</button></div>${published ? '<div class="notice">Este período está publicado no Quadro. Edições exigem republicação para atualizar o PDF.</div>' : ''}<div class="module-form-grid" style="margin:12px 0 8px"><div class="form-group"><label class="form-label">Período</label><select class="form-select" data-programacao-period>${monthOptions}</select></div><div class="form-group"><label class="form-label">Tipo</label><select class="form-select" data-programacao-type><option value="todos">Todos</option>${Object.entries(typeLabel).map(([id, label]) => `<option value="${id}" ${programTypeFilter === id ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div class="form-group"><label class="form-label">Status</label><select class="form-select" data-programacao-status><option value="todos">Todos</option><option value="confirmado" ${programStatusFilter === 'confirmado' ? 'selected' : ''}>Confirmado</option><option value="por_confirmar" ${programStatusFilter === 'por_confirmar' ? 'selected' : ''}>A confirmar</option><option value="por_definir" ${programStatusFilter === 'por_definir' ? 'selected' : ''}>Por definir</option></select></div><div class="form-group" style="display:flex;align-items:end"><button class="btn btn-ghost" type="button" data-fill-programacao-dates style="width:100%">Preencher datas</button></div></div><div style="display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0"><label style="margin-right:auto;display:flex;align-items:center;gap:8px;font-size:.82rem"><input type="checkbox" data-programacao-only-future ${onlyFutureProgramacao ? 'checked' : ''}> Somente futuros</label><button class="btn btn-ghost" type="button" data-download-programacao>Abrir prévia do PDF</button><button class="btn ${published ? 'btn-danger' : 'btn-primary'}" type="button" data-publish-programacao>${published ? 'Despublicar período' : 'Publicar período'}</button></div><div class="module-option-list">${rows.length ? rows.map(([id, p]) => { const status = deriveStatus(p), type = canonicalTalkType(p.tipo), speaker = discursos.oradores?.[p.oradorId ?? ''], lastOpen = p.confirmacao?.whatsappAbertoEm; return `<article class="oradores-program-card" style="--talk-color:${typeColor[type]}"><div class="oradores-program-head"><div><strong>${escapeHtml(p.data ? formatDate(p.data) : 'Sem data')}${p.horarioLocal ? ` · ${escapeHtml(p.horarioLocal)}` : ''}</strong><small>${escapeHtml(typeLabel[type])} · ${escapeHtml(talkPlace(p))}</small></div><span class="agenda-status ${status === 'confirmado' ? 'realizado' : 'confirmacao-pendente'}">${status === 'confirmado' ? 'Confirmado' : status === 'por_definir' ? 'Por definir' : 'A confirmar'}</span></div><div class="oradores-program-body"><strong>${escapeHtml(p.oradorNome ?? oradorNome(p.oradorId ?? '', speaker) ?? 'Orador a definir')}</strong><span>${escapeHtml(p.temaNumero ? `${String(p.temaNumero).padStart(3, '0')} · ${p.temaTitulo ?? 'Tema a definir'}` : p.temaTitulo ?? 'Tema a definir')}</span><small>${p.reconfirmacao?.status ? `Reconfirmado em ${escapeHtml(formatDate(p.reconfirmacao.confirmadoEm?.slice(0, 10)))}` : status === 'confirmado' ? `Confirmado em ${escapeHtml(formatDate(p.confirmacao?.confirmadoEm?.slice(0, 10)))}` : 'Confirmação ainda não registrada'}${lastOpen ? ` · WhatsApp aberto em ${escapeHtml(formatDate(lastOpen.slice(0, 10)))}` : ''}</small></div><div class="oradores-card-actions">${status !== 'confirmado' ? `<button class="btn btn-ghost" type="button" data-programacao-request="${escapeHtml(id)}">Pedir confirmação</button><button class="btn btn-ghost" type="button" data-programacao-confirm="${escapeHtml(id)}">Confirmar</button>` : `<button class="btn btn-ghost" type="button" data-programacao-unconfirm="${escapeHtml(id)}">Desfazer confirmação</button>`}${status === 'confirmado' && needsReconfirmation(p, today) ? `<button class="btn btn-ghost" type="button" data-programacao-reconfirm="${escapeHtml(id)}">Reconfirmar</button>` : ''}<button class="btn btn-ghost" type="button" data-edit-programacao="${escapeHtml(id)}">Editar</button><button class="btn btn-danger" type="button" data-delete-programacao="${escapeHtml(id)}">Excluir</button></div></article>` }).join('') : '<p class="empty-state">Nenhum compromisso corresponde aos filtros.</p>'}</div></div>`
}

function filteredProgramEntries(): Array<[string, LegacyProgramacao]> {
  const today = todayStr()
  return Object.entries(discursos.programacao ?? {})
    .filter(([, talk]) => !talk.data || talk.data.startsWith(selectedProgramacaoPeriod))
    .filter(([, talk]) => !onlyFutureProgramacao || !talk.data || talk.data >= today)
    .filter(([, talk]) => programTypeFilter === 'todos' || canonicalTalkType(talk.tipo) === programTypeFilter)
    .filter(([, talk]) => programStatusFilter === 'todos' || deriveStatus(talk) === programStatusFilter)
    .sort(([, a], [, b]) => String(a.data ?? '').localeCompare(String(b.data ?? '')))
}

function localCongregationName(): string {
  return Object.values(discursos.congregacoes ?? {}).find(congregation => congregation.tipo === 'local')?.nome?.trim() || 'Noroeste'
}

function programacaoPdfRows(): SchedulePdfRow[] {
  return Object.entries(discursos.programacao ?? {})
    .filter(([, talk]) => !talk.data || talk.data.startsWith(selectedProgramacaoPeriod))
    .sort(([, a], [, b]) => String(a.data ?? '').localeCompare(String(b.data ?? '')))
    .map(([, talk]) => {
    const speaker = talk.oradorId ? discursos.oradores?.[talk.oradorId] : undefined
    const congregation = discursos.congregacoes?.[talk.tipo === 'saida_orador' ? talk.congregacaoDestinoId ?? talk.congregacaoId ?? '' : talk.congregacaoOrigemId ?? talk.congregacaoId ?? '']
    return { data:talk.data ?? '', tipo:talk.tipo ?? '', orador:talk.oradorNome ?? oradorNome(talk.oradorId ?? '', speaker), tema:talk.temaNumero ? `${talk.temaNumero} ${talk.temaTitulo ?? ''}`.trim() : talk.temaTitulo ?? '', congregacao:talk.tipo === 'discurso_local' ? localCongregationName() : congregation?.nome ?? (talk.tipo === 'saida_orador' ? talk.congregacaoDestinoNome ?? '' : talk.congregacaoOrigemNome ?? '') }
    })
}

async function downloadProgramacaoPdf(): Promise<void> {
  const rows = programacaoPdfRows()
  try {
    await downloadSchedulePdf({ congregation: localCongregationName(), periodLabel: selectedProgramacaoPeriod, rows })
    speakerSchedulePreview.mark(speakerSchedulePreviewInput(rows))
    toast('Prévia da programação gerada e pronta para publicação')
  } catch { toast('Não foi possível gerar o PDF') }
}

async function toggleProgramacaoPublication(): Promise<void> {
  const published = Boolean(oradoresPlanning.oradoresPublicacoes?.[selectedProgramacaoPeriod])
  try {
    const { publishAgendaModulePdf, unpublishAgendaModulePdf } = await import('./agenda-documents')
    if (published) {
      await unpublishAgendaModulePdf('oradores', selectedProgramacaoPeriod)
      await update(tarefasOradoresPublicacoesRef, { [selectedProgramacaoPeriod]:null })
      delete oradoresPlanning.oradoresPublicacoes?.[selectedProgramacaoPeriod]
      toast('Programação retirada do Quadro')
    } else {
      const rows = programacaoPdfRows()
      if (!rows.length) { toast('Nenhuma programação neste período'); return }
      if (!speakerSchedulePreview.matches(speakerSchedulePreviewInput(rows))) { toast('Abra a prévia atual do PDF antes de publicar'); return }
      const result = await createSchedulePdf({ congregation:localCongregationName(), periodLabel:selectedProgramacaoPeriod, rows })
      const lastDay = new Date(Number(selectedProgramacaoPeriod.slice(0, 4)), Number(selectedProgramacaoPeriod.slice(5, 7)), 0).getDate()
      await publishAgendaModulePdf(result.bytes, { modulo:'oradores', periodo:selectedProgramacaoPeriod, inicio:`${selectedProgramacaoPeriod}-01`, fim:`${selectedProgramacaoPeriod}-${lastDay}`, origemPeriodoId:selectedProgramacaoPeriod, nome:`programacao-oradores-${selectedProgramacaoPeriod}.pdf` })
      const publicadoEm = new Date().toISOString()
      await update(tarefasOradoresPublicacoesRef, { [selectedProgramacaoPeriod]:{ publicadoEm } })
      oradoresPlanning.oradoresPublicacoes ??= {}; oradoresPlanning.oradoresPublicacoes[selectedProgramacaoPeriod] = { publicadoEm }
      toast('Programação publicada no Quadro')
    }
    render()
  } catch { toast('Não foi possível alterar a publicação') }
}

async function setProgramacaoConfirmation(id: string, reconfirmacao: boolean): Promise<void> {
  const talk = discursos.programacao?.[id]
  if (!talk) return
  const stamp = new Date().toISOString()
  const confirmed = confirmationPatch('confirmado', stamp)
  const next = { ...talk, ...confirmed, confirmacao: { ...talk.confirmacao, ...confirmed.confirmacao }, updatedAt: stamp }
  const patch = reconfirmacao ? { [`programacao/${id}/reconfirmacao`]: { status: true, confirmadoEm: stamp }, [`programacao/${id}/updatedAt`]: stamp } : { [`programacao/${id}`]: next }
  try {
    await update(tarefasDiscursosRef, patch)
    if (reconfirmacao) talk.reconfirmacao = { status: true, confirmadoEm: stamp }
    else Object.assign(talk, next)
    toast(reconfirmacao ? 'Reconfirmado' : 'Confirmado')
    render()
  } catch { toast('Não foi possível salvar a confirmação') }
}

async function undoProgramacaoConfirmation(id: string): Promise<void> {
  const talk = discursos.programacao?.[id]
  if (!talk) return
  const next = { ...talk, ...confirmationPatch('por_confirmar', new Date().toISOString()), reconfirmacao: undefined, updatedAt: new Date().toISOString() }
  try { await update(tarefasDiscursosRef, { [`programacao/${id}`]: next }); discursos.programacao![id] = next; toast('Confirmação desfeita'); render() } catch { toast('Não foi possível desfazer a confirmação') }
}

function whatsappDigits(value: string | undefined): string {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.length === 11 ? `55${digits}` : digits
}

function openWhatsappDraft(title: string, message: string, phone: string, onOpen?: () => Promise<void>): void {
  const number = whatsappDigits(phone)
  const overlay = document.createElement('div'); overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal"><h2>${escapeHtml(title)}</h2>${number ? '' : '<div class="notice warning">O contato não possui WhatsApp cadastrado.</div>'}<textarea id="oradoresWhatsappDraft" class="form-input" rows="10" maxlength="4000">${escapeHtml(message)}</textarea><div class="pdf-preview-actions"><button class="btn btn-ghost" id="oradoresWhatsappClose" type="button">Fechar</button><button class="btn btn-ghost" id="oradoresWhatsappCopy" type="button">Copiar</button><button class="btn btn-primary" id="oradoresWhatsappOpen" type="button" ${number ? '' : 'disabled'}>Abrir WhatsApp</button></div></div>`
  document.body.appendChild(overlay)
  document.getElementById('oradoresWhatsappClose')?.addEventListener('click', () => overlay.remove())
  document.getElementById('oradoresWhatsappCopy')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText((document.getElementById('oradoresWhatsappDraft') as HTMLTextAreaElement).value); toast('Texto copiado') } catch { toast('Não foi possível copiar') } })
  document.getElementById('oradoresWhatsappOpen')?.addEventListener('click', async () => {
    const popup = window.open(`https://wa.me/${number}?text=${encodeURIComponent((document.getElementById('oradoresWhatsappDraft') as HTMLTextAreaElement).value)}`, '_blank', 'noopener,noreferrer')
    if (!popup) { toast('Permita pop-ups para abrir o WhatsApp'); return }
    try { await onOpen?.(); toast('WhatsApp aberto para revisão') } catch { toast('WhatsApp abriu, mas o registro de abertura falhou') }
  })
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove() })
}

function openProgramacaoConfirmationDraft(id: string): void {
  const talk = discursos.programacao?.[id]
  if (!talk) return
  const speaker = discursos.oradores?.[talk.oradorId ?? '']
  const congregationId = canonicalTalkType(talk.tipo) === 'discurso_visitante' ? talk.congregacaoOrigemId ?? talk.congregacaoId : talk.congregacaoDestinoId ?? talk.congregacaoId
  const congregation = discursos.congregacoes?.[congregationId ?? '']
  const phone = canonicalTalkType(talk.tipo) === 'discurso_visitante' ? congregation?.telefone ?? '' : speakerPhone(speaker)
  const recipient = canonicalTalkType(talk.tipo) === 'discurso_visitante' ? congregation?.contato || talk.oradorNome : oradorNome(talk.oradorId ?? '', speaker)
  const message = `Olá, ${recipient || 'irmão'}. Poderia confirmar o discurso de ${formatDate(talk.data)}${talk.horarioLocal ? ` às ${talk.horarioLocal}` : ''}? Tema ${talk.temaNumero ? String(talk.temaNumero).padStart(3, '0') : ''} ${talk.temaTitulo ?? 'a definir'}. Obrigado.`
  openWhatsappDraft('Pedir confirmação', message, phone, async () => {
    const stamp = new Date().toISOString()
    await update(tarefasDiscursosRef, { [`programacao/${id}/confirmacao/whatsappAbertoEm`]: stamp })
    talk.confirmacao = { ...(talk.confirmacao ?? {}), whatsappAbertoEm: stamp }
    render()
  })
}

function openAvailableDatesDraft(): void {
  const congregation = discursos.congregacoes?.[selectedCongregationId]
  if (!congregation) { toast('Selecione uma congregação'); return }
  const local = Object.values(discursos.congregacoes ?? {}).find(item => item.tipo === 'local')
  const dates = availableCongregationDates()
  const message = `Olá, ${congregation.contato || 'irmãos'}. Seguem datas livres para discurso público na ${local?.nome || localCongregationName()}:\n${dates.map(date => `- ${formatDate(date)}`).join('\n') || '- Nenhuma data livre neste período'}\n\nHorário: ${local?.horario || 'a confirmar'}\nEndereço: ${local?.observacoes || 'a confirmar'}`
  openWhatsappDraft('Enviar datas livres', message, congregation.telefone ?? '', async () => {
    const stamp = new Date().toISOString()
    await update(tarefasDiscursosRef, { [`congregacoes/${selectedCongregationId}/datasLivresAvisadasEm`]: stamp })
    congregation.datasLivresAvisadasEm = stamp
    render()
  })
}

function openExchangeDraft(): void {
  const congregation = discursos.congregacoes?.[selectedCongregationId]
  if (!congregation) { toast('Selecione uma congregação'); return }
  const entries = Object.entries(discursos.programacao ?? {}).filter(([, talk]) => {
    if (!talk.data || talk.data < todayStr() || canonicalTalkType(talk.tipo) === 'discurso_local') return false
    const congregationId = canonicalTalkType(talk.tipo) === 'saida_orador' ? talk.congregacaoDestinoId ?? talk.congregacaoId : talk.congregacaoOrigemId ?? talk.congregacaoId
    return congregationId === selectedCongregationId
  }).sort(([, a], [, b]) => String(a.data).localeCompare(String(b.data)))
  const message = `Olá, ${congregation.contato || 'irmãos'}. Segue nosso acompanhamento de intercâmbios:\n${entries.map(([, talk]) => `- ${formatDate(talk.data)} · ${canonicalTalkType(talk.tipo) === 'saida_orador' ? 'Saída' : 'Entrada'} · ${talk.oradorNome ?? oradorNome(talk.oradorId ?? '', discursos.oradores?.[talk.oradorId ?? ''])} · ${deriveStatus(talk) === 'confirmado' ? 'confirmado' : 'a confirmar'}`).join('\n') || '- Nenhum intercâmbio futuro'}`
  openWhatsappDraft(`Intercâmbios - ${congregation.nome ?? ''}`, message, congregation.telefone ?? '', async () => {
    const stamp = new Date().toISOString(), patch: Record<string, unknown> = {}
    entries.forEach(([id, talk]) => { patch[`programacao/${id}/intercambioAvisadoEm`] = stamp; talk.intercambioAvisadoEm = stamp })
    if (Object.keys(patch).length) await update(tarefasDiscursosRef, patch)
    render()
  })
}

function programacaoMonthOptions(): string[] {
  const base = new Date(`${todayStr().slice(0, 7)}-01T12:00:00`)
  return Array.from({ length: 13 }, (_, index) => {
    const date = new Date(base.getFullYear(), base.getMonth() + index - 2, 1)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  })
}

function formatMonth(value: string): string {
  const date = new Date(`${value}-01T12:00:00`)
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(date)
}

function excludedProgramacaoDates(): string[] {
  const raw = oradoresPlanning.excludedDates
  return Array.isArray(raw) ? raw : Object.keys(raw ?? {}).filter(key => Boolean(raw?.[key]))
}

async function fillProgramacaoDates(): Promise<void> {
  const weekendDow = oradoresPlanning.meetingDays?.weekendDow ?? oradoresPlanning.weekendDow
  if (typeof weekendDow !== 'number') { toast('Defina o dia da reunião de fim de semana em Tarefas'); return }
  const dates = meetingDatesForMonth(selectedProgramacaoPeriod, weekendDow, excludedProgramacaoDates(), discursos.eventos ?? {})
  const missing = missingLocalTalkDates(discursos.programacao ?? {}, dates).filter(date => date >= todayStr())
  if (!missing.length) { toast('Todas as datas deste período já estão preenchidas'); return }
  if (!window.confirm(`Criar ${missing.length} data${missing.length === 1 ? '' : 's'} de reunião? Programações existentes serão preservadas.`)) return
  const newItems = Object.fromEntries(missing.map(date => [`p_${Date.now().toString(36)}_${date.replace(/-/g, '')}`, { data: date, tipo: 'discurso_local', status: 'por_definir' } satisfies LegacyProgramacao]))
  try {
    await update(tarefasDiscursosRef, Object.fromEntries(Object.entries(newItems).map(([id, item]) => [`programacao/${id}`, item])))
    discursos.programacao = { ...(discursos.programacao ?? {}), ...newItems }
    toast(`${missing.length} data${missing.length === 1 ? '' : 's'} adicionada${missing.length === 1 ? '' : 's'}`)
    render()
  } catch { toast('Erro ao preencher as datas') }
}

function openProgramacaoModal(id: string | null): void {
  const current = id ? discursos.programacao?.[id] : undefined
  const speakers = Object.entries(discursos.oradores ?? {}).sort(([idA, a], [idB, b]) => oradorNome(idA, a).localeCompare(oradorNome(idB, b), 'pt-BR'))
  const speakerOptions = (selected?: string) => speakers.map(([speakerId, speaker]) => `<option value="${escapeHtml(speakerId)}" ${speakerId === selected ? 'selected' : ''}>${escapeHtml(oradorNome(speakerId, speaker))}</option>`).join('')
  const congregacoes = Object.entries(discursos.congregacoes ?? {}).sort(([, a], [, b]) => (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR'))
  const currentCongregationId = canonicalTalkType(current?.tipo) === 'saida_orador' ? current?.congregacaoDestinoId ?? current?.congregacaoId : current?.congregacaoOrigemId ?? current?.congregacaoId
  const congregationOptions = congregacoes.map(([congId, congregation]) => `<option value="${escapeHtml(congId)}" ${congId === currentCongregationId ? 'selected' : ''}>${escapeHtml(congregation.nome ?? congId)}</option>`).join('')
  const themeOptions = Object.entries(discursos.temas ?? {}).sort(([, a], [, b]) => Number(a.numero ?? 0) - Number(b.numero ?? 0)).map(([themeId, theme]) => `<option value="${escapeHtml(themeId)}" ${themeId === current?.temaId ? 'selected' : ''}>${escapeHtml(`${theme.numero ?? ''} ${theme.titulo ?? ''}`.trim())}</option>`).join('')
  const currentType = canonicalTalkType(current?.tipo)
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal"><h2>${id ? 'Editar programação' : 'Nova programação'}</h2><div class="module-form-grid"><div class="form-group"><label class="form-label" for="progData">Data</label><input id="progData" class="form-input" type="date" value="${escapeHtml(current?.data ?? '')}"></div><div class="form-group"><label class="form-label" for="progHorario">Horário</label><input id="progHorario" class="form-input" type="time" value="${escapeHtml(current?.horarioLocal ?? '')}"></div></div><div class="form-group"><label class="form-label" for="progTipo">Tipo</label><select id="progTipo" class="form-select"><option value="discurso_local" ${currentType === 'discurso_local' ? 'selected' : ''}>Discurso local</option><option value="discurso_visitante" ${currentType === 'discurso_visitante' ? 'selected' : ''}>Orador visitante</option><option value="saida_orador" ${currentType === 'saida_orador' ? 'selected' : ''}>Saída de orador</option></select></div><div class="form-group"><label class="form-label" for="progOrador">Orador cadastrado</label><select id="progOrador" class="form-select"><option value="">A definir ou visitante manual</option>${speakerOptions(current?.oradorId)}</select></div><div class="form-group"><label class="form-label" for="progOradorManual">Nome manual do visitante</label><input id="progOradorManual" class="form-input" value="${escapeHtml(current?.oradorId ? '' : current?.oradorNome ?? '')}" placeholder="Opcional para orador visitante"></div><div class="form-group"><label class="form-label" for="progCongregacao">Congregação de origem ou destino</label><select id="progCongregacao" class="form-select"><option value="">Nenhuma</option>${congregationOptions}</select></div><div class="form-group"><label class="form-label" for="progTema">Tema aprovado</label><select id="progTema" class="form-select"><option value="">A definir</option>${themeOptions}</select></div><div class="form-group"><label class="form-label" for="progStatus">Status</label><select id="progStatus" class="form-select"><option value="por_definir" ${current?.status === 'por_definir' ? 'selected' : ''}>Por definir</option><option value="por_confirmar" ${current?.status !== 'confirmado' && current?.status !== 'por_definir' ? 'selected' : ''}>A confirmar</option><option value="confirmado" ${current?.status === 'confirmado' ? 'selected' : ''}>Confirmado</option></select></div><label style="display:flex;gap:8px;margin-bottom:12px"><input id="progReconfirmado" type="checkbox" ${current?.reconfirmacao?.status ? 'checked' : ''}> Reconfirmado para a semana da reunião</label><div style="display:flex;gap:8px;margin-top:8px"><button id="cancelProg" class="btn btn-ghost" type="button" style="flex:1">Cancelar</button><button id="saveProg" class="btn btn-primary" type="button" style="flex:1">Salvar</button></div></div>`
  document.body.appendChild(overlay)
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove() })
  overlay.querySelector('#cancelProg')?.addEventListener('click', () => overlay.remove())
  overlay.querySelector('#saveProg')?.addEventListener('click', () => void saveProgramacao(id, overlay))
}

async function saveProgramacao(id: string | null, overlay: HTMLElement): Promise<void> {
  const current = id ? discursos.programacao?.[id] : undefined
  const oradorId = (overlay.querySelector('#progOrador') as HTMLSelectElement).value
  const orador = oradorId ? discursos.oradores?.[oradorId] : undefined
  const oradorManual = (overlay.querySelector('#progOradorManual') as HTMLInputElement).value.trim()
  const reconfirmado = (overlay.querySelector('#progReconfirmado') as HTMLInputElement).checked
  const tipo = (overlay.querySelector('#progTipo') as HTMLSelectElement).value as 'discurso_local' | 'discurso_visitante' | 'saida_orador'
  const congregacaoId = (overlay.querySelector('#progCongregacao') as HTMLSelectElement).value
  const congregacao = congregacaoId ? discursos.congregacoes?.[congregacaoId] : undefined
  const temaId = (overlay.querySelector('#progTema') as HTMLSelectElement).value
  const tema = temaId ? discursos.temas?.[temaId] : undefined
  const status = (overlay.querySelector('#progStatus') as HTMLSelectElement).value as 'por_definir' | 'por_confirmar' | 'confirmado'
  const stored = { ...(current ?? {}) } as Record<string, unknown>
  ;['oradorOriginalId', 'oradorOriginalNome', 'oradorSecundarioId', 'oradorSecundarioNome', 'desistiu', 'substitutoId', 'substitutoNome', 'realizadoPorId', 'realizadoPorNome', 'observacoes'].forEach(key => delete stored[key])
  const record: LegacyProgramacao = {
    ...stored,
    data: (overlay.querySelector('#progData') as HTMLInputElement).value,
    tipo,
    oradorId: oradorId || undefined,
    oradorNome: orador ? oradorNome(oradorId, orador) : oradorManual || undefined,
    horarioLocal: (overlay.querySelector('#progHorario') as HTMLInputElement).value || undefined,
    congregacaoId: congregacaoId || undefined,
    congregacaoOrigemId: tipo === 'discurso_visitante' ? congregacaoId || undefined : undefined,
    congregacaoOrigemNome: tipo === 'discurso_visitante' ? congregacao?.nome : undefined,
    congregacaoDestinoId: tipo === 'saida_orador' ? congregacaoId || undefined : undefined,
    congregacaoDestinoNome: tipo === 'saida_orador' ? congregacao?.nome : undefined,
    temaId: temaId || undefined,
    temaNumero: tema?.numero,
    temaTitulo: tema?.titulo,
    ...(status === 'por_definir' ? { status, confirmacao: undefined } : confirmationPatch(status, new Date().toISOString())),
    reconfirmacao: reconfirmado ? { status: true, confirmadoEm: current?.reconfirmacao?.confirmadoEm || new Date().toISOString() } : undefined,
    updatedAt: new Date().toISOString(),
  }
  if (!record.data) { toast('Preencha a data'); return }
  const finalId = id ?? `p_${Date.now().toString(36)}`
  if (tipo === 'discurso_local' && eventBlocksLocal(discursos.eventos ?? {}, record.data)) { toast('Há um evento especial nesta data; não pode haver discurso local'); return }
  if ((tipo === 'discurso_visitante' || tipo === 'saida_orador') && !congregacaoId) { toast('Selecione a congregação de origem ou destino'); return }
  if (tipo !== 'discurso_visitante' && !oradorId && oradorManual) { toast('Nome manual é permitido somente para visitante'); return }
  if (tipo === 'saida_orador' && orador?.aprovadoParaSaida === false) { toast('Este orador não está aprovado para saídas'); return }
  if (temaId && orador && !allowedTheme(temaId, orador, discursos.temas ?? {})) { toast('O tema não está aprovado para este orador'); return }
  const conflicts = talkConflicts(finalId, record, discursos.programacao ?? {}, taskMeetings, discursos.oradores ?? {})
  if (conflicts.length) { toast(conflicts[0]); return }
  try {
    await update(tarefasDiscursosRef, { [`programacao/${finalId}`]: record })
    discursos.programacao = { ...(discursos.programacao ?? {}), [finalId]: record }
    overlay.remove(); toast(id ? 'Programação atualizada' : 'Programação adicionada'); render()
  } catch { toast('Erro ao salvar a programação') }
}

async function deleteProgramacao(id: string): Promise<void> {
  if (!id || !discursos.programacao?.[id]) return
  if (!window.confirm('Excluir esta programação?')) return
  try {
    await update(tarefasDiscursosRef, { [`programacao/${id}`]: null })
    const next = { ...(discursos.programacao ?? {}) }; delete next[id]; discursos.programacao = next
    toast('Programação excluída'); render()
  } catch { toast('Erro ao excluir a programação') }
}

function temasView(): string {
  const history = themeHistory(discursos.programacao ?? {}, todayStr())
  const rows = filteredThemeEntries(history)
  return `<div style="margin-top:14px"><div class="oradores-section-head"><div><h3>Temas</h3><p class="form-help">Catálogo, último uso e próximos agendamentos.</p></div><button class="btn btn-primary" type="button" data-add-tema>Adicionar</button></div><div class="module-form-grid"><div class="form-group"><label class="form-label">Mostrar</label><select class="form-select" data-theme-filter><option value="todos" ${themeFilter === 'todos' ? 'selected' : ''}>Todos</option><option value="disponiveis" ${themeFilter === 'disponiveis' ? 'selected' : ''}>Disponíveis</option><option value="usados" ${themeFilter === 'usados' ? 'selected' : ''}>Usados</option></select></div><div class="form-group" style="display:flex;align-items:end"><button class="btn btn-ghost" type="button" data-download-theme-catalog>Abrir prévia do catálogo filtrado</button></div></div><div class="module-option-list">${rows.length ? rows.map(([id, theme]) => { const usage = history[id]; return `<div class="module-menu-btn" style="cursor:default;border-radius:8px;padding:10px 12px"><div style="flex:1"><div class="mod-label">${theme.numero ? `${String(theme.numero).padStart(3, '0')} — ` : ''}${escapeHtml(theme.titulo ?? id)}${theme.ativo === false ? ' · Inativo' : ''}</div><div class="mod-desc">Último uso: ${escapeHtml(usage?.lastPerformed ? formatDate(usage.lastPerformed) : 'Nunca')} · ${usage?.future.length ? `Programado: ${escapeHtml(usage.future.map(formatDate).join(', '))}` : 'Sem programação futura'}</div></div><button class="btn btn-ghost" type="button" data-edit-tema="${escapeHtml(id)}">Editar</button><button class="btn btn-danger" type="button" data-delete-tema="${escapeHtml(id)}">Excluir</button></div>` }).join('') : '<p class="empty-state">Nenhum tema corresponde ao filtro.</p>'}</div></div>`
}

function filteredThemeEntries(history = themeHistory(discursos.programacao ?? {}, todayStr())): Array<[string, LegacyTema]> {
  return Object.entries(discursos.temas ?? {}).filter(([id, theme]) => {
    const usage = history[id]
    if (themeFilter === 'disponiveis') return theme.ativo !== false && !usage?.lastPerformed && !usage?.future.length
    if (themeFilter === 'usados') return Boolean(usage?.lastPerformed)
    return true
  }).sort(([, a], [, b]) => Number(a.numero ?? 0) - Number(b.numero ?? 0))
}

function openTemaModal(id: string | null): void {
  const current = id ? discursos.temas?.[id] : undefined
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal"><h2>${id ? 'Editar tema' : 'Novo tema'}</h2><div class="form-group"><label class="form-label" for="temaNumero">Número</label><input id="temaNumero" class="form-input" type="number" min="1" value="${current?.numero ?? ''}"></div><div class="form-group"><label class="form-label" for="temaTitulo">Título</label><input id="temaTitulo" class="form-input" value="${escapeHtml(current?.titulo ?? '')}"></div><div class="form-group"><label class="form-label" for="temaAtivo">Situação</label><select id="temaAtivo" class="form-select"><option value="true" ${current?.ativo !== false ? 'selected' : ''}>Ativo</option><option value="false" ${current?.ativo === false ? 'selected' : ''}>Inativo</option></select></div><div style="display:flex;gap:8px;margin-top:8px"><button id="cancelTema" class="btn btn-ghost" type="button" style="flex:1">Cancelar</button><button id="saveTema" class="btn btn-primary" type="button" style="flex:1">Salvar</button></div></div>`
  document.body.appendChild(overlay)
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove() })
  overlay.querySelector('#cancelTema')?.addEventListener('click', () => overlay.remove())
  overlay.querySelector('#saveTema')?.addEventListener('click', () => void saveTema(id, overlay))
}

async function saveTema(id: string | null, overlay: HTMLElement): Promise<void> {
  const numero = Number((overlay.querySelector('#temaNumero') as HTMLInputElement).value)
  const titulo = (overlay.querySelector('#temaTitulo') as HTMLInputElement).value.trim()
  if (!numero || !titulo) { toast('Preencha número e título'); return }
  const finalId = id ?? `tema_${String(numero).padStart(3, '0')}`
  const record: LegacyTema = { ...(id ? discursos.temas?.[id] : {}), numero, titulo, ativo: (overlay.querySelector('#temaAtivo') as HTMLSelectElement).value === 'true' }
  try {
    await update(tarefasDiscursosRef, { [`temas/${finalId}`]: record })
    discursos.temas = { ...(discursos.temas ?? {}), [finalId]: record }
    overlay.remove(); toast(id ? 'Tema atualizado' : 'Tema adicionado'); render()
  } catch { toast('Erro ao salvar o tema') }
}

async function downloadThemeCatalog(): Promise<void> {
  const history = themeHistory(discursos.programacao ?? {}, todayStr())
  const rows: ThemeCatalogRow[] = filteredThemeEntries(history)
    .map(([id, theme]) => ({ numero: Number(theme.numero ?? 0), titulo: String(theme.titulo ?? ''), ultimoUso: history[id]?.lastPerformed ? formatDate(history[id].lastPerformed) : 'Nunca', proximos: history[id]?.future?.map(formatDate).join(', ') ?? '' }))
  try {
    await downloadThemeCatalogPdf({ congregation: localCongregationName(), rows })
    toast('Prévia do catálogo de temas gerada')
  } catch { toast('Não foi possível gerar o PDF') }
}

async function deleteTema(id: string): Promise<void> {
  if (!id || !discursos.temas?.[id]) return
  if (!window.confirm('Excluir este tema?')) return
  try {
    await update(tarefasDiscursosRef, { [`temas/${id}`]: null })
    const next = { ...(discursos.temas ?? {}) }; delete next[id]; discursos.temas = next
    toast('Tema excluído'); render()
  } catch { toast('Erro ao excluir o tema') }
}

interface PendingItem { id: string; priority: number; title: string; detail: string; target: OradoresTab; recordId?: string }

function allPendingItems(): PendingItem[] {
  const today = todayStr()
  const items: PendingItem[] = []
  if (!Object.keys(discursos.temas ?? {}).length) items.push({ id: 'catalogo_temas', priority: 1, title: 'Catálogo de temas vazio', detail: 'Cadastre pelo menos um tema para montar os repertórios.', target: 'temas' })
  if (!Object.values(discursos.congregacoes ?? {}).some(congregation => congregation.tipo === 'local' && congregation.ativa !== false)) items.push({ id: 'congregacao_local', priority: 1, title: 'Congregação local não definida', detail: 'Cadastre uma congregação local ativa para datas e documentos.', target: 'congregacoes' })
  watchtowerIssues(discursos.oradores ?? {}).forEach((issue, index) => items.push({ id: `sentinela_${index}`, priority: 1, title: 'Responsabilidade de A Sentinela', detail: issue, target: 'cadastro' }))
  Object.entries(discursos.programacao ?? {}).forEach(([id, talk]) => {
    if (!talk.data || talk.data < today) return
    if (!talk.oradorId && !talk.oradorNome) items.push({ id: `orador_${id}`, priority: 1, title: 'Programação sem orador', detail: `${formatDate(talk.data)} ainda não tem orador definido.`, target: 'programacao', recordId: id })
    if (!talk.temaId) items.push({ id: `tema_${id}`, priority: 1, title: 'Programação sem tema', detail: `${formatDate(talk.data)} ainda não tem tema definido.`, target: 'programacao', recordId: id })
    const exchangeCongregationId = canonicalTalkType(talk.tipo) === 'saida_orador' ? talk.congregacaoDestinoId ?? talk.congregacaoId : talk.congregacaoOrigemId ?? talk.congregacaoId
    if (canonicalTalkType(talk.tipo) !== 'discurso_local' && !exchangeCongregationId) items.push({ id: `intercambio_${id}`, priority: 1, title: 'Intercâmbio sem congregação', detail: `${formatDate(talk.data)} precisa de congregação de origem ou destino.`, target: 'programacao', recordId: id })
    if (deriveStatus(talk) !== 'confirmado') items.push({ id: `confirmar_${id}`, priority: needsReconfirmation(talk, today) ? 1 : 2, title: needsReconfirmation(talk, today) ? 'Reconfirmação necessária' : 'Aguardando confirmação', detail: `${formatDate(talk.data)} precisa de confirmação.`, target: 'programacao', recordId: id })
  })
  Object.entries(discursos.oradores ?? {}).forEach(([id, speaker]) => {
    if (!speaker.pessoaId) items.push({ id: `vinculo_${id}`, priority: 2, title: 'Orador sem vínculo central', detail: `${oradorNome(id, speaker)} precisa ser vinculado a uma pessoa do Admin.`, target: 'cadastro', recordId: id })
    if (!(speaker.temaIds?.length)) items.push({ id: `repertorio_${id}`, priority: 2, title: 'Orador sem repertório', detail: `${oradorNome(id, speaker)} ainda não tem temas aprovados.`, target: 'cadastro', recordId: id })
    if (speaker.pessoaId && pessoas[speaker.pessoaId]?.active === false) items.push({ id: `inativo_${id}`, priority: 2, title: 'Orador vinculado a pessoa inativa', detail: `${oradorNome(id, speaker)} está inativo no cadastro do Admin.`, target: 'cadastro', recordId: id })
  })
  Object.entries(discursos.congregacoes ?? {}).forEach(([id, congregation]) => {
    if (!congregation.contato || !congregation.telefone || !congregation.diaReuniao || !congregation.horario) items.push({ id: `congregacao_${id}`, priority: 3, title: 'Cadastro de congregação incompleto', detail: `${congregation.nome ?? id} precisa de contato e dados de reunião.`, target: 'congregacoes', recordId: id })
  })
  return items.sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title, 'pt-BR'))
}

function pendingCategory(item: PendingItem): typeof pendingFilter {
  if (item.id.startsWith('confirmar_')) return 'confirmacoes'
  if (item.target === 'programacao') return 'programacao'
  if (item.target === 'cadastro') return 'cadastro'
  if (item.target === 'congregacoes') return 'congregacoes'
  return 'todas'
}

function currentPendingItems(): PendingItem[] {
  return allPendingItems().filter(item => !discursos.pendenciasIgnoradas?.[item.id])
}

function ignoredPendingLabel(id: string): string {
  const current = allPendingItems().find(item => item.id === id)
  if (current) return current.title
  if (id.startsWith('orador_')) return 'Programação sem orador'
  if (id.startsWith('tema_')) return 'Programação sem tema'
  if (id.startsWith('confirmar_')) return 'Confirmação de programação'
  if (id.startsWith('intercambio_')) return 'Intercâmbio sem congregação'
  if (id.startsWith('vinculo_')) return 'Orador sem vínculo central'
  if (id.startsWith('repertorio_')) return 'Orador sem repertório'
  if (id.startsWith('congregacao_')) return 'Cadastro de congregação incompleto'
  return 'Pendência anterior'
}

function pendenciasView(): string {
  const all = currentPendingItems()
  const items = all.filter(item => pendingFilter === 'todas' || pendingCategory(item) === pendingFilter)
  const ignored = Object.entries(discursos.pendenciasIgnoradas ?? {}).sort(([, a], [, b]) => b.localeCompare(a))
  const counts = { todas:all.length, programacao:all.filter(item => pendingCategory(item) === 'programacao').length, cadastro:all.filter(item => pendingCategory(item) === 'cadastro').length, congregacoes:all.filter(item => pendingCategory(item) === 'congregacoes').length, confirmacoes:all.filter(item => pendingCategory(item) === 'confirmacoes').length }
  const severity = (priority: number) => priority === 1 ? ['Urgente', '#B3261E'] : priority === 2 ? ['Atenção', '#8A5B00'] : ['Quando puder', '#006EB6']
  const active = items.length ? `<div style="display:flex;flex-direction:column;gap:8px">${items.map(item => { const [label, color] = severity(item.priority); return `<div style="border:1px solid ${color};background:var(--surface);border-radius:8px;padding:12px;font-size:.82rem"><span class="pending-badge" style="background:${color}">${label}</span><strong style="display:block;margin-top:6px">${escapeHtml(item.title)}</strong><div style="color:var(--ink-3);margin:4px 0 10px">${escapeHtml(item.detail)}</div><div style="display:flex;gap:8px"><button class="btn btn-ghost" type="button" data-pendencia-resolver="${escapeHtml(item.id)}">Resolver</button><button class="btn btn-ghost" type="button" data-pendencia-ignore="${escapeHtml(item.id)}">Ignorar</button></div></div>` }).join('')}</div>` : '<div style="padding:18px;border:1px solid #B7DEC7;background:#F1FAF4;border-radius:8px;color:#1A6B3C;font-size:.84rem">Nenhuma pendência neste filtro.</div>'
  return `<div style="margin-top:14px"><h3 style="font-size:.95rem;color:#5C6062;margin-bottom:2px">Pendências</h3><div class="module-form-grid"><div class="form-group"><label class="form-label">Tipo</label><select class="form-select" data-pending-filter><option value="todas">Todas (${counts.todas})</option><option value="programacao" ${pendingFilter === 'programacao' ? 'selected' : ''}>Programação (${counts.programacao})</option><option value="cadastro" ${pendingFilter === 'cadastro' ? 'selected' : ''}>Cadastro (${counts.cadastro})</option><option value="congregacoes" ${pendingFilter === 'congregacoes' ? 'selected' : ''}>Congregações (${counts.congregacoes})</option><option value="confirmacoes" ${pendingFilter === 'confirmacoes' ? 'selected' : ''}>Confirmações (${counts.confirmacoes})</option></select></div><label style="display:flex;align-items:center;gap:8px"><input type="checkbox" data-show-ignored ${showIgnoredPending ? 'checked' : ''}> Mostrar ignoradas (${ignored.length})</label></div>${active}${showIgnoredPending && ignored.length ? `<div style="margin-top:16px"><h3 style="font-size:.9rem;color:#5C6062">Ignoradas</h3>${ignored.map(([id, stamp]) => `<div class="module-menu-btn" style="cursor:default"><div style="flex:1"><div class="mod-label">${escapeHtml(ignoredPendingLabel(id))}</div><div class="mod-desc">Ignorada em ${escapeHtml(formatDate(stamp.slice(0, 10)))}</div></div><button class="btn btn-ghost" type="button" data-pendencia-reactivate="${escapeHtml(id)}">Trazer de volta</button></div>`).join('')}</div>` : ''}</div>`
}

function resolvePending(id: string): void {
  const item = allPendingItems().find(entry => entry.id === id)
  if (!item) return
  const talk = item.recordId ? discursos.programacao?.[item.recordId] : undefined
  const speaker = item.recordId ? discursos.oradores?.[item.recordId] : undefined
  const congregation = item.recordId ? discursos.congregacoes?.[item.recordId] : undefined
  if (talk?.data) selectedProgramacaoPeriod = talk.data.slice(0, 7)
  if (speaker) selectedSpeakerId = item.recordId!
  if (congregation) selectedCongregationId = item.recordId!
  activeTab = item.target
  render()
  if (item.recordId) setTimeout(() => {
    if (item.target === 'programacao') openProgramacaoModal(item.recordId!)
    if (item.target === 'cadastro') openOradorModal(item.recordId!)
    if (item.target === 'congregacoes') openCongregacaoModal(item.recordId!)
  }, 0)
  else if (item.target === 'temas') setTimeout(() => openTemaModal(null), 0)
}

async function ignorePending(id: string): Promise<void> {
  const stamp = new Date().toISOString()
  try {
    await update(tarefasDiscursosRef, { [`pendenciasIgnoradas/${id}`]: stamp })
    discursos.pendenciasIgnoradas = { ...(discursos.pendenciasIgnoradas ?? {}), [id]: stamp }
    render()
  } catch { toast('Não foi possível ignorar a pendência') }
}

async function reactivatePending(id: string): Promise<void> {
  try {
    await update(tarefasDiscursosRef, { [`pendenciasIgnoradas/${id}`]: null })
    const next = { ...(discursos.pendenciasIgnoradas ?? {} ) }; delete next[id]; discursos.pendenciasIgnoradas = next
    render()
  } catch { toast('Não foi possível reativar a pendência') }
}

function formatDate(value: string | undefined): string {
  if (!value) return 'Sem data'
  const [y, m, d] = value.split('-')
  return y && m && d ? `${d}/${m}/${y}` : value
}
