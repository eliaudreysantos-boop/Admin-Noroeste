import type { AppContext, RawPessoas } from '../types'
import { configCongregacaoRef, configReunioesRef, get, pessoasRef, programacaoRef, update } from '../firebase'
import { renderMenuCards, type ItemMenu } from '../ui/menu-cards'
import { moduleBackButton } from '../ui/module-header'
import {
  ASSIGNMENT_PERMISSIONS, assignmentConflicts, assistantNeedsSameSex, bimesters, candidates,
  eligible, filterPrograms, isOfficialJwUrl, mergeImportedProgram, parseOfficialProgram,
  permissionForPart, programPendings, reminderMessage, suggestAssignments,
  type AssignmentPermission, type AssignmentStatus, type MeetingProgram, type ProgramPart, type ProgramPerson, type ProgramSection, type WeekType,
} from './programacao-domain'
type Tab = 'indice' | 'programa' | 'apostilas' | 'pessoas' | 'arquivos' | 'lembretes' | 'pendencias' | 'config'
type PeriodMode = 'week' | 'month' | 'bimester'
interface StoredPerson { masterId?: string; active?: boolean; permissions?: AssignmentPermission[] }
interface Settings { meetingTime?: string; rooms?: Array<{ id: string; name: string }>; reminderTemplate?: string }
interface ProgramData { programs?: Record<string, MeetingProgram>; semanas?: Record<string, MeetingProgram>; pessoas?: Record<string, StoredPerson>; settings?: Settings }

const API_IMPORT_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? '/api/import-jw-program'
  : 'https://southamerica-east1-reunioes-6c437.cloudfunctions.net/importJwProgram'
const permissionLabels: Record<AssignmentPermission, string> = {
  presidente: 'Presidente', 'oracao-inicial': 'Oração inicial', discurso: 'Discurso', joias: 'Joias espirituais',
  'leitura-biblia': 'Leitura da Bíblia', 'iniciando-conversas': 'Iniciando conversas', 'cultivando-interesse': 'Cultivando o interesse',
  'fazendo-discipulos': 'Fazendo discípulos', 'explicando-crencas': 'Explicando crenças', 'o-que-voce-diria': 'O que você diria',
  ajudante: 'Ajudante', 'necessidades-locais': 'Necessidades locais', consideracao: 'Consideração', 'estudo-biblico': 'Estudo bíblico',
  leitor: 'Leitor', 'conselheiro-assistente': 'Conselheiro assistente', 'oracao-final': 'Oração final',
}
const typeLabels: Record<WeekType, string> = { normal: 'Normal', visita: 'Visita do superintendente', assembleia: 'Assembleia/Congresso', celebracao: 'Celebração' }
const statusLabels: Record<AssignmentStatus, string> = { programado: 'Programado', substituido: 'Substituído', realizado: 'Realizado' }
const sectionLabels: Record<ProgramSection, string> = {
  tesouros: 'Tesouros da Palavra de Deus',
  ministerio: 'Faça Seu Melhor no Ministério',
  'vida-crista': 'Nossa Vida Cristã',
}
const sectionOrder: ProgramSection[] = ['tesouros', 'ministerio', 'vida-crista']

let tab: Tab = 'indice'
let data: ProgramData = {}
let masterPeople: RawPessoas = {}
let programs: Record<string, MeetingProgram> = {}
let profiles: Record<string, StoredPerson> = {}
let settings: Settings = {}
let congregation = 'Noroeste'
let editingWeek = ''
let pendingPartId = ''
let periodMode: PeriodMode = 'bimester'
let periodAnchor = today()

const root = () => document.getElementById('programacaoContent')!
const now = () => new Date().toISOString()
function today(): string { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function esc(value: unknown): string { return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]!) }
function toast(message: string): void { const el = document.getElementById('toast'); if (!el) return; el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 3200) }
function formatDate(value: string): string { const [y, m, d] = value.split('-'); return y && m && d ? `${d}/${m}/${y}` : value }
function programList(): MeetingProgram[] { return Object.values(programs).filter(item => item?.meetingDate).sort((a, b) => a.meetingDate.localeCompare(b.meetingDate)) }
function filtered(): MeetingProgram[] { return filterPrograms(programList(), periodMode, periodAnchor) }
function meetingTime(): string { return settings.meetingTime || '19:00' }
function rooms(): Array<{ id: string; name: string }> { return settings.rooms?.length ? settings.rooms : [{ id: 'main', name: 'Salão principal' }] }
function dateFromIso(value: string): Date { return new Date(`${value}T12:00:00`) }
function isoDate(value: Date): string { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}` }
function periodLabel(): string {
  const anchor = dateFromIso(periodAnchor)
  if (periodMode === 'week') {
    const start = new Date(anchor); start.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7))
    const end = new Date(start); end.setDate(start.getDate() + 6)
    return `${formatDate(isoDate(start))} a ${formatDate(isoDate(end))}`
  }
  const startMonth = periodMode === 'bimester' ? anchor.getMonth() - (anchor.getMonth() % 2) : anchor.getMonth()
  const endMonth = startMonth + (periodMode === 'bimester' ? 1 : 0)
  const monthName = (month: number) => new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date(anchor.getFullYear(), month, 1))
  return `${monthName(startMonth)}${endMonth !== startMonth ? ` / ${monthName(endMonth)}` : ''} de ${anchor.getFullYear()}`
}
function movePeriod(direction: -1 | 1): void {
  const next = dateFromIso(periodAnchor)
  if (periodMode === 'week') next.setDate(next.getDate() + direction * 7)
  else if (periodMode === 'month') next.setMonth(next.getMonth() + direction)
  else next.setMonth(next.getMonth() + direction * 2)
  periodAnchor = isoDate(next)
}

function joinedPeople(): ProgramPerson[] {
  return Object.entries(profiles).map(([id, profile]) => {
    const masterId = profile.masterId || id
    const person = masterPeople[masterId]
    const sex: ProgramPerson['sex'] = person?.sex === 'M' ? 'masculino' : person?.sex === 'F' ? 'feminino' : ''
    return {
      id, masterId, name: person?.name || `Cadastro ${masterId}`, whatsapp: String(person?.whatsapp ?? '').replace(/\D/g, ''),
      sex, role: person?.role || 'publicador',
      active: profile.active !== false && person?.active !== false, permissions: Array.isArray(profile.permissions) ? profile.permissions : [],
    }
  }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

function normalizePrograms(value: Record<string, MeetingProgram>): Record<string, MeetingProgram> {
  return Object.fromEntries(Object.entries(value).map(([id, raw]) => {
    const parts = Array.isArray(raw?.parts) ? raw.parts : Object.values((raw?.parts ?? {}) as Record<string, ProgramPart>)
    const meetingDate = String(raw?.meetingDate ?? (raw as unknown as Record<string, unknown>)?.['data'] ?? id)
    return [id, { ...raw, id: raw?.id || id, meetingDate, bibleReading: raw?.bibleReading || '', type: raw?.type || 'normal', parts }]
  }))
}

export default function mount(_context: AppContext): void {
  tab = 'indice'; editingWeek = ''
  document.getElementById('appContent')!.innerHTML = '<div id="programacaoRoot"><div id="programacaoContent"><p class="empty-state">Carregando...</p></div></div>'
  void load()
}

async function load(): Promise<void> {
  try {
    const [programSnap, peopleSnap, congregationSnap, meetingsSnap] = await Promise.all([get(programacaoRef), get(pessoasRef), get(configCongregacaoRef), get(configReunioesRef)])
    data = programSnap.exists() ? programSnap.val() as ProgramData : {}
    programs = normalizePrograms(data.programs ?? data.semanas ?? {})
    profiles = data.pessoas ?? {}
    settings = data.settings ?? {}
    masterPeople = peopleSnap.exists() ? peopleSnap.val() as RawPessoas : {}
    const congregationData = congregationSnap.exists() ? congregationSnap.val() as { nome?: string } : {}
    congregation = congregationData.nome?.trim() || 'Noroeste'
    const meetingData = meetingsSnap.exists() ? meetingsSnap.val() as { meiaDeSemana?: { horario?: string } } : {}
    if (!settings.meetingTime && meetingData.meiaDeSemana?.horario) settings.meetingTime = meetingData.meiaDeSemana.horario
  } catch (error) { console.error(error); toast('Não foi possível carregar Vida e Ministério') }
  render()
}

function render(): void {
  if (tab === 'indice') renderIndex()
  else if (tab === 'programa') renderPrograms()
  else if (tab === 'apostilas') renderImports()
  else if (tab === 'pessoas') renderPeople()
  else if (tab === 'arquivos') renderFiles()
  else if (tab === 'lembretes') renderReminders()
  else if (tab === 'pendencias') renderPending()
  else renderSettings()
}

function renderIndex(): void {
  root().innerHTML = '<div style="margin-bottom:14px"><h2 style="font-size:1.05rem;color:var(--blue-deep)">Vida e Ministério</h2></div><div id="programacaoMenu"></div>'
  const items: ItemMenu[] = [
    { id: 'programa', titulo: 'Programa', subtitulo: 'Semanas, partes e designações', icone: '▦', corFundo: '#003F72' },
    { id: 'pessoas', titulo: 'Pessoas', subtitulo: 'Vínculos do Admin e permissões de designação', icone: '♙', corFundo: '#006EB6' },
    { id: 'apostilas', titulo: 'Apostilas', subtitulo: 'Importação oficial por semana ou bimestre', icone: '▤', corFundo: '#7E3AF2' },
    { id: 'lembretes', titulo: 'Lembretes', subtitulo: 'Mensagens editáveis e confirmações', icone: '✉', corFundo: '#A54B00' },
    { id: 'arquivos', titulo: 'Arquivos', subtitulo: 'S-89, S-140 PDF e DOCX', icone: '▣', corFundo: '#1A6B3C' },
    { id: 'pendencias', titulo: 'Pendências', subtitulo: 'Designações, conflitos e entregas', icone: '!', corFundo: '#B3261E' },
    { id: 'config', titulo: 'Configuração', subtitulo: 'Horário, salas e texto de lembrete', icone: '⚙', corFundo: '#5C6062' },
  ]
  renderMenuCards(root().querySelector<HTMLElement>('#programacaoMenu')!, items, id => { tab = id as Tab; render() })
}

function title(text: string): string { return `<div style="margin-bottom:14px">${moduleBackButton()}<h2 style="font-size:1.05rem;color:var(--blue-deep)">${esc(text)}</h2></div>` }
function periodControls(): string {
  return `<div class="program-period" aria-label="Período do programa"><div class="program-period-modes" role="group" aria-label="Visualização"><button class="program-period-mode" type="button" data-period-mode="week" aria-pressed="${periodMode === 'week'}">Semana</button><button class="program-period-mode" type="button" data-period-mode="month" aria-pressed="${periodMode === 'month'}">Mês</button><button class="program-period-mode" type="button" data-period-mode="bimester" aria-pressed="${periodMode === 'bimester'}">Bimestre</button></div><div class="program-period-nav"><button id="previousProgramPeriod" class="program-icon-button" type="button" aria-label="Período anterior" title="Período anterior">‹</button><strong>${esc(periodLabel())}</strong><button id="nextProgramPeriod" class="program-icon-button" type="button" aria-label="Próximo período" title="Próximo período">›</button></div></div>`
}
function bindPeriod(callback: () => void): void {
  document.querySelectorAll<HTMLButtonElement>('[data-period-mode]').forEach(button => button.addEventListener('click', () => { periodMode = button.dataset['periodMode'] as PeriodMode; callback() }))
  document.getElementById('previousProgramPeriod')?.addEventListener('click', () => { movePeriod(-1); callback() })
  document.getElementById('nextProgramPeriod')?.addEventListener('click', () => { movePeriod(1); callback() })
}

function renderPrograms(): void {
  const list = filtered()
  const total = list.reduce((sum, program) => sum + program.parts.length, 0)
  const assigned = list.reduce((sum, program) => sum + program.parts.filter(part => part.assignedPersonId).length, 0)
  const pending = total - assigned
  root().innerHTML = `${title('Programa')}<div class="program-summary" aria-label="Resumo do período"><div><strong>${total}</strong><span>Partes</span></div><div><strong>${assigned}</strong><span>Designadas</span></div><div class="${pending ? 'is-pending' : ''}"><strong>${pending}</strong><span>Pendentes</span></div></div>${periodControls()}<div class="program-week-list">${list.length ? list.map(program => weekRow(program)).join('') : '<p class="empty-state">Nenhuma semana neste período.</p>'}</div><div id="weekEditor" style="margin-top:12px"></div>`
  bindPeriod(renderPrograms)
  document.querySelectorAll<HTMLButtonElement>('[data-week]').forEach(button => button.addEventListener('click', () => { editingWeek = button.dataset['week']!; renderPrograms() }))
  if (editingWeek) {
    renderEditor(editingWeek)
    const part = programs[editingWeek]?.parts.find(item => item.id === pendingPartId)
    pendingPartId = ''
    if (part) sectionModal(editingWeek, part.section)
  }
}

function weekRow(program: MeetingProgram): string {
  const assigned = program.parts.filter(part => part.assignedPersonId).length
  const pending = program.parts.length - assigned
  const sections = new Set(program.parts.map(part => part.section)).size
  return `<button class="program-week-card" type="button" data-week="${esc(program.id)}"><div class="program-week-date"><strong>${esc(program.meetingDate.slice(8, 10))}</strong><span>${esc(program.meetingDate.slice(5, 7))}</span></div><div class="program-week-content"><div class="program-week-heading"><strong>${esc(formatDate(program.meetingDate))}</strong><span>${esc(typeLabels[program.type ?? 'normal'])}</span></div><div class="program-week-reading">${esc(program.bibleReading || 'Leitura bíblica não informada')}</div><div class="program-week-progress"><span>${program.parts.length} partes</span><span>${sections} seções</span><span class="${pending ? 'is-pending' : 'is-complete'}">${pending ? `${pending} pendente${pending === 1 ? '' : 's'}` : 'Completa'}</span></div></div><span class="program-week-arrow" aria-hidden="true">›</span></button>`
}

function optionsFor(part: ProgramPart, selected: string, assistant = false): string {
  let people = candidates(part, joinedPeople(), assistant)
  if (assistant && assistantNeedsSameSex(part) && part.assignedPersonId) {
    const sex = joinedPeople().find(person => person.id === part.assignedPersonId)?.sex
    if (sex) people = people.filter(person => person.sex === sex)
  }
  const selectedPerson = joinedPeople().find(person => person.id === selected)
  if (selectedPerson && !people.some(person => person.id === selected)) people = [selectedPerson, ...people]
  const history = programList().filter(program => program.id !== editingWeek)
  people = people.sort((a, b) => lastAssignment(a.id, part, history, assistant).localeCompare(lastAssignment(b.id, part, history, assistant)) || a.name.localeCompare(b.name, 'pt-BR'))
  return `<option value="">Sem designação</option>${people.map((person, index) => `<option value="${esc(person.id)}" ${person.id === selected ? 'selected' : ''}>${index === 0 ? 'Recomendado · ' : ''}${esc(person.name)}${person.active ? '' : ' · inativo (histórico)'} · ${esc(lastAssignmentLabel(person.id, part, history, assistant))}</option>`).join('')}`
}

function lastAssignment(personId: string, part: ProgramPart, history: MeetingProgram[], assistant = false): string {
  return history.reduce((latest, program) => {
    if (program.meetingDate >= (programs[editingWeek]?.meetingDate ?? '9999-12-31')) return latest
    const used = program.parts.some(other => assistant
      ? other.assistantPersonId === personId
      : permissionForPart(other) === permissionForPart(part) && [other.assignedPersonId, other.substitutePersonId, other.realizedPersonId].includes(personId))
    return used && program.meetingDate > latest ? program.meetingDate : latest
  }, '')
}

function lastAssignmentLabel(personId: string, part: ProgramPart, history: MeetingProgram[], assistant = false): string {
  const date = lastAssignment(personId, part, history, assistant)
  return date ? `última: ${formatDate(date)}` : 'sem designação anterior'
}

function recommendationLabel(part: ProgramPart, assistant = false): string {
  let people = candidates(part, joinedPeople(), assistant)
  if (assistant && assistantNeedsSameSex(part) && part.assignedPersonId) {
    const sex = joinedPeople().find(person => person.id === part.assignedPersonId)?.sex
    if (sex) people = people.filter(person => person.sex === sex)
  }
  if (!people.length) return 'Nenhuma pessoa elegível cadastrada.'
  const history = programList().filter(program => program.id !== editingWeek)
  const person = [...people].sort((a, b) => lastAssignment(a.id, part, history, assistant).localeCompare(lastAssignment(b.id, part, history, assistant)) || a.name.localeCompare(b.name, 'pt-BR'))[0]
  return `Recomendado: ${person.name} · ${lastAssignmentLabel(person.id, part, history, assistant)}`
}

function permissionOptions(permission: AssignmentPermission, selected: string): string {
  let people = joinedPeople().filter(person => eligible(person, permission))
  const selectedPerson = joinedPeople().find(person => person.id === selected)
  if (selectedPerson && !people.some(person => person.id === selected)) people = [selectedPerson, ...people]
  return `<option value="">Sem designação</option>${people.map(person => `<option value="${esc(person.id)}" ${person.id === selected ? 'selected' : ''}>${esc(person.name)}${person.active ? '' : ' · inativo (histórico)'}</option>`).join('')}`
}

function substituteOptions(selected: string): string {
  let people = joinedPeople().filter(person => person.active)
  const selectedPerson = joinedPeople().find(person => person.id === selected)
  if (selectedPerson && !people.some(person => person.id === selected)) people = [selectedPerson, ...people]
  return `<option value="">Sem substituição</option>${people.map(person => `<option value="${esc(person.id)}" ${person.id === selected ? 'selected' : ''}>${esc(person.name)}${person.active ? '' : ' · inativo (histórico)'}</option>`).join('')}`
}

function renderEditor(id: string): void {
  const host = document.getElementById('weekEditor'), program = programs[id]
  if (!host || !program) return
  host.innerHTML = `<div class="form-panel"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div><strong>${esc(formatDate(program.meetingDate))}</strong><div class="form-help">${esc(program.bibleReading || 'Leitura bíblica não informada')}</div></div><button id="closeWeek" class="btn btn-ghost">Fechar</button></div><div class="module-form-grid" style="margin-top:10px"><div class="form-group"><label class="form-label">Tipo da semana</label><select id="weekType" class="form-select">${Object.entries(typeLabels).map(([value, label]) => `<option value="${value}" ${value === (program.type ?? 'normal') ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></div><div class="form-group"><label class="form-label">Leitura bíblica</label><input id="weekBible" class="form-input" value="${esc(program.bibleReading)}"></div><div class="form-group"><label class="form-label">Conselheiro assistente</label><select id="weekCounselor" class="form-select">${permissionOptions('conselheiro-assistente', program.counselorPersonId ?? '')}</select></div></div><div id="partsEditor" class="program-section-list">${sectionOrder.map(section => sectionEditor(program, section)).join('')}</div><div style="display:flex;gap:8px;flex-wrap:wrap"><button id="suggestProgram" class="btn btn-primary" type="button">Sugerir pendentes</button><button id="addProgramPart" class="btn btn-ghost" type="button">Adicionar parte</button></div><div class="form-help" style="margin-top:6px">Sugestões consideram elegibilidade, histórico e conflitos. Só são gravadas ao salvar.</div><div class="form-group" style="margin-top:10px"><label class="form-label">Observações</label><textarea id="weekNotes" class="form-input">${esc(program.notes ?? '')}</textarea></div><button id="saveWeek" class="btn btn-primary btn-full">Salvar programa</button></div>`
  document.getElementById('closeWeek')!.addEventListener('click', () => { editingWeek = ''; renderPrograms() })
  document.getElementById('addProgramPart')!.addEventListener('click', () => addPart(id))
  document.getElementById('suggestProgram')!.addEventListener('click', () => { programs[id] = suggestAssignments(program, joinedPeople(), programList().filter(item => item.id !== id)); toast('Sugestões preparadas para revisão'); renderEditor(id) })
  document.querySelectorAll<HTMLButtonElement>('[data-delete-part]').forEach(button => button.addEventListener('click', () => { program.parts = program.parts.filter(part => part.id !== button.dataset['deletePart']); renderEditor(id) }))
  document.querySelectorAll<HTMLButtonElement>('[data-edit-section]').forEach(button => button.addEventListener('click', () => sectionModal(id, button.dataset['editSection'] as ProgramSection)))
  document.getElementById('saveWeek')!.addEventListener('click', () => void saveWeek(id))
}

function sectionEditor(program: MeetingProgram, section: ProgramSection): string {
  const parts = program.parts.filter(part => part.section === section)
  if (!parts.length) return ''
  const assigned = parts.filter(part => part.assignedPersonId).length
  const pending = parts.length - assigned
  return `<button class="program-section-editor" type="button" data-edit-section="${section}"><span><strong>${esc(sectionLabels[section])}</strong><small>${assigned}/${parts.length} designadas${pending ? ` · ${pending} pendente${pending === 1 ? '' : 's'}` : ''}</small></span><span class="program-section-summary">${parts.map(part => esc(shortPartTitle(part.title))).join(' · ')}</span><span class="program-section-arrow" aria-hidden="true">›</span></button>`
}

function shortPartTitle(title: string): string {
  if (/leitura/i.test(title)) return 'Leitura'
  if (/joias/i.test(title)) return 'Joias'
  if (/iniciando/i.test(title)) return 'Iniciando conversas'
  if (/cultivando/i.test(title)) return 'Cultivando interesse'
  if (/fazendo discipulos/i.test(title)) return 'Fazendo discípulos'
  if (/necessidades/i.test(title)) return 'Necessidades locais'
  return title.length > 32 ? `${title.slice(0, 30)}...` : title
}

function sectionModal(id: string, section: ProgramSection): void {
  const program = programs[id]
  const parts = program?.parts.filter(part => part.section === section) ?? []
  if (!program || !parts.length) return
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay program-section-modal-overlay'
  overlay.innerHTML = `<div class="modal program-section-modal" role="dialog" aria-modal="true" aria-labelledby="programSectionTitle"><div class="program-section-modal-header"><div><h2 id="programSectionTitle">${esc(sectionLabels[section])}</h2><p>${parts.length} parte${parts.length === 1 ? '' : 's'} nesta seção</p></div><button id="closeSectionModal" class="program-icon-button" type="button" aria-label="Fechar" title="Fechar">×</button></div><div class="program-section-modal-body">${parts.map(partEditor).join('')}</div><div class="program-section-modal-footer"><button id="cancelSectionModal" class="btn btn-ghost" type="button">Cancelar</button><button id="applySectionModal" class="btn btn-primary" type="button">Aplicar edição</button></div></div>`
  document.body.appendChild(overlay)
  const close = () => overlay.remove()
  document.getElementById('closeSectionModal')!.addEventListener('click', close)
  document.getElementById('cancelSectionModal')!.addEventListener('click', close)
  overlay.addEventListener('click', event => { if (event.target === overlay) close() })
  bindModalConflicts(overlay, program)
  overlay.querySelectorAll<HTMLSelectElement>('[data-field="assignedPersonId"], [data-field="assistantPersonId"], [data-field="substitutePersonId"]').forEach(select => select.addEventListener('change', () => bindModalConflicts(overlay, program)))
  overlay.querySelectorAll<HTMLButtonElement>('[data-delete-part]').forEach(button => button.addEventListener('click', () => {
    program.parts = program.parts.filter(part => part.id !== button.dataset['deletePart'])
    close(); renderEditor(id); sectionModal(id, section)
  }))
  document.getElementById('applySectionModal')!.addEventListener('click', () => {
    const changed = readPartEditors(overlay, program)
    if (changed.some(part => !part.title)) { toast('Todas as partes precisam de título'); return }
    const byId = new Map(changed.map(part => [part.id, part]))
    const weekType = document.getElementById('weekType') as HTMLSelectElement | null
    const counselor = document.getElementById('weekCounselor') as HTMLSelectElement | null
    const bible = document.getElementById('weekBible') as HTMLInputElement | null
    const notes = document.getElementById('weekNotes') as HTMLTextAreaElement | null
    programs[id] = {
      ...program,
      type: (weekType?.value || program.type || 'normal') as WeekType,
      counselorPersonId: counselor?.value || undefined,
      bibleReading: bible?.value.trim() || '',
      notes: notes?.value.trim() || undefined,
      parts: program.parts.map(part => byId.get(part.id) ?? part),
    }
    close(); renderEditor(id)
  })
}

function partEditor(part: ProgramPart): string {
  return `<div class="program-part-editor" data-part="${esc(part.id)}"><div style="display:flex;justify-content:space-between;gap:8px"><strong>${esc(part.title)}</strong><button class="btn btn-ghost" type="button" data-delete-part="${esc(part.id)}">Excluir</button></div><div class="module-form-grid"><div class="form-group"><label class="form-label">Título</label><input class="form-input" data-field="title" value="${esc(part.title)}"></div><div class="form-group"><label class="form-label">Seção</label><select class="form-select" data-field="section"><option value="tesouros" ${part.section === 'tesouros' ? 'selected' : ''}>Tesouros</option><option value="ministerio" ${part.section === 'ministerio' ? 'selected' : ''}>Ministério</option><option value="vida-crista" ${part.section === 'vida-crista' ? 'selected' : ''}>Vida cristã</option></select></div>${part.section === 'ministerio' ? `<div class="form-group"><label class="form-label">Formato didático</label><select class="form-select" data-field="teachingType"><option value="conteudo" ${part.teachingType === 'conteudo' ? 'selected' : ''}>Conteúdo</option><option value="cenas" ${part.teachingType === 'cenas' ? 'selected' : ''}>Cenas</option><option value="videos" ${part.teachingType === 'videos' ? 'selected' : ''}>Uso de vídeos</option></select></div>` : ''}<div class="form-group"><label class="form-label">Duração</label><input class="form-input" data-field="durationMinutes" type="number" min="1" max="90" value="${part.durationMinutes}"></div><div class="form-group"><label class="form-label">Principal · ${esc(permissionLabels[permissionForPart(part)])}</label><select class="form-select" data-field="assignedPersonId">${optionsFor(part, part.assignedPersonId ?? '')}</select><small class="program-recommendation">${esc(recommendationLabel(part))}</small></div>${part.section === 'ministerio' ? `<div class="form-group"><label class="form-label">Ajudante</label><select class="form-select" data-field="assistantPersonId">${optionsFor(part, part.assistantPersonId ?? '', true)}</select><small class="program-recommendation">${esc(recommendationLabel(part, true))}</small></div>` : ''}<div class="form-group"><label class="form-label">Sala</label><select class="form-select" data-field="roomId">${rooms().map(room => `<option value="${esc(room.id)}" ${room.id === (part.roomId ?? 'main') ? 'selected' : ''}>${esc(room.name)}</option>`).join('')}</select></div><div class="form-group"><label class="form-label">Substituto</label><select class="form-select" data-field="substitutePersonId">${substituteOptions(part.substitutePersonId ?? '')}</select></div><div class="form-group"><label class="form-label">Quem realizou</label><select class="form-select" data-field="realizedPersonId"><option value="">Ainda não informado</option>${joinedPeople().map(person => `<option value="${esc(person.id)}" ${person.id === part.realizedPersonId ? 'selected' : ''}>${esc(person.name)}</option>`).join('')}</select></div><div class="form-group"><label class="form-label">Situação</label><select class="form-select" data-field="status">${Object.entries(statusLabels).map(([value, label]) => `<option value="${value}" ${value === (part.status ?? 'programado') ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></div><label class="program-absence"><input type="checkbox" data-field="absent" ${part.absent ? 'checked' : ''}> Designado(a) ausente</label></div><div class="program-conflicts" data-part-conflicts></div></div>`
}

function bindModalConflicts(overlay: HTMLElement, program: MeetingProgram): void {
  const changed = readPartEditors(overlay, program)
  const byId = new Map(changed.map(part => [part.id, part]))
  const draft = { ...program, parts: program.parts.map(part => byId.get(part.id) ?? part) }
  overlay.querySelectorAll<HTMLElement>('[data-part]').forEach(element => {
    const part = draft.parts.find(item => item.id === element.dataset['part'])
    const target = element.querySelector<HTMLElement>('[data-part-conflicts]')
    if (!part || !target) return
    const conflicts = assignmentConflicts(draft, part)
    target.innerHTML = conflicts.length ? `<div class="notice warning">${esc(conflicts.join(' '))}</div>` : ''
  })
}

function addPart(id: string): void {
  const program = programs[id], number = program.parts.length + 1
  program.parts.push({ id: `${id}-manual-${Date.now()}`, section: 'vida-crista', title: `Parte ${number}`, durationMinutes: 10 })
  renderEditor(id)
}

async function saveWeek(id: string): Promise<void> {
  const program = programs[id]
  const parts = readPartEditors(document.getElementById('weekEditor')!, program)
  if (parts.some(part => !part.title)) { toast('Todas as partes precisam de título'); return }
  const next: MeetingProgram = { ...program, type: (document.getElementById('weekType') as HTMLSelectElement).value as WeekType, counselorPersonId: (document.getElementById('weekCounselor') as HTMLSelectElement).value || undefined, bibleReading: (document.getElementById('weekBible') as HTMLInputElement).value.trim(), notes: (document.getElementById('weekNotes') as HTMLTextAreaElement).value.trim(), parts, updatedAt: now() }
  try { await update(programacaoRef, { [`programs/${id}`]: next }); programs[id] = next; editingWeek = ''; toast('Programa salvo'); renderPrograms() } catch { toast('Não foi possível salvar o programa') }
}

function readPartEditors(host: ParentNode, program: MeetingProgram): ProgramPart[] {
  return Array.from(host.querySelectorAll<HTMLElement>('[data-part]')).map((element): ProgramPart => {
    const value = (field: string) => (element.querySelector(`[data-field="${field}"]`) as HTMLInputElement | HTMLSelectElement | null)?.value ?? ''
    const previous = program.parts.find(part => part.id === element.dataset['part'])!
    const absent = (element.querySelector('[data-field="absent"]') as HTMLInputElement | null)?.checked ?? false
    return { ...previous, title: value('title').trim(), section: value('section') as ProgramPart['section'], teachingType: (value('teachingType') || undefined) as ProgramPart['teachingType'], durationMinutes: Math.max(1, Number(value('durationMinutes')) || 1), assignedPersonId: value('assignedPersonId') || undefined, assistantPersonId: value('assistantPersonId') || undefined, substitutePersonId: value('substitutePersonId') || undefined, realizedPersonId: value('realizedPersonId') || undefined, status: value('status') as AssignmentStatus, roomId: value('roomId') || 'main', absent, updatedAt: now() }
  })
}

function renderImports(): void {
  const year = Number(periodAnchor.slice(0, 4)) || new Date().getFullYear()
  const currentBi = Math.floor((Number(periodAnchor.slice(5, 7)) - 1) / 2) * 2
  root().innerHTML = `${title('Apostilas')}<div class="form-panel"><label class="form-label">Bimestre oficial</label><select id="bimester" class="form-select">${bimesters(year).map(item => `<option value="${item.startMonth}" ${item.startMonth === currentBi ? 'selected' : ''}>${esc(item.label)}</option>`).join('')}</select><button id="importBimester" class="btn btn-primary btn-full" style="margin-top:10px">Importar bimestre</button><div id="importResult" class="form-help" style="margin-top:8px"></div></div><form id="singleImport" class="form-panel" style="margin-top:10px"><label class="form-label">Página semanal oficial</label><input name="url" class="form-input" type="url" placeholder="https://www.jw.org/pt/..." required><button class="btn btn-ghost btn-full" style="margin-top:10px">Importar uma semana</button></form><details class="form-panel" style="margin-top:10px"><summary>Importação pontual por JSON</summary><textarea id="programJson" class="form-input" rows="7" style="margin-top:8px"></textarea><button id="importJson" class="btn btn-ghost btn-full" style="margin-top:8px">Salvar JSON</button></details>`
  document.getElementById('importBimester')!.addEventListener('click', () => void importBimester(year, Number((document.getElementById('bimester') as HTMLSelectElement).value)))
  document.getElementById('singleImport')!.addEventListener('submit', event => { event.preventDefault(); void importSingle(String(new FormData(event.currentTarget as HTMLFormElement).get('url') ?? '')) })
  document.getElementById('importJson')!.addEventListener('click', () => void importJson())
}

async function requestJson(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(API_IMPORT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const payload = await response.json() as Record<string, unknown>
  if (!response.ok) throw new Error(String(payload['error'] ?? 'Não foi possível acessar a programação oficial.'))
  return payload
}

async function importBimester(year: number, startMonth: number): Promise<void> {
  const button = document.getElementById('importBimester') as HTMLButtonElement; button.disabled = true
  try {
    const payload = await requestJson({ operation: 'bimonthly', year, startMonth })
    const pages = Array.isArray(payload['pages']) ? payload['pages'] as Array<{ sourceUrl: string; html: string }> : []
    const failures = Array.isArray(payload['failures']) ? [...payload['failures'] as string[]] : []
    const parsed: MeetingProgram[] = []
    pages.forEach(page => { try { parsed.push(parseOfficialProgram(page.sourceUrl, page.html)) } catch (error) { failures.push(error instanceof Error ? error.message : String(error)) } })
    const saved = await saveImported(parsed)
    const result = document.getElementById('importResult'); if (result) result.textContent = `${saved.imported} nova(s), ${saved.updated} atualizada(s) e ${failures.length} falha(s). Designações e observações existentes foram preservadas.`
    toast('Importação bimestral concluída')
  } catch (error) { toast(error instanceof Error ? error.message : 'Falha na importação') } finally { button.disabled = false }
}

async function importSingle(url: string): Promise<void> {
  try {
    if (!isOfficialJwUrl(url)) throw new Error('Use uma URL oficial em https://www.jw.org/pt/.')
    const payload = await requestJson({ url })
    const html = String(payload['html'] ?? '')
    if (!html) throw new Error('A página não retornou conteúdo.')
    await saveImported([parseOfficialProgram(url, html)])
    toast('Semana importada'); tab = 'programa'; render()
  } catch (error) { toast(error instanceof Error ? error.message : 'Falha na importação') }
}

async function importJson(): Promise<void> {
  try {
    const raw = JSON.parse((document.getElementById('programJson') as HTMLTextAreaElement).value) as MeetingProgram
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.meetingDate) || !Array.isArray(raw.parts)) throw new Error()
    await saveImported([{ ...raw, id: raw.id || raw.meetingDate }]); toast('Semana salva'); tab = 'programa'; render()
  } catch { toast('JSON inválido. Informe data e partes.') }
}

async function saveImported(incoming: MeetingProgram[]): Promise<{ imported: number; updated: number }> {
  const stamp = now(), patch: Record<string, unknown> = {}
  let imported = 0, updated = 0
  const unique = new Map(incoming.map(program => [program.id, program]))
  unique.forEach(program => {
    if (programs[program.id]) updated += 1
    else imported += 1
    const merged = mergeImportedProgram(programs[program.id], program, stamp)
    patch[`programs/${program.id}`] = merged
    programs[program.id] = merged
  })
  if (Object.keys(patch).length) await update(programacaoRef, patch)
  return { imported, updated }
}

function renderPeople(): void {
  const people = joinedPeople()
  root().innerHTML = `${title('Pessoas')}<div class="form-help" style="margin-bottom:10px">O Admin é a fonte de cadastro: nome, ID, telefone, sexo e privilégios são editados lá. Aqui, selecione pessoas já cadastradas e defina apenas a participação e as permissões.</div><div style="display:flex;justify-content:flex-end;margin-bottom:10px"><button id="linkPerson" class="btn btn-primary">Vincular pessoa do Admin</button></div><div class="module-option-list">${people.length ? people.map(person => `<button class="module-menu-btn" data-profile="${esc(person.id)}"><div class="mod-icon" style="background:#006EB620;color:#006EB6">${esc(person.name.charAt(0))}</div><div><div class="mod-label">${esc(person.name)}</div><div class="mod-desc">${person.active ? 'Ativo' : 'Inativo'} · ${person.permissions.length} permissão(ões)</div></div></button>`).join('') : '<p class="empty-state">Nenhuma pessoa vinculada a Vida e Ministério.</p>'}</div>`
  document.getElementById('linkPerson')!.addEventListener('click', linkPersonModal)
  document.querySelectorAll<HTMLButtonElement>('[data-profile]').forEach(button => button.addEventListener('click', () => profileModal(button.dataset['profile']!)))
}

function linkPersonModal(): void {
  const used = new Set(Object.values(profiles).map(profile => profile.masterId))
  const available = Object.entries(masterPeople).filter(([id, person]) => person.active && !used.has(id)).sort(([, a], [, b]) => a.name.localeCompare(b.name, 'pt-BR'))
  const overlay = document.createElement('div'); overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal"><h2>Vincular pessoa</h2><div class="form-group"><label class="form-label">Pessoa cadastrada no Admin</label><select id="masterToLink" class="form-select">${available.map(([id, person]) => `<option value="${esc(id)}">${esc(person.name)}</option>`).join('')}</select></div><div style="display:flex;gap:8px"><button id="cancelLink" class="btn btn-ghost" style="flex:1">Cancelar</button><button id="saveLink" class="btn btn-primary" style="flex:1" ${available.length ? '' : 'disabled'}>Vincular</button></div></div>`
  document.body.appendChild(overlay)
  document.getElementById('cancelLink')!.addEventListener('click', () => overlay.remove())
  document.getElementById('saveLink')!.addEventListener('click', async () => { const id = (document.getElementById('masterToLink') as HTMLSelectElement).value; if (!id) return; await update(programacaoRef, { [`pessoas/${id}`]: { masterId: id, active: true, permissions: [] } }); profiles[id] = { masterId: id, active: true, permissions: [] }; overlay.remove(); toast('Pessoa vinculada'); renderPeople() })
}

function profileModal(id: string): void {
  const person = joinedPeople().find(item => item.id === id)!, profile = profiles[id]
  const overlay = document.createElement('div'); overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal"><h2>${esc(person.name)}</h2><div class="form-help" style="margin-bottom:10px">Nome, ID, telefone, sexo e privilégio são editados somente no Admin.</div><label style="display:flex;gap:7px;margin-bottom:12px"><input id="profileActive" type="checkbox" ${profile.active !== false ? 'checked' : ''}> Participa de Vida e Ministério</label><div class="form-label" style="margin-bottom:6px">Permissões específicas</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:7px">${ASSIGNMENT_PERMISSIONS.map(permission => `<label style="font-size:.76rem"><input type="checkbox" data-permission="${permission}" ${profile.permissions?.includes(permission) ? 'checked' : ''}> ${esc(permissionLabels[permission])}</label>`).join('')}</div><div style="display:flex;gap:8px;margin-top:14px"><button id="unlinkProfile" class="btn btn-danger">Desvincular</button><span style="flex:1"></span><button id="cancelProfile" class="btn btn-ghost">Cancelar</button><button id="saveProfile" class="btn btn-primary">Salvar</button></div></div>`
  document.body.appendChild(overlay)
  document.getElementById('cancelProfile')!.addEventListener('click', () => overlay.remove())
  document.getElementById('saveProfile')!.addEventListener('click', async () => { const permissions = Array.from(document.querySelectorAll<HTMLInputElement>('[data-permission]:checked')).map(box => box.dataset['permission'] as AssignmentPermission); const next = { ...profile, active: (document.getElementById('profileActive') as HTMLInputElement).checked, permissions }; await update(programacaoRef, { [`pessoas/${id}`]: next }); profiles[id] = next; overlay.remove(); toast('Permissões salvas'); renderPeople() })
  document.getElementById('unlinkProfile')!.addEventListener('click', async () => { if (programList().some(program => program.parts.some(part => [part.assignedPersonId, part.assistantPersonId, part.substitutePersonId, part.realizedPersonId].includes(id)))) { toast('Pessoa usada no histórico; desative em vez de desvincular'); return } if (!confirm(`Desvincular ${person.name}?`)) return; await update(programacaoRef, { [`pessoas/${id}`]: null }); delete profiles[id]; overlay.remove(); renderPeople() })
}

function renderFiles(): void {
  const list = filtered()
  root().innerHTML = `${title('Arquivos')}${periodControls()}<div class="form-panel"><label class="form-label">Semana para S-89</label><select id="fileWeek" class="form-select">${list.map(program => `<option value="${esc(program.id)}">${esc(formatDate(program.meetingDate))}</option>`).join('')}</select><label class="form-label" style="margin-top:8px">Cartão individual</label><select id="filePart" class="form-select"></select><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button id="fileS89One" class="btn btn-primary" ${list.length ? '' : 'disabled'}>S-89 selecionado</button><button id="fileS89" class="btn btn-ghost" ${list.length ? '' : 'disabled'}>S-89 da semana</button><button id="filePdf" class="btn btn-ghost" ${list.length ? '' : 'disabled'}>S-140 PDF</button><button id="fileDocx" class="btn btn-ghost" ${list.length ? '' : 'disabled'}>S-140 DOCX</button><a class="btn btn-ghost" href="https://www.jw.org/pt/biblioteca/orientacoes/" target="_blank" rel="noopener noreferrer">Abrir S-38 oficial</a></div><div class="form-help" style="margin-top:8px">Os documentos usam o período selecionado. Gerar arquivos não altera a programação.</div></div>`
  bindPeriod(renderFiles)
  const refreshParts = () => { const program = programs[(document.getElementById('fileWeek') as HTMLSelectElement).value]; const parts = program?.parts.filter(part => part.section === 'ministerio' && part.assignedPersonId) ?? []; (document.getElementById('filePart') as HTMLSelectElement).innerHTML = parts.map(part => `<option value="${esc(part.id)}">${esc(part.title)}</option>`).join('') }
  document.getElementById('fileWeek')?.addEventListener('change', refreshParts)
  document.getElementById('fileS89One')?.addEventListener('click', async () => { const { downloadS89 } = await import('./programacao-documents'); const program = programs[(document.getElementById('fileWeek') as HTMLSelectElement).value]; const partId = (document.getElementById('filePart') as HTMLSelectElement).value; const count = await downloadS89({ ...program, parts: program.parts.filter(part => part.id === partId) }, joinedPeople()); toast(count ? 'Cartão S-89 gerado' : 'Selecione uma designação do ministério') })
  document.getElementById('fileS89')?.addEventListener('click', async () => { const { downloadS89 } = await import('./programacao-documents'); const program = programs[(document.getElementById('fileWeek') as HTMLSelectElement).value]; const count = await downloadS89(program, joinedPeople()); toast(count ? `${count} cartão(ões) S-89 gerado(s)` : 'Não há partes do ministério designadas') })
  document.getElementById('filePdf')?.addEventListener('click', async () => { const { downloadS140Pdf } = await import('./programacao-documents'); await downloadS140Pdf(list, congregation, joinedPeople()); toast('S-140 PDF gerado') })
  document.getElementById('fileDocx')?.addEventListener('click', async () => { const { downloadS140Docx } = await import('./programacao-documents'); await downloadS140Docx(list, congregation, joinedPeople()); toast('S-140 DOCX gerado') })
  refreshParts()
}

type ReminderRole = 'principal' | 'ajudante'
interface ReminderEntry { program: MeetingProgram; part: ProgramPart; person: ProgramPerson; role: ReminderRole; kind: 's89' | 'geral' }

function reminderEntries(): ReminderEntry[] {
  const people = new Map(joinedPeople().map(person => [person.id, person]))
  return filtered().flatMap(program => program.parts.flatMap(part => {
    const kind = part.section === 'ministerio' ? 's89' as const : 'geral' as const
    const principal = people.get(part.substitutePersonId ?? part.assignedPersonId ?? '')
    const assistant = people.get(part.assistantPersonId ?? '')
    const entries: ReminderEntry[] = []
    if (principal) entries.push({ program, part, person: principal, role: 'principal', kind })
    if (assistant && assistant.id !== principal?.id) entries.push({ program, part, person: assistant, role: 'ajudante', kind })
    return entries
  }))
}

function reminderStamp(entry: ReminderEntry): string | undefined {
  return entry.role === 'ajudante' ? entry.part.assistantRemindedAt : entry.part.remindedAt
}

function reminderText(entry: ReminderEntry): string {
  const base = reminderMessage(entry.person, entry.program, entry.part, meetingTime(), settings.reminderTemplate)
  return entry.kind === 's89' ? `${base}\n\nO cartão S-89 desta designação está disponível para você.` : base
}

function renderReminders(): void {
  const entries = reminderEntries()
  const s89 = entries.filter(entry => entry.kind === 's89').length
  const sent = entries.filter(entry => reminderStamp(entry)).length
  root().innerHTML = `${title('Lembretes')}<div class="program-summary" aria-label="Resumo de lembretes"><div><strong>${entries.length}</strong><span>Destinatários</span></div><div><strong>${s89}</strong><span>S-89</span></div><div><strong>${sent}</strong><span>Lembretes abertos</span></div></div>${periodControls()}<div class="form-panel"><label class="form-label">Designação</label><select id="reminderEntry" class="form-select"><optgroup label="S-89 · Ministério">${entries.filter(entry => entry.kind === 's89').map(entry => reminderOption(entry, entries.indexOf(entry))).join('')}</optgroup><optgroup label="Lembretes gerais">${entries.filter(entry => entry.kind === 'geral').map(entry => reminderOption(entry, entries.indexOf(entry))).join('')}</optgroup></select><div id="reminderMeta" class="form-help" style="margin-top:8px"></div><textarea id="reminderText" class="form-input" rows="8" style="margin-top:10px"></textarea><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button id="openReminder" class="btn btn-primary" ${entries.length ? '' : 'disabled'}>Abrir WhatsApp</button><button id="downloadReminderS89" class="btn btn-ghost" type="button" ${entries.length ? '' : 'disabled'}>Gerar S-89</button><button id="confirmReminder" class="btn btn-ghost" ${entries.length ? '' : 'disabled'}>Marcar confirmação</button></div></div>`
  bindPeriod(renderReminders)
  const selected = () => entries[Number((document.getElementById('reminderEntry') as HTMLSelectElement).value)]
  const refresh = () => {
    const entry = selected()
    ;(document.getElementById('reminderText') as HTMLTextAreaElement).value = entry ? reminderText(entry) : ''
    const meta = document.getElementById('reminderMeta')
    const s89Button = document.getElementById('downloadReminderS89') as HTMLButtonElement
    if (meta) meta.textContent = entry ? `${entry.kind === 's89' ? 'S-89' : 'Lembrete geral'} · ${entry.role === 'ajudante' ? 'Ajudante' : entry.part.substitutePersonId ? 'Substituto' : 'Principal'}${reminderStamp(entry) ? ` · aberto em ${formatDate(reminderStamp(entry)!.slice(0, 10))}` : ' · ainda não aberto'}${entry.part.confirmedAt ? ' · confirmação registrada' : ''}` : ''
    s89Button.disabled = !entry || entry.kind !== 's89'
  }
  document.getElementById('reminderEntry')?.addEventListener('change', refresh)
  document.getElementById('openReminder')?.addEventListener('click', async () => { const entry = selected(); if (!entry?.person.whatsapp) { toast('Cadastre o WhatsApp no Admin'); return } const popup = window.open(`https://wa.me/${entry.person.whatsapp}?text=${encodeURIComponent((document.getElementById('reminderText') as HTMLTextAreaElement).value)}`, '_blank', 'noopener,noreferrer'); if (!popup) { toast('Permita pop-ups para abrir o WhatsApp'); return } const stamp = now(), field = entry.role === 'ajudante' ? 'assistantRemindedAt' : 'remindedAt'; await update(programacaoRef, { [`programs/${entry.program.id}/parts/${entry.program.parts.indexOf(entry.part)}/${field}`]: stamp }); entry.part[field] = stamp; toast('WhatsApp aberto; revise antes de enviar'); refresh() })
  document.getElementById('downloadReminderS89')?.addEventListener('click', async () => { const entry = selected(); if (!entry || entry.kind !== 's89') { toast('S-89 é usado apenas nas partes do ministério'); return } const { downloadS89 } = await import('./programacao-documents'); const count = await downloadS89({ ...entry.program, parts: [entry.part] }, joinedPeople()); toast(count ? 'Cartão S-89 gerado' : 'Não foi possível gerar o cartão S-89') })
  document.getElementById('confirmReminder')?.addEventListener('click', async () => { const entry = selected(); if (!entry) return; const stamp = now(); await update(programacaoRef, { [`programs/${entry.program.id}/parts/${entry.program.parts.indexOf(entry.part)}/confirmedAt`]: stamp }); entry.part.confirmedAt = stamp; toast('Confirmação registrada'); refresh() })
  refresh()
}

function reminderOption(entry: ReminderEntry, index: number): string {
  const role = entry.role === 'ajudante' ? 'Ajudante' : entry.part.substitutePersonId ? 'Substituto' : 'Principal'
  return `<option value="${index}">${esc(formatDate(entry.program.meetingDate))} · ${esc(entry.person.name)} · ${esc(role)} · ${esc(entry.part.title)}${reminderStamp(entry) ? ' · aberto' : ''}</option>`
}

function renderPending(): void {
  const pending = programPendings(filtered(), joinedPeople())
  root().innerHTML = `${title('Pendências')}${periodControls()}<div class="module-option-list">${pending.length ? pending.map((item, index) => `<button class="module-menu-btn" data-pending-index="${index}"><div class="mod-icon" style="background:#B3261E20;color:#B3261E">!</div><div><div class="mod-label">${esc(formatDate(item.date))}</div><div class="mod-desc">${esc(item.message)}</div></div><span style="color:var(--ink-3);font-size:1.2rem">›</span></button>`).join('') : '<div class="notice success">Nenhuma pendência no período.</div>'}</div>`
  bindPeriod(renderPending)
  document.querySelectorAll<HTMLButtonElement>('[data-pending-index]').forEach(button => button.addEventListener('click', () => {
    const item = pending[Number(button.dataset['pendingIndex'])]
    if (!item) return
    periodAnchor = item.date; editingWeek = item.programId; pendingPartId = item.partId ?? ''; tab = 'programa'; render()
  }))
}

function renderSettings(): void {
  root().innerHTML = `${title('Configuração')}<div class="form-panel"><div class="form-group"><label class="form-label">Horário da reunião</label><input id="settingTime" class="form-input" type="time" value="${esc(meetingTime())}"></div><div class="form-group"><label class="form-label">Salas</label><textarea id="settingRooms" class="form-input" rows="3">${esc(rooms().map(room => room.name).join('\n'))}</textarea><div class="form-help">Uma sala por linha. A primeira é o salão principal.</div></div><div class="form-group"><label class="form-label">Modelo de lembrete</label><textarea id="settingTemplate" class="form-input" rows="7">${esc(settings.reminderTemplate || 'Olá, {nome}!\n\nLembrando sua designação na reunião de {data}, às {horario}:\n\nParte: {parte}\n\nPor favor, confirme o recebimento.')}</textarea><div class="form-help">Marcadores: {nome}, {data}, {horario} e {parte}.</div></div><button id="saveProgramSettings" class="btn btn-primary btn-full">Salvar configuração</button></div>`
  document.getElementById('saveProgramSettings')!.addEventListener('click', async () => {
    const names = (document.getElementById('settingRooms') as HTMLTextAreaElement).value.split('\n').map(value => value.trim()).filter(Boolean)
    if (!names.length) { toast('Informe ao menos uma sala'); return }
    const next: Settings = { meetingTime: (document.getElementById('settingTime') as HTMLInputElement).value || '19:00', rooms: names.map((name, index) => ({ id: index ? `room-${index + 1}` : 'main', name })), reminderTemplate: (document.getElementById('settingTemplate') as HTMLTextAreaElement).value.trim() }
    try { await update(programacaoRef, { settings: next }); settings = next; toast('Configuração salva') } catch { toast('Não foi possível salvar a configuração') }
  })
}
