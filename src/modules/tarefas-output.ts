export function formatTaskDate(value: string | undefined): string {
  if (!value) return 'Sem data'
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

export function rowsPerPrintPage(pageHeight: number, headerHeight: number, tableHeaderHeight: number, rowHeight: number): number {
  if (![pageHeight, headerHeight, tableHeaderHeight, rowHeight].every(Number.isFinite) || rowHeight <= 0) return 1
  return Math.max(1, Math.floor((pageHeight - headerHeight - tableHeaderHeight - 12) / rowHeight))
}

export function paginateItems<T>(items: T[], pageSize: number): T[][] {
  const size = Math.max(1, Math.floor(pageSize))
  const pages: T[][] = []
  for (let index = 0; index < items.length; index += size) pages.push(items.slice(index, index + size))
  return pages
}
