import type { AppContext } from '../types'
import { get, tarefasScaleRef, tarefasDiscursosRef, pessoasRef, configLimpezaRef } from '../firebase'

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
  for (const [periodId, periodValue] of Object.entries(records(scale))) {
    const period = records(periodValue)
    for (const [meetingId, meetingValue] of Object.entries(records(period.meetings))) {
      const meeting = records(meetingValue)
      const found = Object.values(records(meeting.assignments)).some(value => samePerson(value) || samePerson(records(value).name) || samePerson(records(value).nome))
      if (found) assignments.push(`<div style="padding:10px 0;border-bottom:1px solid var(--border)"><strong>${esc(dateLabel(meeting.date ?? meetingId))}</strong><div style="font-size:.78rem;color:var(--ink-3)">${esc(meeting.type ?? periodId)} · Designação atribuída</div></div>`)
    }
  }
  const speakerRows = Object.values(records(discursos.oradores)).filter(value => samePerson(records(value).nome) || samePerson(records(value).name)).map(value => `<div style="padding:10px 0;border-bottom:1px solid var(--border)"><strong>Orador</strong><div style="font-size:.78rem;color:var(--ink-3)">${esc(records(value).nome ?? records(value).name)}</div></div>`).join('')
  const person = ctx.usuario.masterId ? records(pessoas[ctx.usuario.masterId]) : {}
  const group = Number(person.limpeza && records(person.limpeza).grupo)
  const cleaning = group > 0 && limpeza.ativa === true
    ? `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:12px"><strong>Limpeza</strong><div style="font-size:.78rem;color:var(--ink-3);margin-top:4px">Você está no grupo ${group}. Consulte a escala de limpeza para a próxima reunião.</div></div>`
    : ''
  root.innerHTML = `<div style="margin-bottom:14px"><h2 style="font-size:1.05rem;color:var(--blue-deep);margin-bottom:2px">Minha agenda</h2><p style="font-size:.8rem;color:var(--ink-3)">Designações associadas a ${esc(ctx.usuario.nome)}.</p></div>
    ${cleaning}
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:0 12px;margin-bottom:12px">${assignments.join('') || '<p style="padding:18px 0;color:var(--ink-3);text-align:center">Nenhuma designação encontrada.</p>'}</div>
    ${speakerRows ? `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:0 12px"><div style="font-weight:700;padding:12px 0 4px">Oradores</div>${speakerRows}</div>` : ''}`
}
