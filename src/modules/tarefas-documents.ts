import { TASK_ROLES, TASK_ROLE_LABELS, assignmentForRole, personName, roleApplies, type TaskMeeting, type TaskPerson } from './tarefas-domain.ts'
import { formatTaskDate, paginateItems, rowsPerPrintPage } from './tarefas-output.ts'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib/cjs/index.js'
import { previewPdf } from '../ui/pdf-preview.ts'

const MIN_PT = 8, MAX_PT = 22
const A4_WIDTH = ((210 - 16) / 25.4) * 96
const A4_HEIGHT = ((297 - 16) / 25.4) * 96
const esc = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]!)

function assignmentName(value: unknown, people: Record<string, TaskPerson>): string {
  if (typeof value === 'string') return people[value] ? personName(people[value], value) : value
  if (!value || typeof value !== 'object') return ''
  const item = value as Record<string, unknown>
  const direct = item['name'] ?? item['nome'] ?? item['label']
  if (typeof direct === 'string' && direct.trim()) return direct
  const id = item['personId'] ?? item['pessoaId'] ?? item['peopleId'] ?? item['id']
  return typeof id === 'string' ? (people[id] ? personName(people[id], id) : id) : ''
}

export function taskPrintHtml(meetings: TaskMeeting[], congregation: string, people: Record<string, TaskPerson>, pageSize = meetings.length): string {
  const last = meetings[meetings.length - 1]
  return paginateItems(meetings, pageSize).map((page, index, pages) => `<div class="tarefas-print-page"><header class="tarefas-print-header"><div><div class="tarefas-print-title">Escala de Tarefas</div><div class="tarefas-print-subtitle">${esc(congregation)}</div></div><div class="tarefas-print-period">${formatTaskDate(meetings[0]?.date)} - ${formatTaskDate(last?.date)}${pages.length > 1 ? ` · ${index + 1}/${pages.length}` : ''}</div></header><div class="tarefas-print-meetings">${page.map(meeting => { const roles = TASK_ROLES.filter(role => roleApplies(role, meeting)); return `<section class="tarefas-print-meeting"><h2>${formatTaskDate(meeting.date)} · ${meeting.type === 'midweek' ? 'Meio de semana' : 'Fim de semana'}</h2><table class="tarefas-print-table"><tbody>${roles.map(role => `<tr><th>${esc(TASK_ROLE_LABELS[role])}</th><td>${esc(assignmentName(assignmentForRole(meeting, role), people))}</td></tr>`).join('')}</tbody></table></section>` }).join('')}</div></div>`).join('')
}

export interface PreparedTaskPrint {
  html: string
  fontPt: number
}

export function prepareTaskPrint(meetings: TaskMeeting[], congregation: string, people: Record<string, TaskPerson>, preferredFontPt: number): PreparedTaskPrint {
  const doc = document.createElement('div'); doc.className = 'tarefas-print-doc'; doc.innerHTML = taskPrintHtml(meetings, congregation, people); document.body.appendChild(doc)
  let chosen = Math.min(MAX_PT, Math.max(MIN_PT, Math.round(preferredFontPt))), fitsHeight = false
  doc.dataset['measuring'] = 'true'
  for (let size = chosen; size >= MIN_PT; size -= 1) { doc.style.fontSize = `${size}pt`; chosen = size; const fitsWidth = doc.scrollWidth <= A4_WIDTH; fitsHeight = doc.scrollHeight <= A4_HEIGHT; if (fitsWidth && fitsHeight) break }
  if (!fitsHeight) { const header = doc.querySelector<HTMLElement>('.tarefas-print-header')?.offsetHeight ?? 0, tableHeader = doc.querySelector<HTMLElement>('thead')?.offsetHeight ?? 0, rows = [...doc.querySelectorAll<HTMLElement>('tbody tr')], rowHeight = Math.max(1, ...rows.map(row => row.offsetHeight)); doc.innerHTML = taskPrintHtml(meetings, congregation, people, rowsPerPrintPage(A4_HEIGHT, header, tableHeader, rowHeight)) }
  const html = doc.innerHTML
  doc.remove()
  return { html, fontPt: chosen }
}

export function printPreparedTaskSchedule(prepared: PreparedTaskPrint): void {
  const doc = document.createElement('div'); doc.className = 'tarefas-print-doc'; doc.innerHTML = prepared.html; doc.dataset['printing'] = 'true'; doc.style.fontSize = `${prepared.fontPt}pt`; document.body.appendChild(doc)
  const cleanup = () => { window.removeEventListener('afterprint', cleanup); doc.remove() }
  window.addEventListener('afterprint', cleanup); window.print(); setTimeout(cleanup, 2000)
}

export function printTaskSchedule(meetings: TaskMeeting[], congregation: string, people: Record<string, TaskPerson>, preferredFontPt: number): number {
  const prepared = prepareTaskPrint(meetings, congregation, people, preferredFontPt)
  printPreparedTaskSchedule(prepared)
  return prepared.fontPt
}

export interface TaskPdfResult { bytes: Uint8Array; pages: number; effectiveFontSize: number }

const A4_PORTRAIT: [number, number] = [595.28, 841.89]
const PDF_MARGIN = 34

function fitPdfText(font: PDFFont, value: string, size: number, width: number): string {
  if (font.widthOfTextAtSize(value, size) <= width) return value
  let result = value
  while (result.length > 1 && font.widthOfTextAtSize(`${result}...`, size) > width) result = result.slice(0, -1)
  return `${result.trim()}...`
}

function drawTaskPdfHeader(page: PDFPage, regular: PDFFont, bold: PDFFont, congregation: string, period: string, pageNumber: number): number {
  page.drawText('Escala de Tarefas', { x:PDF_MARGIN, y:800, size:20, font:bold, color:rgb(.32, .12, .58) })
  page.drawText(congregation || 'Congregação Noroeste', { x:PDF_MARGIN, y:782, size:9, font:regular, color:rgb(.3, .33, .37) })
  page.drawText(period, { x:410, y:800, size:9, font:bold, color:rgb(.18, .2, .23) })
  page.drawText(`Página ${pageNumber}`, { x:492, y:782, size:7, font:regular, color:rgb(.4, .42, .45) })
  page.drawLine({ start:{ x:PDF_MARGIN, y:770 }, end:{ x:A4_PORTRAIT[0] - PDF_MARGIN, y:770 }, thickness:1.2, color:rgb(.32, .12, .58) })
  return 750
}

function drawTaskMeeting(page: PDFPage, regular: PDFFont, bold: PDFFont, meeting: TaskMeeting, people: Record<string, TaskPerson>, x: number, top: number, width: number, fontSize: number): number {
  const roles = TASK_ROLES.filter(role => roleApplies(role, meeting))
  const headerHeight = 24
  const rowHeight = Math.max(15, fontSize + 7)
  const height = headerHeight + roles.length * rowHeight
  page.drawRectangle({ x, y:top - height, width, height, borderColor:rgb(.48, .5, .53), borderWidth:.6, color:rgb(1, 1, 1) })
  page.drawRectangle({ x, y:top - headerHeight, width, height:headerHeight, color:rgb(.32, .12, .58) })
  const kind = String(meeting.type).startsWith('midweek') ? 'Meio de semana' : 'Fim de semana'
  page.drawText(fitPdfText(bold, `${formatTaskDate(meeting.date)} · ${kind}`, fontSize, width - 12), { x:x + 6, y:top - 16, size:fontSize, font:bold, color:rgb(1, 1, 1) })
  let y = top - headerHeight
  roles.forEach(role => {
    y -= rowHeight
    const labelWidth = Math.min(96, width * .4)
    page.drawRectangle({ x, y, width:labelWidth, height:rowHeight, color:rgb(.94, .91, .98) })
    page.drawLine({ start:{ x, y }, end:{ x:x + width, y }, thickness:.35, color:rgb(.58, .6, .63) })
    page.drawLine({ start:{ x:x + labelWidth, y }, end:{ x:x + labelWidth, y:y + rowHeight }, thickness:.35, color:rgb(.58, .6, .63) })
    page.drawText(fitPdfText(bold, TASK_ROLE_LABELS[role], fontSize - 1, labelWidth - 8), { x:x + 4, y:y + 5, size:fontSize - 1, font:bold, color:rgb(.12, .13, .15) })
    page.drawText(fitPdfText(regular, assignmentName(assignmentForRole(meeting, role), people) || 'A definir', fontSize - 1, width - labelWidth - 8), { x:x + labelWidth + 4, y:y + 5, size:fontSize - 1, font:regular, color:rgb(.08, .09, .1) })
  })
  return height
}

export async function createTaskSchedulePdf(meetings: TaskMeeting[], congregation: string, people: Record<string, TaskPerson>, preferredFontPt: number): Promise<TaskPdfResult> {
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ordered = [...meetings].sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')))
  const effectiveFontSize = Math.min(11, Math.max(7, Math.round(preferredFontPt * .68)))
  const columnGap = 12
  const columnWidth = (A4_PORTRAIT[0] - PDF_MARGIN * 2 - columnGap) / 2
  const period = ordered.length ? `${formatTaskDate(ordered[0]?.date)} - ${formatTaskDate(ordered[ordered.length - 1]?.date)}` : 'Sem período'
  let page = pdf.addPage(A4_PORTRAIT)
  let pageNumber = 1
  let column = 0
  let y = drawTaskPdfHeader(page, regular, bold, congregation, period, pageNumber)
  if (!ordered.length) page.drawText('Nenhuma reunião cadastrada.', { x:PDF_MARGIN, y, size:10, font:regular })
  for (const meeting of ordered) {
    const roles = TASK_ROLES.filter(role => roleApplies(role, meeting))
    const estimated = 24 + roles.length * Math.max(15, effectiveFontSize + 7)
    if (y - estimated < 50) {
      if (column === 0) { column = 1; y = 750 }
      else { page = pdf.addPage(A4_PORTRAIT); pageNumber += 1; column = 0; y = drawTaskPdfHeader(page, regular, bold, congregation, period, pageNumber) }
    }
    const x = PDF_MARGIN + column * (columnWidth + columnGap)
    y -= drawTaskMeeting(page, regular, bold, meeting, people, x, y, columnWidth, effectiveFontSize) + 9
  }
  pdf.getPages().forEach(item => item.drawText('Gerado pelo sistema Noroeste', { x:PDF_MARGIN, y:25, size:7, font:regular, color:rgb(.45, .47, .5) }))
  return { bytes:Uint8Array.from(await pdf.save()), pages:pdf.getPageCount(), effectiveFontSize }
}

export async function previewTaskSchedulePdf(meetings: TaskMeeting[], congregation: string, people: Record<string, TaskPerson>, preferredFontPt: number, periodId: string): Promise<TaskPdfResult> {
  const result = await createTaskSchedulePdf(meetings, congregation, people, preferredFontPt)
  previewPdf(result.bytes, `tarefas-${periodId}.pdf`, 'Prévia da escala de tarefas')
  return result
}
