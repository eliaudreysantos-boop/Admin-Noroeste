import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib/cjs/index.js'
import type { MasterPessoa } from '../types'
import { previewPdf } from '../ui/pdf-preview.ts'
import type { FieldServiceAssignment } from './servico-campo-domain.ts'

const A4: [number, number] = [595.28, 841.89]
const monthLabel = (month: string): string => new Intl.DateTimeFormat('pt-BR', { month:'long', year:'numeric', timeZone:'UTC' }).format(new Date(`${month}-15T12:00:00Z`))
const dateLabel = (date: string): string => new Intl.DateTimeFormat('pt-BR', { weekday:'short', day:'2-digit', month:'2-digit', timeZone:'UTC' }).format(new Date(`${date}T12:00:00Z`)).replace('.', '')

function fitted(font: PDFFont, value: string, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(value, size) <= maxWidth) return value
  let result = value
  while (result.length > 1 && font.widthOfTextAtSize(`${result}...`, size) > maxWidth) result = result.slice(0, -1)
  return `${result.trim()}...`
}

function drawRow(page: PDFPage, fonts: { regular:PDFFont; bold:PDFFont }, values: string[], y: number, rowHeight: number, header = false): void {
  const x = 38, widths = [92, 60, 190, 177]
  page.drawRectangle({ x, y:y - rowHeight, width:519, height:rowHeight, color:header ? rgb(.78, .86, .96) : rgb(1, 1, 1), borderColor:rgb(.58, .67, .77), borderWidth:.5 })
  let cursor = x
  values.forEach((value, index) => {
    if (index) page.drawLine({ start:{ x:cursor, y }, end:{ x:cursor, y:y - rowHeight }, thickness:.5, color:rgb(.58, .67, .77) })
    const font = header ? fonts.bold : fonts.regular
    const size = header ? 9 : 8.5
    page.drawText(fitted(font, value, size, widths[index]! - 10), { x:cursor + 5, y:y - rowHeight + 7, size, font, color:rgb(.08, .12, .17) })
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
  const perPage = 36
  const chunks = rows.length ? Array.from({ length:Math.ceil(rows.length / perPage) }, (_, index) => rows.slice(index * perPage, (index + 1) * perPage)) : [[]]
  chunks.forEach((chunk, pageIndex) => {
    const page = pdf.addPage(A4)
    page.drawText('Programação de Serviço de Campo', { x:38, y:792, size:20, font:bold, color:rgb(.02, .25, .45) })
    page.drawText(`${input.congregation || 'Congregação Noroeste'} - ${monthLabel(input.month)}`, { x:38, y:772, size:10, font:regular, color:rgb(.25, .31, .36) })
    if (chunks.length > 1) page.drawText(`Página ${pageIndex + 1} de ${chunks.length}`, { x:490, y:792, size:8, font:regular, color:rgb(.35, .4, .45) })
    let y = 744
    drawRow(page, fonts, ['Dia', 'Hora', 'Local', 'Dirigente'], y, 22, true); y -= 22
    chunk.forEach(assignment => {
      drawRow(page, fonts, [dateLabel(assignment.date), assignment.time, assignment.location, input.people[assignment.leaderId]?.name ?? 'A definir'], y, 18)
      y -= 18
    })
    page.drawText('Gerado pelo sistema Noroeste', { x:38, y:30, size:7, font:regular, color:rgb(.45, .49, .53) })
  })
  return pdf.save()
}

export async function previewFieldServicePdf(input: Parameters<typeof createFieldServicePdf>[0]): Promise<void> {
  const bytes = await createFieldServicePdf(input)
  const filename = `servico-de-campo-${input.month}.pdf`
  previewPdf(bytes, filename, 'Prévia da programação de Serviço de Campo')
  void import('./agenda-documents.ts').then(({ archiveAgendaPdf }) => archiveAgendaPdf(bytes, { modulo:'servicoCampo', periodo:input.month, nome:filename })).catch(() => undefined)
}
