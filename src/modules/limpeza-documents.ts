import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib/cjs/index.js'
import type { LimpezaPeriodoGerado, LimpezaSemanaGerada } from '../types'

export interface CleaningPdfOptions {
  requestedFontSize: number
}

export interface CleaningPdfResult {
  bytes: Uint8Array
  effectiveFontSize: number
  pages: number
}

const A4: [number, number] = [595.28, 841.89]
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function formatCleaningDate(value: string): string {
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}/${year.slice(-2)}` : value
}

function monthLabel(value: string): string {
  const month = Number(value.slice(5, 7))
  return MONTHS[month - 1] ?? value
}

function download(bytes: Uint8Array, filename: string): void {
  const copy = Uint8Array.from(bytes)
  const url = URL.createObjectURL(new Blob([copy.buffer], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function upper(value: string): string {
  return value.toLocaleUpperCase('pt-BR')
}

function fitSize(font: PDFFont, text: string, desired: number, width: number): number {
  if (!text) return desired
  const measured = font.widthOfTextAtSize(text, desired)
  return measured <= width ? desired : desired * width / measured
}

function drawCentered(page: PDFPage, font: PDFFont, text: string, x: number, y: number, width: number, size: number, color = rgb(0, 0, 0)): void {
  const fitted = Math.max(6, fitSize(font, text, size, width))
  page.drawText(text, { x: x + (width - font.widthOfTextAtSize(text, fitted)) / 2, y, size: fitted, font, color })
}

function rowsByMonth(period: LimpezaPeriodoGerado): LimpezaSemanaGerada[][] {
  const grouped = new Map<string, LimpezaSemanaGerada[]>()
  period.semanas.forEach(week => {
    const key = week.dataMeioSemana.slice(0, 7)
    grouped.set(key, [...(grouped.get(key) ?? []), week])
  })
  return [...grouped.values()]
}

export async function createCleaningPdf(period: LimpezaPeriodoGerado, options: CleaningPdfOptions): Promise<CleaningPdfResult> {
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const page = pdf.addPage(A4)
  const [pageWidth, pageHeight] = A4
  const margin = 30
  const titleY = pageHeight - 58
  const columns = rowsByMonth(period)
  const gap = 12
  const columnCount = Math.max(1, columns.length)
  const columnWidth = (pageWidth - margin * 2 - gap * (columnCount - 1)) / columnCount
  const contentTop = pageHeight - 112
  const contentBottom = 32
  const maxRows = Math.max(1, ...columns.map(rows => rows.length))
  const rowHeight = (contentTop - contentBottom - 38) / maxRows
  const requested = Math.max(8, Math.min(22, options.requestedFontSize))
  const verticalLimit = Math.max(8, (rowHeight - 13) / 5.25)
  const innerWidth = columnWidth - 20
  const horizontalLimit = period.semanas.reduce((limit, week) => {
    const lines: Array<[string, number]> = [
      [`GRUPO ${week.grupo}`, 1.7],
      [upper(week.grupoNome), 1.08],
      ['LIMPEZA APÓS REUNIÃO', .72],
      [`MEIO DE SEMANA ${formatCleaningDate(week.dataMeioSemana)}`, .76],
      [`LIMPEZA SEMANAL ${formatCleaningDate(week.dataFimSemana)}`, .76],
    ]
    return Math.min(limit, ...lines.map(([text, ratio]) => innerWidth / (bold.widthOfTextAtSize(text, 1) * ratio)))
  }, Number.POSITIVE_INFINITY)
  const effective = Math.max(8, Math.min(requested, verticalLimit, horizontalLimit))

  drawCentered(page, bold, 'LIMPEZA DO SALÃO', margin, titleY, pageWidth - margin * 2, 28, rgb(.07, .09, .18))
  page.drawLine({ start: { x: 154, y: titleY - 7 }, end: { x: pageWidth - 154, y: titleY - 7 }, thickness: 1.5, color: rgb(.07, .09, .18) })
  drawCentered(page, regular, upper(period.congregacao), margin, titleY - 25, pageWidth - margin * 2, 9, rgb(.3, .32, .36))

  columns.forEach((rows, columnIndex) => {
    const x = margin + columnIndex * (columnWidth + gap)
    page.drawRectangle({ x, y: contentBottom, width: columnWidth, height: contentTop - contentBottom, color: rgb(.955, .955, .95) })
    if (columnIndex > 0) page.drawRectangle({ x: x - gap / 2 - 1, y: contentBottom + 7, width: 2, height: contentTop - contentBottom - 14, color: rgb(.73, .22, .08) })
    const label = rows[0] ? upper(monthLabel(rows[0].dataMeioSemana)) : ''
    drawCentered(page, bold, label, x + 8, contentTop - 27, columnWidth - 16, 20, rgb(.05, .05, .05))
    page.drawLine({ start: { x: x + 28, y: contentTop - 32 }, end: { x: x + columnWidth - 28, y: contentTop - 32 }, thickness: 1 })

    rows.forEach((week, rowIndex) => {
      const top = contentTop - 43 - rowIndex * rowHeight
      const innerX = x + 10
      const innerWidth = columnWidth - 20
      const accent = rgb(.73, .22, .08)
      drawCentered(page, bold, `GRUPO ${week.grupo}`, innerX, top - effective * 1.5, innerWidth, effective * 1.7, accent)
      drawCentered(page, bold, upper(week.grupoNome), innerX, top - effective * 2.65, innerWidth, effective * 1.08, accent)
      drawCentered(page, bold, 'LIMPEZA APÓS REUNIÃO', innerX, top - effective * 3.65, innerWidth, effective * .72, rgb(.34, .34, .34))
      drawCentered(page, bold, `MEIO DE SEMANA ${formatCleaningDate(week.dataMeioSemana)}`, innerX, top - effective * 4.45, innerWidth, effective * .76)
      drawCentered(page, bold, `LIMPEZA SEMANAL ${formatCleaningDate(week.dataFimSemana)}`, innerX, top - effective * 5.25, innerWidth, effective * .76, rgb(.85, .04, .08))
    })
  })

  const bytes = await pdf.save()
  return { bytes, effectiveFontSize: Math.round(effective * 10) / 10, pages: 1 }
}

export async function downloadCleaningPdf(period: LimpezaPeriodoGerado, options: CleaningPdfOptions): Promise<CleaningPdfResult> {
  const result = await createCleaningPdf(period, options)
  download(result.bytes, `limpeza-${period.id}.pdf`)
  return result
}
