import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib/cjs/index.js'
import type { LimpezaPeriodoGerado, LimpezaSemanaGerada } from '../types'
import { downloadPdf } from '../ui/pdf-download.ts'
import { A4_PORTRAIT, PDF_INK, PDF_LINE, PDF_MUTED, drawPublicPdfHeader } from '../ui/public-pdf-layout.ts'

export interface CleaningPdfOptions { requestedFontSize: number }
export interface CleaningPdfResult { bytes: Uint8Array; effectiveFontSize: number; pages: number }

const MARGIN = 42
const COLUMNS = [MARGIN, 90, 286, 420]
const WIDTHS = [40, 188, 126, 133]

function formatDate(value: string): string {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(value)
  return match ? `${match[2]}/${match[1]}` : value
}

function periodLabel(period: LimpezaPeriodoGerado): string {
  const format = (value: string) => {
    const date = new Date(`${value}T12:00:00`)
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('pt-BR', { month:'long', year:'numeric' }).format(date)
  }
  const start = format(period.inicio)
  const end = format(period.fim)
  return start === end ? start : `${start} - ${end}`
}

function wrapText(font: PDFFont, value: string, size: number, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of value.trim().split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word
    if (line && font.widthOfTextAtSize(candidate, size) > width) { lines.push(line); line = word }
    else line = candidate
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

function preparedRow(week: LimpezaSemanaGerada, font: PDFFont, size: number): string[][] {
  const values = [String(week.grupo), week.grupoNome || `Grupo ${week.grupo}`, formatDate(week.dataMeioSemana), formatDate(week.dataFimSemana)]
  return values.map((value, index) => wrapText(font, value, size, WIDTHS[index]))
}

function drawTableHeader(page: PDFPage, bold: PDFFont, y: number): number {
  ;['Nº', 'Grupo', 'Meio de semana', 'Fim de semana'].forEach((label, index) => {
    page.drawText(label, { x:COLUMNS[index], y, size:8, font:bold, color:PDF_MUTED })
  })
  y -= 12
  page.drawLine({ start:{ x:MARGIN, y }, end:{ x:A4_PORTRAIT[0] - MARGIN, y }, thickness:.5, color:PDF_LINE })
  return y - 13
}

export async function createCleaningPdf(period: LimpezaPeriodoGerado, options: CleaningPdfOptions): Promise<CleaningPdfResult> {
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const effective = Math.min(11, Math.max(8, Number(options.requestedFontSize) || 10))
  let page!: PDFPage
  let y = 0
  const addPage = () => {
    page = pdf.addPage(A4_PORTRAIT)
    y = drawPublicPdfHeader(page, bold, regular, { title:'Limpeza do Salão', congregation:period.congregacao, period:periodLabel(period), margin:MARGIN })
    y = drawTableHeader(page, bold, y)
  }
  addPage()

  if (!period.semanas.length) page.drawText('Nenhuma semana programada.', { x:MARGIN, y, size:effective, font:regular, color:PDF_INK })
  for (const week of period.semanas) {
    const cells = preparedRow(week, regular, effective)
    const lineCount = Math.max(...cells.map(cell => cell.length))
    const height = lineCount * 12 + 14
    if (y - height < MARGIN) addPage()
    cells.forEach((cell, column) => cell.forEach((line, index) => {
      page.drawText(line, { x:COLUMNS[column], y:y - index * 12, size:effective, font:column < 2 ? bold : regular, color:PDF_INK })
    }))
    y -= height
    page.drawLine({ start:{ x:MARGIN, y:y + 7 }, end:{ x:A4_PORTRAIT[0] - MARGIN, y:y + 7 }, thickness:.35, color:PDF_LINE })
  }
  return { bytes:Uint8Array.from(await pdf.save()), effectiveFontSize:effective, pages:pdf.getPageCount() }
}

export async function downloadCleaningPdf(period: LimpezaPeriodoGerado, options: CleaningPdfOptions): Promise<CleaningPdfResult> {
  const result = await createCleaningPdf(period, options)
  downloadPdf(result.bytes, `limpeza-${period.id}.pdf`)
  return result
}
