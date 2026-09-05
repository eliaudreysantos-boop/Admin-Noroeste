import type { AppContext } from '../types'
import { get, tarefasScaleRef, tarefasDiscursosRef, pessoasRef, configLimpezaRef } from '../firebase'
import { moduleTitle } from '../ui/module-header'

type Row = Record<string, unknown>
let ctx: AppContext | null = null
let scale: Row = {}
let discursos: Row = {}
let pessoas: Row = {}
let limpeza: Row = {}

function records(value: unknown): Row { return value && typeof value === 'object' ? value as Row : {} }
function esc(value: unknown): string { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c] ?? c)) }
function dateLabel(value: unknown): string {
  const raw = String(value ?? '')
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : raw
}
function samePerson(value: unknown): boolean {
  const text = String(value ?? '').toLowerCase()
  return Boolean(ctx && (text === ctx.usuario.nome.toLowerCase() || text === ctx.uid || text === String(ctx.usuario.masterId ?? '').toLowerCase()))
}

export default function mount(context: AppContext): void {
  ctx = context
  const root = document.getElementById('appContent')
  if (!root) return
  root.innerHTML = '<div id="individualRoot"><p style="padding:24px;color:var(--ink-3);text-align:center">Carregando sua agenda...</p></div>'
  void load()
}

async function load(): Promise<void> {
  try {
    const [scaleSnap, discursosSnap, pessoasSnap, limpezaSnap] = await Promise.all([get(tarefasScaleRef), get(tarefasDiscursosRef), get(pessoasRef), get(configLimpezaRef)])
    scale = scaleSnap.exists() ? records(scaleSnap.val()) : {}
    discursos = discursosSnap.exists() ? records(discursosSnap.val()) : {}
    pessoas = pessoasSnap.exists() ? records(pessoasSnap.val()) : {}
    limpeza = limpezaSnap.exists() ? records(limpezaSnap.val()) : {}
  } catch { /* a tela continua mostrando o estado vazio */ }
  render()
}

function render(): void {
  const root = document.getElementById('individualRoot')
  if (!root || !ctx) return
  const assignments: string[] = []
  const events: Array<{ date: string; title: string; description: string }> = []
  for (const [periodId, periodValue] of Object.entries(records(scale))) {
    const period = records(periodValue)
    for (const [meetingId, meetingValue] of Object.entries(records(period.meetings))) {
      const meeting = records(meetingValue)
      const found = Object.values(records(meeting.assignments)).some(value => samePerson(value) || samePerson(records(value).name) || samePerson(records(value).nome))
      if (found) {
        const date = String(meeting.date ?? meetingId)
        const title = String(meeting.type ?? periodId)
        assignments.push(`<div style="padding:10px 0;border-bottom:1px solid var(--border)"><strong>${esc(dateLabel(date))}</strong><div style="font-size:.78rem;color:var(--ink-3)">${esc(title)} · Designação atribuída</div></div>`)
        events.push({ date, title, description: 'Designação do sistema Noroeste' })
      }
    }
  }
  const speakerRows = Object.values(records(discursos.oradores)).filter(value => samePerson(records(value).nome) || samePerson(records(value).name)).map(value => `<div style="padding:10px 0;border-bottom:1px solid var(--border)"><strong>Orador</strong><div style="font-size:.78rem;color:var(--ink-3)">${esc(records(value).nome ?? records(value).name)}</div></div>`).join('')
  const person = ctx.usuario.masterId ? records(pessoas[ctx.usuario.masterId]) : {}
  const group = Number(person.limpeza && records(person.limpeza).grupo)
  const cleaning = group > 0 && limpeza.ativa === true
    ? `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:12px"><strong>Limpeza</strong><div style="font-size:.78rem;color:var(--ink-3);margin-top:4px">Você está no grupo ${group}. Consulte a escala de limpeza para a próxima reunião.</div></div>`
    : ''
  root.innerHTML = `${moduleTitle('Minha agenda')}
    <div class="form-panel" style="margin-bottom:12px"><strong>Compartilhar agenda</strong><div class="form-help">Exporte suas designações para o calendário do aparelho ou envie um resumo.</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button id="btnAgendaIcs" class="primary-btn" type="button">Baixar calendário ICS</button><button id="btnAgendaWhatsApp" class="secondary-btn" type="button">Abrir WhatsApp</button></div></div>
    ${cleaning}
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:0 12px;margin-bottom:12px">${assignments.join('') || '<p style="padding:18px 0;color:var(--ink-3);text-align:center">Nenhuma designação encontrada.</p>'}</div>
    ${speakerRows ? `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:0 12px"><div style="font-weight:700;padding:12px 0 4px">Oradores</div>${speakerRows}</div>` : ''}`
  document.getElementById('btnAgendaIcs')?.addEventListener('click', () => downloadIcs(events))
  document.getElementById('btnAgendaWhatsApp')?.addEventListener('click', () => shareAgenda(events))
}

function downloadIcs(events: Array<{ date: string; title: string; description: string }>): void {
  if (!events.length) { alert('Nenhuma designação disponível para exportar.'); return }
  const body = events.map(event => {
    const date = event.date.replace(/-/g, '')
    return `BEGIN:VEVENT\r\nUID:${date}-${event.title.replace(/\W+/g, '')}@noroeste\r\nDTSTART;VALUE=DATE:${date}\r\nSUMMARY:${event.title}\r\nDESCRIPTION:${event.description}\r\nEND:VEVENT`
  }).join('\r\n')
  const blob = new Blob([`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Noroeste//Minha agenda//PT-BR\r\n${body}\r\nEND:VCALENDAR`], { type: 'text/calendar;charset=utf-8' })
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'minha-agenda.ics'; link.click(); URL.revokeObjectURL(link.href)
}

function shareAgenda(events: Array<{ date: string; title: string }>): void {
  const text = events.length ? `Minha agenda Noroeste:\n${events.map(event => `• ${dateLabel(event.date)} - ${event.title}`).join('\n')}` : 'Minha agenda Noroeste: nenhuma designação registrada.'
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
}
