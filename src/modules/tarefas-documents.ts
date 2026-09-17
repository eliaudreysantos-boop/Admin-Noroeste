import { TASK_ROLES, TASK_ROLE_LABELS, assignmentForRole, personName, roleApplies, type TaskMeeting, type TaskPerson } from './tarefas-domain.ts'
import { formatTaskDate, paginateItems, rowsPerPrintPage } from './tarefas-output.ts'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib/cjs/index.js'
import { downloadPdf } from '../ui/pdf-download.ts'
import { A4_PORTRAIT, PDF_INK, PDF_LINE, drawPublicPdfHeader } from '../ui/public-pdf-layout.ts'

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

const PDF_MARGIN = 34

function wrapTaskPdfText(font: PDFFont, value: string, size: number, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of value.split(/\s+/)) {
    if (line && font.widthOfTextAtSize(`${line} ${word}`, size) > width) { lines.push(line); line = '' }
    for (const character of (line ? ' ' : '') + word) {
      if (line && font.widthOfTextAtSize(line + character, size) > width) { lines.push(line); line = '' }
      line += character
    }
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

export async function createTaskSchedulePdf(meetings: TaskMeeting[], congregation: string, people: Record<string, TaskPerson>, preferredFontPt: number): Promise<TaskPdfResult> {
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ordered = [...meetings].sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')))
  const effectiveFontSize = Math.min(10, Math.max(8, Math.round(preferredFontPt * .68)))
  const lineHeight = effectiveFontSize + 2
  const width = A4_PORTRAIT[0] - PDF_MARGIN * 2, labelWidth = 102
  const period = ordered.length ? `${formatTaskDate(ordered[0]?.date)} - ${formatTaskDate(ordered[ordered.length - 1]?.date)}` : 'Sem período'
  let page!: PDFPage, y = 0
  const addPage = () => {
    page = pdf.addPage(A4_PORTRAIT)
    y = drawPublicPdfHeader(page, bold, regular, { title:'Escala de Tarefas', congregation:congregation || 'Congregação Noroeste', period, margin:PDF_MARGIN })
  }
  addPage()
  if (!ordered.length) page.drawText('Nenhuma reunião cadastrada.', { x:PDF_MARGIN, y, size:10, font:regular })
  const sections: Array<[string, TaskMeeting[]]> = [
    ['Meio de semana', ordered.filter(meeting => String(meeting.type).startsWith('midweek'))],
    ['Fim de semana', ordered.filter(meeting => !String(meeting.type).startsWith('midweek'))],
  ]
  for (const [title, section] of sections) {
    for (let offset = 0; offset < section.length; offset += 5) {
      const dates = section.slice(offset, offset + 5)
      const cellWidth = (width - labelWidth) / dates.length
      const roles = TASK_ROLES.filter(role => dates.some(meeting => roleApplies(role, meeting)))
      const prepared = roles.map(role => [
        wrapTaskPdfText(bold, TASK_ROLE_LABELS[role], effectiveFontSize, labelWidth - 10),
        ...dates.map(meeting => wrapTaskPdfText(regular, roleApplies(role, meeting) ? assignmentName(assignmentForRole(meeting, role), people) || 'A definir' : '-', effectiveFontSize, cellWidth - 10)),
      ])
      const fullHeight = 44 + prepared.reduce((sum, cells) => sum + Math.max(...cells.map(lines => lines.length)) * lineHeight + 10, 0)
      if (y - Math.min(fullHeight, 650) < PDF_MARGIN) addPage()
      const header = () => {
        page.drawText(title, { x:PDF_MARGIN, y, size:11, font:bold, color:PDF_INK })
        y -= 12
        page.drawRectangle({ x:PDF_MARGIN, y:y - 23, width, height:23, color:PDF_INK })
        page.drawText('Tarefa', { x:PDF_MARGIN + 5, y:y - 15, size:effectiveFontSize, font:bold, color:rgb(1, 1, 1) })
        dates.forEach((meeting, index) => page.drawText(formatTaskDate(meeting.date), { x:PDF_MARGIN + labelWidth + index * cellWidth + 5, y:y - 15, size:effectiveFontSize, font:bold, color:rgb(1, 1, 1) }))
        y -= 23
      }
      header()
      for (const cells of prepared) {
        let cursor = 0
        const count = Math.max(...cells.map(lines => lines.length))
        while (cursor < count) {
          const availableLines = Math.floor((y - PDF_MARGIN - 10) / lineHeight)
          if (availableLines < 1 || (cursor === 0 && count <= 40 && count > availableLines)) { addPage(); header(); continue }
          const lines = Math.min(count - cursor, availableLines)
          const height = lines * lineHeight + 10
          page.drawRectangle({ x:PDF_MARGIN, y:y - height, width:labelWidth, height, color:rgb(.96, .96, .96) })
          cells.forEach((cell, column) => {
            const x = PDF_MARGIN + (column ? labelWidth + (column - 1) * cellWidth : 0)
            cell.slice(cursor, cursor + lines).forEach((text, index) => page.drawText(text, { x:x + 5, y:y - 5 - effectiveFontSize - index * lineHeight, size:effectiveFontSize, font:column ? regular : bold, color:PDF_INK }))
            page.drawLine({ start:{ x, y }, end:{ x, y:y - height }, thickness:.35, color:PDF_LINE })
          })
          page.drawLine({ start:{ x:PDF_MARGIN + width, y }, end:{ x:PDF_MARGIN + width, y:y - height }, thickness:.35, color:PDF_LINE })
          y -= height
          page.drawLine({ start:{ x:PDF_MARGIN, y }, end:{ x:PDF_MARGIN + width, y }, thickness:.35, color:PDF_LINE })
          cursor += lines
        }
      }
      y -= 24
    }
  }
  return { bytes:Uint8Array.from(await pdf.save()), pages:pdf.getPageCount(), effectiveFontSize }
}

export async function downloadTaskSchedulePdf(meetings: TaskMeeting[], congregation: string, people: Record<string, TaskPerson>, preferredFontPt: number, periodId: string): Promise<TaskPdfResult> {
  const result = await createTaskSchedulePdf(meetings, congregation, people, preferredFontPt)
  downloadPdf(result.bytes, `tarefas-${periodId}.pdf`)
  return result
}
