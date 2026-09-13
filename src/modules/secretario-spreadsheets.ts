import JSZip from 'jszip'
import ExcelJS from 'exceljs'
import type { MasterPessoa } from '../types'
import type { SecretaryGroup, SecretaryPublisher, SecretaryReport } from './secretario-domain'

const cleanName = (value: string): string => value.replace(/[\\/:*?"<>|]/g, '-').trim() || 'Sem nome'
const monthLabel = (month: string): string => new Intl.DateTimeFormat('pt-BR', { month:'long', year:'numeric', timeZone:'UTC' }).format(new Date(`${month}-01T00:00:00Z`)).replace(/^./, char => char.toUpperCase())
const number = (value: unknown): number => Math.max(0, Number(value) || 0)
const check = (value: boolean): string => value ? 'X' : ''
const monthsInServiceYear = (startYear: number): string[] => Array.from({ length:12 }, (_, index) => { const date = new Date(Date.UTC(startYear, 8 + index, 1)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}` })

function buildWorkbook(sheetName: string, rows: ExcelJS.CellValue[][], widths: number[], headerRow: number): ExcelJS.Workbook {
  const book = new ExcelJS.Workbook()
  const sheet = book.addWorksheet(sheetName, { views:[{ state:'frozen', ySplit:headerRow }] })
  sheet.addRows(rows)
  sheet.columns = widths.map(width => ({ width }))
  sheet.getRow(1).eachCell(cell => {
    cell.font = { bold:true, size:14, color:{ argb:'FF003F72' } }
  })
  const header = sheet.getRow(headerRow)
  header.height = 22
  header.eachCell(cell => {
    cell.font = { bold:true, color:{ argb:'FFFFFFFF' } }
    cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF003F72' } }
    cell.alignment = { horizontal:'center', vertical:'middle', wrapText:true }
  })
  for (let row = headerRow; row <= sheet.rowCount; row++) {
    sheet.getRow(row).eachCell({ includeEmpty:true }, cell => {
      cell.border = {
        top:{ style:'thin', color:{ argb:'FFB7C6D8' } },
        left:{ style:'thin', color:{ argb:'FFB7C6D8' } },
        bottom:{ style:'thin', color:{ argb:'FFB7C6D8' } },
        right:{ style:'thin', color:{ argb:'FFB7C6D8' } },
      }
      if (row > headerRow) cell.alignment = { vertical:'top', wrapText:true }
    })
  }
  sheet.pageSetup = { orientation:'portrait', paperSize:9, fitToPage:true, fitToWidth:1, fitToHeight:0 }
  sheet.pageSetup.margins = { left:0.3, right:0.3, top:0.5, bottom:0.5, header:0.2, footer:0.2 }
  return book
}

function publisherWorkbook(publisher: SecretaryPublisher, person: MasterPessoa, reports: Record<string, SecretaryReport>, year: number): ExcelJS.Workbook {
  const rows: ExcelJS.CellValue[][] = [[person.name], [], [`Ano de serviço ${year}/${year + 1}`], [], ['Mês', 'Participou', 'Estudos', 'Aux.', 'Horas', 'Atividades aprovadas', 'Observações']]
  const byMonth = new Map(Object.values(reports).filter(report => report.masterId === publisher.masterId).map(report => [report.competencia, report]))
  monthsInServiceYear(year).forEach(month => {
    const report = byMonth.get(month)
    rows.push([monthLabel(month), check(Boolean(report?.participou)), number(report?.estudos) || '', check(Boolean(report?.pioneiroAuxiliar)), number(report?.horasCampo) || '', number(report?.horasAtividadeAprovada) || '', report?.observacoes ?? ''])
  })
  rows.push(['', '', '', 'Total', { formula:'SUM(E6:E17)' }, { formula:'SUM(F6:F17)' }, ''])
  return buildWorkbook('S-21', rows, [20, 13, 11, 10, 11, 23, 42], 5)
}

function totalsWorkbook(title: string, publishers: SecretaryPublisher[], reports: Record<string, SecretaryReport>, year: number): ExcelJS.Workbook {
  const rows: ExcelJS.CellValue[][] = [[title], [], ['Registros totais da congregação'], [], ['Mês', 'Participou', 'Estudos', 'Aux.', 'Horas', 'Relatórios']]
  monthsInServiceYear(year).forEach(month => {
    const items = Object.values(reports).filter(report => report.competencia === month && publishers.some(publisher => publisher.masterId === report.masterId))
    rows.push([monthLabel(month), check(items.some(item => item.participou)), items.reduce((sum, item) => sum + number(item.estudos), 0) || '', check(items.some(item => item.pioneiroAuxiliar)), items.reduce((sum, item) => sum + number(item.horasCampo), 0) || '', items.length || ''])
  })
  rows.push(['', '', '', 'Total', { formula:'SUM(E6:E17)' }, { formula:'SUM(F6:F17)' }])
  return buildWorkbook('Totais', rows, [20, 13, 11, 10, 11, 13], 5)
}

const xlsxBytes = async (book: ExcelJS.Workbook): Promise<Uint8Array> => new Uint8Array(await book.xlsx.writeBuffer() as unknown as ArrayBuffer)

export async function createS21BatchZip(
  publishers: Record<string, SecretaryPublisher>, people: Record<string, MasterPessoa>, groups: Record<string, SecretaryGroup>, reports: Record<string, SecretaryReport>, year: number,
): Promise<Uint8Array> {
  const zip = new JSZip(), active = Object.values(publishers).filter(publisher => publisher.ativo), inactive = Object.values(publishers).filter(publisher => !publisher.ativo)
  const addPublisher = async (publisher: SecretaryPublisher, path: string): Promise<void> => {
    const person = people[publisher.masterId]; if (!person) return
    zip.file(`${path}/${cleanName(person.name)}.xlsx`, await xlsxBytes(publisherWorkbook(publisher, person, reports, year)))
  }
  const publisherJobs = active.map(async publisher => {
    const person = people[publisher.masterId]; if (!person) return
    const pioneers = ['pioneiro_regular', 'pioneiro_especial', 'missionario'].includes(publisher.categoria)
    const path = pioneers ? 'Publicadores ativos/Pioneiros regulares e especiais' : `Publicadores ativos/Outros publicadores/${cleanName(groups[publisher.grupoId]?.nome || 'Sem grupo')}`
    await addPublisher(publisher, path)
  })
  publisherJobs.push(...inactive.map(publisher => addPublisher(publisher, 'Publicadores inativos')))
  await Promise.all(publisherJobs)
  const publicadores = active.filter(item => item.categoria === 'publicador'), auxiliares = active.filter(item => item.categoria === 'pioneiro_auxiliar'), regulares = active.filter(item => ['pioneiro_regular', 'pioneiro_especial', 'missionario'].includes(item.categoria))
  const totals = [
    ['Registros totais da congregação/Publicadores.xlsx', totalsWorkbook('Publicadores', publicadores, reports, year)],
    ['Registros totais da congregação/Pioneiros auxiliares.xlsx', totalsWorkbook('Pioneiros auxiliares', auxiliares, reports, year)],
    ['Registros totais da congregação/Pioneiros regulares e especiais.xlsx', totalsWorkbook('Pioneiros regulares e especiais', regulares, reports, year)],
  ] as const
  await Promise.all(totals.map(async ([path, book]) => zip.file(path, await xlsxBytes(book))))
  const contactRows: ExcelJS.CellValue[][] = [['Nome', 'WhatsApp', 'Categoria', 'Grupo', 'Situação'], ...Object.values(publishers).map(publisher => [people[publisher.masterId]?.name ?? 'Cadastro não encontrado', people[publisher.masterId]?.whatsapp ?? '', publisher.categoria, groups[publisher.grupoId]?.nome ?? 'Sem grupo', publisher.ativo ? 'Ativo' : 'Inativo'])]
  zip.file('Contatos.xlsx', await xlsxBytes(buildWorkbook('Contatos', contactRows, [34, 18, 24, 24, 12], 1)))
  const groupRows: ExcelJS.CellValue[][] = [['Grupo', 'Superintendente', 'Membros ativos'], ...Object.values(groups).map(group => [group.nome, people[group.superintendenteMasterId]?.name ?? '', active.filter(publisher => publisher.grupoId === group.id).map(publisher => people[publisher.masterId]?.name ?? '').filter(Boolean).join(', ')])]
  zip.file('Grupos de serviço.xlsx', await xlsxBytes(buildWorkbook('Grupos', groupRows, [28, 34, 72], 1)))
  return zip.generateAsync({ type:'uint8array', compression:'DEFLATE', compressionOptions:{ level:6 } })
}

export function downloadS21Batch(bytes: Uint8Array, year: number): void {
  const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type:'application/zip' })), link = document.createElement('a'); link.href = url; link.download = `S-21-${year}-${year + 1}.zip`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
