import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib/cjs/index.js'
import { speakerName, themeHistory, type Congregation, type Speaker, type Talk, type Theme } from './oradores-domain.ts'
import { agendaToIcs, type AgendaEvent } from './individual-domain.ts'
import { previewPdf } from '../ui/pdf-preview.ts'
import { A4_PORTRAIT as A4, PDF_INK, PDF_LINE, PDF_MUTED, drawPublicPdfHeader } from '../ui/public-pdf-layout.ts'

const MARGIN = 42
const ROW_HEIGHT = 17
const SCHEDULE_COLUMNS = [MARGIN, 78, 207, 418]
const SCHEDULE_COLUMN_WIDTHS = [28, 121, 203, 127]

export interface AvailableSpeakerThemes {
  nome: string
  temas: Array<{ numero: number; titulo: string; ultimoUso: string }>
}

export interface SchedulePdfRow {
  data: string
  tipo: string
  orador: string
  tema: string
  congregacao: string
}

export interface ThemeCatalogRow {
  numero: number
  titulo: string
  ultimoUso: string
  proximos: string
}

export interface GeneratedPdf {
  bytes: Uint8Array
  pages: number
}

type ScheduleTalk = Pick<Talk, 'data' | 'tipo' | 'oradorId' | 'oradorNome' | 'temaNumero' | 'temaTitulo' | 'congregacaoId' | 'congregacaoDestinoId' | 'congregacaoDestinoNome' | 'congregacaoOrigemId' | 'congregacaoOrigemNome'>

export function scheduleRows(entries: Array<[string, ScheduleTalk]>, speakers: Record<string, Speaker>, congregations: Record<string, Congregation>): SchedulePdfRow[] {
  const localName = Object.values(congregations).find(congregation => congregation.tipo === 'local')?.nome?.trim() || 'Noroeste'
  return entries.map(([id, talk]) => {
    const speaker = talk.oradorId ? speakers[talk.oradorId] : undefined
    const congregationId = talk.tipo === 'saida_orador' ? talk.congregacaoDestinoId ?? talk.congregacaoId : talk.congregacaoOrigemId ?? talk.congregacaoId
    return { data: talk.data ?? '', tipo: talk.tipo ?? '', orador: talk.oradorNome ?? speakerName(speaker, talk.oradorId ?? ''), tema: talk.temaNumero ? `${talk.temaNumero} ${talk.temaTitulo ?? ''}`.trim() : talk.temaTitulo ?? '', congregacao: talk.tipo === 'discurso_local' ? localName : congregations[congregationId ?? '']?.nome ?? (talk.tipo === 'saida_orador' ? talk.congregacaoDestinoNome ?? '' : talk.congregacaoOrigemNome ?? ''), id }
  })
}

export function scheduleToAgendaEvents(congregation: string, rows: Array<SchedulePdfRow & { id?: string }>): AgendaEvent[] {
  return rows.filter(row => Boolean(row.data)).map((row, index) => ({
    id: `oradores:${row.id ?? `${row.data}-${index}`}`,
    source: 'oradores',
    date: row.data,
    title: row.tipo === 'saida_orador' ? 'Discurso em outra congregação' : row.tipo === 'discurso_visitante' ? 'Discurso público com visitante' : 'Discurso público local',
    detail: [row.orador, row.tema].filter(Boolean).join(' · ') || 'Programação de oradores',
    location: row.congregacao || congregation,
    status: 'futuro',
  }))
}

export function downloadScheduleIcs(params: { congregation: string; rows: Array<SchedulePdfRow & { id?: string }> }): void {
  const blob = new Blob([agendaToIcs(scheduleToAgendaEvents(params.congregation, params.rows), new Date().toISOString())], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'calendario-oradores.ics'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function formatMonthYear(value: string): string {
  if (!value) return 'Nunca'
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' })
    .format(date)
    .replace('.', '')
}

function wrapText(font: PDFFont, value: string, size: number, width: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean).flatMap(word => {
    const pieces: string[] = []
    let piece = ''
    for (const character of word) {
      if (piece && font.widthOfTextAtSize(piece + character, size) > width) {
        pieces.push(piece)
        piece = ''
      }
      piece += character
    }
    if (piece) pieces.push(piece)
    return pieces
  })
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (line && font.widthOfTextAtSize(candidate, size) > width) {
      lines.push(line)
      line = word
    } else line = candidate
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

function drawHeader(page: PDFPage, bold: PDFFont, regular: PDFFont, congregacao: string, title = 'TEMAS DISPONIVEIS'): number {
  return drawPublicPdfHeader(page, bold, regular, { title, congregation:congregacao, margin:MARGIN })
}

export function availableSpeakerThemes(params: {
  speakers: Record<string, Speaker>
  themes: Record<string, Theme>
  talks: Record<string, Talk>
  today: string
}): AvailableSpeakerThemes[] {
  const history = themeHistory(params.talks, params.today)
  return Object.entries(params.speakers)
    .filter(([, speaker]) => speaker.tipo === 'local' && speaker.ativo !== false)
    .map(([id, speaker]) => ({
      nome: speakerName(speaker, id),
      temas: (speaker.temaIds ?? [])
        .map(themeId => ({ themeId, theme: params.themes[themeId] }))
        .filter((entry): entry is { themeId: string; theme: Theme } => Boolean(entry.theme))
        .filter(({ themeId }) => {
          const usage = history[themeId]
          return !usage?.lastPerformed && !(usage?.future.length)
        })
        .map(({ themeId, theme }) => ({
          numero: Number(theme.numero ?? 0),
          titulo: String(theme.titulo ?? '').trim(),
          ultimoUso: formatMonthYear(history[themeId]?.lastPerformed ?? ''),
        }))
        .filter(theme => theme.numero > 0 && Boolean(theme.titulo))
        .sort((a, b) => a.numero - b.numero),
    }))
    .filter(entry => entry.temas.length > 0)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

export async function createAvailableThemesPdf(params: {
  congregation: string
  entries: AvailableSpeakerThemes[]
}): Promise<GeneratedPdf> {
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  let page!: PDFPage
  let y = 0

  const addPage = () => {
    page = pdf.addPage(A4)
    y = drawHeader(page, bold, regular, params.congregation || 'Congregacao')
  }
  addPage()

  for (const entry of params.entries) {
    const rows = entry.temas.flatMap(theme => wrapText(regular, `${String(theme.numero).padStart(3, '0')}  ${theme.titulo}`, 10, 385).map((line, index) => ({ line, ultimoUso: index === 0 ? theme.ultimoUso : '' })))
    const groupHeight = 22 + rows.length * ROW_HEIGHT + 12
    if (y - groupHeight < MARGIN) addPage()

    page.drawText(entry.nome, { x: MARGIN, y, size: 11, font: bold, color: rgb(.08, .1, .14) })
    y -= 18
    for (const row of rows) {
      page.drawText(row.line, { x: MARGIN + 8, y, size: 10, font: regular })
      if (row.ultimoUso) page.drawText(row.ultimoUso, { x: 456, y, size: 9, font: regular, color: rgb(.32, .34, .38) })
      y -= ROW_HEIGHT
    }
    y -= 8
  }

  if (params.entries.length === 0) {
    page.drawText('Nenhum orador com tema disponivel.', { x: MARGIN, y, size: 11, font: regular })
  }

  return { bytes:Uint8Array.from(await pdf.save()), pages:pdf.getPageCount() }
}

export async function downloadAvailableThemesPdf(params: {
  congregation: string
  entries: AvailableSpeakerThemes[]
}): Promise<void> {
  const result = await createAvailableThemesPdf(params)
  previewPdf(result.bytes, 'temas-disponiveis.pdf', 'Previa dos temas disponiveis')
}

export function formatScheduleDay(value: string): string {
  const match = /^\d{4}-\d{2}-(\d{2})$/.exec(value)
  return match?.[1] ?? value
}

function scheduleMonthLabel(value: string): string {
  const date = new Date(`${value}-01T12:00:00`)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('pt-BR', { month:'long', year:'numeric' }).format(date)
}

function drawScheduleRows(page: PDFPage, regular: PDFFont, bold: PDFFont, title: string, rows: string[][][], y: number): number {
  page.drawText(title, { x: MARGIN, y, size: 12, font: bold, color: PDF_INK })
  y -= 20
  ;['Dia', 'Orador', 'Tema', 'Congregação'].forEach((label, index) => page.drawText(label, { x: SCHEDULE_COLUMNS[index], y, size: 8, font: bold, color: PDF_MUTED }))
  y -= 12
  page.drawLine({ start: { x: MARGIN, y }, end: { x: A4[0] - MARGIN, y }, thickness: .5, color: PDF_LINE })
  y -= 13
  if (!rows.length) {
    page.drawText('Nenhum item neste período.', { x: MARGIN, y, size: 8.5, font: regular, color: rgb(.32, .34, .38) })
    y -= 15
    page.drawLine({ start: { x: MARGIN, y }, end: { x: A4[0] - MARGIN, y }, thickness: .35, color: rgb(.78, .79, .81) })
    return y - 10
  }
  for (const lines of rows) {
    const lineCount = Math.max(...lines.map(linesForCell => linesForCell.length))
    for (let line = 0; line < lineCount; line += 1) {
      lines.forEach((linesForCell, index) => {
        if (linesForCell[line]) page.drawText(linesForCell[line], { x: SCHEDULE_COLUMNS[index], y, size: 8.5, font: regular })
      })
      y -= 11
    }
    y -= 3
    page.drawLine({ start: { x: MARGIN, y }, end: { x: A4[0] - MARGIN, y }, thickness: .35, color: rgb(.78, .79, .81) })
    y -= 11
  }
  return y
}

export async function createSchedulePdf(params: {
  congregation: string
  periodLabel: string
  rows: SchedulePdfRow[]
}): Promise<GeneratedPdf> {
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const locais = params.rows.filter(row => row.tipo !== 'saida_orador')
  const saidas = params.rows.filter(row => row.tipo === 'saida_orador')
  const saidasPorMes = new Map<string, SchedulePdfRow[]>()
  saidas.forEach(row => {
    const month = /^\d{4}-\d{2}/.exec(row.data)?.[0] ?? params.periodLabel
    saidasPorMes.set(month, [...(saidasPorMes.get(month) ?? []), row])
  })
  const sections: Array<[string, SchedulePdfRow[]]> = [['Local e visitantes', locais]]
  if (saidasPorMes.size) {
    saidasPorMes.forEach((rows, month) => sections.push([`Saídas - ${scheduleMonthLabel(month)}`, rows]))
  } else sections.push(['Saídas', []])
  let page!: PDFPage
  let y = 0
  const addPage = () => {
    page = pdf.addPage(A4)
    y = drawHeader(page, bold, regular, params.congregation || 'Congregacao', 'PROGRAMAÇÃO DE ORADORES')
    page.drawText(params.periodLabel.toLocaleUpperCase('pt-BR'), { x: MARGIN, y, size: 11, font: bold, color: rgb(.08, .1, .14) })
    y -= 28
  }
  addPage()

  for (const [title, rows] of sections) {
    const prepared = rows.flatMap(row => {
      const cells = [formatScheduleDay(row.data), row.orador || '—', row.tema || '—', row.congregacao || '—']
      const lines = cells.map((value, index) => wrapText(regular, value, 8.5, SCHEDULE_COLUMN_WIDTHS[index]))
      const count = Math.max(...lines.map(cell => cell.length))
      return Array.from({ length:Math.ceil(count / 45) }, (_, index) => lines.map(cell => cell.slice(index * 45, (index + 1) * 45)))
    })
    let chunk: string[][][] = []
    let height = 45
    let continuation = false
    const flush = () => {
      y = drawScheduleRows(page, regular, bold, continuation ? `${title} (continuação)` : title, chunk, y) - 12
      continuation = true
      chunk = []
      height = 45
    }
    for (const lines of prepared) {
      const rowHeight = Math.max(...lines.map(cell => cell.length)) * 11 + 14
      if (y - height - rowHeight - 12 < MARGIN) {
        if (chunk.length) flush()
        addPage()
      }
      chunk.push(lines)
      height += rowHeight
    }
    if (!prepared.length && y - 82 < MARGIN) addPage()
    flush()
  }

  return { bytes:Uint8Array.from(await pdf.save()), pages:pdf.getPageCount() }
}

export async function downloadSchedulePdf(params: {
  congregation: string
  periodLabel: string
  rows: SchedulePdfRow[]
}): Promise<void> {
  const result = await createSchedulePdf(params)
  const filename = `programacao-oradores-${params.periodLabel}.pdf`
  previewPdf(result.bytes, filename, 'Previa da programacao de oradores')
}

export async function createThemeCatalogPdf(params: {
  congregation: string
  rows: ThemeCatalogRow[]
}): Promise<GeneratedPdf> {
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  let page!: PDFPage
  let y = 0
  let count = 0
  const columns = [MARGIN, 82, 326, 428]
  const addPage = () => {
    page = pdf.addPage(A4)
    count = 0
    y = drawHeader(page, bold, regular, params.congregation || 'Congregacao')
    page.drawText('CATÁLOGO DE TEMAS', { x: MARGIN, y, size: 12, font: bold, color: rgb(.08, .1, .14) })
    y -= 22
    ;['Nº', 'Título', 'Último uso', 'Próximos'].forEach((label, column) => page.drawText(label, { x: columns[column], y, size: 8, font: bold, color: rgb(.32, .34, .38) }))
    y -= 14
  }
  addPage()
  for (const row of params.rows) {
    const cells = [String(row.numero).padStart(3, '0'), row.titulo, row.ultimoUso || 'Nunca', row.proximos || '—']
      .map((value, index) => wrapText(regular, value, 9, [34, 230, 94, 120][index]))
    const lineCount = Math.max(...cells.map(cell => cell.length))
    for (let offset = 0; offset < lineCount; offset += 45) {
      const lines = cells.map(cell => cell.slice(offset, offset + 45))
      const height = Math.max(...lines.map(cell => cell.length)) * 10 + 14
      if (count >= 22 || y - height < MARGIN) addPage()
      lines.forEach((cell, column) => cell.forEach((line, index) => page.drawText(line, { x:columns[column], y:y - index * 10, size:9, font:regular })))
      y -= height
      page.drawLine({ start:{ x:MARGIN, y:y + 10 }, end:{ x:A4[0] - MARGIN, y:y + 10 }, thickness:.35, color:rgb(.78, .79, .81) })
      count += 1
    }
  }
  if (!params.rows.length) page.drawText('Nenhum tema cadastrado.', { x:MARGIN, y, size:10, font:regular })
  return { bytes:Uint8Array.from(await pdf.save()), pages:pdf.getPageCount() }
}

export async function downloadThemeCatalogPdf(params: {
  congregation: string
  rows: ThemeCatalogRow[]
}): Promise<void> {
  const result = await createThemeCatalogPdf(params)
  previewPdf(result.bytes, 'catalogo-de-temas.pdf', 'Previa do catalogo de temas')
}
