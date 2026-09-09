import type { AppContext, RawPessoas } from '../types'
import { get, pessoasRef, update, tarefasDiscursosRef, tarefasEventosRef, tarefasPlanejamentoRef, tarefasScaleRef } from '../firebase'
import { renderMenuCards, type ItemMenu } from '../ui/menu-cards'
import { moduleBackButton, moduleTitle } from '../ui/module-header'
import { allowedTheme, assignmentsForSpeaker, confirmationPatch, deriveStatus, eventBlocksLocal, meetingDatesForMonth, missingLocalTalkDates, needsReconfirmation, talkConflicts, themeHistory, type Congregation, type Speaker, type Talk, type Theme } from './oradores-domain'
import { availableSpeakerThemes, downloadApprovedSpeakersPdf, downloadAvailableThemesPdf, downloadSchedulePdf, downloadThemeCatalogPdf, type ApprovedSpeakerRow, type SchedulePdfRow, type ThemeCatalogRow } from './oradores-documents'

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
let oradoresPlanning: { meetingDays?: { weekendDow?: number }; weekendDow?: number; excludedDates?: string[] | Record<string, unknown> } = {}
type OradoresTab = 'indice' | 'resumo' | 'cadastro' | 'programacao' | 'designacoes' | 'temas' | 'congregacoes' | 'intercambios' | 'eventos' | 'pendencias'
let activeTab: OradoresTab = 'indice'
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

function oradorTelefone(orador?: LegacyOrador): string {
  return pessoas[orador?.pessoaId ?? '']?.whatsapp ?? orador?.telefone ?? ''
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
        { id: 'designacoes', titulo: 'Designações por orador', subtitulo: 'Agenda individual e mensagens', icone: '☷', corFundo: '#003F72' },
        { id: 'cadastro', titulo: 'Cadastro', subtitulo: 'Oradores da congregação', icone: '♙', corFundo: '#003F72' },
        { id: 'temas', titulo: 'Temas', subtitulo: 'Catálogo dos discursos públicos', icone: '▤', corFundo: '#1A6B3C' },
        { id: 'congregacoes', titulo: 'Congregações', subtitulo: 'Locais, visitantes e intercâmbios', icone: '⌂', corFundo: '#006EB6' },
        { id: 'intercambios', titulo: 'Intercâmbios', subtitulo: 'Entradas, saídas e mensagens', icone: '⇄', corFundo: '#7E3AF2' },
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
  el.querySelector<HTMLButtonElement>('[data-download-available-themes]')?.addEventListener('click', () => void downloadAvailableThemes())
  el.querySelector<HTMLButtonElement>('[data-download-approved-speakers]')?.addEventListener('click', () => void downloadApprovedSpeakers())
  el.querySelector<HTMLButtonElement>('[data-download-theme-catalog]')?.addEventListener('click', () => void downloadThemeCatalog())
  el.querySelectorAll<HTMLButtonElement>('[data-edit-orador]').forEach(button => {
    button.addEventListener('click', () => openOradorModal(button.dataset['editOrador'] ?? null))
  })
  el.querySelectorAll<HTMLButtonElement>('[data-delete-orador]').forEach(button => {
    button.addEventListener('click', () => void deleteOrador(button.dataset['deleteOrador'] ?? ''))
  })
  el.querySelector<HTMLButtonElement>('[data-add-programacao]')?.addEventListener('click', () => openProgramacaoModal(null))
  el.querySelector<HTMLButtonElement>('[data-download-programacao]')?.addEventListener('click', () => void downloadProgramacaoPdf())
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
  el.querySelectorAll<HTMLButtonElement>('[data-edit-programacao]').forEach(button => {
    button.addEventListener('click', () => openProgramacaoModal(button.dataset['editProgramacao'] ?? null))
  })
  el.querySelectorAll<HTMLButtonElement>('[data-delete-programacao]').forEach(button => {
    button.addEventListener('click', () => void deleteProgramacao(button.dataset['deleteProgramacao'] ?? ''))
  })
  el.querySelectorAll<HTMLButtonElement>('[data-programacao-whatsapp]').forEach(button => {
    button.addEventListener('click', () => void sendProgramacaoWhatsApp(button.dataset['programacaoWhatsapp'] ?? ''))
  })
  el.querySelectorAll<HTMLButtonElement>('[data-programacao-confirm]').forEach(button => {
    button.addEventListener('click', () => void setProgramacaoConfirmation(button.dataset['programacaoConfirm'] ?? '', false))
  })
  el.querySelectorAll<HTMLButtonElement>('[data-programacao-reconfirm]').forEach(button => {
    button.addEventListener('click', () => void setProgramacaoConfirmation(button.dataset['programacaoReconfirm'] ?? '', true))
  })
  el.querySelector<HTMLButtonElement>('[data-add-tema]')?.addEventListener('click', () => openTemaModal(null))
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
  el.querySelector<HTMLButtonElement>('[data-send-available-dates]')?.addEventListener('click', () => sendAvailableDates())
  el.querySelectorAll<HTMLButtonElement>('[data-edit-congregacao]').forEach(button => {
    button.addEventListener('click', () => openCongregacaoModal(button.dataset['editCongregacao'] ?? null))
  })
  el.querySelectorAll<HTMLButtonElement>('[data-delete-congregacao]').forEach(button => {
    button.addEventListener('click', () => void deleteCongregacao(button.dataset['deleteCongregacao'] ?? ''))
  })
  el.querySelector<HTMLButtonElement>('[data-add-evento]')?.addEventListener('click', () => openEventoModal(null))
  el.querySelectorAll<HTMLButtonElement>('[data-edit-evento]').forEach(button => button.addEventListener('click', () => openEventoModal(button.dataset['editEvento'] ?? null)))
  el.querySelectorAll<HTMLButtonElement>('[data-delete-evento]').forEach(button => button.addEventListener('click', () => void deleteEvento(button.dataset['deleteEvento'] ?? '')))
  el.querySelectorAll<HTMLButtonElement>('[data-intercambio-message]').forEach(button => button.addEventListener('click', () => openIntercambioMessage(button.dataset['intercambioMessage'] ?? '')))
  el.querySelector<HTMLSelectElement>('#designationSpeaker')?.addEventListener('change', event => { selectedSpeakerId = (event.target as HTMLSelectElement).value; localStorage.setItem(ORADORES_DESIGNATION_SPEAKER_KEY, selectedSpeakerId); render() })
  el.querySelector<HTMLButtonElement>('#designationWhats')?.addEventListener('click', () => void sendDesignationMessage())
}

function renderTabContent(tab: OradoresTab): string {
  if (tab === 'cadastro') return cadastroView()
  if (tab === 'programacao') return programacaoView()
  if (tab === 'designacoes') return designacoesView()
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

function designationLines(entries: Array<[string, LegacyProgramacao]>): string[] {
  return entries.map(([, talk]) => `${formatDate(talk.data)} · ${talkPlace(talk)} · Tema ${talk.temaNumero ?? ''} ${talk.temaTitulo ?? 'a definir'} · ${deriveStatus(talk) === 'confirmado' ? 'Confirmado' : 'A confirmar'}`)
}

function designacoesView(): string {
  const speakers = Object.entries(discursos.oradores ?? {}).sort(([idA, a], [idB, b]) => oradorNome(idA, a).localeCompare(oradorNome(idB, b), 'pt-BR'))
  if (!selectedSpeakerId || !discursos.oradores?.[selectedSpeakerId]) selectedSpeakerId = speakers[0]?.[0] ?? ''
  const entries = assignmentsForSpeaker(discursos.programacao ?? {}, selectedSpeakerId, todayStr())
  const speaker = discursos.oradores?.[selectedSpeakerId]
  const draft = entries.length ? `Olá, ${oradorNome(selectedSpeakerId, speaker)}! Estas são suas próximas designações:\n\n${designationLines(entries).map(line => `• ${line}`).join('\n')}\n\nPor favor, confirme se está tudo certo.` : ''
  return `<div style="margin-top:14px"><div class="form-group"><label class="form-label">Orador</label><select id="designationSpeaker" class="form-select">${speakers.map(([id, item]) => `<option value="${escapeHtml(id)}" ${id === selectedSpeakerId ? 'selected' : ''}>${escapeHtml(oradorNome(id, item))}</option>`).join('')}</select></div><div class="module-option-list">${entries.length ? entries.map(([, talk]) => `<div class="module-menu-btn" style="cursor:default"><div style="flex:1"><div class="mod-label">${escapeHtml(formatDate(talk.data))} · ${escapeHtml(talkPlace(talk))}</div><div class="mod-desc">Tema ${escapeHtml(talk.temaNumero ?? '')} ${escapeHtml(talk.temaTitulo ?? 'a definir')} · ${deriveStatus(talk) === 'confirmado' ? 'Confirmado' : 'A confirmar'}${talk.avisadoEm ? ' · Avisado' : ''}</div></div></div>`).join('') : '<p class="empty-state">Nenhuma designação futura para este orador.</p>'}</div>${entries.length ? `<div class="form-group" style="margin-top:14px"><label class="form-label">Mensagem</label><textarea id="designationText" class="form-input" rows="11">${escapeHtml(draft)}</textarea></div><button id="designationWhats" class="btn btn-primary">Abrir WhatsApp</button>` : ''}</div>`
}

async function sendDesignationMessage(): Promise<void> {
  const speaker = discursos.oradores?.[selectedSpeakerId]
  const phone = digits(oradorTelefone(speaker))
  const message = (document.getElementById('designationText') as HTMLTextAreaElement | null)?.value.trim() ?? ''
  if (!phone) { toast('Cadastre o WhatsApp desta pessoa no Admin'); return }
  if (!message) { toast('Escreva a mensagem'); return }
  const popup = window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
  if (!popup) { toast('Permita pop-ups para abrir o WhatsApp'); return }
  const entries = assignmentsForSpeaker(discursos.programacao ?? {}, selectedSpeakerId, todayStr())
  const stamp = new Date().toISOString()
  const patch = Object.fromEntries(entries.map(([id]) => [`programacao/${id}/avisadoEm`, stamp]))
  try {
    await update(tarefasDiscursosRef, patch)
    entries.forEach(([id, talk]) => { talk.avisadoEm = stamp; if (discursos.programacao?.[id]) discursos.programacao[id] = talk })
    toast('WhatsApp aberto; revise antes de enviar'); render()
  } catch { toast('WhatsApp aberto, mas não foi possível registrar os avisos') }
}

function intercambiosView(): string {
  const contextId = selectedCongregationId
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
    return `<div class="module-menu-btn" style="cursor:default${near ? ';border-color:#D6A100;background:#FFF9E8' : ''}"><div class="mod-icon" style="background:#7E3AF220;color:#7E3AF2">${outgoing ? '→' : '←'}</div><div style="flex:1"><div class="mod-label">${escapeHtml(congregation?.nome ?? 'congregação não informada')}${near ? ' · menos de 21 dias' : ''}</div><div class="mod-desc">${escapeHtml(formatDate(talk.data))} · ${escapeHtml(oradorNome(talk.oradorId ?? '', speaker))} · ${escapeHtml(talk.temaTitulo ?? 'tema a definir')}</div></div><button class="btn btn-primary" type="button" data-intercambio-message="${escapeHtml(id)}">Mensagem</button></div>`
  }).join('') : '<p class="empty-state">Nenhum compromisso futuro.</p>'}</div></section>`
  const entradas = rows.filter(([, talk]) => canonicalTalkType(talk.tipo) === 'discurso_visitante')
  const saidas = rows.filter(([, talk]) => canonicalTalkType(talk.tipo) === 'saida_orador')
  const contextName = contextId ? discursos.congregacoes?.[contextId]?.nome ?? 'Congregação' : 'Todas as congregações'
  return `<div style="margin-top:14px"><h3 style="font-size:.95rem;color:#5C6062;margin-bottom:2px">Intercâmbios</h3><p style="font-size:.75rem;color:var(--ink-3)">Contexto: ${escapeHtml(contextName)}.</p>${renderRows(entradas, 'Entradas')} ${renderRows(saidas, 'Saídas')}</div>`
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

function digits(value: unknown): string {
  const phone = String(value ?? '').replace(/\D/g, '')
  return phone.length === 11 ? `55${phone}` : phone
}

function openIntercambioMessage(id: string): void {
  const talk = discursos.programacao?.[id]; if (!talk) return
  const outgoing = canonicalTalkType(talk.tipo) === 'saida_orador'
  const congregationId = outgoing ? talk.congregacaoDestinoId ?? talk.congregacaoId : talk.congregacaoOrigemId ?? talk.congregacaoId
  const congregation = discursos.congregacoes?.[congregationId ?? '']
  const speakerId = talk.oradorId ?? ''
  const speaker = discursos.oradores?.[speakerId]
  const speakerPhone = digits(oradorTelefone(speaker)), congregationPhone = digits(congregation?.telefone)
  const message = outgoing
    ? `Olá! Confirmamos o discurso de ${oradorNome(speakerId, speaker)} em ${congregation?.nome ?? 'sua congregação'}, no dia ${formatDate(talk.data)}, com o tema ${talk.temaNumero ?? ''} ${talk.temaTitulo ?? ''}.`
    : `Olá, ${oradorNome(speakerId, speaker)}! Confirmamos seu discurso em nossa congregação no dia ${formatDate(talk.data)}, com o tema ${talk.temaNumero ?? ''} ${talk.temaTitulo ?? ''}.`
  const overlay = document.createElement('div'); overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal"><h2>Mensagem de intercâmbio</h2><div class="form-group"><label class="form-label">Destinatário</label><select id="exchangeTarget" class="form-select"><option value="${speakerPhone}">Orador: ${escapeHtml(oradorNome(speakerId, speaker))}</option>${congregationPhone ? `<option value="${congregationPhone}">Congregação: ${escapeHtml(congregation?.nome ?? '')}</option>` : ''}</select></div><div class="form-group"><label class="form-label">Texto</label><textarea id="exchangeText" class="form-input" rows="10">${escapeHtml(message)}</textarea></div><div style="display:flex;gap:8px"><button id="exchangeCancel" class="btn btn-ghost">Cancelar</button><button id="exchangeWhats" class="btn btn-primary">Abrir WhatsApp</button></div></div>`
  document.body.appendChild(overlay)
  overlay.querySelector('#exchangeCancel')?.addEventListener('click', () => overlay.remove())
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove() })
  overlay.querySelector('#exchangeWhats')?.addEventListener('click', () => void sendIntercambioMessage(id, overlay))
}

async function sendIntercambioMessage(id: string, overlay: HTMLElement): Promise<void> {
  const phone = (overlay.querySelector('#exchangeTarget') as HTMLSelectElement).value
  const message = (overlay.querySelector('#exchangeText') as HTMLTextAreaElement).value.trim()
  if (!phone) { toast('Cadastre o WhatsApp no Admin ou na congregação'); return }
  if (!message) { toast('Escreva a mensagem'); return }
  const popup = window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
  if (!popup) { toast('Permita pop-ups para abrir o WhatsApp'); return }
  const stamp = new Date().toISOString()
  try {
    await update(tarefasDiscursosRef, { [`programacao/${id}/avisadoEm`]: stamp })
    if (discursos.programacao?.[id]) discursos.programacao[id].avisadoEm = stamp
    overlay.remove(); toast('WhatsApp aberto; revise antes de enviar'); render()
  } catch { toast('WhatsApp aberto, mas não foi possível registrar o aviso') }
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
  return `<div style="margin-top:14px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px"><h3 style="font-size:.95rem;color:#5C6062">Congregações</h3><button class="btn btn-primary" type="button" data-add-congregacao style="padding:6px 10px;font-size:.78rem">Adicionar</button></div>${rows.length ? `<div class="form-group"><label class="form-label">Congregação consultada</label><select class="form-select" data-congregation-select>${selector}</select></div><div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px;margin:10px 0"><strong>${escapeHtml(selected?.nome ?? '')}</strong><div style="font-size:.76rem;color:var(--ink-3);margin-top:4px">${escapeHtml([selected?.cidade, selected?.diaReuniao, selected?.horario].filter(Boolean).join(' · ') || 'Dados de reunião não informados')}</div><div style="font-size:.76rem;color:var(--ink-3);margin-top:4px">Contato: ${escapeHtml(selected?.contato || '—')} · ${escapeHtml(selected?.telefone || '—')}</div>${mapsLink ? `<a href="${escapeHtml(mapsLink)}" target="_blank" rel="noopener noreferrer" style="font-size:.76rem">Abrir no Maps</a>` : ''}</div><div class="module-form-grid" style="margin:10px 0"><div class="form-group"><label class="form-label">Alcance das datas livres</label><select class="form-select" data-available-days><option value="60" ${availableDaysHorizon === 60 ? 'selected' : ''}>60 dias</option><option value="90" ${availableDaysHorizon === 90 ? 'selected' : ''}>90 dias</option><option value="120" ${availableDaysHorizon === 120 ? 'selected' : ''}>120 dias</option></select></div><div class="form-group" style="display:flex;align-items:end"><button class="btn btn-ghost" type="button" data-send-available-dates ${selected?.telefone && dates.length ? '' : 'disabled'} style="width:100%">Enviar datas livres</button></div></div><div class="module-option-list">${dates.length ? dates.map(date => `<div class="module-menu-btn" style="cursor:default"><span>${escapeHtml(formatDate(date))}</span></div>`).join('') : '<p class="empty-state">Nenhuma data livre neste alcance.</p>'}</div><div class="module-option-list" style="margin-top:14px">${rows.map(([id, c]) => `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 12px;display:flex;justify-content:space-between;gap:10px;align-items:center"><div style="flex:1;min-width:0"><strong>${escapeHtml(c.nome ?? id)}</strong><div style="font-size:.75rem;color:var(--ink-3)">${escapeHtml(c.cidade ?? 'Cidade não informada')} · ${c.tipo === 'local' ? 'Local' : 'Visitante'}</div></div><button class="btn btn-ghost" type="button" data-edit-congregacao="${escapeHtml(id)}" style="padding:4px 8px;font-size:.72rem">Editar</button><button class="btn btn-danger" type="button" data-delete-congregacao="${escapeHtml(id)}" style="padding:4px 8px;font-size:.72rem">Excluir</button></div>`).join('')}</div>` : '<p class="empty-state">Nenhuma congregação cadastrada.</p>'}</div>`
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

function sendAvailableDates(): void {
  const congregation = discursos.congregacoes?.[selectedCongregationId]
  const phone = digits(congregation?.telefone)
  const dates = availableCongregationDates()
  if (!phone || !dates.length) { toast('Informe um telefone e mantenha ao menos uma data livre'); return }
  const message = `Olá${congregation?.contato ? `, ${congregation.contato}` : ''}! A Congregação ${localCongregationName()} tem as seguintes datas livres para discurso público:\n\n${dates.map(formatDate).join('\n')}`
  const popup = window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
  toast(popup ? 'WhatsApp aberto; revise antes de enviar' : 'Permita pop-ups para abrir o WhatsApp')
}

function openCongregacaoModal(id: string | null): void {
  const current = id ? discursos.congregacoes?.[id] : undefined
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal"><h2>${id ? 'Editar congregação' : 'Nova congregação'}</h2><div class="form-group"><label class="form-label" for="congNome">Nome</label><input id="congNome" class="form-input" value="${escapeHtml(current?.nome ?? '')}"></div><div class="form-group"><label class="form-label" for="congCidade">Cidade</label><input id="congCidade" class="form-input" value="${escapeHtml(current?.cidade ?? '')}"></div><div class="form-group"><label class="form-label" for="congTipo">Tipo</label><select id="congTipo" class="form-select"><option value="visitante" ${current?.tipo !== 'local' ? 'selected' : ''}>Visitante</option><option value="local" ${current?.tipo === 'local' ? 'selected' : ''}>Local</option></select></div><div class="form-group"><label class="form-label" for="congContato">Contato</label><input id="congContato" class="form-input" value="${escapeHtml(current?.contato ?? '')}"></div><div class="form-group"><label class="form-label" for="congTelefone">Telefone do contato</label><input id="congTelefone" class="form-input" type="tel" value="${escapeHtml(current?.telefone ?? '')}"></div><div class="module-form-grid"><div class="form-group"><label class="form-label" for="congDia">Dia da reunião</label><input id="congDia" class="form-input" value="${escapeHtml(current?.diaReuniao ?? '')}" placeholder="Domingo"></div><div class="form-group"><label class="form-label" for="congHorario">Horário</label><input id="congHorario" class="form-input" type="time" value="${escapeHtml(current?.horario ?? '')}"></div></div><div class="form-group"><label class="form-label" for="congLocal">Link do Maps</label><input id="congLocal" class="form-input" value="${escapeHtml(current?.localizacao ?? '')}"></div><div class="form-group"><label class="form-label" for="congObs">Endereço</label><textarea id="congObs" class="form-input">${escapeHtml(current?.observacoes ?? '')}</textarea></div><div style="display:flex;gap:8px;margin-top:8px"><button id="cancelCong" class="btn btn-ghost" type="button" style="flex:1">Cancelar</button><button id="saveCong" class="btn btn-primary" type="button" style="flex:1">Salvar</button></div></div>`
  document.body.appendChild(overlay)
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove() })
  overlay.querySelector('#cancelCong')?.addEventListener('click', () => overlay.remove())
  overlay.querySelector('#saveCong')?.addEventListener('click', () => void saveCongregacao(id, overlay))
}

async function saveCongregacao(id: string | null, overlay: HTMLElement): Promise<void> {
  const nome = (overlay.querySelector('#congNome') as HTMLInputElement).value.trim()
  if (!nome) { toast('Preencha o nome da congregação'); return }
  const record: LegacyCongregacao = { ...(id ? discursos.congregacoes?.[id] : {}), nome, cidade: (overlay.querySelector('#congCidade') as HTMLInputElement).value.trim(), tipo: (overlay.querySelector('#congTipo') as HTMLSelectElement).value, contato: (overlay.querySelector('#congContato') as HTMLInputElement).value.trim(), telefone: (overlay.querySelector('#congTelefone') as HTMLInputElement).value.trim(), diaReuniao: (overlay.querySelector('#congDia') as HTMLInputElement).value.trim(), horario: (overlay.querySelector('#congHorario') as HTMLInputElement).value, localizacao: (overlay.querySelector('#congLocal') as HTMLInputElement).value.trim(), observacoes: (overlay.querySelector('#congObs') as HTMLTextAreaElement).value.trim() }
  delete (record as Record<string, unknown>).ativa
  const finalId = id ?? `c_${Date.now().toString(36)}`
  try { await update(tarefasDiscursosRef, { [`congregacoes/${finalId}`]: record }); discursos.congregacoes = { ...(discursos.congregacoes ?? {}), [finalId]: record }; overlay.remove(); toast(id ? 'Congregação atualizada' : 'Congregação adicionada'); render() } catch { toast('Erro ao salvar congregação') }
}

async function deleteCongregacao(id: string): Promise<void> {
  if (!id || !discursos.congregacoes?.[id]) return
  if (Object.values(discursos.programacao ?? {}).some(p => p.congregacaoId === id)) { toast('Esta congregação está vinculada a uma programação'); return }
  if (!window.confirm(`Excluir a congregação "${discursos.congregacoes[id].nome ?? id}"?`)) return
  try { await update(tarefasDiscursosRef, { [`congregacoes/${id}`]: null }); const next = { ...(discursos.congregacoes ?? {}) }; delete next[id]; discursos.congregacoes = next; toast('Congregação excluída'); render() } catch { toast('Erro ao excluir congregação') }
}

function cadastroView(): string {
  const rows = Object.entries(discursos.oradores ?? {}).sort(([idA, a], [idB, b]) => oradorNome(idA, a).localeCompare(oradorNome(idB, b), 'pt-BR'))
  const availableBySpeaker = new Map(availableSpeakerThemes({ speakers: discursos.oradores ?? {}, themes: discursos.temas ?? {}, talks: discursos.programacao ?? {}, today: todayStr() }).map(entry => [entry.nome, entry.temas.length]))
  const approved = rows.filter(([, speaker]) => speaker.aprovadoParaSaida)
  return `<div style="margin-top:14px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:2px"><div><h3 style="font-size:.95rem;color:#5C6062">Cadastro</h3><p style="font-size:.75rem;color:var(--ink-3)">Oradores vinculados ao cadastro central.</p></div><button class="btn btn-primary" type="button" data-add-orador style="padding:6px 10px;font-size:.78rem;white-space:nowrap">Adicionar</button></div><div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin:10px 0"><button class="btn btn-ghost" type="button" data-download-available-themes>PDF de temas disponíveis</button><button class="btn btn-ghost" type="button" data-download-approved-speakers>PDF de aprovados para saída</button></div><div style="margin:12px 0"><h3 style="font-size:.9rem;color:#5C6062;margin-bottom:6px">Aprovados para saída</h3>${approved.length ? `<div class="module-option-list">${approved.map(([id, speaker]) => `<div class="module-menu-btn" style="cursor:default"><span>${escapeHtml(oradorNome(id, speaker))}</span><span class="mod-desc">${speaker.temaIds?.length ?? 0} temas</span></div>`).join('')}</div>` : '<p class="empty-state">Nenhum orador aprovado para saída.</p>'}</div><div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:0 12px">${rows.length ? rows.map(([id, o]) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)"><div style="flex:1;min-width:0"><strong>${escapeHtml(oradorNome(id, o))}</strong><div style="font-size:.75rem;color:var(--ink-3)">${o.pessoaId ? 'Vinculado ao Admin' : 'Vínculo pendente'} · ${o.temaIds?.length ?? 0} no repertório · ${availableBySpeaker.get(oradorNome(id, o)) ?? 0} disponíveis</div></div><button class="btn btn-ghost" type="button" data-edit-orador="${escapeHtml(id)}" style="padding:4px 8px;font-size:.72rem">Editar</button><button class="btn btn-danger" type="button" data-delete-orador="${escapeHtml(id)}" style="padding:4px 8px;font-size:.72rem">Excluir</button></div>`).join('') : '<p style="padding:16px 0;color:var(--ink-3);text-align:center;font-size:.82rem">Nenhum orador cadastrado.</p>'}</div></div>`
}

async function downloadAvailableThemes(): Promise<void> {
  const entries = availableSpeakerThemes({ speakers: discursos.oradores ?? {}, themes: discursos.temas ?? {}, talks: discursos.programacao ?? {}, today: todayStr() })
  try {
    await downloadAvailableThemesPdf({ congregation: 'Noroeste', entries })
    toast(entries.length ? 'PDF de temas disponíveis gerado' : 'PDF gerado sem temas disponíveis')
  } catch {
    toast('Não foi possível gerar o PDF')
  }
}

async function downloadApprovedSpeakers(): Promise<void> {
  const rows: ApprovedSpeakerRow[] = Object.entries(discursos.oradores ?? {})
    .filter(([, speaker]) => speaker.aprovadoParaSaida)
    .sort(([idA, a], [idB, b]) => oradorNome(idA, a).localeCompare(oradorNome(idB, b), 'pt-BR'))
    .map(([id, speaker]) => ({ nome: oradorNome(id, speaker), telefone: oradorTelefone(speaker), temas: (speaker.temaIds ?? []).map(themeId => discursos.temas?.[themeId]).filter((theme): theme is LegacyTema => Boolean(theme)).sort((a, b) => Number(a.numero ?? 0) - Number(b.numero ?? 0)).map(theme => String(theme.numero ?? '')).join(', ') }))
  try {
    await downloadApprovedSpeakersPdf({ congregation: localCongregationName(), rows })
    toast('PDF de aprovados para saída gerado')
  } catch { toast('Não foi possível gerar o PDF') }
}

function newOradorId(): string {
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  return `o_${Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('')}`
}

function openOradorModal(id: string | null): void {
  const current = id ? discursos.oradores?.[id] : undefined
  const linked = new Set(Object.entries(discursos.oradores ?? {}).filter(([other]) => other !== id).map(([, item]) => item.pessoaId).filter(Boolean))
  const personOptions = Object.entries(pessoas).filter(([mid, person]) => person.active !== false && (!linked.has(mid) || mid === current?.pessoaId)).sort(([, a], [, b]) => a.name.localeCompare(b.name, 'pt-BR')).map(([mid, person]) => `<option value="${escapeHtml(mid)}" ${current?.pessoaId === mid ? 'selected' : ''}>${escapeHtml(person.name)}</option>`).join('')
  const themeChecks = Object.entries(discursos.temas ?? {}).sort(([, a], [, b]) => Number(a.numero ?? 0) - Number(b.numero ?? 0)).map(([themeId, theme]) => `<label style="display:flex;gap:8px;padding:6px 0"><input type="checkbox" data-orador-theme="${escapeHtml(themeId)}" ${current?.temaIds?.includes(themeId) ? 'checked' : ''}> ${escapeHtml(`${theme.numero ?? ''} ${theme.titulo ?? ''}`.trim())}</label>`).join('')
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal"><h2>${id ? 'Editar orador' : 'Adicionar orador'}</h2><div class="form-group"><label class="form-label" for="oradorPessoa">Pessoa do cadastro Admin</label><select id="oradorPessoa" class="form-select"><option value="">Selecionar...</option>${personOptions}</select><p class="form-help">Nome e WhatsApp são editados somente no Admin.</p></div><div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px"><label><input id="oradorSaida" type="checkbox" ${current?.aprovadoParaSaida ? 'checked' : ''}> Aprovado para saídas</label><label><input id="oradorPreside" type="checkbox" ${current?.podePresidir ? 'checked' : ''}> Pode presidir</label><label><input id="oradorSentinela" type="checkbox" ${current?.sentinelaDirigente ? 'checked' : ''}> Dirigente da Sentinela</label><label><input id="oradorSentinelaSub" type="checkbox" ${current?.sentinelaSubstituto ? 'checked' : ''}> Substituto da Sentinela</label></div><div class="form-group"><label class="form-label">Temas aprovados</label><div style="max-height:220px;overflow:auto;border:1px solid var(--border);padding:6px 10px;border-radius:8px">${themeChecks || '<p class="empty-state">Nenhum tema cadastrado.</p>'}</div></div><div style="display:flex;gap:8px;margin-top:8px"><button id="cancelOrador" class="btn btn-ghost" type="button" style="flex:1">Cancelar</button><button id="saveOrador" class="btn btn-primary" type="button" style="flex:1">Salvar</button></div></div>`
  document.body.appendChild(overlay)
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove() })
  overlay.querySelector('#cancelOrador')?.addEventListener('click', () => overlay.remove())
  overlay.querySelector('#saveOrador')?.addEventListener('click', () => void saveOrador(id, overlay))
}

async function saveOrador(id: string | null, overlay: HTMLElement): Promise<void> {
  const current = id ? discursos.oradores?.[id] : undefined
  const pessoaId = (overlay.querySelector('#oradorPessoa') as HTMLSelectElement).value
  if (!pessoaId || !pessoas[pessoaId]) { toast('Selecione uma pessoa do Admin'); return }
  const sentinelaDirigente = (overlay.querySelector('#oradorSentinela') as HTMLInputElement).checked
  const sentinelaSubstituto = (overlay.querySelector('#oradorSentinelaSub') as HTMLInputElement).checked
  if (sentinelaDirigente && sentinelaSubstituto) { toast('A mesma pessoa não pode ser dirigente e substituto da Sentinela'); return }
  const temaIds = Array.from(overlay.querySelectorAll<HTMLInputElement>('[data-orador-theme]:checked')).map(input => input.dataset['oradorTheme']!).filter(Boolean)
  const record: LegacyOrador = {
    ...(id ? discursos.oradores?.[id] : {}),
    pessoaId,
    tipo: current?.tipo ?? 'local',
    aprovadoParaSaida: (overlay.querySelector('#oradorSaida') as HTMLInputElement).checked,
    podePresidir: (overlay.querySelector('#oradorPreside') as HTMLInputElement).checked,
    sentinelaDirigente,
    sentinelaSubstituto,
    temaIds,
  }
  delete record.nome; delete record.name; delete record.telefone
  delete (record as Record<string, unknown>).ativo
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
  const rows = Object.entries(discursos.programacao ?? {})
    .filter(([, talk]) => !talk.data || talk.data.startsWith(selectedProgramacaoPeriod))
    .filter(([, talk]) => !onlyFutureProgramacao || !talk.data || talk.data >= today)
    .sort(([, a], [, b]) => String(a.data ?? '').localeCompare(String(b.data ?? '')))
  const monthOptions = programacaoMonthOptions().map(month => `<option value="${month}" ${month === selectedProgramacaoPeriod ? 'selected' : ''}>${formatMonth(month)}</option>`).join('')
  return `<div style="margin-top:14px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:2px"><div><h3 style="font-size:.95rem;color:#5C6062">Programação</h3><p style="font-size:.75rem;color:var(--ink-3)">Compromissos, confirmações e datas de reunião.</p></div><button class="btn btn-primary" type="button" data-add-programacao style="padding:6px 10px;font-size:.78rem;white-space:nowrap">Adicionar</button></div><div class="module-form-grid" style="margin:12px 0 8px"><div class="form-group"><label class="form-label">Período</label><select class="form-select" data-programacao-period>${monthOptions}</select></div><div class="form-group" style="display:flex;align-items:end"><button class="btn btn-ghost" type="button" data-fill-programacao-dates style="width:100%">Preencher datas</button></div></div><div style="display:flex;justify-content:flex-end;margin:8px 0"><button class="btn btn-ghost" type="button" data-download-programacao>Gerar PDF</button></div><label style="display:flex;align-items:center;gap:8px;margin:8px 0 12px;font-size:.82rem"><input type="checkbox" data-programacao-only-future ${onlyFutureProgramacao ? 'checked' : ''}> Mostrar somente compromissos futuros</label><div class="module-option-list">${rows.length ? rows.map(([id, p]) => `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 12px"><div style="display:flex;justify-content:space-between;gap:10px"><div style="flex:1;min-width:0"><strong>${escapeHtml(p.data ? formatDate(p.data) : 'Sem data')}</strong><div style="font-size:.76rem;color:var(--ink-3)">${escapeHtml(p.oradorNome ?? discursos.oradores?.[p.oradorId ?? '']?.nome ?? p.oradorId ?? 'Orador a definir')} · ${escapeHtml(p.temaTitulo ?? (p.temaNumero ? `Tema ${p.temaNumero}` : 'Tema a definir'))}</div></div><span style="font-size:.72rem;font-weight:700;color:${deriveStatus(p) === 'confirmado' ? '#1A6B3C' : '#B3261E'}">${deriveStatus(p) === 'confirmado' ? 'Confirmado' : 'A confirmar'}</span></div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"><button class="btn btn-ghost" type="button" data-programacao-whatsapp="${escapeHtml(id)}">WhatsApp</button>${deriveStatus(p) !== 'confirmado' ? `<button class="btn btn-ghost" type="button" data-programacao-confirm="${escapeHtml(id)}">Confirmar</button>` : ''}${deriveStatus(p) === 'confirmado' && needsReconfirmation(p, today) ? `<button class="btn btn-ghost" type="button" data-programacao-reconfirm="${escapeHtml(id)}">Reconfirmar</button>` : ''}<button class="btn btn-ghost" type="button" data-edit-programacao="${escapeHtml(id)}">Editar</button><button class="btn btn-danger" type="button" data-delete-programacao="${escapeHtml(id)}">Excluir</button></div></div>`).join('') : '<p class="empty-state">Nenhum compromisso neste período.</p>'}</div></div>`
}

function localCongregationName(): string {
  return Object.values(discursos.congregacoes ?? {}).find(congregation => congregation.tipo === 'local')?.nome?.trim() || 'Noroeste'
}

async function downloadProgramacaoPdf(): Promise<void> {
  const rows: SchedulePdfRow[] = Object.values(discursos.programacao ?? {})
    .filter(talk => talk.data?.startsWith(selectedProgramacaoPeriod))
    .sort((a, b) => String(a.data ?? '').localeCompare(String(b.data ?? '')))
    .map(talk => {
      const speaker = talk.oradorId ? discursos.oradores?.[talk.oradorId] : undefined
      const congregation = discursos.congregacoes?.[talk.tipo === 'saida_orador' ? talk.congregacaoDestinoId ?? talk.congregacaoId ?? '' : talk.congregacaoOrigemId ?? talk.congregacaoId ?? '']
      return { data: talk.data ?? '', tipo: talk.tipo ?? '', orador: talk.oradorNome ?? oradorNome(talk.oradorId ?? '', speaker), tema: talk.temaNumero ? `${talk.temaNumero} ${talk.temaTitulo ?? ''}`.trim() : talk.temaTitulo ?? '', congregacao: talk.tipo === 'discurso_local' ? localCongregationName() : congregation?.nome ?? (talk.tipo === 'saida_orador' ? talk.congregacaoDestinoNome ?? '' : talk.congregacaoOrigemNome ?? '') }
    })
  try {
    await downloadSchedulePdf({ congregation: localCongregationName(), periodLabel: selectedProgramacaoPeriod, rows })
    toast('PDF da programação gerado')
  } catch { toast('Não foi possível gerar o PDF') }
}

async function setProgramacaoConfirmation(id: string, reconfirmacao: boolean): Promise<void> {
  const talk = discursos.programacao?.[id]
  if (!talk) return
  const stamp = new Date().toISOString()
  const patch = reconfirmacao ? { [`programacao/${id}/reconfirmacao`]: { status: true, confirmadoEm: stamp } } : { [`programacao/${id}`]: { ...talk, ...confirmationPatch('confirmado', stamp) } }
  try {
    await update(tarefasDiscursosRef, patch)
    if (reconfirmacao) talk.reconfirmacao = { status: true, confirmadoEm: stamp }
    else Object.assign(talk, confirmationPatch('confirmado', stamp))
    toast(reconfirmacao ? 'Reconfirmado' : 'Confirmado')
    render()
  } catch { toast('Não foi possível salvar a confirmação') }
}

async function sendProgramacaoWhatsApp(id: string): Promise<void> {
  const talk = discursos.programacao?.[id]
  if (!talk) return
  const speaker = talk.oradorId ? discursos.oradores?.[talk.oradorId] : undefined
  const phone = digits(oradorTelefone(speaker))
  if (!phone) { toast('Cadastre o WhatsApp desta pessoa no Admin'); return }
  const place = talkPlace(talk)
  const message = `Olá, ${oradorNome(talk.oradorId ?? '', speaker)}! Confirmamos seu compromisso em ${formatDate(talk.data)}, ${place}, com o tema ${talk.temaNumero ?? ''} ${talk.temaTitulo ?? 'a definir'}.`
  const popup = window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
  if (!popup) { toast('Permita pop-ups para abrir o WhatsApp'); return }
  const stamp = new Date().toISOString()
  try {
    await update(tarefasDiscursosRef, { [`programacao/${id}/avisadoEm`]: stamp })
    talk.avisadoEm = stamp
    toast('WhatsApp aberto; revise antes de enviar')
    render()
  } catch { toast('WhatsApp aberto, mas não foi possível registrar o aviso') }
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
  overlay.innerHTML = `<div class="modal"><h2>${id ? 'Editar programação' : 'Nova programação'}</h2><div class="form-group"><label class="form-label" for="progData">Data</label><input id="progData" class="form-input" type="date" value="${escapeHtml(current?.data ?? '')}"></div><div class="form-group"><label class="form-label" for="progTipo">Tipo</label><select id="progTipo" class="form-select"><option value="discurso_local" ${currentType === 'discurso_local' ? 'selected' : ''}>Discurso local</option><option value="discurso_visitante" ${currentType === 'discurso_visitante' ? 'selected' : ''}>Orador visitante</option><option value="saida_orador" ${currentType === 'saida_orador' ? 'selected' : ''}>Saída de orador</option></select></div><div class="form-group"><label class="form-label" for="progOrador">Orador</label><select id="progOrador" class="form-select"><option value="">A definir</option>${speakerOptions(current?.oradorId)}</select></div><div class="form-group"><label class="form-label" for="progCongregacao">Congregação de origem ou destino</label><select id="progCongregacao" class="form-select"><option value="">Nenhuma</option>${congregationOptions}</select></div><div class="form-group"><label class="form-label" for="progTema">Tema aprovado</label><select id="progTema" class="form-select"><option value="">A definir</option>${themeOptions}</select></div><div class="form-group"><label class="form-label" for="progStatus">Status</label><select id="progStatus" class="form-select"><option value="por_definir" ${current?.status === 'por_definir' ? 'selected' : ''}>Por definir</option><option value="por_confirmar" ${current?.status !== 'confirmado' && current?.status !== 'por_definir' ? 'selected' : ''}>A confirmar</option><option value="confirmado" ${current?.status === 'confirmado' ? 'selected' : ''}>Confirmado</option></select></div><label style="display:flex;gap:8px;margin-bottom:12px"><input id="progReconfirmado" type="checkbox" ${current?.reconfirmacao?.status ? 'checked' : ''}> Reconfirmado para a semana da reunião</label><div style="display:flex;gap:8px;margin-top:8px"><button id="cancelProg" class="btn btn-ghost" type="button" style="flex:1">Cancelar</button><button id="saveProg" class="btn btn-primary" type="button" style="flex:1">Salvar</button></div></div>`
  document.body.appendChild(overlay)
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove() })
  overlay.querySelector('#cancelProg')?.addEventListener('click', () => overlay.remove())
  overlay.querySelector('#saveProg')?.addEventListener('click', () => void saveProgramacao(id, overlay))
}

async function saveProgramacao(id: string | null, overlay: HTMLElement): Promise<void> {
  const current = id ? discursos.programacao?.[id] : undefined
  const oradorId = (overlay.querySelector('#progOrador') as HTMLSelectElement).value
  const orador = oradorId ? discursos.oradores?.[oradorId] : undefined
  const reconfirmado = (overlay.querySelector('#progReconfirmado') as HTMLInputElement).checked
  const tipo = (overlay.querySelector('#progTipo') as HTMLSelectElement).value as 'discurso_local' | 'discurso_visitante' | 'saida_orador'
  const congregacaoId = (overlay.querySelector('#progCongregacao') as HTMLSelectElement).value
  const congregacao = congregacaoId ? discursos.congregacoes?.[congregacaoId] : undefined
  const temaId = (overlay.querySelector('#progTema') as HTMLSelectElement).value
  const tema = temaId ? discursos.temas?.[temaId] : undefined
  const status = (overlay.querySelector('#progStatus') as HTMLSelectElement).value as 'por_definir' | 'por_confirmar' | 'confirmado'
  const stored = { ...(current ?? {}) } as Record<string, unknown>
  ;['oradorOriginalId', 'oradorOriginalNome', 'oradorSecundarioId', 'oradorSecundarioNome', 'desistiu', 'substitutoId', 'substitutoNome', 'realizadoPorId', 'realizadoPorNome', 'horarioLocal', 'observacoes'].forEach(key => delete stored[key])
  const record: LegacyProgramacao = {
    ...stored,
    data: (overlay.querySelector('#progData') as HTMLInputElement).value,
    tipo,
    oradorId: oradorId || undefined,
    oradorNome: orador ? oradorNome(oradorId, orador) : undefined,
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
  }
  if (!record.data) { toast('Preencha a data'); return }
  const finalId = id ?? `p_${Date.now().toString(36)}`
  if (tipo === 'discurso_local' && eventBlocksLocal(discursos.eventos ?? {}, record.data)) { toast('Há um evento especial nesta data; não pode haver discurso local'); return }
  if ((tipo === 'discurso_visitante' || tipo === 'saida_orador') && !congregacaoId) { toast('Selecione a congregação de origem ou destino'); return }
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
  const rows = Object.entries(discursos.temas ?? {}).sort(([, a], [, b]) => (a.numero ?? 0) - (b.numero ?? 0))
  const history = themeHistory(discursos.programacao ?? {}, todayStr())
  return `<div style="margin-top:14px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:2px"><div><h3 style="font-size:.95rem;color:#5C6062">Temas</h3><p style="font-size:.75rem;color:var(--ink-3)">Catálogo, último uso e próximos agendamentos.</p></div><button class="btn btn-primary" type="button" data-add-tema style="padding:6px 10px;font-size:.78rem">Adicionar</button></div><div style="display:flex;justify-content:flex-end;margin:10px 0"><button class="btn btn-ghost" type="button" data-download-theme-catalog>Gerar PDF do catálogo</button></div><div class="module-option-list">${rows.length ? rows.map(([id, t]) => { const usage = history[id]; return `<div class="module-menu-btn" style="cursor:default;border-radius:8px;padding:10px 12px"><div style="flex:1"><div class="mod-label">${t.numero ? `${String(t.numero).padStart(3, '0')} — ` : ''}${escapeHtml(t.titulo ?? id)}</div><div class="mod-desc">Último uso: ${escapeHtml(usage?.lastPerformed ? formatDate(usage.lastPerformed) : 'Nunca')} · Próximos: ${escapeHtml(usage?.future.length ? usage.future.map(formatDate).join(', ') : 'nenhum')}</div></div><button class="btn btn-ghost" type="button" data-edit-tema="${escapeHtml(id)}" style="padding:4px 8px;font-size:.72rem">Editar</button><button class="btn btn-danger" type="button" data-delete-tema="${escapeHtml(id)}" style="padding:4px 8px;font-size:.72rem">Excluir</button></div>` }).join('') : '<p class="empty-state">Nenhum tema cadastrado.</p>'}</div></div>`
}

function openTemaModal(id: string | null): void {
  const current = id ? discursos.temas?.[id] : undefined
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal"><h2>${id ? 'Editar tema' : 'Novo tema'}</h2><div class="form-group"><label class="form-label" for="temaNumero">Número</label><input id="temaNumero" class="form-input" type="number" min="1" value="${current?.numero ?? ''}"></div><div class="form-group"><label class="form-label" for="temaTitulo">Título</label><input id="temaTitulo" class="form-input" value="${escapeHtml(current?.titulo ?? '')}"></div><div style="display:flex;gap:8px;margin-top:8px"><button id="cancelTema" class="btn btn-ghost" type="button" style="flex:1">Cancelar</button><button id="saveTema" class="btn btn-primary" type="button" style="flex:1">Salvar</button></div></div>`
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
  const record: LegacyTema = { ...(id ? discursos.temas?.[id] : {}), numero, titulo }
  delete (record as Record<string, unknown>).ativo
  try {
    await update(tarefasDiscursosRef, { [`temas/${finalId}`]: record })
    discursos.temas = { ...(discursos.temas ?? {}), [finalId]: record }
    overlay.remove(); toast(id ? 'Tema atualizado' : 'Tema adicionado'); render()
  } catch { toast('Erro ao salvar o tema') }
}

async function downloadThemeCatalog(): Promise<void> {
  const history = themeHistory(discursos.programacao ?? {}, todayStr())
  const rows: ThemeCatalogRow[] = Object.entries(discursos.temas ?? {})
    .sort(([, a], [, b]) => Number(a.numero ?? 0) - Number(b.numero ?? 0))
    .map(([id, theme]) => ({ numero: Number(theme.numero ?? 0), titulo: String(theme.titulo ?? ''), ultimoUso: history[id]?.lastPerformed ? formatDate(history[id].lastPerformed) : 'Nunca', proximos: history[id]?.future?.map(formatDate).join(', ') ?? '' }))
  try {
    await downloadThemeCatalogPdf({ congregation: localCongregationName(), rows })
    toast('PDF do catálogo de temas gerado')
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
  })
  Object.entries(discursos.congregacoes ?? {}).forEach(([id, congregation]) => {
    if (!congregation.contato || !congregation.telefone || !congregation.diaReuniao || !congregation.horario) items.push({ id: `congregacao_${id}`, priority: 3, title: 'Cadastro de congregação incompleto', detail: `${congregation.nome ?? id} precisa de contato e dados de reunião.`, target: 'congregacoes', recordId: id })
  })
  return items.sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title, 'pt-BR'))
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
  const items = currentPendingItems()
  const ignored = Object.entries(discursos.pendenciasIgnoradas ?? {}).sort(([, a], [, b]) => b.localeCompare(a))
  const active = items.length ? `<div style="display:flex;flex-direction:column;gap:8px">${items.map(item => `<div style="border:1px solid ${item.priority === 1 ? '#E6C7C4' : '#D5D8DC'};background:${item.priority === 1 ? '#FFF7F6' : 'var(--surface)'};border-radius:8px;padding:12px;font-size:.82rem"><strong>${escapeHtml(item.title)}</strong><div style="color:var(--ink-3);margin:4px 0 10px">${escapeHtml(item.detail)}</div><div style="display:flex;gap:8px"><button class="btn btn-ghost" type="button" data-pendencia-resolver="${escapeHtml(item.id)}">Resolver</button><button class="btn btn-ghost" type="button" data-pendencia-ignore="${escapeHtml(item.id)}">Ignorar</button></div></div>`).join('')}</div>` : '<div style="padding:18px;border:1px solid #B7DEC7;background:#F1FAF4;border-radius:8px;color:#1A6B3C;font-size:.84rem">Nenhuma pendência identificada.</div>'
  return `<div style="margin-top:14px"><h3 style="font-size:.95rem;color:#5C6062;margin-bottom:2px">Pendências</h3><p style="font-size:.75rem;color:var(--ink-3);margin-bottom:10px">Itens ordenados por prioridade.</p>${active}${ignored.length ? `<div style="margin-top:16px"><h3 style="font-size:.9rem;color:#5C6062">Ignoradas</h3>${ignored.map(([id, stamp]) => `<div class="module-menu-btn" style="cursor:default"><div style="flex:1"><div class="mod-label">${escapeHtml(ignoredPendingLabel(id))}</div><div class="mod-desc">Ignorada em ${escapeHtml(formatDate(stamp.slice(0, 10)))}</div></div><button class="btn btn-ghost" type="button" data-pendencia-reactivate="${escapeHtml(id)}">Trazer de volta</button></div>`).join('')}</div>` : ''}</div>`
}

function resolvePending(id: string): void {
  const item = allPendingItems().find(entry => entry.id === id)
  if (!item) return
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
