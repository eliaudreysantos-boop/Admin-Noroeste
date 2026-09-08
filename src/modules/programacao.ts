import type { AppContext, RawPessoas } from '../types'
import { configCongregacaoRef, configReunioesRef, get, pessoasRef, programacaoRef, update } from '../firebase'
import { renderMenuCards, type ItemMenu } from '../ui/menu-cards'
import { moduleBackButton } from '../ui/module-header'
import {
  ASSIGNMENT_PERMISSIONS, assignmentConflicts, assistantNeedsSameSex, bimesters, candidates,
  eligible, filterPrograms, isOfficialJwUrl, mergeImportedProgram, parseOfficialProgram,
  permissionForPart, programPendings, reminderMessage, suggestAssignments,
  type AssignmentPermission, type AssignmentStatus, type MeetingProgram, type ProgramPart, type ProgramPerson, type WeekType,
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

let tab: Tab = 'indice'
let data: ProgramData = {}
let masterPeople: RawPessoas = {}
let programs: Record<string, MeetingProgram> = {}
let profiles: Record<string, StoredPerson> = {}
let settings: Settings = {}
let congregation = 'Noroeste'
let editingWeek = ''
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
  } catch (error) { console.error(error); toast('Não foi possível carregar Programação') }
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
  root().innerHTML = '<div style="margin-bottom:14px"><h2 style="font-size:1.05rem;color:var(--blue-deep)">Programação</h2></div><div id="programacaoMenu"></div>'
  const items: ItemMenu[] = [
    { id: 'programa', titulo: 'Programa', subtitulo: 'Semanas, partes e designações', icone: '▦', corFundo: '#003F72' },
    { id: 'pessoas', titulo: 'Pessoas', subtitulo: 'Vínculos e permissões de designação', icone: '♙', corFundo: '#006EB6' },
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
  return `<div class="module-form-grid" style="margin-bottom:12px"><div class="form-group"><label class="form-label">Visualização</label><select id="programPeriodMode" class="form-select"><option value="week" ${periodMode === 'week' ? 'selected' : ''}>Semana</option><option value="month" ${periodMode === 'month' ? 'selected' : ''}>Mês</option><option value="bimester" ${periodMode === 'bimester' ? 'selected' : ''}>Bimestre</option></select></div><div class="form-group"><label class="form-label">Período</label><input id="programPeriodAnchor" class="form-input" type="date" value="${periodAnchor}"></div></div>`
}
function bindPeriod(callback: () => void): void {
  document.getElementById('programPeriodMode')?.addEventListener('change', event => { periodMode = (event.target as HTMLSelectElement).value as PeriodMode; callback() })
  document.getElementById('programPeriodAnchor')?.addEventListener('change', event => { periodAnchor = (event.target as HTMLInputElement).value || today(); callback() })
}

function renderPrograms(): void {
  const list = filtered()
  root().innerHTML = `${title('Programa')}${periodControls()}<div class="module-option-list">${list.length ? list.map(program => weekRow(program)).join('') : '<p class="empty-state">Nenhuma semana neste período.</p>'}</div><div id="weekEditor" style="margin-top:12px"></div>`
  bindPeriod(renderPrograms)
  document.querySelectorAll<HTMLButtonElement>('[data-week]').forEach(button => button.addEventListener('click', () => { editingWeek = button.dataset['week']!; renderPrograms() }))
  if (editingWeek) renderEditor(editingWeek)
}

function weekRow(program: MeetingProgram): string {
  const pending = program.parts.filter(part => !part.assignedPersonId).length
  return `<button class="module-menu-btn" type="button" data-week="${esc(program.id)}"><div class="mod-icon" style="background:#003F7220;color:#003F72">${esc(program.meetingDate.slice(8, 10))}</div><div style="flex:1;min-width:0"><div class="mod-label">${esc(formatDate(program.meetingDate))} · ${esc(typeLabels[program.type ?? 'normal'])}</div><div class="mod-desc">${esc(program.bibleReading)} · ${pending ? `${pending} pendente(s)` : 'Completa'}</div></div></button>`
}

function optionsFor(part: ProgramPart, selected: string, assistant = false): string {
  let people = candidates(part, joinedPeople(), assistant)
  if (assistant && assistantNeedsSameSex(part) && part.assignedPersonId) {
    const sex = joinedPeople().find(person => person.id === part.assignedPersonId)?.sex
    if (sex) people = people.filter(person => person.sex === sex)
  }
  const selectedPerson = joinedPeople().find(person => person.id === selected)
  if (selectedPerson && !people.some(person => person.id === selected)) people = [selectedPerson, ...people]
  return `<option value="">Sem designação</option>${people.map(person => `<option value="${esc(person.id)}" ${person.id === selected ? 'selected' : ''}>${esc(person.name)}</option>`).join('')}`
}

function permissionOptions(permission: AssignmentPermission, selected: string): string {
  return `<option value="">Sem designação</option>${joinedPeople().filter(person => eligible(person, permission)).map(person => `<option value="${esc(person.id)}" ${person.id === selected ? 'selected' : ''}>${esc(person.name)}</option>`).join('')}`
}

function renderEditor(id: string): void {
  const host = document.getElementById('weekEditor'), program = programs[id]
  if (!host || !program) return
  host.innerHTML = `<div class="form-panel"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><strong>${esc(formatDate(program.meetingDate))}</strong><button id="closeWeek" class="btn btn-ghost">Fechar</button></div><div class="module-form-grid" style="margin-top:10px"><div class="form-group"><label class="form-label">Tipo da semana</label><select id="weekType" class="form-select">${Object.entries(typeLabels).map(([value, label]) => `<option value="${value}" ${value === (program.type ?? 'normal') ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></div><div class="form-group"><label class="form-label">Leitura bíblica</label><input id="weekBible" class="form-input" value="${esc(program.bibleReading)}"></div><div class="form-group"><label class="form-label">Conselheiro assistente</label><select id="weekCounselor" class="form-select">${permissionOptions('conselheiro-assistente', program.counselorPersonId ?? '')}</select></div></div><div id="partsEditor">${program.parts.map(partEditor).join('')}</div><div style="display:flex;gap:8px;flex-wrap:wrap"><button id="suggestProgram" class="btn btn-primary" type="button">Sugerir pendentes</button><button id="addProgramPart" class="btn btn-ghost" type="button">Adicionar parte</button></div><div class="form-help" style="margin-top:6px">Sugestões consideram elegibilidade, histórico e conflitos. Só são gravadas ao salvar.</div><div class="form-group" style="margin-top:10px"><label class="form-label">Observações</label><textarea id="weekNotes" class="form-input">${esc(program.notes ?? '')}</textarea></div><button id="saveWeek" class="btn btn-primary btn-full">Salvar programa</button></div>`
  document.getElementById('closeWeek')!.addEventListener('click', () => { editingWeek = ''; renderPrograms() })
  document.getElementById('addProgramPart')!.addEventListener('click', () => addPart(id))
  document.getElementById('suggestProgram')!.addEventListener('click', () => { programs[id] = suggestAssignments(program, joinedPeople(), programList().filter(item => item.id !== id)); toast('Sugestões preparadas para revisão'); renderEditor(id) })
  document.querySelectorAll<HTMLButtonElement>('[data-delete-part]').forEach(button => button.addEventListener('click', () => { program.parts = program.parts.filter(part => part.id !== button.dataset['deletePart']); renderEditor(id) }))
  document.getElementById('saveWeek')!.addEventListener('click', () => void saveWeek(id))
}

function partEditor(part: ProgramPart): string {
  const conflicts = assignmentConflicts(programs[editingWeek], part)
  return `<div class="form-panel" data-part="${esc(part.id)}" style="margin:10px 0;padding:10px"><div style="display:flex;justify-content:space-between;gap:8px"><strong>${esc(part.title)}</strong><button class="btn btn-ghost" type="button" data-delete-part="${esc(part.id)}">Excluir</button></div><div class="module-form-grid"><div class="form-group"><label class="form-label">Título</label><input class="form-input" data-field="title" value="${esc(part.title)}"></div><div class="form-group"><label class="form-label">Seção</label><select class="form-select" data-field="section"><option value="tesouros" ${part.section === 'tesouros' ? 'selected' : ''}>Tesouros</option><option value="ministerio" ${part.section === 'ministerio' ? 'selected' : ''}>Ministério</option><option value="vida-crista" ${part.section === 'vida-crista' ? 'selected' : ''}>Vida cristã</option></select></div>${part.section === 'ministerio' ? `<div class="form-group"><label class="form-label">Formato didático</label><select class="form-select" data-field="teachingType"><option value="conteudo" ${part.teachingType === 'conteudo' ? 'selected' : ''}>Conteúdo</option><option value="cenas" ${part.teachingType === 'cenas' ? 'selected' : ''}>Cenas</option><option value="videos" ${part.teachingType === 'videos' ? 'selected' : ''}>Uso de vídeos</option></select></div>` : ''}<div class="form-group"><label class="form-label">Duração</label><input class="form-input" data-field="durationMinutes" type="number" min="1" max="90" value="${part.durationMinutes}"></div><div class="form-group"><label class="form-label">Principal · ${esc(permissionLabels[permissionForPart(part)])}</label><select class="form-select" data-field="assignedPersonId">${optionsFor(part, part.assignedPersonId ?? '')}</select></div>${part.section === 'ministerio' ? `<div class="form-group"><label class="form-label">Ajudante</label><select class="form-select" data-field="assistantPersonId">${optionsFor(part, part.assistantPersonId ?? '', true)}</select></div>` : ''}<div class="form-group"><label class="form-label">Sala</label><select class="form-select" data-field="roomId">${rooms().map(room => `<option value="${esc(room.id)}" ${room.id === (part.roomId ?? 'main') ? 'selected' : ''}>${esc(room.name)}</option>`).join('')}</select></div><div class="form-group"><label class="form-label">Substituto</label><select class="form-select" data-field="substitutePersonId"><option value="">Sem substituição</option>${joinedPeople().filter(person => person.active).map(person => `<option value="${esc(person.id)}" ${person.id === part.substitutePersonId ? 'selected' : ''}>${esc(person.name)}</option>`).join('')}</select></div><div class="form-group"><label class="form-label">Quem realizou</label><select class="form-select" data-field="realizedPersonId"><option value="">Ainda não informado</option>${joinedPeople().map(person => `<option value="${esc(person.id)}" ${person.id === part.realizedPersonId ? 'selected' : ''}>${esc(person.name)}</option>`).join('')}</select></div><div class="form-group"><label class="form-label">Situação</label><select class="form-select" data-field="status">${Object.entries(statusLabels).map(([value, label]) => `<option value="${value}" ${value === (part.status ?? 'programado') ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></div></div>${conflicts.length ? `<div class="notice warning">${esc(conflicts.join(' '))}</div>` : ''}</div>`
}

function addPart(id: string): void {
  const program = programs[id], number = program.parts.length + 1
  program.parts.push({ id: `${id}-manual-${Date.now()}`, section: 'vida-crista', title: `Parte ${number}`, durationMinutes: 10 })
  renderEditor(id)
}

async function saveWeek(id: string): Promise<void> {
  const program = programs[id]
  const parts = Array.from(document.querySelectorAll<HTMLElement>('[data-part]')).map((element): ProgramPart => {
    const value = (field: string) => (element.querySelector(`[data-field="${field}"]`) as HTMLInputElement | HTMLSelectElement | null)?.value ?? ''
    const previous = program.parts.find(part => part.id === element.dataset['part'])!
    return { ...previous, title: value('title').trim(), section: value('section') as ProgramPart['section'], teachingType: (value('teachingType') || undefined) as ProgramPart['teachingType'], durationMinutes: Math.max(1, Number(value('durationMinutes')) || 1), assignedPersonId: value('assignedPersonId') || undefined, assistantPersonId: value('assistantPersonId') || undefined, substitutePersonId: value('substitutePersonId') || undefined, realizedPersonId: value('realizedPersonId') || undefined, status: value('status') as AssignmentStatus, roomId: value('roomId') || 'main', updatedAt: now() }
  })
  if (parts.some(part => !part.title)) { toast('Todas as partes precisam de título'); return }
  const next: MeetingProgram = { ...program, type: (document.getElementById('weekType') as HTMLSelectElement).value as WeekType, counselorPersonId: (document.getElementById('weekCounselor') as HTMLSelectElement).value || undefined, bibleReading: (document.getElementById('weekBible') as HTMLInputElement).value.trim(), notes: (document.getElementById('weekNotes') as HTMLTextAreaElement).value.trim(), parts, updatedAt: now() }
  try { await update(programacaoRef, { [`programs/${id}`]: next }); programs[id] = next; editingWeek = ''; toast('Programa salvo'); renderPrograms() } catch { toast('Não foi possível salvar o programa') }
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
    await saveImported(parsed)
    const result = document.getElementById('importResult'); if (result) result.textContent = `${parsed.length} semana(s) processada(s). ${failures.length} falha(s). Semanas existentes foram preservadas.`
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

async function saveImported(incoming: MeetingProgram[]): Promise<void> {
  const stamp = now(), patch: Record<string, unknown> = {}
  incoming.forEach(program => { const merged = mergeImportedProgram(programs[program.id], program, stamp); patch[`programs/${program.id}`] = merged; programs[program.id] = merged })
  if (Object.keys(patch).length) await update(programacaoRef, patch)
}

function renderPeople(): void {
  const people = joinedPeople()
  root().innerHTML = `${title('Pessoas')}<div style="display:flex;justify-content:flex-end;margin-bottom:10px"><button id="linkPerson" class="btn btn-primary">Vincular pessoa do Admin</button></div><div class="module-option-list">${people.length ? people.map(person => `<button class="module-menu-btn" data-profile="${esc(person.id)}"><div class="mod-icon" style="background:#006EB620;color:#006EB6">${esc(person.name.charAt(0))}</div><div><div class="mod-label">${esc(person.name)}</div><div class="mod-desc">${person.active ? 'Ativo' : 'Inativo'} · ${person.permissions.length} permissão(ões)</div></div></button>`).join('') : '<p class="empty-state">Nenhuma pessoa vinculada à Programação.</p>'}</div>`
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
  overlay.innerHTML = `<div class="modal"><h2>${esc(person.name)}</h2><div class="form-help" style="margin-bottom:10px">Nome, sexo, privilégio e WhatsApp são editados no Admin.</div><label style="display:flex;gap:7px;margin-bottom:12px"><input id="profileActive" type="checkbox" ${profile.active !== false ? 'checked' : ''}> Participa da Programação</label><div class="form-label" style="margin-bottom:6px">Permissões específicas</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:7px">${ASSIGNMENT_PERMISSIONS.map(permission => `<label style="font-size:.76rem"><input type="checkbox" data-permission="${permission}" ${profile.permissions?.includes(permission) ? 'checked' : ''}> ${esc(permissionLabels[permission])}</label>`).join('')}</div><div style="display:flex;gap:8px;margin-top:14px"><button id="unlinkProfile" class="btn btn-danger">Desvincular</button><span style="flex:1"></span><button id="cancelProfile" class="btn btn-ghost">Cancelar</button><button id="saveProfile" class="btn btn-primary">Salvar</button></div></div>`
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

function reminderEntries(): Array<{ program: MeetingProgram; part: ProgramPart; person: ProgramPerson }> {
  const people = new Map(joinedPeople().map(person => [person.id, person]))
  return filtered().flatMap(program => program.parts.flatMap(part => { const person = people.get(part.substitutePersonId ?? part.assignedPersonId ?? ''); return person ? [{ program, part, person }] : [] }))
}

function renderReminders(): void {
  const entries = reminderEntries()
  root().innerHTML = `${title('Lembretes')}${periodControls()}<div class="form-panel"><label class="form-label">Designação</label><select id="reminderEntry" class="form-select">${entries.map((entry, index) => `<option value="${index}">${esc(formatDate(entry.program.meetingDate))} · ${esc(entry.person.name)} · ${esc(entry.part.title)}</option>`).join('')}</select><textarea id="reminderText" class="form-input" rows="8" style="margin-top:10px"></textarea><div style="display:flex;gap:8px;margin-top:10px"><button id="openReminder" class="btn btn-primary" ${entries.length ? '' : 'disabled'}>Abrir WhatsApp</button><button id="confirmReminder" class="btn btn-ghost" ${entries.length ? '' : 'disabled'}>Marcar confirmado</button></div></div>`
  bindPeriod(renderReminders)
  const refresh = () => { const entry = entries[Number((document.getElementById('reminderEntry') as HTMLSelectElement).value)]; (document.getElementById('reminderText') as HTMLTextAreaElement).value = entry ? reminderMessage(entry.person, entry.program, entry.part, meetingTime(), settings.reminderTemplate) : '' }
  document.getElementById('reminderEntry')?.addEventListener('change', refresh)
  document.getElementById('openReminder')?.addEventListener('click', async () => { const entry = entries[Number((document.getElementById('reminderEntry') as HTMLSelectElement).value)]; if (!entry?.person.whatsapp) { toast('Cadastre o WhatsApp no Admin'); return } const popup = window.open(`https://wa.me/${entry.person.whatsapp}?text=${encodeURIComponent((document.getElementById('reminderText') as HTMLTextAreaElement).value)}`, '_blank', 'noopener,noreferrer'); if (!popup) { toast('Permita pop-ups para abrir o WhatsApp'); return } const stamp = now(); await update(programacaoRef, { [`programs/${entry.program.id}/parts/${entry.program.parts.indexOf(entry.part)}/remindedAt`]: stamp }); entry.part.remindedAt = stamp; toast('WhatsApp aberto; revise antes de enviar') })
  document.getElementById('confirmReminder')?.addEventListener('click', async () => { const entry = entries[Number((document.getElementById('reminderEntry') as HTMLSelectElement).value)]; if (!entry) return; const stamp = now(); await update(programacaoRef, { [`programs/${entry.program.id}/parts/${entry.program.parts.indexOf(entry.part)}/confirmedAt`]: stamp }); entry.part.confirmedAt = stamp; toast('Confirmação registrada') })
  refresh()
}

function renderPending(): void {
  const pending = programPendings(filtered(), joinedPeople())
  root().innerHTML = `${title('Pendências')}${periodControls()}<div class="module-option-list">${pending.length ? pending.map(item => `<button class="module-menu-btn" data-pending-date="${item.date}"><div class="mod-icon" style="background:#B3261E20;color:#B3261E">!</div><div><div class="mod-label">${esc(formatDate(item.date))}</div><div class="mod-desc">${esc(item.message)}</div></div></button>`).join('') : '<div class="notice success">Nenhuma pendência no período.</div>'}</div>`
  bindPeriod(renderPending)
  document.querySelectorAll<HTMLButtonElement>('[data-pending-date]').forEach(button => button.addEventListener('click', () => { periodAnchor = button.dataset['pendingDate']!; editingWeek = programList().find(program => program.meetingDate === periodAnchor)?.id ?? ''; tab = 'programa'; render() }))
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
