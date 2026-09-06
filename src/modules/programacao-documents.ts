import { AlignmentType, Document, Footer, Packer, PageBreak, Paragraph, TextRun } from 'docx'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib/cjs/index.js'
import type { MeetingProgram, ProgramPart, ProgramPerson, ProgramSection } from './programacao-domain'

const sectionLabels: Record<ProgramSection, string> = {
  tesouros: 'TESOUROS DA PALAVRA DE DEUS',
  ministerio: 'FAÇA SEU MELHOR NO MINISTÉRIO',
  'vida-crista': 'NOSSA VIDA CRISTÃ',
}
const sectionColors: Record<ProgramSection, [number, number, number]> = {
  tesouros: [0.36, 0.38, 0.39], ministerio: [0.78, 0.56, 0], 'vida-crista': [0.61, 0, 0.2],
}

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

const partNumber = (part: ProgramPart): string => {
  const pieces = part.id.split('-')
  return pieces[pieces.length - 1] ?? ''
}
const personName = (id: string | undefined, people: Map<string, ProgramPerson>): string => id ? people.get(id)?.name ?? 'Cadastro não encontrado' : 'Sem designação'
const clipped = (value: string, max: number): string => value.length > max ? `${value.slice(0, max - 1)}…` : value

export async function createS89(program: MeetingProgram, peopleList: ProgramPerson[]): Promise<{ bytes: Uint8Array; count: number }> {
  const people = new Map(peopleList.map(person => [person.id, person]))
  const cards = program.parts.filter(part => part.section === 'ministerio' && part.assignedPersonId)
  if (!cards.length) return { bytes: new Uint8Array(), count: 0 }
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  cards.forEach(part => {
    const page = pdf.addPage([340, 452])
    const draw = (text: string, x: number, y: number, size = 10, isBold = false) => page.drawText(text, { x, y, size, font: isBold ? bold : regular })
    page.drawRectangle({ x: 18, y: 18, width: 304, height: 416, borderWidth: 1, borderColor: rgb(.25, .25, .25) })
    draw('DESIGNAÇÃO PARA A REUNIÃO', 57, 405, 13, true)
    draw('NOSSA VIDA E MINISTÉRIO CRISTÃO', 48, 386, 11, true)
    page.drawLine({ start: { x: 30, y: 373 }, end: { x: 310, y: 373 }, thickness: 1 })
    draw('Nome:', 31, 345, 9, true); draw(clipped(personName(part.assignedPersonId, people), 42), 75, 345, 10)
    draw('Ajudante:', 31, 315, 9, true); draw(clipped(personName(part.assistantPersonId, people).replace('Sem designação', ''), 38), 88, 315, 10)
    draw('Data:', 31, 285, 9, true); draw(formatDate(program.meetingDate), 70, 285, 10)
    draw('Parte:', 31, 255, 9, true); draw(clipped(`${partNumber(part)}. ${part.title}`, 45), 72, 255, 10)
    draw('Local:', 31, 225, 9, true); draw(part.roomId ? clipped(part.roomId, 32) : 'Salão principal', 70, 225, 10)
    page.drawRectangle({ x: 31, y: 180, width: 11, height: 11, borderWidth: 1 }); draw('Salão principal', 50, 181, 9)
    page.drawRectangle({ x: 31, y: 153, width: 11, height: 11, borderWidth: 1 }); draw('Sala auxiliar', 50, 154, 9)
    draw('Observação:', 31, 117, 9, true)
    page.drawLine({ start: { x: 31, y: 100 }, end: { x: 308, y: 100 }, thickness: .5 })
    page.drawLine({ start: { x: 31, y: 78 }, end: { x: 308, y: 78 }, thickness: .5 })
    draw('S-89-T', 273, 31, 7)
  })
  return { bytes: await pdf.save(), count: cards.length }
}

export async function downloadS89(program: MeetingProgram, peopleList: ProgramPerson[]): Promise<number> {
  const result = await createS89(program, peopleList)
  if (result.count) download(new Uint8Array(result.bytes).buffer as ArrayBuffer, 'application/pdf', `S-89-${program.meetingDate}.pdf`)
  return result.count
}

function paginate(programs: MeetingProgram[]): MeetingProgram[][] {
  const pages: MeetingProgram[][] = []
  for (let index = 0; index < programs.length; index += 2) pages.push(programs.slice(index, index + 2))
  return pages
}

export async function createS140Pdf(programs: MeetingProgram[], congregation: string, peopleList: ProgramPerson[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const people = new Map(peopleList.map(person => [person.id, person]))
  paginate(programs).forEach(meetings => {
    const page = pdf.addPage([595.28, 841.89])
    const draw = (text: string, x: number, y: number, size: number, isBold = false, color = rgb(0, 0, 0)) => page.drawText(text, { x, y, size, font: isBold ? bold : regular, color })
    meetings.forEach((program, meetingIndex) => {
      let y = meetingIndex ? 398 : 790
      draw(clipped(congregation, 30), 38, y, 9, true); draw('Programação da reunião do meio de semana', 220, y, 13, true)
      y -= 18; page.drawLine({ start: { x: 38, y }, end: { x: 557, y }, thickness: 1 }); y -= 16
      draw(`${formatDate(program.meetingDate)} | ${clipped(program.bibleReading, 48)}`, 38, y, 9, true)
      ;(Object.keys(sectionLabels) as ProgramSection[]).forEach(section => {
        const parts = program.parts.filter(part => part.section === section)
        if (!parts.length) return
        y -= 17
        const color = sectionColors[section]
        page.drawRectangle({ x: 38, y, width: 519, height: 14, color: rgb(...color) })
        draw(sectionLabels[section], 43, y + 3, 8, true, rgb(1, 1, 1)); y -= 14
        parts.forEach(part => {
          draw(`${partNumber(part)}. ${clipped(part.title, 45)} (${part.durationMinutes} min.)`, 48, y, 8)
          draw(clipped(personName(part.realizedPersonId ?? part.substitutePersonId ?? part.assignedPersonId, people), 27), 388, y, 8)
          y -= 12
        })
      })
      if (!meetingIndex && meetings.length === 2) page.drawLine({ start: { x: 38, y: 420 }, end: { x: 557, y: 420 }, thickness: .5, color: rgb(.65, .65, .65) })
    })
    draw('S-140-T  11/23', 38, 24, 8)
  })
  return pdf.save()
}

export async function downloadS140Pdf(programs: MeetingProgram[], congregation: string, peopleList: ProgramPerson[]): Promise<void> {
  const bytes = await createS140Pdf(programs, congregation, peopleList)
  download(new Uint8Array(bytes).buffer as ArrayBuffer, 'application/pdf', `S-140-${programs[0]?.meetingDate ?? 'programacao'}.pdf`)
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
    parts.forEach(part => children.push(new Paragraph({ indent: { left: 160 }, spacing: { after: 15 }, children: [new TextRun({ text: `${partNumber(part)}. ${part.title} (${part.durationMinutes} min.)`, size: 14 }), new TextRun({ text: `  • ${personName(part.realizedPersonId ?? part.substitutePersonId ?? part.assignedPersonId, people)}`, size: 12, color: '333333' })] })))
  })
  return children
}

export async function createS140Docx(programs: MeetingProgram[], congregation: string, peopleList: ProgramPerson[]): Promise<Blob> {
  const people = new Map(peopleList.map(person => [person.id, person]))
  const children: Paragraph[] = []
  paginate(programs).forEach((page, pageIndex) => {
    page.forEach((program, index) => {
      children.push(...docxMeeting(program, congregation, people))
      if (!index && page.length === 2) children.push(new Paragraph({ border: { bottom: { color: 'B0B0B0', style: 'single', size: 4 } }, spacing: { before: 35, after: 35 } }))
    })
    if (pageIndex < paginate(programs).length - 1) children.push(new Paragraph({ children: [new PageBreak()] }))
  })
  const documentFile = new Document({ sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 480, right: 560, bottom: 520, left: 560 } } }, footers: { default: new Footer({ children: [new Paragraph({ children: [new TextRun({ text: 'S-140-T  11/23', size: 14 })] })] }) }, children }] })
  return Packer.toBlob(documentFile)
}

export async function downloadS140Docx(programs: MeetingProgram[], congregation: string, peopleList: ProgramPerson[]): Promise<void> {
  const blob = await createS140Docx(programs, congregation, peopleList)
  download(blob, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', `S-140-${programs[0]?.meetingDate ?? 'programacao'}.docx`)
}
