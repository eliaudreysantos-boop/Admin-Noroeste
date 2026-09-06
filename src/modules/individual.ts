import type { AppContext, RawRoot } from '../types'
import { get, rootRef, secretarioRef, update } from '../firebase'
import { moduleTitle } from '../ui/module-header'
import { agendaMessage, agendaToIcs, collectAgendaEvents, type AgendaEvent, type AgendaSource } from './individual-domain'

let ctx: AppContext | null = null
let data: RawRoot = {}
let month = new Date().toISOString().slice(0, 7)

const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char] ?? char))
const labelDate = (date: string): string => date.split('-').reverse().join('/')
const sourceLabels: Record<AgendaSource, string> = { tarefas:'Tarefas', limpeza:'Limpeza', escala:'Escala', oradores:'Oradores', programacao:'Vida e Ministério' }

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

function render(): void {
  const root = document.getElementById('individualRoot')
  if (!root || !ctx) return
  if (!ctx.usuario.masterId) { root.innerHTML = `${moduleTitle('Minha agenda')}<div class="notice warning">Seu usuário ainda não está vinculado ao cadastro do Admin.</div>`; return }
  const events = monthEvents(), [year, monthNumber] = month.split('-').map(Number)
  const firstDow = new Date(year, monthNumber - 1, 1).getDay(), totalDays = new Date(year, monthNumber, 0).getDate()
  const byDay = new Map<number, AgendaEvent[]>(); events.forEach(event => { const day = Number(event.date.slice(-2)); byDay.set(day, [...(byDay.get(day) ?? []), event]) })
  const calendar = [...Array(firstDow).fill(''), ...Array.from({ length:totalDays }, (_, index) => String(index + 1))]
  root.innerHTML = `${moduleTitle('Minha agenda')}
    <div class="agenda-toolbar"><button class="btn btn-ghost" id="agendaPrev" type="button" aria-label="Mês anterior">‹</button><input class="form-input" id="agendaMonth" type="month" value="${month}"><button class="btn btn-ghost" id="agendaNext" type="button" aria-label="Próximo mês">›</button></div>
    <div class="agenda-actions"><button class="btn btn-primary" id="agendaIcs" type="button">Baixar ICS</button><button class="btn btn-ghost" id="agendaShare" type="button">Compartilhar</button>${ctx.usuario.secretarioPapel === 'publicador' ? '<button class="btn btn-ghost" id="agendaReport" type="button">Relatório pessoal</button>' : ''}</div>
    <div class="agenda-calendar"><div class="agenda-weekdays">${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(day => `<strong>${day}</strong>`).join('')}</div><div class="agenda-days">${calendar.map(day => day ? `<div class="agenda-day ${byDay.has(Number(day)) ? 'has-events' : ''}"><span>${day}</span>${(byDay.get(Number(day)) ?? []).slice(0, 3).map(event => `<i title="${esc(event.title)}"></i>`).join('')}</div>` : '<div class="agenda-day empty"></div>').join('')}</div></div>
    <div class="agenda-list">${events.map(event => `<article class="agenda-event"><time>${esc(labelDate(event.date))}${event.time ? ` · ${esc(event.time)}` : ''}</time><div><strong>${esc(event.title)}</strong><small>${esc(sourceLabels[event.source])} · ${esc(event.detail)}${event.location ? ` · ${esc(event.location)}` : ''}</small>${event.note ? `<p>${esc(event.note)}</p>` : ''}</div><span class="agenda-status ${event.status}">${esc(event.status.replace(/-/g, ' '))}</span></article>`).join('') || '<p class="empty-state">Nenhuma designação neste período.</p>'}</div>`
  bind()
}

function moveMonth(delta: number): void { const [year, value] = month.split('-').map(Number), date = new Date(Date.UTC(year, value - 1 + delta, 1)); month = date.toISOString().slice(0, 7); render() }
function bind(): void {
  document.getElementById('agendaPrev')?.addEventListener('click', () => moveMonth(-1))
  document.getElementById('agendaNext')?.addEventListener('click', () => moveMonth(1))
  document.getElementById('agendaMonth')?.addEventListener('change', event => { month = (event.target as HTMLInputElement).value || month; render() })
  document.getElementById('agendaIcs')?.addEventListener('click', downloadIcs)
  document.getElementById('agendaShare')?.addEventListener('click', openShare)
  document.getElementById('agendaReport')?.addEventListener('click', openReport)
}

function downloadIcs(): void {
  const events = monthEvents(); if (!events.length) { alert('Nenhuma designação disponível neste período.'); return }
  const blob = new Blob([agendaToIcs(events, new Date().toISOString())], { type:'text/calendar;charset=utf-8' }), link = document.createElement('a')
  link.href = URL.createObjectURL(blob); link.download = `minha-agenda-${month}.ics`; link.click(); URL.revokeObjectURL(link.href)
}

function openShare(): void {
  const overlay = document.createElement('div'); overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal"><h2>Compartilhar agenda</h2><textarea id="agendaDraft" class="form-input" rows="10" maxlength="2000">${esc(agendaMessage(monthEvents()))}</textarea><div class="secretary-actions"><button class="btn btn-ghost" id="agendaCopy">Copiar</button><button class="btn btn-primary" id="agendaWhatsapp">Abrir WhatsApp</button><button class="btn btn-ghost" id="agendaClose">Fechar</button></div></div>`
  document.body.appendChild(overlay)
  document.getElementById('agendaClose')?.addEventListener('click', () => overlay.remove())
  document.getElementById('agendaCopy')?.addEventListener('click', () => void navigator.clipboard.writeText((document.getElementById('agendaDraft') as HTMLTextAreaElement).value))
  document.getElementById('agendaWhatsapp')?.addEventListener('click', () => window.open(`https://wa.me/?text=${encodeURIComponent((document.getElementById('agendaDraft') as HTMLTextAreaElement).value)}`, '_blank', 'noopener,noreferrer'))
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
