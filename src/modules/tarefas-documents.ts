import { TASK_ROLES, TASK_ROLE_LABELS, assignmentForRole, personName, roleApplies, type TaskMeeting, type TaskPerson } from './tarefas-domain'
import { formatTaskDate, paginateItems, rowsPerPrintPage } from './tarefas-output'

const MIN_PT = 8, MAX_PT = 22
const A4_WIDTH = ((210 - 16) / 25.4) * 96
const A4_HEIGHT = ((297 - 16) / 25.4) * 96
const esc = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]!)

function assignmentName(value: unknown, people: Record<string, TaskPerson>): string {
  if (typeof value === 'string') return people[value] ? personName(people[value], value) : value
  if (!value || typeof value !== 'object') return ''
  const item = value as Record<string, unknown>
  const direct = item['name'] ?? item['nome'] ?? item['label']
  if (typeof direct === 'string' && direct.trim()) return direct
  const id = item['personId'] ?? item['pessoaId'] ?? item['peopleId'] ?? item['id']
  return typeof id === 'string' ? (people[id] ? personName(people[id], id) : id) : ''
}

export function taskPrintHtml(meetings: TaskMeeting[], congregation: string, people: Record<string, TaskPerson>, pageSize = meetings.length): string {
  const last = meetings[meetings.length - 1]
  return paginateItems(meetings, pageSize).map((page, index, pages) => `<div class="tarefas-print-page"><header class="tarefas-print-header"><div><div class="tarefas-print-title">Escala de Tarefas</div><div class="tarefas-print-subtitle">${esc(congregation)}</div></div><div class="tarefas-print-period">${formatTaskDate(meetings[0]?.date)} - ${formatTaskDate(last?.date)}${pages.length > 1 ? ` · ${index + 1}/${pages.length}` : ''}</div></header><div class="tarefas-print-meetings">${page.map(meeting => { const roles = TASK_ROLES.filter(role => roleApplies(role, meeting)); return `<section class="tarefas-print-meeting"><h2>${formatTaskDate(meeting.date)} · ${meeting.type === 'midweek' ? 'Meio de semana' : 'Fim de semana'}</h2><table class="tarefas-print-table"><tbody>${roles.map(role => `<tr><th>${esc(TASK_ROLE_LABELS[role])}</th><td>${esc(assignmentName(assignmentForRole(meeting, role), people))}</td></tr>`).join('')}</tbody></table></section>` }).join('')}</div></div>`).join('')
}

export function printTaskSchedule(meetings: TaskMeeting[], congregation: string, people: Record<string, TaskPerson>, preferredFontPt: number): number {
  const doc = document.createElement('div'); doc.className = 'tarefas-print-doc'; doc.innerHTML = taskPrintHtml(meetings, congregation, people); document.body.appendChild(doc)
  let chosen = Math.min(MAX_PT, Math.max(MIN_PT, Math.round(preferredFontPt))), fitsHeight = false
  doc.dataset['measuring'] = 'true'
  for (let size = chosen; size >= MIN_PT; size -= 1) { doc.style.fontSize = `${size}pt`; chosen = size; const fitsWidth = doc.scrollWidth <= A4_WIDTH; fitsHeight = doc.scrollHeight <= A4_HEIGHT; if (fitsWidth && fitsHeight) break }
  if (!fitsHeight) { const header = doc.querySelector<HTMLElement>('.tarefas-print-header')?.offsetHeight ?? 0, tableHeader = doc.querySelector<HTMLElement>('thead')?.offsetHeight ?? 0, rows = [...doc.querySelectorAll<HTMLElement>('tbody tr')], rowHeight = Math.max(1, ...rows.map(row => row.offsetHeight)); doc.innerHTML = taskPrintHtml(meetings, congregation, people, rowsPerPrintPage(A4_HEIGHT, header, tableHeader, rowHeight)) }
  delete doc.dataset['measuring']; doc.dataset['printing'] = 'true'; doc.style.fontSize = `${chosen}pt`
  const cleanup = () => { window.removeEventListener('afterprint', cleanup); doc.remove() }
  window.addEventListener('afterprint', cleanup); window.print(); setTimeout(cleanup, 2000)
  return chosen
}
