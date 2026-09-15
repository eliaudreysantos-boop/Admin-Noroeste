import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib/cjs/index.js'
import type { MasterPessoa } from '../types'
import { previewPdf } from '../ui/pdf-preview.ts'
import { A4_PORTRAIT, PDF_INK, PDF_LINE, drawPublicPdfHeader } from '../ui/public-pdf-layout.ts'
import type { SecretaryAttendance, SecretaryGroup, SecretaryPublisher, SecretaryReport } from './secretario-domain'

export interface SensitivePublisherFields { nascimento?: string; batismo?: string; ungido?: boolean }

function monthsInServiceYear(startYear: number): string[] {
  return Array.from({ length: 12 }, (_, index) => { const date = new Date(Date.UTC(startYear, 8 + index, 1)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}` })
}
function publisherReports(masterId: string, reports: Record<string, SecretaryReport>, startYear: number): SecretaryReport[] {
  const months = new Set(monthsInServiceYear(startYear)); return Object.values(reports).filter(report => report.masterId === masterId && months.has(report.competencia))
}
function attendanceByMonth(attendance: Record<string, SecretaryAttendance>, kind: SecretaryAttendance['tipo'], serviceYear: number): Array<{ month: string; meetings: number; total: number; average: number }> {
  return monthsInServiceYear(serviceYear).map(month => { const values = Object.values(attendance).filter(item => item.tipo === kind && item.data.startsWith(month)); const total = values.reduce((sum, item) => sum + Math.max(0, item.quantidade || 0), 0); return { month, meetings: values.length, total, average: values.length ? Math.round(total / values.length) : 0 } })
}

function formatDate(value = ''): string {
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

function text(page: PDFPage, font: PDFFont, value: string, x: number, y: number, size = 8): void {
  page.drawText(value.slice(0, 90), { x, y, size, font, color: rgb(0, 0, 0) })
}

function mark(page: PDFPage, font: PDFFont, enabled: boolean, x: number, y: number): void {
  if (enabled) text(page, font, 'X', x, y, 9)
}

export async function createS21(
  template: ArrayBuffer,
  selected: SecretaryPublisher[],
  people: Record<string, MasterPessoa>,
  reports: Record<string, SecretaryReport>,
  serviceYear: number,
  sensitive: Record<string, SensitivePublisherFields>,
): Promise<Uint8Array> {
  const source = await PDFDocument.load(template)
  const output = await PDFDocument.create()
  const regular = await output.embedFont(StandardFonts.Helvetica)
  const bold = await output.embedFont(StandardFonts.HelveticaBold)
  const chunks = selected.reduce<SecretaryPublisher[][]>((all, item, index) => {
    if (index % 2 === 0) all.push([])
    all[all.length - 1]!.push(item)
    return all
  }, [])
  for (const chunk of chunks) {
    const [page] = await output.copyPages(source, [0])
    output.addPage(page)
    chunk.forEach((publisher, index) => {
      const person = people[publisher.masterId]
      if (!person) return
      const base = index === 0 ? 0 : -422
      text(page, bold, person.name, 59, 793 + base, 9)
      text(page, regular, formatDate(sensitive[publisher.masterId]?.nascimento), 126, 779 + base, 8)
      text(page, regular, formatDate(sensitive[publisher.masterId]?.batismo), 105, 765 + base, 8)
      mark(page, bold, person.sex === 'M', 385, 779 + base); mark(page, bold, person.sex === 'F', 486, 779 + base)
      mark(page, bold, !sensitive[publisher.masterId]?.ungido, 385, 765 + base); mark(page, bold, sensitive[publisher.masterId]?.ungido === true, 486, 765 + base)
      mark(page, bold, person.role === 'anciao', 17, 750 + base); mark(page, bold, person.role === 'servo-ministerial', 84, 750 + base)
      mark(page, bold, publisher.categoria === 'pioneiro_regular', 211, 750 + base)
      mark(page, bold, publisher.categoria === 'pioneiro_especial', 332, 750 + base)
      mark(page, bold, publisher.categoria === 'missionario', 457, 750 + base)
      const byMonth = new Map(publisherReports(publisher.masterId, reports, serviceYear).map(report => [report.competencia, report]))
      monthsInServiceYear(serviceYear).forEach((month, monthIndex) => {
        const report = byMonth.get(month); if (!report) return
        const y = 675 + base - monthIndex * 17.7
        mark(page, bold, report.participou, 131, y)
        text(page, regular, report.estudos ? String(report.estudos) : '', 207, y, 8)
        mark(page, bold, report.pioneiroAuxiliar, 273, y)
        text(page, regular, report.horasCampo ? String(report.horasCampo) : '', 347, y, 8)
        const notes = [report.observacoes, report.horasAtividadeAprovada ? `Ativ. aprov.: ${report.horasAtividadeAprovada}h` : '', report.creditoHoras ? `Credito: ${report.creditoHoras}h` : ''].filter(Boolean).join(' | ')
        text(page, regular, notes, 384, y, 7)
      })
    })
  }
  return output.save()
}

export async function createS3(template: ArrayBuffer, congregation: string, competence: string, attendance: Record<string, SecretaryAttendance>): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(template); const page = pdf.getPage(0); const font = await pdf.embedFont(StandardFonts.Helvetica)
  text(page, font, congregation, 94, 147, 8); text(page, font, competence, 244, 147, 8)
  const monthRows = Object.values(attendance).filter(item => item.data.startsWith(competence))
  ;(['meio_semana', 'fim_semana'] as const).forEach((kind, rowIndex) => {
    const values = monthRows.filter(item => item.tipo === kind).sort((a, b) => a.data.localeCompare(b.data)).slice(0, 5)
    const y = rowIndex === 0 ? 97 : 57
    values.forEach((item, index) => text(page, font, String(item.quantidade), 70 + index * 37, y, 9))
    const total = values.reduce((sum, item) => sum + item.quantidade, 0)
    text(page, font, String(total || ''), 255, y, 9); text(page, font, values.length ? String(Math.round(total / values.length)) : '', 291, y, 9)
  })
  return pdf.save()
}

export async function createS88(template: ArrayBuffer, attendance: Record<string, SecretaryAttendance>, serviceYear: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(template); const form = pdf.getForm()
  const fill = (name: string, value: string) => { try { const field = form.getTextField(name); field.setFontSize(8); field.setText(value) } catch { /* template variant */ } }
  ;([['meio_semana', 1], ['fim_semana', 3]] as const).forEach(([kind, prefix]) => {
    fill(`Service Year_${prefix}`, `${serviceYear}/${serviceYear + 1}`)
    const rows = attendanceByMonth(attendance, kind, serviceYear)
    rows.forEach((row, index) => { fill(`${prefix}-Meeting_${index + 1}`, String(row.meetings || '')); fill(`${prefix}-Attendance_${index + 1}`, String(row.total || '')); fill(`${prefix}-Average_${index + 1}`, String(row.average || '')) })
    const used = rows.filter(row => row.meetings); fill(`${prefix}-Average_Total`, used.length ? String(Math.round(used.reduce((sum, row) => sum + row.average, 0) / used.length)) : '')
  })
  form.updateFieldAppearances(await pdf.embedFont(StandardFonts.Helvetica))
  return pdf.save()
}

export function previewSecretaryPdf(bytes: Uint8Array, filename: string): void {
  previewPdf(bytes, filename)
}

function wrapGroupText(font: PDFFont, value: string, size: number, width: number): string[] {
  const lines: string[] = []
  let current = ''
  for (const word of value.trim().split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word
    if (!current || font.widthOfTextAtSize(candidate, size) <= width) current = candidate
    else { lines.push(current); current = word }
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['']
}

function privilegeCode(person: MasterPessoa | undefined): string {
  const role = person?.role === 'anciao' ? 'A' : person?.role === 'servo-ministerial' ? 'SM' : ''
  return person?.role === 'pioneiro' ? 'P' : role
}

export async function createGroupsPdf(
  groupRecords: Record<string, SecretaryGroup>,
  publisherRecords: Record<string, SecretaryPublisher>,
  people: Record<string, MasterPessoa>,
  congregation: string,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create(), regular = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const groups = Object.values(groupRecords).filter(group => group.ativo).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const chunks = groups.length ? Array.from({ length:Math.ceil(groups.length / 4) }, (_, index) => groups.slice(index * 4, (index + 1) * 4)) : [[]]
  for (const chunk of chunks) {
    const page = pdf.addPage(A4_PORTRAIT)
    drawPublicPdfHeader(page, bold, regular, { title:'Grupos de serviço', congregation, margin:38 })
    const gap = 10, width = (519 - gap * 3) / 4
    chunk.forEach((group, column) => {
      const x = 38 + column * (width + gap)
      const headingLines = wrapGroupText(bold, group.nome, 8, width - 10)
      const headingHeight = Math.max(22, headingLines.length * 9 + 8)
      page.drawRectangle({ x, y:742 - headingHeight, width, height:headingHeight, color:PDF_INK, borderColor:PDF_LINE, borderWidth:.5 })
      headingLines.forEach((line, index) => page.drawText(line, { x:x + 5, y:742 - 13 - index * 9, size:8, font:bold, color:rgb(1, 1, 1) }))
      const members = Object.values(publisherRecords).filter(item => item.ativo && item.grupoId === group.id).sort((a, b) => {
        if (a.masterId === group.superintendenteMasterId) return -1
        if (b.masterId === group.superintendenteMasterId) return 1
        return (people[a.masterId]?.name ?? '').localeCompare(people[b.masterId]?.name ?? '', 'pt-BR')
      })
      const prepared = members.map(publisher => { const person = people[publisher.masterId], font = publisher.masterId === group.superintendenteMasterId ? bold : regular; return { publisher, person, font, lines:wrapGroupText(font, person?.name ?? 'Cadastro não encontrado', 7, width - 24) } })
      const totalLines = prepared.reduce((sum, item) => sum + item.lines.length, 0)
      const size = Math.max(5.5, Math.min(7, (680 - headingHeight) / Math.max(1, totalLines) - 1))
      let y = 730 - headingHeight
      prepared.forEach(({ person, font }) => {
        const lines = wrapGroupText(font, person?.name ?? 'Cadastro não encontrado', size, width - 24)
        const code = privilegeCode(person)
        if (y - lines.length * (size + 1.5) < 42) return
        page.drawText(code, { x, y, size:Math.max(5, size - 1), font:regular, color:rgb(.48, .5, .53) })
        lines.forEach((line, lineIndex) => page.drawText(line, { x:x + 19, y:y - lineIndex * (size + 1.5), size, font, color:rgb(.08, .1, .12) }))
        y -= lines.length * (size + 1.5) + 2
      })
    })
  }
  return pdf.save()
}
