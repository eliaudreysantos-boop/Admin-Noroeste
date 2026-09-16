import { AlignmentType, Document, Footer, Packer, PageBreak, Paragraph, TextRun } from 'docx'
// O entrypoint ESM do pdf-lib 1.17.1 referencia "./text" sem extensao e falha no Vite 5.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib/cjs/index.js'
import type { PDFFont } from 'pdf-lib'
import { previewPdf } from '../ui/pdf-preview.ts'
import type { MeetingProgram, ProgramPart, ProgramPerson, ProgramSection } from './programacao-domain'
import { permissionForPart } from './programacao-domain.ts'

const sectionLabels: Record<ProgramSection, string> = {
  tesouros: 'TESOUROS DA PALAVRA DE DEUS',
  ministerio: 'FAÇA SEU MELHOR NO MINISTÉRIO',
  'vida-crista': 'NOSSA VIDA CRISTÃ',
}
const sectionColors: Record<ProgramSection, [number, number, number]> = {
  tesouros: [0.36, 0.38, 0.39], ministerio: [0.78, 0.56, 0], 'vida-crista': [0.61, 0, 0.2],
}
export const S140_REVISION = '11/23'

function formatDate(value: string): string {
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

function download(bytes: BlobPart, type: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([bytes], { type }))
  const link = document.createElement('a')
  link.href = url; link.download = filename; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const documentPartTitle = (part: ProgramPart): string => {
  const number = part.id.match(/^\d{4}-\d{2}-\d{2}-(\d+)$/)?.[1]
  return `${number ? `${number}. ` : ''}${part.title}`
}
export const documentPartLine = (part: ProgramPart): string => {
  const role = permissionForPart(part)
  const fixedRole = ['presidente', 'oracao-inicial', 'oracao-final', 'leitor'].includes(role)
  return `${documentPartTitle(part)}${fixedRole ? '' : ` (${part.durationMinutes} min.)`}`
}
const personName = (id: string | undefined, people: Map<string, ProgramPerson>): string => id ? people.get(id)?.name ?? 'Cadastro não encontrado' : 'Sem designação'
export const personIdForDocument = (part: ProgramPart): string | undefined => part.realizedPersonId ?? part.substitutePersonId ?? part.assignedPersonId
function clippedToWidth(value: string, maxWidth: number, font: PDFFont, size: number): string {
  if (font.widthOfTextAtSize(value, size) <= maxWidth) return value
  let output = value
  while (output && font.widthOfTextAtSize(`${output}...`, size) > maxWidth) output = output.slice(0, -1)
  return `${output}...`
}

async function s89TemplateBytes(): Promise<Uint8Array> {
  const response = await fetch('/templates/S-89_T.pdf')
  if (!response.ok) throw new Error('O modelo oficial S-89 não está disponível.')
  return new Uint8Array(await response.arrayBuffer())
}

export async function createS89(program: MeetingProgram, peopleList: ProgramPerson[], templateBytes?: Uint8Array): Promise<{ bytes: Uint8Array; count: number }> {
  const people = new Map(peopleList.map(person => [person.id, person]))
  const cards = program.parts.filter(part => part.section === 'ministerio' && personIdForDocument(part))
  if (!cards.length) return { bytes: new Uint8Array(), count: 0 }
  const source = templateBytes ?? await s89TemplateBytes()
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const [background] = await pdf.embedPdf(source, [0])
  for (const part of cards) {
    const page = pdf.addPage([background.width, background.height])
    page.drawPage(background, { x: 0, y: 0, width: background.width, height: background.height })
    const draw = (text: string, x: number, y: number, maxWidth = 235) => page.drawText(clippedToWidth(text, maxWidth, regular, 9), { x, y, size: 9, font: regular })
    draw(personName(personIdForDocument(part), people), 52, 267)
    draw(personName(part.assistantPersonId, people).replace('Sem designação', ''), 61, 244)
    draw(formatDate(program.meetingDate), 48, 221, 100)
    draw(documentPartTitle(part), 117, 197, 185)
    // Esta congregação usa somente o Salão principal no formulário S-89.
    page.drawText('X', { x: 26, y: 144, size: 9, font: regular })
  }
  return { bytes: await pdf.save(), count: cards.length }
}

export async function downloadS89(program: MeetingProgram, peopleList: ProgramPerson[]): Promise<number> {
  const result = await createS89(program, peopleList)
  if (result.count) {
    const filename = `S-89-${program.meetingDate}.pdf`
    previewPdf(result.bytes, filename, 'Prévia do S-89')
  }
  return result.count
}

export async function createS89Batch(programs: MeetingProgram[], people: ProgramPerson[], templateBytes?: Uint8Array): Promise<{ bytes: Uint8Array; count: number }> {
  const source = templateBytes ?? await s89TemplateBytes()
  const pdf = await PDFDocument.create()
  let count = 0
  for (const program of programs) {
    const cards = await createS89(program, people, source)
    if (!cards.count) continue
    const document = await PDFDocument.load(cards.bytes)
    const backgrounds = await pdf.embedPages(document.getPages())
    for (const background of backgrounds) {
      const slot = count % 4
      const page = slot === 0 ? pdf.addPage([595.28, 841.89]) : pdf.getPage(pdf.getPageCount() - 1)
      const cellWidth = 595.28 / 2, cellHeight = 841.89 / 2
      const scale = Math.min((cellWidth - 16) / background.width, (cellHeight - 16) / background.height)
      const width = background.width * scale, height = background.height * scale
      page.drawPage(background, { x: (slot % 2) * cellWidth + (cellWidth - width) / 2, y: (slot < 2 ? cellHeight : 0) + (cellHeight - height) / 2, width, height })
      count += 1
    }
  }
  return { count, bytes: count ? await pdf.save() : new Uint8Array() }
}

export async function downloadS89Batch(programs: MeetingProgram[], people: ProgramPerson[]): Promise<number> {
  const result = await createS89Batch(programs, people)
  if (result.count) previewPdf(result.bytes, `S-89-lote-${programs[0]?.meetingDate ?? 'periodo'}.pdf`, 'Prévia S-89 em lote')
  return result.count
}

export function paginateS140(programs: MeetingProgram[]): MeetingProgram[][] {
  const blocks = programs.flatMap(program => {
    const parts = (Object.keys(sectionLabels) as ProgramSection[]).flatMap(section => program.parts.filter(part => part.section === section))
    const result: MeetingProgram[] = []
    for (let index = 0; index < parts.length; index += 18) result.push({ ...program, parts: parts.slice(index, index + 18) })
    return result.length ? result : [program]
  })
  const pages: MeetingProgram[][] = []
  for (let index = 0; index < blocks.length; index += 2) pages.push(blocks.slice(index, index + 2))
  return pages
}

export async function createS140Pdf(programs: MeetingProgram[], congregation: string, peopleList: ProgramPerson[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const people = new Map(peopleList.map(person => [person.id, person]))
  paginateS140(programs).forEach(meetings => {
    const page = pdf.addPage([595.28, 841.89])
    const draw = (text: string, x: number, y: number, size: number, isBold = false, color = rgb(0, 0, 0)) => page.drawText(text, { x, y, size, font: isBold ? bold : regular, color })
    meetings.forEach((program, meetingIndex) => {
      let y = meetingIndex ? 398 : 790
      draw(clippedToWidth(congregation, 165, bold, 9), 38, y, 9, true); draw('Programação da reunião do meio de semana', 220, y, 13, true)
      y -= 18; page.drawLine({ start: { x: 38, y }, end: { x: 557, y }, thickness: 1 }); y -= 16
      draw(`${formatDate(program.meetingDate)} | ${clippedToWidth(program.bibleReading, 430, bold, 9)}`, 38, y, 9, true)
      ;(Object.keys(sectionLabels) as ProgramSection[]).forEach(section => {
        const parts = program.parts.filter(part => part.section === section)
        if (!parts.length) return
        y -= 17
        const color = sectionColors[section]
        page.drawRectangle({ x: 38, y, width: 519, height: 14, color: rgb(...color) })
        draw(sectionLabels[section], 43, y + 3, 8, true, rgb(1, 1, 1)); y -= 14
        parts.forEach(part => {
          draw(clippedToWidth(documentPartLine(part), 330, regular, 8), 48, y, 8)
          draw(clippedToWidth(personName(personIdForDocument(part), people), 165, regular, 8), 388, y, 8)
          y -= 12
        })
      })
      if (!meetingIndex && meetings.length === 2) page.drawLine({ start: { x: 38, y: 420 }, end: { x: 557, y: 420 }, thickness: .5, color: rgb(.65, .65, .65) })
    })
    draw(`S-140-T  ${S140_REVISION}`, 38, 24, 8)
  })
  return pdf.save()
}

export async function downloadS140Pdf(programs: MeetingProgram[], congregation: string, peopleList: ProgramPerson[]): Promise<void> {
  const bytes = await createS140Pdf(programs, congregation, peopleList)
  const filename = `S-140-${programs[0]?.meetingDate ?? 'programacao'}.pdf`
  previewPdf(bytes, filename, 'Prévia do S-140')
}

function docxMeeting(program: MeetingProgram, congregation: string, people: Map<string, ProgramPerson>): Paragraph[] {
  const children: Paragraph[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: `${congregation}     `, bold: true, size: 18 }), new TextRun({ text: 'Programação da reunião do meio de semana', bold: true, size: 24, font: 'Times New Roman' })] }),
    new Paragraph({ border: { bottom: { color: '555555', style: 'single', size: 8 } }, spacing: { after: 50 }, children: [new TextRun({ text: `${formatDate(program.meetingDate)} | ${program.bibleReading}`, bold: true, size: 17 })] }),
  ]
  ;(Object.keys(sectionLabels) as ProgramSection[]).forEach(section => {
    const parts = program.parts.filter(part => part.section === section)
    if (!parts.length) return
    const color = sectionColors[section].map(value => Math.round(value * 255).toString(16).padStart(2, '0')).join('').toUpperCase()
    children.push(new Paragraph({ shading: { fill: color }, spacing: { before: 55, after: 35 }, children: [new TextRun({ text: sectionLabels[section], color: 'FFFFFF', bold: true, size: 15 })] }))
    parts.forEach(part => children.push(new Paragraph({ indent: { left: 160 }, spacing: { after: 15 }, children: [new TextRun({ text: documentPartLine(part), size: 14 }), new TextRun({ text: `  • ${personName(personIdForDocument(part), people)}`, size: 12, color: '333333' })] })))
  })
  return children
}

export async function createS140Docx(programs: MeetingProgram[], congregation: string, peopleList: ProgramPerson[]): Promise<Blob> {
  const people = new Map(peopleList.map(person => [person.id, person]))
  const children: Paragraph[] = []
  paginateS140(programs).forEach((page, pageIndex) => {
    page.forEach((program, index) => {
      children.push(...docxMeeting(program, congregation, people))
      if (!index && page.length === 2) children.push(new Paragraph({ border: { bottom: { color: 'B0B0B0', style: 'single', size: 4 } }, spacing: { before: 35, after: 35 } }))
    })
    if (pageIndex < paginateS140(programs).length - 1) children.push(new Paragraph({ children: [new PageBreak()] }))
  })
  const documentFile = new Document({ sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 480, right: 560, bottom: 520, left: 560 } } }, footers: { default: new Footer({ children: [new Paragraph({ children: [new TextRun({ text: `S-140-T  ${S140_REVISION}`, size: 14 })] })] }) }, children }] })
  return Packer.toBlob(documentFile)
}

export async function downloadS140Docx(programs: MeetingProgram[], congregation: string, peopleList: ProgramPerson[]): Promise<void> {
  const blob = await createS140Docx(programs, congregation, peopleList)
  download(blob, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', `S-140-${programs[0]?.meetingDate ?? 'programacao'}.docx`)
}
