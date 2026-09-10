import type { AppContext, RawRoot } from '../types'
import { get, rootRef, secretarioRef, update } from '../firebase'
import { moduleTitle } from '../ui/module-header'
import { agendaMessage, agendaToIcs, announcementMessage, collectAgendaEvents, collectAnnouncementEvents, upcomingAgendaEvents, type AgendaEvent, type AgendaSource, type AgendaStatus } from './individual-domain'

let ctx: AppContext | null = null
let data: RawRoot = {}
let month = new Date().toISOString().slice(0, 7)
let screen: 'agenda' | 'relatorio' | 'quadro' = 'agenda'
let boardSource: AgendaSource | 'todas' = 'todas'
let boardStatus: AgendaStatus | 'todos' = 'todos'

const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char] ?? char))
const labelDate = (date: string): string => date.split('-').reverse().join('/')
const sourceLabels: Record<AgendaSource, string> = { tarefas:'Tarefas', limpeza:'Limpeza', escala:'Escala TPL', oradores:'Oradores', programacao:'Vida e Ministério' }
const fortalezaDate = (): string => new Intl.DateTimeFormat('en-CA', { timeZone:'America/Fortaleza', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date()).replace(/\//g, '-')

export default function mount(context: AppContext): void {
  ctx = context
  const root = document.getElementById('appContent')
  if (!root) return
  root.innerHTML = '<div id="individualRoot"><p class="empty-state">Carregando sua agenda...</p></div>'
  void load()
}

async function load(): Promise<void> {
  try { const snapshot = await get(rootRef); data = snapshot.exists() ? snapshot.val() as RawRoot : {} }
  catch { data = {} }
  render()
}

function personalEvents(): AgendaEvent[] { return ctx?.usuario.masterId ? collectAgendaEvents(data, ctx.usuario.masterId) : [] }
function monthEvents(): AgendaEvent[] { return personalEvents().filter(event => event.date.startsWith(month)) }
function screenTabs(): string { return `<div class="program-period-modes" role="tablist" aria-label="Minha agenda" style="margin-bottom:12px"><button class="program-period-mode" type="button" data-agenda-screen="agenda" aria-pressed="${screen === 'agenda'}">Agenda</button><button class="program-period-mode" type="button" data-agenda-screen="relatorio" aria-pressed="${screen === 'relatorio'}">Relatório</button><button class="program-period-mode" type="button" data-agenda-screen="quadro" aria-pressed="${screen === 'quadro'}">Quadro</button></div>` }
function bindScreenTabs(): void { document.querySelectorAll<HTMLButtonElement>('[data-agenda-screen]').forEach(button => button.addEventListener('click', () => { screen = button.dataset['agendaScreen'] as typeof screen; render() })) }

function render(): void {
  const root = document.getElementById('individualRoot')
  if (!root || !ctx) return
  if (!ctx.usuario.masterId) { root.innerHTML = `${moduleTitle('Minha agenda')}<div class="notice warning">Seu usuário ainda não está vinculado ao cadastro do Admin.</div>`; return }
  if (screen === 'relatorio') { renderReportScreen(root); return }
  if (screen === 'quadro') { renderBoard(root); return }
  const events = monthEvents(), [year, monthNumber] = month.split('-').map(Number)
  const firstDow = new Date(year, monthNumber - 1, 1).getDay(), totalDays = new Date(year, monthNumber, 0).getDate()
  const byDay = new Map<number, AgendaEvent[]>(); events.forEach(event => { const day = Number(event.date.slice(-2)); byDay.set(day, [...(byDay.get(day) ?? []), event]) })
  const calendar = [...Array(firstDow).fill(''), ...Array.from({ length:totalDays }, (_, index) => String(index + 1))]
  root.innerHTML = `${moduleTitle('Minha agenda')}${screenTabs()}
    <div class="agenda-toolbar"><button class="btn btn-ghost" id="agendaPrev" type="button" aria-label="Mês anterior">‹</button><input class="form-input" id="agendaMonth" type="month" value="${month}"><button class="btn btn-ghost" id="agendaNext" type="button" aria-label="Próximo mês">›</button></div>
    <div class="agenda-actions"><button class="btn btn-primary" id="agendaIcsMonth" type="button">Baixar mês</button><button class="btn btn-ghost" id="agendaIcsUpcoming" type="button">Baixar próximos</button><button class="btn btn-ghost" id="agendaShare" type="button">Compartilhar</button></div>
    <div class="agenda-calendar"><div class="agenda-weekdays">${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(day => `<strong>${day}</strong>`).join('')}</div><div class="agenda-days">${calendar.map(day => day ? `<div class="agenda-day ${byDay.has(Number(day)) ? 'has-events' : ''}"><span>${day}</span>${(byDay.get(Number(day)) ?? []).slice(0, 3).map(event => `<i title="${esc(event.title)}"></i>`).join('')}</div>` : '<div class="agenda-day empty"></div>').join('')}</div></div>
    <div class="agenda-list">${events.map(event => `<article class="agenda-event"><time>${esc(labelDate(event.date))}${event.time ? ` · ${esc(event.time)}` : ''}</time><div><strong>${esc(event.title)}</strong><small>${esc(sourceLabels[event.source])} · ${esc(event.detail)}${event.location ? ` · ${esc(event.location)}` : ''}</small>${event.note ? `<p>${esc(event.note)}</p>` : ''}</div><span class="agenda-status ${event.status}">${esc(event.status.replace(/-/g, ' '))}</span></article>`).join('') || '<p class="empty-state">Nenhuma designação neste período.</p>'}</div>`
  bind()
}

function moveMonth(delta: number): void { const [year, value] = month.split('-').map(Number), date = new Date(Date.UTC(year, value - 1 + delta, 1)); month = date.toISOString().slice(0, 7); render() }
function bind(): void {
  bindScreenTabs()
  document.getElementById('agendaPrev')?.addEventListener('click', () => moveMonth(-1))
  document.getElementById('agendaNext')?.addEventListener('click', () => moveMonth(1))
  document.getElementById('agendaMonth')?.addEventListener('change', event => { month = (event.target as HTMLInputElement).value || month; render() })
  document.getElementById('agendaIcsMonth')?.addEventListener('click', () => downloadIcs(monthEvents(), `minha-agenda-${month}.ics`, 'Nenhuma designação disponível neste mês.'))
  document.getElementById('agendaIcsUpcoming')?.addEventListener('click', () => downloadIcs(upcomingAgendaEvents(personalEvents(), fortalezaDate()), 'minha-agenda-proximos-compromissos.ics', 'Nenhum compromisso futuro disponível.'))
  document.getElementById('agendaShare')?.addEventListener('click', openShare)
}

function renderReportScreen(root: HTMLElement): void {
  const masterId = ctx!.usuario.masterId!, reports = Object.values((data.secretario?.['relatorios'] ?? {}) as Record<string, Record<string, unknown>>).filter(report => report['masterId'] === masterId)
  const year = Number(month.slice(0, 4)) - (Number(month.slice(5, 7)) < 10 ? 1 : 0), start = `${year}-10`, end = `${year + 1}-09`
  const serviceReports = reports.filter(report => { const competence = String(report['competencia'] ?? ''); return competence >= start && competence <= end })
  const studies = serviceReports.reduce((sum, report) => sum + (Number(report['estudos']) || 0), 0)
  root.innerHTML = `${moduleTitle('Minha agenda')}${screenTabs()}<div class="program-summary"><div><strong>${serviceReports.length}</strong><span>Relatórios no ano</span></div><div><strong>${studies}</strong><span>Estudos bíblicos</span></div><div><strong>${year}/${String(year + 1).slice(-2)}</strong><span>Ano de serviço</span></div></div><div class="form-panel"><h3 style="margin-top:0">Relatório de serviço</h3><p class="form-help">Envie seu relatório mensal e acompanhe os registros já recebidos no ano de serviço.</p><button class="btn btn-primary" id="openPersonalReport" type="button">Enviar relatório</button></div><div class="module-option-list">${serviceReports.sort((a, b) => String(b['competencia']).localeCompare(String(a['competencia']))).map(report => `<div class="agenda-event"><time>${esc(String(report['competencia']))}</time><div><strong>${report['participou'] === false ? 'Não participou' : 'Participou no ministério'}</strong><small>${Number(report['estudos']) || 0} estudo(s) bíblico(s)</small></div></div>`).join('') || '<p class="empty-state">Nenhum relatório neste ano de serviço.</p>'}</div>`
  bindScreenTabs(); document.getElementById('openPersonalReport')?.addEventListener('click', openReport)
}

function renderBoard(root: HTMLElement): void {
  const events = collectAnnouncementEvents(data).filter(event => event.date.startsWith(month) && (boardSource === 'todas' || event.source === boardSource) && (boardStatus === 'todos' || event.status === boardStatus))
  root.innerHTML = `${moduleTitle('Minha agenda')}${screenTabs()}
    <div class="agenda-toolbar"><button class="btn btn-ghost" id="boardPrev" type="button" aria-label="Mês anterior">‹</button><input class="form-input" id="boardMonth" type="month" value="${month}"><button class="btn btn-ghost" id="boardNext" type="button" aria-label="Próximo mês">›</button></div>
    <div class="module-form-grid" style="margin-bottom:12px"><div class="form-group"><label class="form-label">Origem</label><select id="boardSource" class="form-select"><option value="todas">Todas</option>${Object.entries(sourceLabels).map(([id, label]) => `<option value="${id}" ${boardSource === id ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></div><div class="form-group"><label class="form-label">Status</label><select id="boardStatus" class="form-select"><option value="todos">Todos</option><option value="futuro" ${boardStatus === 'futuro' ? 'selected' : ''}>Futuro</option><option value="confirmacao-pendente" ${boardStatus === 'confirmacao-pendente' ? 'selected' : ''}>Confirmação pendente</option><option value="alterado" ${boardStatus === 'alterado' ? 'selected' : ''}>Alterado</option><option value="realizado" ${boardStatus === 'realizado' ? 'selected' : ''}>Realizado</option></select></div></div>
    <div class="agenda-actions"><button class="btn btn-primary" id="boardWhatsapp" type="button">Compartilhar no WhatsApp</button></div>
    <div class="agenda-list">${events.map(event => `<article class="agenda-event"><time>${esc(labelDate(event.date))}${event.time ? ` · ${esc(event.time)}` : ''}</time><div><strong>${esc(event.title)}</strong><small>${esc(sourceLabels[event.source])} · ${esc(event.detail)}${event.location ? ` · ${esc(event.location)}` : ''}</small><p>${esc(event.people.join(', '))}</p></div><span class="agenda-status ${event.status}">${esc(event.status.replace(/-/g, ' '))}</span></article>`).join('') || '<p class="empty-state">Nenhuma designação neste período.</p>'}</div>`
  bindScreenTabs()
  document.getElementById('boardPrev')?.addEventListener('click', () => moveMonth(-1))
  document.getElementById('boardNext')?.addEventListener('click', () => moveMonth(1))
  document.getElementById('boardMonth')?.addEventListener('change', event => { month = (event.target as HTMLInputElement).value || month; render() })
  document.getElementById('boardSource')?.addEventListener('change', event => { boardSource = (event.target as HTMLSelectElement).value as typeof boardSource; render() })
  document.getElementById('boardStatus')?.addEventListener('change', event => { boardStatus = (event.target as HTMLSelectElement).value as typeof boardStatus; render() })
  document.getElementById('boardWhatsapp')?.addEventListener('click', () => openBoardShare(events))
}

function downloadIcs(events: AgendaEvent[], filename: string, emptyMessage: string): void {
  if (!events.length) { alert(emptyMessage); return }
  const blob = new Blob([agendaToIcs(events, new Date().toISOString())], { type:'text/calendar;charset=utf-8' }), link = document.createElement('a')
  link.href = URL.createObjectURL(blob); link.download = filename; link.click(); URL.revokeObjectURL(link.href)
}

function openShare(): void {
  const overlay = document.createElement('div'); overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal"><h2>Compartilhar agenda</h2><textarea id="agendaDraft" class="form-input" rows="10" maxlength="2000">${esc(agendaMessage(monthEvents()))}</textarea><div class="secretary-actions"><button class="btn btn-ghost" id="agendaCopy">Copiar</button><button class="btn btn-primary" id="agendaWhatsapp">Abrir WhatsApp</button><button class="btn btn-ghost" id="agendaClose">Fechar</button></div></div>`
  document.body.appendChild(overlay)
  document.getElementById('agendaClose')?.addEventListener('click', () => overlay.remove())
  document.getElementById('agendaCopy')?.addEventListener('click', () => void navigator.clipboard.writeText((document.getElementById('agendaDraft') as HTMLTextAreaElement).value))
  document.getElementById('agendaWhatsapp')?.addEventListener('click', () => window.open(`https://wa.me/?text=${encodeURIComponent((document.getElementById('agendaDraft') as HTMLTextAreaElement).value)}`, '_blank', 'noopener,noreferrer'))
}

function openBoardShare(events: ReturnType<typeof collectAnnouncementEvents>): void {
  const overlay = document.createElement('div'); overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal"><h2>Compartilhar quadro</h2><textarea id="boardDraft" class="form-input" rows="12" maxlength="4000">${esc(announcementMessage(events))}</textarea><div class="secretary-actions"><button class="btn btn-ghost" id="boardCopy">Copiar</button><button class="btn btn-primary" id="boardOpenWhatsapp">Abrir WhatsApp</button><button class="btn btn-ghost" id="boardClose">Fechar</button></div></div>`
  document.body.appendChild(overlay)
  document.getElementById('boardClose')?.addEventListener('click', () => overlay.remove())
  document.getElementById('boardCopy')?.addEventListener('click', () => void navigator.clipboard.writeText((document.getElementById('boardDraft') as HTMLTextAreaElement).value))
  document.getElementById('boardOpenWhatsapp')?.addEventListener('click', () => window.open(`https://wa.me/?text=${encodeURIComponent((document.getElementById('boardDraft') as HTMLTextAreaElement).value)}`, '_blank', 'noopener,noreferrer'))
}

function openReport(): void {
  if (!ctx?.usuario.masterId) return
  const day = new Date().getDate(), overlay = document.createElement('div'); overlay.className = 'modal-overlay'
  overlay.innerHTML = `<form class="modal" id="personalReport"><h2>Relatório pessoal</h2>${day > 10 ? '<div class="notice warning">O período normal de envio é do dia 1 ao dia 10.</div>' : ''}<label class="form-field"><span>Competência</span><input class="form-input" name="competencia" type="month" value="${month}" required></label><label><input name="participou" type="checkbox" checked> Participei no ministério</label><label class="form-field"><span>Estudos bíblicos</span><input class="form-input" name="estudos" type="number" min="0" value="0"></label><label class="form-field"><span>Observação</span><textarea class="form-input" name="observacoes" maxlength="250"></textarea></label><div class="secretary-actions"><button class="btn btn-ghost" id="reportCancel" type="button">Cancelar</button><button class="btn btn-primary" type="submit">Enviar relatório</button></div></form>`
  document.body.appendChild(overlay); document.getElementById('reportCancel')?.addEventListener('click', () => overlay.remove())
  document.getElementById('personalReport')?.addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget as HTMLFormElement, values = new FormData(form), competence = String(values.get('competencia')), id = `pessoal-${ctx!.usuario.masterId}-${competence}`
    await update(secretarioRef, { [`relatorios/${id}`]: { id, masterId:ctx!.usuario.masterId, competencia:competence, categoria:'publicador', participou:values.get('participou') === 'on', estudos:Math.max(0, Number(values.get('estudos')) || 0), horasCampo:0, horasAtividadeAprovada:0, creditoHoras:0, pioneiroAuxiliar:false, observacoes:String(values.get('observacoes') ?? '').trim().slice(0, 250), atrasado:day > 10, recebidoEm:new Date().toISOString().slice(0, 10), atualizadoEm:new Date().toISOString() } }); overlay.remove(); alert('Relatório enviado para conferência do secretário.')
  })
}
