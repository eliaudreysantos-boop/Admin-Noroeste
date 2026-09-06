import { child } from 'firebase/database'
import type { AppContext, RawPessoas } from '../types'
import { escalaRef, get, pessoasRef, update } from '../firebase'
import { renderMenuCards, type ItemMenu } from '../ui/menu-cards'
import {
  ESCALA_RULE_LABELS, activeDates, analyzeCell, availabilityKey, generateAll,
  isBlocked, localSlots, participantName, validatePair,
  type EscalaAvailability, type EscalaBlocks, type EscalaGenerationInput,
  type EscalaLocal, type EscalaParticipant, type EscalaTable, type EscalaTables,
} from './escala-domain'
import {
  assignmentsForDay, assignmentsForPerson, confirmationMessage, dayLabel, dayMessage,
  monthLabel, personMessage, printRowsForLocal,
} from './escala-output'

type Tab = 'indice' | 'participantes' | 'disponibilidade' | 'escalaAtual' | 'mensagens' | 'pendencias' | 'config'
type Participants = Record<string, EscalaParticipant>
type Locals = Record<string, EscalaLocal>
interface Settings { groupWhatsAppLink?: string; printFontPt?: number }
interface Greetings { date?: string; participant?: string; confirm?: string }
interface Data {
  participants?: Participants; scales?: Locals; availability?: EscalaAvailability
  tables?: EscalaTables; monthSlotBlocks?: EscalaBlocks; monthExclusions?: Record<string, string[]>
  settings?: Settings; greetings?: Greetings; publishedMonth?: string; editingMonth?: string
}

let context: AppContext
let participants: Participants = {}, pessoas: RawPessoas = {}, locals: Locals = {}
let availability: EscalaAvailability = {}, tables: EscalaTables = {}, blocks: EscalaBlocks = {}
let exclusions: Record<string, string[]> = {}, settings: Settings = {}, greetings: Greetings = {}
let publishedMonth = '', selectedMonth = monthNow(), selectedLocalId = '', selectedParticipantId = ''
let tab: Tab = 'indice'

const root = () => document.getElementById('escalaContent')!
const orderedLocals = () => Object.entries(locals).sort((a, b) => Number(a[1].sortOrder ?? 0) - Number(b[1].sortOrder ?? 0))
const orderedPeople = (active = false) => Object.entries(participants).filter(([, p]) => !active || p.active !== false).sort((a, b) => name(a[0]).localeCompare(name(b[0]), 'pt-BR'))
const name = (id: string) => participantName(participants[id], id)
const now = () => new Date().toISOString()

function monthNow(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}
function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]!)
}
function toast(message: string): void {
  const element = document.getElementById('toast'); if (!element) return
  element.textContent = message; element.classList.add('show')
  setTimeout(() => element.classList.remove('show'), 3200)
}
function input(localId = selectedLocalId): EscalaGenerationInput {
  return { month: selectedMonth, localId, local: locals[localId], participants, availability, tables, blocks, exclusions: exclusions[selectedMonth] ?? [] }
}

export default function mount(ctx: AppContext): void {
  context = ctx; tab = 'indice'; selectedLocalId = ''; selectedParticipantId = ''
  document.getElementById('appContent')!.innerHTML = '<div id="escalaRoot"><div id="escalaContent"></div></div>'
  void load()
}
async function load(): Promise<void> {
  root().innerHTML = '<p class="empty-state">Carregando Escala...</p>'
  try {
    const [snap, peopleSnap] = await Promise.all([get(escalaRef), get(pessoasRef)])
    const data = snap.exists() ? snap.val() as Data : {}
    participants = data.participants ?? {}; locals = data.scales ?? {}; availability = data.availability ?? {}
    tables = data.tables ?? {}; blocks = data.monthSlotBlocks ?? {}; exclusions = data.monthExclusions ?? {}
    settings = data.settings ?? {}; greetings = data.greetings ?? {}; publishedMonth = data.publishedMonth ?? ''
    selectedMonth = /^\d{4}-\d{2}$/.test(data.editingMonth ?? '') ? data.editingMonth! : monthNow()
    pessoas = peopleSnap.exists() ? peopleSnap.val() as RawPessoas : {}
    selectedLocalId = orderedLocals()[0]?.[0] ?? ''; selectedParticipantId = orderedPeople(true)[0]?.[0] ?? ''
  } catch (error) { console.error(error); toast('Não foi possível carregar a Escala') }
  render()
}
function go(next: Tab): void { tab = next; render() }
function render(): void {
  if (tab === 'indice') renderIndex()
  else if (tab === 'participantes') renderParticipants()
  else if (tab === 'disponibilidade') renderAvailability()
  else if (tab === 'escalaAtual') renderScale()
  else if (tab === 'mensagens') renderMessages()
  else if (tab === 'pendencias') renderPending()
  else renderConfig()
}
function renderIndex(): void {
  root().innerHTML = '<div style="margin-bottom:14px"><h2 style="font-size:1.05rem;color:#1A6B3C">Escala</h2></div><div id="escalaMenu"></div>'
  const items: ItemMenu[] = [
    { id: 'participantes', titulo: 'Participantes', subtitulo: 'Cadastro e regras de participação', icone: '♙', corFundo: '#1A6B3C' },
    { id: 'disponibilidade', titulo: 'Disponibilidade', subtitulo: 'Dias, locais e horários disponíveis', icone: '◫', corFundo: '#006EB6' },
    { id: 'escalaAtual', titulo: 'Escala do mês', subtitulo: 'Gerar, revisar, editar e publicar', icone: '▣', corFundo: '#003F72' },
    { id: 'mensagens', titulo: 'Mensagens', subtitulo: 'Pessoa, dia e confirmação', icone: '✉', corFundo: '#7E3AF2' },
    { id: 'pendencias', titulo: 'Pendências', subtitulo: 'Conflitos e dados que precisam de atenção', icone: '!', corFundo: '#B3261E' },
    { id: 'config', titulo: 'Configuração', subtitulo: 'Textos, WhatsApp e impressão', icone: '⚙', corFundo: '#5C6062' },
  ]
  renderMenuCards(root().querySelector<HTMLElement>('#escalaMenu')!, items, id => go(id as Tab))
}

function periodControls(local = true): string {
  return `<div class="module-form-grid" style="margin-bottom:12px"><div class="form-group"><label class="form-label">Período</label><input id="eMonth" class="form-input" type="month" value="${selectedMonth}"></div>${local ? `<div class="form-group"><label class="form-label">Local</label><select id="eLocal" class="form-select">${orderedLocals().map(([id, l]) => `<option value="${esc(id)}" ${id === selectedLocalId ? 'selected' : ''}>${esc(l.name ?? id)}</option>`).join('')}</select></div>` : ''}</div>`
}
function bindPeriod(rerender: () => void): void {
  document.getElementById('eMonth')?.addEventListener('change', event => {
    const value = (event.target as HTMLInputElement).value
    if (/^\d{4}-\d{2}$/.test(value)) { selectedMonth = value; void update(escalaRef, { editingMonth: value }); rerender() }
  })
  document.getElementById('eLocal')?.addEventListener('change', event => { selectedLocalId = (event.target as HTMLSelectElement).value; rerender() })
}

function renderParticipants(): void {
  const unlinked = orderedPeople().filter(([, p]) => !p.masterId).length
  root().innerHTML = `${unlinked ? `<div class="notice warning">${unlinked} participante(s) sem vínculo com o cadastro do Admin.</div>` : ''}<div style="display:flex;gap:8px;margin-bottom:12px"><input id="pSearch" class="form-input" type="search" placeholder="Buscar participante" style="flex:1"><button id="pNew" class="btn btn-primary" type="button">Adicionar</button></div><div id="pList" class="module-option-list"></div>`
  const list = () => {
    const term = (document.getElementById('pSearch') as HTMLInputElement).value.trim().toLocaleLowerCase('pt-BR')
    document.getElementById('pList')!.innerHTML = orderedPeople().filter(([id]) => name(id).toLocaleLowerCase('pt-BR').includes(term)).map(([id, p]) => {
      const count = Object.values(availability).reduce((sum, byPerson) => sum + Object.values(byPerson[id] ?? {}).filter(Boolean).length, 0)
      const details = [p.active === false ? 'Inativo' : 'Ativo', p.pioneer ? 'Pioneiro' : '', p.capPerMonth ? `Máx. ${p.capPerMonth}/mês` : '', p.onlyWithId ? `Só com ${name(p.onlyWithId)}` : '', `${count} horários`].filter(Boolean).join(' · ')
      return `<button class="module-menu-btn" type="button" data-person="${esc(id)}"><div class="mod-icon" style="background:#1A6B3C20;color:#1A6B3C">${esc(name(id).charAt(0).toUpperCase())}</div><div><div class="mod-label">${esc(name(id))}</div><div class="mod-desc">${esc(details)}</div></div></button>`
    }).join('') || '<p class="empty-state">Nenhum participante encontrado.</p>'
    document.querySelectorAll<HTMLButtonElement>('[data-person]').forEach(button => button.addEventListener('click', () => participantModal(button.dataset['person']!)))
  }
  list(); document.getElementById('pSearch')!.addEventListener('input', list); document.getElementById('pNew')!.addEventListener('click', () => participantModal(''))
}
function participantModal(id: string): void {
  const p = participants[id] ?? { active: true, sex: 'M' }
  const overlay = document.createElement('div'); overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal"><h2>${id ? 'Editar participante' : 'Novo participante'}</h2><div class="form-group"><label class="form-label">Nome</label><input id="pmName" class="form-input" maxlength="80" value="${esc(p.name ?? '')}"></div><div class="module-form-grid"><div class="form-group"><label class="form-label">Sexo</label><select id="pmSex" class="form-select"><option value="M">Masculino</option><option value="F" ${p.sex === 'F' ? 'selected' : ''}>Feminino</option></select></div><div class="form-group"><label class="form-label">WhatsApp</label><input id="pmPhone" class="form-input" value="${esc(p.phone ?? '')}"></div><div class="form-group"><label class="form-label">Máximo/mês (0 sem limite)</label><input id="pmCap" class="form-input" type="number" min="0" max="99" value="${Number(p.capPerMonth ?? 0)}"></div><div class="form-group"><label class="form-label">Participa a partir de</label><input id="pmStart" class="form-input" type="date" value="${esc(p.startFromDate ?? '')}"></div><div class="form-group"><label class="form-label">Referência da folga</label><input id="pmFolga" class="form-input" type="date" value="${esc(p.refFolgaDate ?? '')}"></div><div class="form-group"><label class="form-label">Só participa com</label><select id="pmOnly" class="form-select"><option value="">Sem restrição</option>${orderedPeople(true).filter(([other]) => other !== id).map(([other]) => `<option value="${esc(other)}" ${p.onlyWithId === other ? 'selected' : ''}>${esc(name(other))}</option>`).join('')}</select></div></div><div class="form-group"><label class="form-label">Vínculo com cadastro Admin</label><select id="pmMaster" class="form-select"><option value="">Sem vínculo</option>${Object.entries(pessoas).filter(([, m]) => m.active).sort((a, b) => a[1].name.localeCompare(b[1].name, 'pt-BR')).map(([mid, m]) => `<option value="${esc(mid)}" ${p.masterId === mid ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div><div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px"><label><input id="pmActive" type="checkbox" ${p.active !== false ? 'checked' : ''}> Ativo</label><label><input id="pmPioneer" type="checkbox" ${p.pioneer ? 'checked' : ''}> Pioneiro</label><label><input id="pmChild" type="checkbox" ${p.withChild ? 'checked' : ''}> Acompanha criança</label><label><input id="pmSame" type="checkbox" ${p.sameSexOnly ? 'checked' : ''}> Mesmo sexo</label></div><div class="form-group"><label class="form-label">Observação</label><textarea id="pmObs" class="form-input">${esc(p.obs ?? '')}</textarea></div><div style="display:flex;gap:8px">${id ? '<button id="pmDelete" class="btn btn-danger">Excluir</button>' : ''}<span style="flex:1"></span><button id="pmCancel" class="btn btn-ghost">Cancelar</button><button id="pmSave" class="btn btn-primary">Salvar</button></div></div>`
  document.body.appendChild(overlay)
  document.getElementById('pmCancel')!.addEventListener('click', () => overlay.remove())
  document.getElementById('pmSave')!.addEventListener('click', () => void saveParticipant(id, overlay))
  document.getElementById('pmDelete')?.addEventListener('click', () => void deleteParticipant(id, overlay))
}
async function saveParticipant(id: string, overlay: HTMLElement): Promise<void> {
  const value = (target: string) => (document.getElementById(target) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value
  if (!value('pmName').trim()) { toast('Informe o nome'); return }
  const target = id || `esc_pub_${Date.now()}`
  const p: EscalaParticipant = { ...(participants[id] ?? {}), name: value('pmName').trim(), sex: value('pmSex'), phone: value('pmPhone').trim(), capPerMonth: Math.min(99, Math.max(0, Number(value('pmCap')) || 0)), startFromDate: value('pmStart'), refFolgaDate: value('pmFolga'), onlyWithId: value('pmOnly'), masterId: value('pmMaster'), active: (document.getElementById('pmActive') as HTMLInputElement).checked, pioneer: (document.getElementById('pmPioneer') as HTMLInputElement).checked, withChild: (document.getElementById('pmChild') as HTMLInputElement).checked, sameSexOnly: (document.getElementById('pmSame') as HTMLInputElement).checked, obs: value('pmObs').trim(), updatedAt: now() }
  try { await update(child(escalaRef, `participants/${target}`), p); participants[target] = p; overlay.remove(); toast('Participante salvo'); renderParticipants() } catch { toast('Não foi possível salvar') }
}
async function deleteParticipant(id: string, overlay: HTMLElement): Promise<void> {
  const used = Object.values(tables).some(byMonth => Object.values(byMonth).some(t => Object.values(t.rows ?? {}).some(row => Object.values(row.slots ?? {}).some(cell => cell.p1 === id || cell.p2 === id))))
  if (used) { toast('O participante aparece em uma escala e não pode ser excluído'); return }
  if (!confirm(`Excluir ${name(id)}?`)) return
  const patch: Record<string, null> = { [`participants/${id}`]: null }
  Object.keys(availability).forEach(localId => { patch[`availability/${localId}/${id}`] = null })
  try { await update(escalaRef, patch); delete participants[id]; Object.values(availability).forEach(byPerson => delete byPerson[id]); overlay.remove(); toast('Participante excluído'); renderParticipants() } catch { toast('Não foi possível excluir') }
}

function renderAvailability(): void {
  const people = orderedPeople(true), local = locals[selectedLocalId]
  if (!selectedParticipantId || participants[selectedParticipantId]?.active === false) selectedParticipantId = people[0]?.[0] ?? ''
  if (!local || !selectedParticipantId) { root().innerHTML = '<p class="empty-state">Cadastre um local e participantes ativos primeiro.</p>'; return }
  const marked = availability[selectedLocalId]?.[selectedParticipantId] ?? {}, days = local.daysActive ?? [], slots = localSlots(local), labels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  root().innerHTML = `${periodControls()}<div class="form-group"><label class="form-label">Participante</label><select id="aPerson" class="form-select">${people.map(([id]) => `<option value="${esc(id)}" ${id === selectedParticipantId ? 'selected' : ''}>${esc(name(id))}</option>`).join('')}</select></div><p class="form-help" style="margin-bottom:10px">Clique no dia ou horário do cabeçalho para marcar uma linha ou coluna inteira.</p><div class="availability-wrap"><table class="availability-table"><thead><tr><th>Dia</th>${slots.map(time => `<th><button class="table-toggle" data-atime="${time}">${time}</button></th>`).join('')}</tr></thead><tbody>${days.map(dow => `<tr><th><button class="table-toggle" data-aday="${dow}">${labels[dow]}</button></th>${slots.map(time => { const key = availabilityKey(dow, time); return `<td><input type="checkbox" data-avail="${key}" ${marked[key] ? 'checked' : ''}></td>` }).join('')}</tr>`).join('')}</tbody></table></div><div style="text-align:right;margin-top:10px"><button id="aConfirm" class="btn btn-primary">Confirmar revisão</button></div>`
  bindPeriod(renderAvailability)
  document.getElementById('aPerson')!.addEventListener('change', e => { selectedParticipantId = (e.target as HTMLSelectElement).value; renderAvailability() })
  document.querySelectorAll<HTMLInputElement>('[data-avail]').forEach(box => box.addEventListener('change', () => void saveAvailability([box.dataset['avail']!], box.checked)))
  document.querySelectorAll<HTMLButtonElement>('[data-aday]').forEach(button => button.addEventListener('click', () => void toggleGroup(slots.map(time => availabilityKey(Number(button.dataset['aday']), time)))))
  document.querySelectorAll<HTMLButtonElement>('[data-atime]').forEach(button => button.addEventListener('click', () => void toggleGroup(days.map(dow => availabilityKey(dow, button.dataset['atime']!)))))
  document.getElementById('aConfirm')!.addEventListener('click', () => void confirmAvailability())
}
async function toggleGroup(keys: string[]): Promise<void> {
  const current = availability[selectedLocalId]?.[selectedParticipantId] ?? {}
  await saveAvailability(keys, keys.some(key => !current[key]), true)
}
async function saveAvailability(keys: string[], on: boolean, rerender = false): Promise<void> {
  const stamp = now(), patch: Record<string, unknown> = { [`participants/${selectedParticipantId}/availabilityUpdatedAt`]: stamp }
  keys.forEach(key => { patch[`availability/${selectedLocalId}/${selectedParticipantId}/${key}`] = on ? true : null })
  try {
    await update(escalaRef, patch); availability[selectedLocalId] ??= {}; availability[selectedLocalId][selectedParticipantId] ??= {}
    keys.forEach(key => { if (on) availability[selectedLocalId][selectedParticipantId][key] = true; else delete availability[selectedLocalId][selectedParticipantId][key] })
    participants[selectedParticipantId].availabilityUpdatedAt = stamp; if (rerender) renderAvailability()
  } catch { toast('Não foi possível salvar a disponibilidade'); renderAvailability() }
}
async function confirmAvailability(): Promise<void> {
  try { const stamp = now(); await update(child(escalaRef, `participants/${selectedParticipantId}`), { availabilityUpdatedAt: stamp }); participants[selectedParticipantId].availabilityUpdatedAt = stamp; toast('Disponibilidade revisada hoje') } catch { toast('Não foi possível confirmar') }
}

function hasData(month: string): boolean {
  return Object.values(tables).some(byMonth => Object.values(byMonth[month]?.rows ?? {}).some(row => Object.values(row.slots ?? {}).some(cell => cell.p1 || cell.p2)))
}
function renderScale(): void {
  const local = locals[selectedLocalId]
  if (!local) { root().innerHTML = '<p class="empty-state">Nenhum local cadastrado.</p>'; return }
  const table = tables[selectedLocalId]?.[selectedMonth], published = publishedMonth === selectedMonth
  root().innerHTML = `${periodControls()}${published ? '<div class="notice warning">Este mês está publicado e bloqueado para edição.</div>' : ''}<div class="scale-actions"><button id="sGenerateAll" class="btn btn-primary" ${published ? 'disabled' : ''}>${hasData(selectedMonth) ? 'Completar mês' : 'Gerar mês'}</button>${orderedLocals().length > 1 ? `<button id="sGenerateLocal" class="btn btn-ghost" ${published ? 'disabled' : ''}>Só ${esc(local.name ?? selectedLocalId)}</button>` : ''}<button id="sPdf" class="btn btn-ghost" ${hasData(selectedMonth) ? '' : 'disabled'}>Gerar PDF</button>${published ? '<button id="sUnpublish" class="btn btn-ghost">Despublicar</button>' : '<button id="sPublish" class="btn btn-ghost">Publicar mês</button>'}</div><div class="scale-days">${activeDates(selectedMonth, local.daysActive ?? [], exclusions[selectedMonth] ?? []).map(date => `<section class="scale-day"><h3>${esc(dayLabel(date))}</h3>${localSlots(local).map(time => slotHtml(date, time, table)).join('')}</section>`).join('') || '<p class="empty-state">Este local não tem dias ativos neste mês.</p>'}</div>`
  bindPeriod(renderScale)
  document.getElementById('sGenerateAll')!.addEventListener('click', () => void generate())
  document.getElementById('sGenerateLocal')?.addEventListener('click', () => void generate(selectedLocalId))
  document.getElementById('sPdf')!.addEventListener('click', printPdf)
  document.getElementById('sPublish')?.addEventListener('click', () => void publish())
  document.getElementById('sUnpublish')?.addEventListener('click', () => void unpublish())
  document.querySelectorAll<HTMLButtonElement>('[data-slot]').forEach(button => button.addEventListener('click', () => pairModal(button.dataset['date']!, button.dataset['time']!)))
}
function slotHtml(date: string, time: string, table?: EscalaTable): string {
  const cell = table?.rows?.[date]?.slots?.[time]
  const names = [cell?.p1, cell?.p2].filter((id): id is string => Boolean(id)).map(name)
  let status = isBlocked(blocks, selectedMonth, selectedLocalId, new Date(`${date}T12:00:00`).getDay(), time) ? 'Sem carrinho' : 'Vago'
  if (!names.length && status === 'Vago') {
    const eligible = analyzeCell(input(), date, time).eligible
    status = eligible.length === 0 ? 'Ninguém disponível' : eligible.length === 1 ? `Só ${name(eligible[0])} disponível` : `${eligible.length} disponíveis, sem dupla válida`
  }
  return `<button class="scale-slot" data-slot data-date="${date}" data-time="${time}" ${publishedMonth === selectedMonth ? 'disabled' : ''}><strong>${time}</strong><span>${esc(names.length ? names.join(' + ') : status)}</span></button>`
}
async function generate(onlyLocalId = ''): Promise<void> {
  if (publishedMonth === selectedMonth) { toast('Despublique o mês antes de gerar'); return }
  const generated = generateAll({ month: selectedMonth, locals, onlyLocalId: onlyLocalId || undefined, participants, availability, tables, blocks, exclusions: exclusions[selectedMonth] ?? [] })
  if (generated.errors.length) { toast(generated.errors.join('. ')); return }
  const patch: Record<string, unknown> = { editingMonth: selectedMonth, lastGeneratedAt: now() }
  Object.keys(generated.results).forEach(id => { patch[`tables/${id}/${selectedMonth}`] = generated.tables[id][selectedMonth] })
  try {
    await update(escalaRef, patch); tables = generated.tables
    const total = Object.values(generated.results).reduce((sum, result) => ({ filled: sum.filled + result.summary.filled, kept: sum.kept + result.summary.preserved, empty: sum.empty + result.summary.empty }), { filled: 0, kept: 0, empty: 0 })
    toast(`${total.filled} preenchidos, ${total.kept} mantidos${total.empty ? ` e ${total.empty} sem dupla` : ''}`); renderScale()
  } catch { toast('Nada foi gravado; a geração falhou sem escrita parcial') }
}
function pairModal(date: string, time: string): void {
  const analysis = analyzeCell(input(), date, time), cell = tables[selectedLocalId]?.[selectedMonth]?.rows?.[date]?.slots?.[time] ?? { p1: '', p2: '' }
  const ids = [...analysis.eligible, ...analysis.blocked.map(item => item.id)]
  const options = ids.map(id => { const item = analysis.blocked.find(candidate => candidate.id === id); return `<option value="${esc(id)}">${esc(name(id))}${item ? ` — ${esc(ESCALA_RULE_LABELS[item.rule])}` : ''}</option>` }).join('')
  const overlay = document.createElement('div'); overlay.className = 'modal-overlay'; overlay.innerHTML = `<div class="modal"><h2>${esc(dayLabel(date))} · ${time}</h2><p class="form-help">Disponíveis primeiro; conflitos continuam selecionáveis com confirmação.</p><div class="form-group"><label class="form-label">Primeira pessoa</label><select id="pair1" class="form-select"><option value="">Vago</option>${options}</select></div><div class="form-group"><label class="form-label">Segunda pessoa</label><select id="pair2" class="form-select"><option value="">Vago</option>${options}</select></div><div style="display:flex;gap:8px;justify-content:flex-end"><button id="pairCancel" class="btn btn-ghost">Cancelar</button><button id="pairSave" class="btn btn-primary">Salvar</button></div></div>`
  document.body.appendChild(overlay); (document.getElementById('pair1') as HTMLSelectElement).value = cell.p1; (document.getElementById('pair2') as HTMLSelectElement).value = cell.p2
  document.getElementById('pairCancel')!.addEventListener('click', () => overlay.remove()); document.getElementById('pairSave')!.addEventListener('click', () => void savePair(date, time, overlay))
}
async function savePair(date: string, time: string, overlay: HTMLElement): Promise<void> {
  const p1 = (document.getElementById('pair1') as HTMLSelectElement).value, p2 = (document.getElementById('pair2') as HTMLSelectElement).value
  const errors = validatePair(input(), date, time, p1, p2)
  if (errors.length && !confirm(`Esta escolha tem conflito:\n\n${errors.join('\n')}\n\nSalvar assim mesmo?`)) return
  const dow = new Date(`${date}T12:00:00`).getDay()
  try {
    await update(escalaRef, { [`tables/${selectedLocalId}/${selectedMonth}/slots`]: localSlots(locals[selectedLocalId]), [`tables/${selectedLocalId}/${selectedMonth}/rows/${date}/dow`]: dow, [`tables/${selectedLocalId}/${selectedMonth}/rows/${date}/slots/${time}`]: { p1, p2 }, [`manualEdits/${selectedLocalId}/${selectedMonth}/${date}/${time.replace(':', '-')}`]: { p1, p2, editedAt: now(), editedBy: context.uid, conflicts: errors } })
    tables[selectedLocalId] ??= {}; tables[selectedLocalId][selectedMonth] ??= { slots: localSlots(locals[selectedLocalId]), rows: {} }; tables[selectedLocalId][selectedMonth].rows[date] ??= { dow, slots: {} }; tables[selectedLocalId][selectedMonth].rows[date].slots[time] = { p1, p2 }
    overlay.remove(); toast('Dupla atualizada'); renderScale()
  } catch { toast('Não foi possível salvar a dupla') }
}
async function publish(): Promise<void> {
  if (!hasData(selectedMonth)) { toast('Gere e revise a escala antes de publicar'); return }
  const snapshot = { publicadoEm: now(), nomes: Object.fromEntries(Object.keys(participants).map(id => [id, name(id)])), locais: Object.fromEntries(orderedLocals().map(([id, local]) => [id, local.name ?? id])) }
  try { await update(escalaRef, { publishedMonth: selectedMonth, [`publishedSnapshots/${selectedMonth}`]: snapshot }); publishedMonth = selectedMonth; toast('Mês publicado e bloqueado'); renderScale() } catch { toast('Não foi possível publicar') }
}
async function unpublish(): Promise<void> {
  if (!confirm(`Despublicar ${monthLabel(selectedMonth)}?`)) return
  try { await update(escalaRef, { publishedMonth: '' }); publishedMonth = ''; toast('Mês aberto para edição'); renderScale() } catch { toast('Não foi possível despublicar') }
}

function renderMessages(): void {
  const people = orderedPeople(true), dates = [...new Set(Object.values(tables).flatMap(byMonth => Object.keys(byMonth[selectedMonth]?.rows ?? {})))].sort()
  root().innerHTML = `${periodControls(false)}<div class="module-form-grid"><div class="form-group"><label class="form-label">Tipo</label><select id="mType" class="form-select"><option value="person">Mensagem para pessoa</option><option value="day">Mensagem do dia</option><option value="confirm">Confirmar disponibilidade</option></select></div><div class="form-group" id="mTargetWrap"></div></div><div class="form-group"><label class="form-label">Texto</label><textarea id="mText" class="form-input" rows="12"></textarea></div><div class="scale-actions"><button id="mCopy" class="btn btn-ghost">Copiar</button><button id="mWhats" class="btn btn-primary">Abrir WhatsApp</button><button id="mGroup" class="btn btn-ghost" ${settings.groupWhatsAppLink ? '' : 'disabled'}>Abrir grupo</button></div>`
  bindPeriod(renderMessages)
  const type = document.getElementById('mType') as HTMLSelectElement
  const targets = () => {
    document.getElementById('mTargetWrap')!.innerHTML = type.value === 'day' ? `<label class="form-label">Dia</label><select id="mTarget" class="form-select">${dates.map(date => `<option value="${date}">${esc(dayLabel(date))}</option>`).join('')}</select>` : `<label class="form-label">Pessoa</label><select id="mTarget" class="form-select">${people.map(([id]) => `<option value="${esc(id)}">${esc(name(id))}</option>`).join('')}</select>`
    document.getElementById('mTarget')!.addEventListener('change', fillMessage); fillMessage()
  }
  type.addEventListener('change', targets); targets()
  document.getElementById('mCopy')!.addEventListener('click', () => void copyMessage())
  document.getElementById('mWhats')!.addEventListener('click', openWhatsApp)
  document.getElementById('mGroup')!.addEventListener('click', () => { void copyMessage(); window.open(settings.groupWhatsAppLink, '_blank', 'noopener') })
}
function fillMessage(): void {
  const type = (document.getElementById('mType') as HTMLSelectElement).value, target = (document.getElementById('mTarget') as HTMLSelectElement)?.value ?? ''
  const text = type === 'day' ? dayMessage(greetings.date ?? '', target, assignmentsForDay(target, selectedMonth, tables, locals, participants)) : type === 'confirm' ? confirmationMessage(greetings.confirm ?? '', target, participants[target], locals, availability) : personMessage(greetings.participant ?? '', participants[target], selectedMonth, assignmentsForPerson(target, selectedMonth, tables, locals, participants))
  ;(document.getElementById('mText') as HTMLTextAreaElement).value = text
}
async function copyMessage(): Promise<void> {
  try { await navigator.clipboard.writeText((document.getElementById('mText') as HTMLTextAreaElement).value); toast('Mensagem copiada') } catch { toast('Não foi possível copiar automaticamente') }
}
function digits(value: unknown): string { const result = String(value ?? '').replace(/\D/g, ''); return result.length === 11 ? `55${result}` : result }
function openWhatsApp(): void {
  const type = (document.getElementById('mType') as HTMLSelectElement).value, target = (document.getElementById('mTarget') as HTMLSelectElement)?.value ?? ''
  const phone = type === 'day' ? '' : digits(participants[target]?.phone ?? (participants[target]?.masterId ? pessoas[participants[target].masterId]?.whatsapp : ''))
  if (!phone) { toast('Este destino não tem WhatsApp cadastrado'); return }
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent((document.getElementById('mText') as HTMLTextAreaElement).value)}`, '_blank', 'noopener')
}

function renderPending(): void {
  const pending: { level: string; title: string; detail: string; target: Tab }[] = [], active = orderedPeople(true)
  const stuck = active.filter(([, p]) => p.onlyWithId && participants[p.onlyWithId]?.active === false)
  if (stuck.length) pending.push({ level: 'high', title: `${stuck.length} participante(s) preso(s) a uma pessoa inativa`, detail: stuck.map(([, p]) => participantName(p)).join(', '), target: 'participantes' })
  const noPhone = active.filter(([, p]) => !digits(p.phone ?? (p.masterId ? pessoas[p.masterId]?.whatsapp : '')))
  if (noPhone.length) pending.push({ level: 'medium', title: `${noPhone.length} participante(s) sem WhatsApp`, detail: noPhone.slice(0, 6).map(([id]) => name(id)).join(', '), target: 'participantes' })
  const noAvailability = active.filter(([id]) => !Object.values(availability).some(byPerson => Object.values(byPerson[id] ?? {}).some(Boolean)))
  if (noAvailability.length) pending.push({ level: 'high', title: `${noAvailability.length} participante(s) sem disponibilidade`, detail: noAvailability.slice(0, 6).map(([id]) => name(id)).join(', '), target: 'disponibilidade' })
  const stale = active.filter(([id, p]) => Object.values(availability).some(byPerson => Object.values(byPerson[id] ?? {}).some(Boolean)) && (!p.availabilityUpdatedAt || Date.now() - new Date(p.availabilityUpdatedAt).getTime() > 30 * 86_400_000))
  if (stale.length) pending.push({ level: 'low', title: `${stale.length} disponibilidade(s) sem revisão há mais de 30 dias`, detail: stale.slice(0, 6).map(([id]) => name(id)).join(', '), target: 'mensagens' })
  for (const [localId, local] of orderedLocals()) {
    const table = tables[localId]?.[selectedMonth]
    if (!table || !Object.values(table.rows ?? {}).some(row => Object.values(row.slots ?? {}).some(cell => cell.p1 || cell.p2))) pending.push({ level: 'medium', title: `${local.name ?? localId} sem escala em ${monthLabel(selectedMonth)}`, detail: 'Gere o mês e revise os horários vagos.', target: 'escalaAtual' })
    const halves = Object.values(table?.rows ?? {}).flatMap(row => Object.values(row.slots ?? {}).filter(cell => Boolean(cell.p1) !== Boolean(cell.p2)))
    if (halves.length) pending.push({ level: 'high', title: `${local.name ?? localId} tem ${halves.length} dupla(s) incompleta(s)`, detail: 'Abra a escala e complete ou deixe o horário vago.', target: 'escalaAtual' })
  }
  root().innerHTML = `${periodControls(false)}<div class="module-option-list">${pending.map(item => `<button class="module-menu-btn" data-pending="${item.target}"><div class="mod-icon" style="background:${item.level === 'high' ? '#B3261E20' : '#C8922A20'};color:${item.level === 'high' ? '#B3261E' : '#8A5B00'}">!</div><div><div class="mod-label">${esc(item.title)}</div><div class="mod-desc">${esc(item.detail)}</div></div></button>`).join('') || '<p class="empty-state">Nenhuma pendência identificada.</p>'}</div>`
  bindPeriod(renderPending); document.querySelectorAll<HTMLButtonElement>('[data-pending]').forEach(button => button.addEventListener('click', () => go(button.dataset['pending'] as Tab)))
}

function renderConfig(): void {
  const font = Math.min(18, Math.max(8, Number(settings.printFontPt ?? 12)))
  const local = locals[selectedLocalId]
  const scope = '__persist__'
  root().innerHTML = `${periodControls()}<div class="form-group"><label class="form-label">Link do grupo do WhatsApp</label><input id="cGroup" class="form-input" value="${esc(settings.groupWhatsAppLink ?? '')}"></div><div class="form-group"><label class="form-label">Tamanho máximo no PDF: <strong id="cFontValue">${font}pt</strong></label><input id="cFont" type="range" min="8" max="18" value="${font}" style="width:100%"><p class="form-help">O app reduz a partir deste teto até encontrar a maior letra que caiba sem quebrar nomes.</p></div><div class="form-group"><label class="form-label">Mensagem para pessoa</label><textarea id="cPerson" class="form-input">${esc(greetings.participant ?? '')}</textarea></div><div class="form-group"><label class="form-label">Mensagem do dia</label><textarea id="cDay" class="form-input">${esc(greetings.date ?? '')}</textarea></div><div class="form-group"><label class="form-label">Confirmação de disponibilidade</label><textarea id="cConfirm" class="form-input">${esc(greetings.confirm ?? '')}</textarea></div><button id="cSave" class="btn btn-primary">Salvar textos e impressão</button><hr style="border:0;border-top:1px solid var(--border);margin:18px 0"><h3 style="font-size:.9rem;margin-bottom:8px">Exceções de ${esc(monthLabel(selectedMonth))}</h3><div style="display:flex;gap:8px;margin-bottom:8px"><input id="cExclusion" class="form-input" type="date" min="${selectedMonth}-01" max="${selectedMonth}-31"><button id="cAddExclusion" class="btn btn-ghost">Adicionar</button></div><div class="module-option-list">${(exclusions[selectedMonth] ?? []).map(date => `<div class="module-menu-btn" style="cursor:default"><div><div class="mod-label">${esc(dayLabel(date))}</div><div class="mod-desc">Sem carrinho em todos os locais</div></div><button class="btn btn-danger" data-remove-exclusion="${date}">Remover</button></div>`).join('') || '<p class="empty-state">Nenhuma data excluída neste mês.</p>'}</div>${local ? `<hr style="border:0;border-top:1px solid var(--border);margin:18px 0"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:8px"><h3 style="font-size:.9rem">Bloqueios de horário</h3><select id="cBlockScope" class="form-select" style="max-width:190px"><option value="__persist__">Todos os meses</option><option value="${selectedMonth}">Somente este mês</option></select></div><div id="cBlocks">${blockGrid(local, scope)}</div>` : ''}`
  bindPeriod(renderConfig)
  document.getElementById('cFont')!.addEventListener('input', e => { document.getElementById('cFontValue')!.textContent = `${(e.target as HTMLInputElement).value}pt` })
  document.getElementById('cSave')!.addEventListener('click', () => void saveConfig())
  document.getElementById('cAddExclusion')!.addEventListener('click', () => void addExclusion())
  document.querySelectorAll<HTMLButtonElement>('[data-remove-exclusion]').forEach(button => button.addEventListener('click', () => void removeExclusion(button.dataset['removeExclusion']!)))
  document.getElementById('cBlockScope')?.addEventListener('change', event => { document.getElementById('cBlocks')!.innerHTML = blockGrid(local, (event.target as HTMLSelectElement).value); bindBlockInputs() })
  bindBlockInputs()
}
function blockGrid(local: EscalaLocal, scope: string): string {
  const labels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'], selected = blocks[scope]?.[selectedLocalId] ?? []
  return `<p class="form-help" style="margin-bottom:8px">Marque horários em que não deve haver carrinho.</p><div class="availability-wrap"><table class="availability-table"><thead><tr><th>Dia</th>${localSlots(local).map(time => `<th>${time}</th>`).join('')}</tr></thead><tbody>${(local.daysActive ?? []).map(dow => `<tr><th>${labels[dow]}</th>${localSlots(local).map(time => { const key = availabilityKey(dow, time); return `<td><input type="checkbox" data-block="${key}" data-scope="${scope}" ${selected.includes(key) ? 'checked' : ''}></td>` }).join('')}</tr>`).join('')}</tbody></table></div>`
}
function bindBlockInputs(): void {
  document.querySelectorAll<HTMLInputElement>('[data-block]').forEach(box => box.addEventListener('change', () => void toggleBlock(box.dataset['scope']!, box.dataset['block']!, box.checked)))
}
async function toggleBlock(scope: string, key: string, enabled: boolean): Promise<void> {
  const current = blocks[scope]?.[selectedLocalId] ?? []
  const next = enabled ? [...new Set([...current, key])] : current.filter(item => item !== key)
  try { await update(escalaRef, { [`monthSlotBlocks/${scope}/${selectedLocalId}`]: next.length ? next : null }); blocks[scope] ??= {}; blocks[scope][selectedLocalId] = next; toast('Bloqueio atualizado') } catch { toast('Não foi possível atualizar o bloqueio'); renderConfig() }
}
async function addExclusion(): Promise<void> {
  const date = (document.getElementById('cExclusion') as HTMLInputElement).value
  if (!date.startsWith(`${selectedMonth}-`)) { toast('Escolha uma data deste período'); return }
  const next = [...new Set([...(exclusions[selectedMonth] ?? []), date])].sort()
  try { await update(escalaRef, { [`monthExclusions/${selectedMonth}`]: next }); exclusions[selectedMonth] = next; toast('Exceção adicionada'); renderConfig() } catch { toast('Não foi possível adicionar') }
}
async function removeExclusion(date: string): Promise<void> {
  const next = (exclusions[selectedMonth] ?? []).filter(item => item !== date)
  try { await update(escalaRef, { [`monthExclusions/${selectedMonth}`]: next.length ? next : null }); exclusions[selectedMonth] = next; toast('Exceção removida'); renderConfig() } catch { toast('Não foi possível remover') }
}
async function saveConfig(): Promise<void> {
  const value = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement).value.trim()
  const nextSettings = { groupWhatsAppLink: value('cGroup'), printFontPt: Number(value('cFont')) }, nextGreetings = { participant: value('cPerson'), date: value('cDay'), confirm: value('cConfirm') }
  try { await update(escalaRef, { settings: nextSettings, greetings: nextGreetings }); settings = nextSettings; greetings = nextGreetings; toast('Configurações salvas') } catch { toast('Não foi possível salvar') }
}

function printPdf(): void {
  document.querySelector('.escala-print-doc')?.remove()
  const printable = document.createElement('div'); printable.className = 'escala-print-doc'; printable.dataset['printing'] = 'true'; printable.style.setProperty('--escala-print-font', `${Math.min(18, Math.max(8, Number(settings.printFontPt ?? 12)))}pt`)
  printable.innerHTML = orderedLocals().map(([localId, local]) => { const slots = localSlots(local), rows = printRowsForLocal(localId, selectedMonth, local, tables, participants, exclusions[selectedMonth] ?? []); return `<section class="escala-print-page"><header><strong>${esc(local.name ?? localId)}</strong><span>${esc(monthLabel(selectedMonth))}</span></header><table><thead><tr><th>Dia</th>${slots.map(time => `<th>${time}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr><th>${esc(dayLabel(row.date))}</th>${row.cells.map(names => `<td>${names.map(person => `<span>${esc(person)}</span>`).join('') || '&nbsp;'}</td>`).join('')}</tr>`).join('')}</tbody></table></section>` }).join('')
  printable.dataset['measuring'] = 'true'; document.body.appendChild(printable)
  for (let pt = Math.min(18, Math.max(8, Number(settings.printFontPt ?? 12))); pt >= 8; pt -= 1) {
    printable.style.setProperty('--escala-print-font', `${pt}pt`)
    const overflow = [...printable.querySelectorAll<HTMLElement>('.escala-print-page')].some(page => page.scrollWidth > page.clientWidth || page.scrollHeight > 735)
    if (!overflow || pt === 8) break
  }
  delete printable.dataset['measuring']
  const title = document.title; document.title = `Escala do carrinho - ${monthLabel(selectedMonth)}`
  window.addEventListener('afterprint', () => { document.title = title; printable.remove() }, { once: true }); window.print()
}
