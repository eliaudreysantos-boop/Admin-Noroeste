import { localSlots, type EscalaLocal, type EscalaParticipant, type EscalaTables } from './escala-domain.ts'
import { dayLabel, monthLabel, printRowsForLocal } from './escala-output.ts'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib/cjs/index.js'
import { previewPdf } from '../ui/pdf-preview.ts'

const esc = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]!)

export interface ScalePrintInput { month: string; locals: Record<string, EscalaLocal>; tables: EscalaTables; participants: Record<string, EscalaParticipant>; exclusions: string[]; requestedFontPt: number; localIds?: string[] }
export interface PreparedScalePrint { html: string; fontPt: number }

export function scalePrintHtml(input: Omit<ScalePrintInput, 'requestedFontPt'>): string {
  const allowed = input.localIds ? new Set(input.localIds) : null
  return Object.entries(input.locals).filter(([id]) => !allowed || allowed.has(id)).sort((a, b) => Number(a[1].sortOrder ?? 0) - Number(b[1].sortOrder ?? 0)).map(([localId, local]) => {
    const slots = localSlots(local), rows = printRowsForLocal(localId, input.month, local, input.tables, input.participants, input.exclusions)
    return `<section class="escala-print-page"><header><strong>${esc(local.name ?? localId)}</strong><span>${esc(monthLabel(input.month))}</span></header><table><thead><tr><th>Dia</th>${slots.map(time => `<th>${time}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr><th>${esc(dayLabel(row.date))}</th>${row.cells.map(names => `<td>${names.map(person => `<span>${esc(person)}</span>`).join('') || '&nbsp;'}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`
  }).join('')
}

export function prepareScalePrint(input: ScalePrintInput): PreparedScalePrint {
  document.querySelector('.escala-print-doc')?.remove()
  const printable = document.createElement('div'); printable.className = 'escala-print-doc'; printable.innerHTML = scalePrintHtml(input)
  let chosen = Math.min(18, Math.max(8, Number(input.requestedFontPt || 12)))
  printable.style.setProperty('--escala-print-font', `${chosen}pt`); printable.dataset['measuring'] = 'true'; document.body.appendChild(printable)
  for (let pt = chosen; pt >= 8; pt -= 1) { printable.style.setProperty('--escala-print-font', `${pt}pt`); chosen = pt; const overflow = [...printable.querySelectorAll<HTMLElement>('.escala-print-page')].some(page => page.scrollWidth > page.clientWidth || page.scrollHeight > 735); if (!overflow || pt === 8) break }
  const html = printable.innerHTML
  printable.remove()
  return { html, fontPt: chosen }
}

export function printPreparedScale(prepared: PreparedScalePrint, month: string): void {
  const printable = document.createElement('div'); printable.className = 'escala-print-doc'; printable.dataset['printing'] = 'true'; printable.innerHTML = prepared.html
  printable.style.setProperty('--escala-print-font', `${prepared.fontPt}pt`); document.body.appendChild(printable)
  const title = document.title; document.title = `Escala do carrinho - ${monthLabel(month)}`
  const cleanup = () => { document.title = title; printable.remove() }
  window.addEventListener('afterprint', cleanup, { once: true }); window.print(); setTimeout(cleanup, 2000)
}

export function printScaleSchedule(input: ScalePrintInput): number {
  const prepared = prepareScalePrint(input)
  printPreparedScale(prepared, input.month)
  return prepared.fontPt
}

export interface ScalePdfResult { bytes: Uint8Array; pages: number; effectiveFontSize: number }
const A4_LANDSCAPE: [number, number] = [841.89, 595.28]

function fit(font: PDFFont, value: string, size: number, width: number): string {
  if (font.widthOfTextAtSize(value, size) <= width) return value
  let result = value
  while (result.length > 1 && font.widthOfTextAtSize(`${result}...`, size) > width) result = result.slice(0, -1)
  return `${result.trim()}...`
}

function drawScaleHeader(page: PDFPage, regular: PDFFont, bold: PDFFont, local: string, month: string, pageNumber: number): number {
  page.drawText('Escala TPL', { x:30, y:555, size:18, font:bold, color:rgb(.08, .36, .2) })
  page.drawText(local, { x:30, y:538, size:10, font:bold })
  page.drawText(monthLabel(month), { x:650, y:555, size:10, font:bold })
  page.drawText(`Página ${pageNumber}`, { x:735, y:538, size:7, font:regular, color:rgb(.4, .42, .45) })
  page.drawLine({ start:{ x:30, y:528 }, end:{ x:812, y:528 }, thickness:1.2, color:rgb(.08, .36, .2) })
  return 510
}

function drawScaleTable(page: PDFPage, regular: PDFFont, bold: PDFFont, slots: string[], rows: ReturnType<typeof printRowsForLocal>, y: number, fontSize: number): void {
  const x = 30, width = 782, dayWidth = 62, slotWidth = (width - dayWidth) / Math.max(1, slots.length), headerHeight = 22, rowHeight = 29
  page.drawRectangle({ x, y:y - headerHeight, width, height:headerHeight, color:rgb(.08, .36, .2), borderColor:rgb(.4, .45, .42), borderWidth:.5 })
  page.drawText('Dia', { x:x + 5, y:y - 15, size:fontSize, font:bold, color:rgb(1, 1, 1) })
  slots.forEach((time, index) => {
    const cellX = x + dayWidth + index * slotWidth
    page.drawLine({ start:{ x:cellX, y }, end:{ x:cellX, y:y - headerHeight }, thickness:.4, color:rgb(.75, .82, .77) })
    page.drawText(fit(bold, time, fontSize, slotWidth - 8), { x:cellX + 4, y:y - 15, size:fontSize, font:bold, color:rgb(1, 1, 1) })
  })
  let cursor = y - headerHeight
  rows.forEach(row => {
    cursor -= rowHeight
    page.drawRectangle({ x, y:cursor, width, height:rowHeight, borderColor:rgb(.48, .5, .5), borderWidth:.45, color:rgb(1, 1, 1) })
    page.drawText(fit(bold, dayLabel(row.date), fontSize - .5, dayWidth - 8), { x:x + 4, y:cursor + 10, size:fontSize - .5, font:bold })
    row.cells.forEach((names, index) => {
      const cellX = x + dayWidth + index * slotWidth
      page.drawLine({ start:{ x:cellX, y:cursor }, end:{ x:cellX, y:cursor + rowHeight }, thickness:.35, color:rgb(.58, .6, .6) })
      names.slice(0, 2).forEach((name, line) => page.drawText(fit(regular, name, fontSize - 1, slotWidth - 7), { x:cellX + 3.5, y:cursor + 17 - line * 11, size:fontSize - 1, font:regular }))
    })
  })
}

export async function createScaleSchedulePdf(input: ScalePrintInput): Promise<ScalePdfResult> {
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const allowed = input.localIds ? new Set(input.localIds) : null
  const selectedLocals = Object.entries(input.locals).filter(([id]) => !allowed || allowed.has(id)).sort((a, b) => Number(a[1].sortOrder ?? 0) - Number(b[1].sortOrder ?? 0))
  let pageNumber = 0
  let effectiveFontSize = Math.min(9, Math.max(6, Math.round(input.requestedFontPt * .62)))
  for (const [localId, local] of selectedLocals) {
    const slots = localSlots(local)
    if (slots.length > 8) effectiveFontSize = Math.min(effectiveFontSize, 7)
    const allRows = printRowsForLocal(localId, input.month, local, input.tables, input.participants, input.exclusions)
    const chunks = allRows.length ? Array.from({ length:Math.ceil(allRows.length / 15) }, (_, index) => allRows.slice(index * 15, (index + 1) * 15)) : [[]]
    chunks.forEach(rows => {
      const page = pdf.addPage(A4_LANDSCAPE); pageNumber += 1
      const y = drawScaleHeader(page, regular, bold, String(local.name ?? localId), input.month, pageNumber)
      drawScaleTable(page, regular, bold, slots, rows, y, effectiveFontSize)
      page.drawText('Gerado pelo sistema Noroeste', { x:30, y:20, size:7, font:regular, color:rgb(.45, .47, .5) })
    })
  }
  if (!selectedLocals.length) pdf.addPage(A4_LANDSCAPE).drawText('Nenhum local disponível.', { x:30, y:540, size:11, font:regular })
  return { bytes:Uint8Array.from(await pdf.save()), pages:pdf.getPageCount(), effectiveFontSize }
}

export async function previewScaleSchedulePdf(input: ScalePrintInput): Promise<ScalePdfResult> {
  const result = await createScaleSchedulePdf(input)
  previewPdf(result.bytes, `escala-tpl-${input.month}.pdf`, 'Prévia da Escala TPL')
  return result
}
