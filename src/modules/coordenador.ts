import type { AppContext, LimpezaPeriodoGerado, RawPessoas } from '../types'
import { configCongregacaoRef, get, limpezaPeriodosRef, pessoasRef, programacaoRef, tarefasPeopleRef, tarefasScaleRef } from '../firebase'
import { canExportDocument, canViewCoordinatorCard, type CoordinatorDocument, type CoordinatorModule } from './coordenador-domain'
import type { AssignmentPermission, MeetingProgram, ProgramPart, ProgramPerson } from './programacao-domain'
import { canonicalMeetingType, type TaskMeeting, type TaskPeriod, type TaskPerson } from './tarefas-domain'

const META: Array<{ id: CoordinatorModule; title: string; description: string; color: string }> = [
  { id: 'tarefas', title: 'Tarefas', description: 'Escala das reuniões', color: '#7E3AF2' },
  { id: 'escala', title: 'Escala', description: 'Escala de campo', color: '#1A6B3C' },
  { id: 'limpeza', title: 'Limpeza', description: 'Períodos já gerados', color: '#006EB6' },
  { id: 'oradores', title: 'Oradores', description: 'Discursos públicos', color: '#5C6062' },
  { id: 'programacao', title: 'Programação', description: 'S-89 e S-140', color: '#003F72' },
  { id: 'secretario', title: 'Secretário', description: 'Documentos autorizados', color: '#B3261E' },
]

let context: AppContext
const esc = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]!)
const toast = (message: string) => { const el = document.getElementById('toast'); if (!el) return; el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 3000) }

export default function mount(ctx: AppContext): void {
  context = ctx
  const root = document.getElementById('appContent')!
  const cards = META.filter(item => canViewCoordinatorCard(ctx.usuario, item.id))
  root.innerHTML = `<div class="coordinator-page"><h2 style="font-size:1.1rem;margin-bottom:14px">Coordenador</h2><div class="coordinator-grid">${cards.map(item => `<details class="coordinator-card" data-coordinator-card="${item.id}"><summary><span class="mod-icon" style="background:${item.color}20;color:${item.color}">▤</span><span><strong>${item.title}</strong><small>${item.description}</small></span><span aria-hidden="true">⌄</span></summary><div class="coordinator-card-body"><p class="empty-state">Abra para carregar os documentos.</p></div></details>`).join('')}</div></div>`
  root.querySelectorAll<HTMLDetailsElement>('[data-coordinator-card]').forEach(card => card.addEventListener('toggle', () => { if (card.open && !card.dataset['loaded']) { card.dataset['loaded'] = 'true'; void loadCard(card.dataset['coordinatorCard'] as CoordinatorModule, card.querySelector<HTMLElement>('.coordinator-card-body')!) } }))
}

async function loadCard(module: CoordinatorModule, body: HTMLElement): Promise<void> {
  body.innerHTML = '<p class="empty-state">Carregando...</p>'
  try {
    if (module === 'tarefas') await loadTasks(body)
    else if (module === 'limpeza') await loadCleaning(body)
    else if (module === 'programacao') await loadProgramacao(body)
    else body.innerHTML = '<p class="empty-state">Nenhum documento desacoplado disponível neste módulo.</p>'
  } catch (error) { console.error(error); body.innerHTML = '<p class="empty-state">Não foi possível carregar os documentos.</p>' }
}

async function loadTasks(body: HTMLElement): Promise<void> {
  const [periodSnap, profileSnap, peopleSnap, congregationSnap] = await Promise.all([get(tarefasScaleRef), get(tarefasPeopleRef), get(pessoasRef), get(configCongregacaoRef)])
  const periods = periodSnap.exists() ? periodSnap.val() as Record<string, TaskPeriod> : {}
  const profiles = profileSnap.exists() ? profileSnap.val() as Record<string, TaskPerson> : {}
  const master = peopleSnap.exists() ? peopleSnap.val() as RawPessoas : {}
  const people = Object.fromEntries(Object.entries(profiles).map(([id, profile]) => { const central = profile.masterId ? master[profile.masterId] : undefined; return [id, central ? { ...profile, name: central.name, phone: central.whatsapp } : profile] }))
  const congregation = congregationSnap.exists() ? (congregationSnap.val() as { nome?: string }).nome || 'Noroeste' : 'Noroeste'
  const entries = Object.entries(periods).filter(([, period]) => Object.values(period.meetings ?? {}).some(meeting => canonicalMeetingType(meeting.type))).sort(([a], [b]) => b.localeCompare(a))
  body.innerHTML = entries.length ? `<label class="form-label">Período</label><select id="coordTaskPeriod" class="form-select">${entries.map(([id]) => `<option value="${esc(id)}">${esc(id)}</option>`).join('')}</select><label class="form-label" style="margin-top:10px">Tamanho máximo da letra</label><input id="coordTaskFont" type="range" min="8" max="22" value="14" style="width:100%"><button id="coordTaskPdf" class="btn btn-primary btn-full" style="margin-top:12px">Gerar PDF</button>` : '<p class="empty-state">Nenhum período de Tarefas gerado.</p>'
  body.querySelector('#coordTaskPdf')?.addEventListener('click', async () => {
    if (!requireExport('tarefas-pdf')) return
    const period = periods[(body.querySelector('#coordTaskPeriod') as HTMLSelectElement).value]
    const meetings = Object.values(period?.meetings ?? {}).filter((meeting): meeting is TaskMeeting => Boolean(canonicalMeetingType(meeting.type))).sort((a, b) => String(a.date).localeCompare(String(b.date)))
    if (!meetings.length) { toast('Este período não possui reuniões geradas'); return }
    const { printTaskSchedule } = await import('./tarefas-documents')
    const chosen = printTaskSchedule(meetings, congregation, people, Number((body.querySelector('#coordTaskFont') as HTMLInputElement).value)); toast(`PDF em ${chosen} pt`)
  })
}

function requireExport(id: CoordinatorDocument): boolean {
  if (canExportDocument(context.usuario, id)) return true
  toast('Este perfil não tem permissão para este documento'); return false
}

async function loadCleaning(body: HTMLElement): Promise<void> {
  const snap = await get(limpezaPeriodosRef)
  const periods = snap.exists() ? snap.val() as Record<string, LimpezaPeriodoGerado> : {}
  const list = Object.values(periods).sort((a, b) => b.inicio.localeCompare(a.inicio))
  body.innerHTML = list.length ? `<label class="form-label">Período</label><select id="coordCleaningPeriod" class="form-select">${list.map(period => `<option value="${esc(period.id)}">${esc(period.inicio)} a ${esc(period.fim)}</option>`).join('')}</select><label class="form-label" style="margin-top:10px">Tamanho máximo da letra</label><input id="coordCleaningFont" type="range" min="8" max="18" value="12" style="width:100%"><button id="coordCleaningPdf" class="btn btn-primary btn-full" style="margin-top:12px">Baixar PDF</button>` : '<p class="empty-state">Nenhum período de limpeza gerado.</p>'
  body.querySelector('#coordCleaningPdf')?.addEventListener('click', async () => {
    if (!requireExport('limpeza-pdf')) return
    const period = periods[(body.querySelector('#coordCleaningPeriod') as HTMLSelectElement).value]
    const font = Number((body.querySelector('#coordCleaningFont') as HTMLInputElement).value)
    const { downloadCleaningPdf } = await import('./limpeza-documents'); await downloadCleaningPdf(period, { requestedFontSize: font }); toast('PDF da limpeza baixado')
  })
}

function normalizePrograms(value: Record<string, MeetingProgram>): MeetingProgram[] {
  return Object.entries(value).map(([id, raw]) => ({ ...raw, id: raw.id || id, meetingDate: raw.meetingDate || id, parts: Array.isArray(raw.parts) ? raw.parts : Object.values((raw.parts ?? {}) as Record<string, ProgramPart>) })).filter(program => program.meetingDate).sort((a, b) => a.meetingDate.localeCompare(b.meetingDate))
}

async function loadProgramacao(body: HTMLElement): Promise<void> {
  const [programSnap, peopleSnap, congregationSnap] = await Promise.all([get(programacaoRef), get(pessoasRef), get(configCongregacaoRef)])
  const data = programSnap.exists() ? programSnap.val() as { programs?: Record<string, MeetingProgram>; semanas?: Record<string, MeetingProgram>; pessoas?: Record<string, { masterId?: string; active?: boolean; permissions?: AssignmentPermission[] }> } : {}
  const people = peopleSnap.exists() ? peopleSnap.val() as RawPessoas : {}
  const congregation = congregationSnap.exists() ? (congregationSnap.val() as { nome?: string }).nome || 'Noroeste' : 'Noroeste'
  const programs = normalizePrograms(data.programs ?? data.semanas ?? {})
  const joined: ProgramPerson[] = Object.entries(data.pessoas ?? {}).map(([id, profile]) => { const masterId = profile.masterId || id, person = people[masterId]; return { id, masterId, name: person?.name || `Cadastro ${masterId}`, whatsapp: String(person?.whatsapp ?? '').replace(/\D/g, ''), sex: person?.sex === 'M' ? 'masculino' : person?.sex === 'F' ? 'feminino' : '', role: person?.role || 'publicador', active: profile.active !== false && person?.active !== false, permissions: profile.permissions ?? [] } })
  body.innerHTML = programs.length ? `<label class="form-label">Semana</label><select id="coordProgramWeek" class="form-select">${programs.map(program => `<option value="${esc(program.id)}">${esc(program.meetingDate)}</option>`).join('')}</select><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn btn-primary" data-coord-doc="s89-semana">S-89 da semana</button><button class="btn btn-ghost" data-coord-doc="s140-pdf">S-140 PDF</button><button class="btn btn-ghost" data-coord-doc="s140-docx">S-140 DOCX</button></div>` : '<p class="empty-state">Nenhuma programação importada.</p>'
  body.querySelectorAll<HTMLButtonElement>('[data-coord-doc]').forEach(button => button.addEventListener('click', async () => {
    const id = button.dataset['coordDoc'] as CoordinatorDocument; if (!requireExport(id)) return
    const selected = programs.find(program => program.id === (body.querySelector('#coordProgramWeek') as HTMLSelectElement).value); if (!selected) return
    const docs = await import('./programacao-documents')
    if (id === 's89-semana') { const count = await docs.downloadS89(selected, joined); toast(count ? `${count} cartão(ões) S-89 gerado(s)` : 'Não há designações para S-89') }
    else if (id === 's140-pdf') { await docs.downloadS140Pdf([selected], congregation, joined); toast('S-140 PDF baixado') }
    else { await docs.downloadS140Docx([selected], congregation, joined); toast('S-140 DOCX baixado') }
  }))
}
