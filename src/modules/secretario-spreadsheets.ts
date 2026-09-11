import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import type { MasterPessoa } from '../types'
import type { SecretaryGroup, SecretaryPublisher, SecretaryReport } from './secretario-domain'

const cleanName = (value: string): string => value.replace(/[\\/:*?"<>|]/g, '-').trim() || 'Sem nome'
const monthLabel = (month: string): string => new Intl.DateTimeFormat('pt-BR', { month:'long', year:'numeric', timeZone:'UTC' }).format(new Date(`${month}-01T00:00:00Z`)).replace(/^./, char => char.toUpperCase())
const number = (value: unknown): number => Math.max(0, Number(value) || 0)
const check = (value: boolean): string => value ? 'X' : ''
const monthsInServiceYear = (startYear: number): string[] => Array.from({ length:12 }, (_, index) => { const date = new Date(Date.UTC(startYear, 8 + index, 1)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}` })

function styleSheet(sheet: XLSX.WorkSheet, widths: number[]): void {
  sheet['!cols'] = widths.map(width => ({ wch: width }))
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:A1')
  for (let column = range.s.c; column <= range.e.c; column++) {
    const cell = sheet[XLSX.utils.encode_cell({ r:4, c:column })]
    if (cell) cell.s = { font:{ bold:true, color:{ rgb:'FFFFFF' } }, fill:{ fgColor:{ rgb:'003F72' } }, alignment:{ horizontal:'center' } }
  }
  for (let column = range.s.c; column <= range.e.c; column++) {
    const cell = sheet[XLSX.utils.encode_cell({ r:0, c:column })]
    if (cell) cell.s = { font:{ bold:true, sz:14, color:{ rgb:'003F72' } } }
  }
}

function publisherWorkbook(publisher: SecretaryPublisher, person: MasterPessoa, reports: Record<string, SecretaryReport>, year: number): XLSX.WorkBook {
  const rows: unknown[][] = [[person.name], [], [`Ano de serviço ${year}/${year + 1}`], [], ['Mês', 'Participou', 'Estudos', 'Aux.', 'Horas', 'Atividades aprovadas', 'Observações']]
  const byMonth = new Map(Object.values(reports).filter(report => report.masterId === publisher.masterId).map(report => [report.competencia, report]))
  monthsInServiceYear(year).forEach(month => {
    const report = byMonth.get(month)
    rows.push([monthLabel(month), check(Boolean(report?.participou)), number(report?.estudos) || '', check(Boolean(report?.pioneiroAuxiliar)), number(report?.horasCampo) || '', number(report?.horasAtividadeAprovada) || '', report?.observacoes ?? ''])
  })
  rows.push(['', '', '', 'Total', { f:'SUM(E6:E17)' }, { f:'SUM(F6:F17)' }, ''])
  const sheet = XLSX.utils.aoa_to_sheet(rows); styleSheet(sheet, [20, 13, 11, 10, 11, 23, 42])
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'S-21'); return book
}

function totalsWorkbook(title: string, publishers: SecretaryPublisher[], reports: Record<string, SecretaryReport>, year: number): XLSX.WorkBook {
  const rows: unknown[][] = [[title], [], ['Registros totais da congregação'], [], ['Mês', 'Participou', 'Estudos', 'Aux.', 'Horas', 'Relatórios']]
  monthsInServiceYear(year).forEach(month => {
    const items = Object.values(reports).filter(report => report.competencia === month && publishers.some(publisher => publisher.masterId === report.masterId))
    rows.push([monthLabel(month), check(items.some(item => item.participou)), items.reduce((sum, item) => sum + number(item.estudos), 0) || '', check(items.some(item => item.pioneiroAuxiliar)), items.reduce((sum, item) => sum + number(item.horasCampo), 0) || '', items.length || ''])
  })
  rows.push(['', '', '', 'Total', { f:'SUM(E6:E17)' }, { f:'SUM(F6:F17)' }])
  const sheet = XLSX.utils.aoa_to_sheet(rows); styleSheet(sheet, [20, 13, 11, 10, 11, 13])
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Totais'); return book
}

const xlsxBytes = (book: XLSX.WorkBook): Uint8Array => XLSX.write(book, { bookType:'xlsx', type:'array', cellStyles:true }) as Uint8Array

export async function createS21BatchZip(
  publishers: Record<string, SecretaryPublisher>, people: Record<string, MasterPessoa>, groups: Record<string, SecretaryGroup>, reports: Record<string, SecretaryReport>, year: number,
): Promise<Uint8Array> {
  const zip = new JSZip(), active = Object.values(publishers).filter(publisher => publisher.ativo), inactive = Object.values(publishers).filter(publisher => !publisher.ativo)
  const addPublisher = (publisher: SecretaryPublisher, path: string): void => {
    const person = people[publisher.masterId]; if (!person) return
    zip.file(`${path}/${cleanName(person.name)}.xlsx`, xlsxBytes(publisherWorkbook(publisher, person, reports, year)))
  }
  active.forEach(publisher => {
    const person = people[publisher.masterId]; if (!person) return
    const pioneers = ['pioneiro_regular', 'pioneiro_especial', 'missionario'].includes(publisher.categoria)
    const path = pioneers ? 'Publicadores ativos/Pioneiros regulares e especiais' : `Publicadores ativos/Outros publicadores/${cleanName(groups[publisher.grupoId]?.nome || 'Sem grupo')}`
    addPublisher(publisher, path)
  })
  inactive.forEach(publisher => addPublisher(publisher, 'Publicadores inativos'))
  const publicadores = active.filter(item => item.categoria === 'publicador'), auxiliares = active.filter(item => item.categoria === 'pioneiro_auxiliar'), regulares = active.filter(item => ['pioneiro_regular', 'pioneiro_especial', 'missionario'].includes(item.categoria))
  zip.file('Registros totais da congregação/Publicadores.xlsx', xlsxBytes(totalsWorkbook('Publicadores', publicadores, reports, year)))
  zip.file('Registros totais da congregação/Pioneiros auxiliares.xlsx', xlsxBytes(totalsWorkbook('Pioneiros auxiliares', auxiliares, reports, year)))
  zip.file('Registros totais da congregação/Pioneiros regulares e especiais.xlsx', xlsxBytes(totalsWorkbook('Pioneiros regulares e especiais', regulares, reports, year)))
  const contactRows = [['Nome', 'WhatsApp', 'Categoria', 'Grupo', 'Situação'], ...Object.values(publishers).map(publisher => [people[publisher.masterId]?.name ?? 'Cadastro não encontrado', people[publisher.masterId]?.whatsapp ?? '', publisher.categoria, groups[publisher.grupoId]?.nome ?? 'Sem grupo', publisher.ativo ? 'Ativo' : 'Inativo'])]
  const contacts = XLSX.utils.aoa_to_sheet(contactRows); styleSheet(contacts, [34, 18, 24, 24, 12]); const contactBook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(contactBook, contacts, 'Contatos'); zip.file('Contatos.xlsx', xlsxBytes(contactBook))
  const groupRows = [['Grupo', 'Superintendente', 'Membros ativos'], ...Object.values(groups).map(group => [group.nome, people[group.superintendenteMasterId]?.name ?? '', active.filter(publisher => publisher.grupoId === group.id).map(publisher => people[publisher.masterId]?.name ?? '').filter(Boolean).join(', ')])]
  const groupSheet = XLSX.utils.aoa_to_sheet(groupRows); styleSheet(groupSheet, [28, 34, 72]); const groupBook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(groupBook, groupSheet, 'Grupos'); zip.file('Grupos de serviço.xlsx', xlsxBytes(groupBook))
  return zip.generateAsync({ type:'uint8array', compression:'DEFLATE', compressionOptions:{ level:6 } })
}

export function downloadS21Batch(bytes: Uint8Array, year: number): void {
  const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type:'application/zip' })), link = document.createElement('a'); link.href = url; link.download = `S-21-${year}-${year + 1}.zip`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
