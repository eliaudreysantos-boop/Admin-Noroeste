import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib/cjs/index.js'
import type { MasterPessoa } from '../types'
import { previewPdf } from '../ui/pdf-preview.ts'
import { A4_PORTRAIT, PDF_INK, PDF_LINE, drawPublicPdfHeader } from '../ui/public-pdf-layout.ts'
import type { FieldServiceAssignment } from './servico-campo-domain.ts'

const monthLabel = (month: string): string => new Intl.DateTimeFormat('pt-BR', { month:'long', year:'numeric', timeZone:'UTC' }).format(new Date(`${month}-15T12:00:00Z`))
const dateLabel = (date: string): string => new Intl.DateTimeFormat('pt-BR', { weekday:'short', day:'2-digit', timeZone:'UTC' }).format(new Date(`${date}T12:00:00Z`)).replace('.', '')

function wrap(font: PDFFont, value: string, size: number, maxWidth: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return ['']
  const lines: string[] = []
  let current = ''
  words.forEach(word => {
    const candidate = current ? `${current} ${word}` : word
    if (!current || font.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate
    else { lines.push(current); current = word }
  })
  if (current) lines.push(current)
  return lines
}

function rowHeight(fonts: { regular:PDFFont; bold:PDFFont }, values: string[], header = false): number {
  if (header) return 22
  const widths = [72, 54, 205, 188], size = 8.5
  return Math.max(20, ...values.map((value, index) => wrap(fonts.regular, value, size, widths[index]! - 10).length * 10 + 8))
}

function drawRow(page: PDFPage, fonts: { regular:PDFFont; bold:PDFFont }, values: string[], y: number, height: number, header = false): void {
  const x = 38, widths = [72, 54, 205, 188]
  page.drawRectangle({ x, y:y - height, width:519, height, color:header ? PDF_INK : rgb(1, 1, 1), borderColor:PDF_LINE, borderWidth:.5 })
  let cursor = x
  values.forEach((value, index) => {
    if (index) page.drawLine({ start:{ x:cursor, y }, end:{ x:cursor, y:y - height }, thickness:.5, color:PDF_LINE })
    const font = header ? fonts.bold : fonts.regular
    const size = header ? 9 : 8.5
    const lines = header ? [value] : wrap(font, value, size, widths[index]! - 10)
    lines.forEach((line, lineIndex) => page.drawText(line, { x:cursor + 5, y:y - 13 - lineIndex * 10, size, font, color:header ? rgb(1, 1, 1) : PDF_INK }))
    cursor += widths[index]!
  })
}

export async function createFieldServicePdf(input: {
  month: string
  assignments: FieldServiceAssignment[]
  people: Record<string, MasterPessoa>
  congregation: string
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const fonts = { regular, bold }
  const rows = [...input.assignments].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.location.localeCompare(b.location, 'pt-BR'))
  let page: PDFPage
  let y = 0
  const addPage = (): void => {
    page = pdf.addPage(A4_PORTRAIT)
    y = drawPublicPdfHeader(page, bold, regular, { title:'Programação de Serviço de Campo', congregation:input.congregation || 'Congregação Noroeste', period:monthLabel(input.month), margin:38 })
    drawRow(page, fonts, ['Dia', 'Hora', 'Local', 'Dirigente'], y, 22, true); y -= 22
  }
  addPage()
  if (!rows.length) page!.drawText('Nenhuma saída programada para este período.', { x:43, y:y - 24, size:9, font:regular, color:PDF_INK })
  rows.forEach(assignment => {
    const values = [dateLabel(assignment.date), assignment.time, assignment.location, input.people[assignment.leaderId]?.name ?? 'A definir']
    const height = rowHeight(fonts, values)
    if (y - height < 42) addPage()
    drawRow(page!, fonts, values, y, height)
    y -= height
  })
  return pdf.save()
}

export async function previewFieldServicePdf(input: Parameters<typeof createFieldServicePdf>[0]): Promise<void> {
  const bytes = await createFieldServicePdf(input)
  const filename = `servico-de-campo-${input.month}.pdf`
  previewPdf(bytes, filename, 'Prévia da programação de Serviço de Campo')
}
