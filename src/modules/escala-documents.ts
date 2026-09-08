import { localSlots, type EscalaLocal, type EscalaParticipant, type EscalaTables } from './escala-domain'
import { dayLabel, monthLabel, printRowsForLocal } from './escala-output'

const esc = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]!)

export interface ScalePrintInput { month: string; locals: Record<string, EscalaLocal>; tables: EscalaTables; participants: Record<string, EscalaParticipant>; exclusions: string[]; requestedFontPt: number; localIds?: string[] }

export function scalePrintHtml(input: Omit<ScalePrintInput, 'requestedFontPt'>): string {
  const allowed = input.localIds ? new Set(input.localIds) : null
  return Object.entries(input.locals).filter(([id]) => !allowed || allowed.has(id)).sort((a, b) => Number(a[1].sortOrder ?? 0) - Number(b[1].sortOrder ?? 0)).map(([localId, local]) => {
    const slots = localSlots(local), rows = printRowsForLocal(localId, input.month, local, input.tables, input.participants, input.exclusions)
    return `<section class="escala-print-page"><header><strong>${esc(local.name ?? localId)}</strong><span>${esc(monthLabel(input.month))}</span></header><table><thead><tr><th>Dia</th>${slots.map(time => `<th>${time}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr><th>${esc(dayLabel(row.date))}</th>${row.cells.map(names => `<td>${names.map(person => `<span>${esc(person)}</span>`).join('') || '&nbsp;'}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`
  }).join('')
}

export function printScaleSchedule(input: ScalePrintInput): number {
  document.querySelector('.escala-print-doc')?.remove()
  const printable = document.createElement('div'); printable.className = 'escala-print-doc'; printable.dataset['printing'] = 'true'; printable.innerHTML = scalePrintHtml(input)
  let chosen = Math.min(18, Math.max(8, Number(input.requestedFontPt || 12)))
  printable.style.setProperty('--escala-print-font', `${chosen}pt`); printable.dataset['measuring'] = 'true'; document.body.appendChild(printable)
  for (let pt = chosen; pt >= 8; pt -= 1) { printable.style.setProperty('--escala-print-font', `${pt}pt`); chosen = pt; const overflow = [...printable.querySelectorAll<HTMLElement>('.escala-print-page')].some(page => page.scrollWidth > page.clientWidth || page.scrollHeight > 735); if (!overflow || pt === 8) break }
  delete printable.dataset['measuring']
  const title = document.title; document.title = `Escala do carrinho - ${monthLabel(input.month)}`
  window.addEventListener('afterprint', () => { document.title = title; printable.remove() }, { once: true }); window.print()
  return chosen
}
