import type { AppContext, RawPessoas } from '../types'
import { get, pessoasRef, update, tarefasDiscursosRef, tarefasScaleRef } from '../firebase'
import { renderMenuCards, type ItemMenu } from '../ui/menu-cards'
import { moduleBackButton, moduleTitle } from '../ui/module-header'
import { allowedTheme, confirmationPatch, deriveStatus, emergencyCandidates, eventBlocksLocal, needsReconfirmation, talkConflicts, themeHistory, watchtowerIssues, type Congregation, type Speaker, type Talk, type Theme } from './oradores-domain'

interface LegacyOrador extends Speaker {}
interface LegacyProgramacao extends Talk {}
interface LegacyTema extends Theme {}
interface LegacyCongregacao extends Congregation {}
interface LegacyEvento { data?: string; tipo?: string; titulo?: string; observacoes?: string }
interface LegacyDiscursos {
  oradores?: Record<string, LegacyOrador>
  programacao?: Record<string, LegacyProgramacao>
  temas?: Record<string, LegacyTema>
  congregacoes?: Record<string, LegacyCongregacao>
  eventos?: Record<string, LegacyEvento>
}

let discursos: LegacyDiscursos = {}
let pessoas: RawPessoas = {}
let taskMeetings: { date?: string; assignments?: Record<string, unknown> }[] = []
type OradoresTab = 'indice' | 'resumo' | 'cadastro' | 'programacao' | 'temas' | 'congregacoes' | 'intercambios' | 'emergencia' | 'eventos' | 'pendencias'
let activeTab: OradoresTab = 'indice'

function toast(msg: string, ms = 2600): void {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = msg
  el.classList.add('show')
  setTimeout(() => el.classList.remove('show'), ms)
}

function countRecords<T>(value: Record<string, T> | undefined): number {
  return Object.keys(value ?? {}).length
}

function countWhere<T>(value: Record<string, T> | undefined, pred: (item: T) => boolean): number {
  return Object.values(value ?? {}).filter(pred).length
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function canonicalTalkType(value?: string): 'discurso_local' | 'discurso_visitante' | 'saida_orador' {
  if (value === 'saida_orador') return value
  if (value === 'visitante' || value === 'discurso_visitante') return 'discurso_visitante'
  return 'discurso_local'
}

export default function mount(_ctx: AppContext): void {
  const el = document.getElementById('appContent')
  if (!el) return

  el.innerHTML = `
    <div id="oradoresRoot">
      <p style="padding:24px;color:var(--ink-3);text-align:center">Carregando...</p>
    </div>`

  activeTab = 'indice'
  void loadOradores()
}

async function loadOradores(): Promise<void> {
  try {
    const [snap, peopleSnap, scaleSnap] = await Promise.all([get(tarefasDiscursosRef), get(pessoasRef), get(tarefasScaleRef)])
    discursos = snap.exists() ? (snap.val() as LegacyDiscursos) : {}
    pessoas = peopleSnap.exists() ? peopleSnap.val() as RawPessoas : {}
    const periods = scaleSnap.exists() ? scaleSnap.val() as Record<string, { meetings?: Record<string, { date?: string; assignments?: Record<string, unknown> }> }> : {}
    taskMeetings = Object.values(periods).flatMap(period => Object.values(period.meetings ?? {}))
  } catch {
    toast('Erro ao carregar Oradores')
  }
  render()
}

function oradorNome(id: string, orador?: LegacyOrador): string {
  return pessoas[orador?.pessoaId ?? '']?.name ?? orador?.nome ?? orador?.name ?? id
}

function oradorTelefone(orador?: LegacyOrador): string {
  return pessoas[orador?.pessoaId ?? '']?.whatsapp ?? orador?.telefone ?? ''
}

function render(): void {
  const el = document.getElementById('oradoresRoot')
  if (!el) return

  const hoje = todayStr()
  const totalOradores = countRecords(discursos.oradores)
  const oradoresAtivos = countWhere(discursos.oradores, o => o.ativo !== false)
  const visitantes = countWhere(discursos.oradores, o => o.tipo === 'visitante')
  const locais = countWhere(discursos.oradores, o => o.tipo === 'local')
  const temasAtivos = countWhere(discursos.temas, t => t.ativo !== false)
  const congregacoesAtivas = countWhere(discursos.congregacoes, c => c.ativa !== false)
  const programacoesFuturas = countWhere(
    discursos.programacao,
    p => !p.data || p.data >= hoje,
  )
  const aConfirmar = countWhere(
    discursos.programacao,
    p => p.status === 'por_confirmar' || p.status === 'por_definir',
  )

  el.innerHTML = `
    ${moduleTitle('Oradores', '#5C6062')}

    ${activeTab === 'indice' || activeTab === 'resumo' ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      ${metricCard('Oradores', `${oradoresAtivos}/${totalOradores}`, '#5C6062')}
      ${metricCard('Locais', String(locais), '#003F72')}
      ${metricCard('Visitantes', String(visitantes), '#7E3AF2')}
      ${metricCard('Temas ativos', String(temasAtivos), '#1A6B3C')}
      ${metricCard('Congregações', String(congregacoesAtivas), '#006EB6')}
      ${metricCard('A confirmar', String(aConfirmar), '#B3261E')}
    </div><div id="oradoresMenu"></div>` : `${moduleBackButton()}${renderTabContent(activeTab)}`}`

  if (activeTab === 'indice' || activeTab === 'resumo') {
    const menu = el.querySelector<HTMLElement>('#oradoresMenu')
    if (menu) {
      const items: ItemMenu[] = [
        { id: 'cadastro', titulo: 'Cadastro', subtitulo: 'Oradores da congregação', icone: '♙', corFundo: '#003F72' },
        { id: 'programacao', titulo: 'Programação', subtitulo: `${programacoesFuturas} compromisso${programacoesFuturas === 1 ? '' : 's'} futuro${programacoesFuturas === 1 ? '' : 's'}`, icone: '▣', corFundo: '#7E3AF2' },
        { id: 'temas', titulo: 'Temas', subtitulo: 'Catálogo dos discursos públicos', icone: '▤', corFundo: '#1A6B3C' },
        { id: 'congregacoes', titulo: 'Congregações', subtitulo: 'Locais, visitantes e intercâmbios', icone: '⌂', corFundo: '#006EB6' },
        { id: 'intercambios', titulo: 'Intercâmbios', subtitulo: 'Entradas, saídas e mensagens', icone: '⇄', corFundo: '#7E3AF2' },
        { id: 'emergencia', titulo: 'Emergência', subtitulo: 'Substitutos e temas disponíveis', icone: '!', corFundo: '#B3261E' },
        { id: 'eventos', titulo: 'Eventos', subtitulo: 'Datas sem discurso público local', icone: '◆', corFundo: '#8A5B00' },
        { id: 'pendencias', titulo: 'Pendências', subtitulo: `${aConfirmar} compromisso${aConfirmar === 1 ? '' : 's'} a confirmar`, icone: '!', corFundo: '#B3261E' },
      ]
      renderMenuCards(menu, items, id => { activeTab = id as OradoresTab; render() })
    }
  }

  el.querySelectorAll<HTMLButtonElement>('[data-oradores-tab]').forEach(button => {
    button.addEventListener('click', () => { activeTab = button.dataset['oradoresTab'] as OradoresTab; render() })
  })
  el.querySelector<HTMLButtonElement>('[data-add-orador]')?.addEventListener('click', () => openOradorModal(null))
  el.querySelectorAll<HTMLButtonElement>('[data-edit-orador]').forEach(button => {
    button.addEventListener('click', () => openOradorModal(button.dataset['editOrador'] ?? null))
  })
  el.querySelectorAll<HTMLButtonElement>('[data-delete-orador]').forEach(button => {
    button.addEventListener('click', () => void deleteOrador(button.dataset['deleteOrador'] ?? ''))
  })
  el.querySelector<HTMLButtonElement>('[data-add-programacao]')?.addEventListener('click', () => openProgramacaoModal(null))
  el.querySelectorAll<HTMLButtonElement>('[data-edit-programacao]').forEach(button => {
    button.addEventListener('click', () => openProgramacaoModal(button.dataset['editProgramacao'] ?? null))
  })
  el.querySelectorAll<HTMLButtonElement>('[data-delete-programacao]').forEach(button => {
    button.addEventListener('click', () => void deleteProgramacao(button.dataset['deleteProgramacao'] ?? ''))
  })
  el.querySelector<HTMLButtonElement>('[data-add-tema]')?.addEventListener('click', () => openTemaModal(null))
  el.querySelectorAll<HTMLButtonElement>('[data-edit-tema]').forEach(button => {
    button.addEventListener('click', () => openTemaModal(button.dataset['editTema'] ?? null))
  })
  el.querySelectorAll<HTMLButtonElement>('[data-delete-tema]').forEach(button => {
    button.addEventListener('click', () => void deleteTema(button.dataset['deleteTema'] ?? ''))
  })
  el.querySelector<HTMLButtonElement>('[data-add-congregacao]')?.addEventListener('click', () => openCongregacaoModal(null))
  el.querySelectorAll<HTMLButtonElement>('[data-edit-congregacao]').forEach(button => {
    button.addEventListener('click', () => openCongregacaoModal(button.dataset['editCongregacao'] ?? null))
  })
  el.querySelectorAll<HTMLButtonElement>('[data-delete-congregacao]').forEach(button => {
    button.addEventListener('click', () => void deleteCongregacao(button.dataset['deleteCongregacao'] ?? ''))
  })
  el.querySelector<HTMLButtonElement>('[data-add-evento]')?.addEventListener('click', () => openEventoModal(null))
  el.querySelectorAll<HTMLButtonElement>('[data-edit-evento]').forEach(button => button.addEventListener('click', () => openEventoModal(button.dataset['editEvento'] ?? null)))
  el.querySelectorAll<HTMLButtonElement>('[data-delete-evento]').forEach(button => button.addEventListener('click', () => void deleteEvento(button.dataset['deleteEvento'] ?? '')))
  el.querySelectorAll<HTMLButtonElement>('[data-intercambio-message]').forEach(button => button.addEventListener('click', () => openIntercambioMessage(button.dataset['intercambioMessage'] ?? '')))
  el.querySelectorAll<HTMLButtonElement>('[data-emergency]').forEach(button => button.addEventListener('click', () => openEmergencyModal(button.dataset['emergency'] ?? '')))
}

function renderTabContent(tab: OradoresTab): string {
  if (tab === 'cadastro') return cadastroView()
  if (tab === 'programacao') return programacaoView()
  if (tab === 'temas') return temasView()
  if (tab === 'congregacoes') return congregacoesView()
  if (tab === 'intercambios') return intercambiosView()
  if (tab === 'emergencia') return emergenciaView()
  if (tab === 'eventos') return eventosView()
  return pendenciasView()
}

function candidatesFor(id: string, talk: LegacyProgramacao) {
  return emergencyCandidates(id, talk, discursos.programacao ?? {}, taskMeetings, discursos.oradores ?? {}, discursos.temas ?? {}, todayStr())
}

function emergenciaView(): string {
  const pending = Object.entries(discursos.programacao ?? {}).filter(([, talk]) => (!talk.data || talk.data >= todayStr()) && (!talk.oradorId || (talk.desistiu && !talk.substitutoId)))
  return `<div style="margin-top:14px"><h3 style="font-size:.95rem;color:#5C6062;margin-bottom:8px">Emergência</h3><div class="module-option-list">${pending.length ? pending.map(([id, talk]) => {
    const candidates = candidatesFor(id, talk)
    return `<div class="module-menu-btn" style="cursor:default"><div class="mod-icon" style="background:#B3261E20;color:#B3261E">!</div><div style="flex:1"><div class="mod-label">${escapeHtml(formatDate(talk.data))} · ${escapeHtml(talk.temaTitulo ?? 'tema a definir')}</div><div class="mod-desc">${candidates.length} candidato(s) sem conflito e com tema disponível</div></div><button class="btn btn-primary" data-emergency="${escapeHtml(id)}" ${candidates.length ? '' : 'disabled'}>Substituir</button></div>`
  }).join('') : '<p class="empty-state">Nenhuma substituição emergencial pendente.</p>'}</div></div>`
}

function openEmergencyModal(id: string): void {
  const talk = discursos.programacao?.[id]; if (!talk) return
  const candidates = candidatesFor(id, talk); if (!candidates.length) { toast('Nenhum candidato elegível'); return }
  const overlay = document.createElement('div'); overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal"><h2>Substituição de emergência</h2><div class="form-group"><label class="form-label">Candidato</label><select id="emergencySpeaker" class="form-select">${candidates.map(candidate => `<option value="${escapeHtml(candidate.speakerId)}">${escapeHtml(oradorNome(candidate.speakerId, discursos.oradores?.[candidate.speakerId]))}</option>`).join('')}</select></div><div class="form-group"><label class="form-label">Tema disponível</label><select id="emergencyTheme" class="form-select"></select></div><div style="display:flex;gap:8px"><button id="emergencyCancel" class="btn btn-ghost">Cancelar</button><button id="emergencyApply" class="btn btn-primary">Aplicar substituição</button></div></div>`
  document.body.appendChild(overlay)
  const renderThemes = () => {
    const speakerId = (overlay.querySelector('#emergencySpeaker') as HTMLSelectElement).value
    const candidate = candidates.find(item => item.speakerId === speakerId)
    ;(overlay.querySelector('#emergencyTheme') as HTMLSelectElement).innerHTML = (candidate?.themeIds ?? []).map(themeId => `<option value="${escapeHtml(themeId)}">${escapeHtml(`${discursos.temas?.[themeId]?.numero ?? ''} ${discursos.temas?.[themeId]?.titulo ?? ''}`.trim())}</option>`).join('')
  }
  renderThemes()
  overlay.querySelector('#emergencySpeaker')?.addEventListener('change', renderThemes)
  overlay.querySelector('#emergencyCancel')?.addEventListener('click', () => overlay.remove())
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove() })
  overlay.querySelector('#emergencyApply')?.addEventListener('click', () => void applyEmergency(id, overlay))
}

async function applyEmergency(id: string, overlay: HTMLElement): Promise<void> {
  const talk = discursos.programacao?.[id]; if (!talk) return
  const speakerId = (overlay.querySelector('#emergencySpeaker') as HTMLSelectElement).value
  const themeId = (overlay.querySelector('#emergencyTheme') as HTMLSelectElement).value
  const speaker = discursos.oradores?.[speakerId], theme = discursos.temas?.[themeId]
  const replacement = Boolean(talk.oradorId)
  const patch: Record<string, unknown> = {
    [`programacao/${id}/${replacement ? 'substitutoId' : 'oradorId'}`]: speakerId,
    [`programacao/${id}/${replacement ? 'substitutoNome' : 'oradorNome'}`]: oradorNome(speakerId, speaker),
    [`programacao/${id}/temaId`]: themeId,
    [`programacao/${id}/temaNumero`]: theme?.numero ?? null,
    [`programacao/${id}/temaTitulo`]: theme?.titulo ?? null,
    [`programacao/${id}/status`]: 'por_confirmar',
    [`programacao/${id}/confirmacao`]: { status: false, confirmadoEm: '' },
    [`programacao/${id}/reconfirmacao`]: null,
  }
  try {
    await update(tarefasDiscursosRef, patch)
    Object.assign(talk, replacement ? { substitutoId: speakerId, substitutoNome: oradorNome(speakerId, speaker) } : { oradorId: speakerId, oradorNome: oradorNome(speakerId, speaker) }, { temaId: themeId, temaNumero: theme?.numero, temaTitulo: theme?.titulo, status: 'por_confirmar', confirmacao: { status: false, confirmadoEm: '' }, reconfirmacao: undefined })
    overlay.remove(); toast('Substituição aplicada'); render(); openSubstitutionMessage(id)
  } catch { toast('Não foi possível aplicar a substituição') }
}

function openSubstitutionMessage(id: string): void {
  const talk = discursos.programacao?.[id]; if (!talk) return
  const speakerId = talk.substitutoId ?? talk.oradorId ?? '', speaker = discursos.oradores?.[speakerId]
  const phone = digits(oradorTelefone(speaker))
  const text = `Olá, ${oradorNome(speakerId, speaker)}! Você poderia substituir o discurso do dia ${formatDate(talk.data)}? Tema ${talk.temaNumero ?? ''} ${talk.temaTitulo ?? ''}. Por favor, confirme sua disponibilidade.`
  const overlay = document.createElement('div'); overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal"><h2>Mensagem ao substituto</h2><div class="form-group"><label class="form-label">Texto</label><textarea id="exchangeText" class="form-input" rows="9">${escapeHtml(text)}</textarea></div><input id="exchangeTarget" type="hidden" value="${escapeHtml(phone)}"><div style="display:flex;gap:8px"><button id="exchangeCancel" class="btn btn-ghost">Fechar</button><button id="exchangeWhats" class="btn btn-primary">Abrir WhatsApp</button></div></div>`
  document.body.appendChild(overlay)
  overlay.querySelector('#exchangeCancel')?.addEventListener('click', () => overlay.remove())
  overlay.querySelector('#exchangeWhats')?.addEventListener('click', () => void sendIntercambioMessage(id, overlay))
}

function intercambiosView(): string {
  const rows = Object.entries(discursos.programacao ?? {}).filter(([, talk]) => talk.data && talk.data >= todayStr() && canonicalTalkType(talk.tipo) !== 'discurso_local').sort(([, a], [, b]) => String(a.data).localeCompare(String(b.data)))
  return `<div style="margin-top:14px"><h3 style="font-size:.95rem;color:#5C6062;margin-bottom:8px">Intercâmbios</h3><div class="module-option-list">${rows.length ? rows.map(([id, talk]) => {
    const outgoing = canonicalTalkType(talk.tipo) === 'saida_orador'
    const congregationId = outgoing ? talk.congregacaoDestinoId ?? talk.congregacaoId : talk.congregacaoOrigemId ?? talk.congregacaoId
    const congregation = discursos.congregacoes?.[congregationId ?? '']
    const speaker = discursos.oradores?.[talk.substitutoId ?? talk.oradorId ?? '']
    return `<div class="module-menu-btn" style="cursor:default"><div class="mod-icon" style="background:#7E3AF220;color:#7E3AF2">${outgoing ? '→' : '←'}</div><div style="flex:1"><div class="mod-label">${outgoing ? 'Saída para' : 'Entrada de'} ${escapeHtml(congregation?.nome ?? 'congregação não informada')}</div><div class="mod-desc">${escapeHtml(formatDate(talk.data))} · ${escapeHtml(oradorNome(talk.oradorId ?? '', speaker))} · ${escapeHtml(talk.temaTitulo ?? 'tema a definir')}</div></div><button class="btn btn-primary" type="button" data-intercambio-message="${escapeHtml(id)}">Mensagem</button></div>`
  }).join('') : '<p class="empty-state">Nenhum intercâmbio futuro.</p>'}</div></div>`
}

function digits(value: unknown): string {
  const phone = String(value ?? '').replace(/\D/g, '')
  return phone.length === 11 ? `55${phone}` : phone
}

function openIntercambioMessage(id: string): void {
  const talk = discursos.programacao?.[id]; if (!talk) return
  const outgoing = canonicalTalkType(talk.tipo) === 'saida_orador'
  const congregationId = outgoing ? talk.congregacaoDestinoId ?? talk.congregacaoId : talk.congregacaoOrigemId ?? talk.congregacaoId
  const congregation = discursos.congregacoes?.[congregationId ?? '']
  const speakerId = talk.substitutoId ?? talk.oradorId ?? ''
  const speaker = discursos.oradores?.[speakerId]
  const speakerPhone = digits(oradorTelefone(speaker)), congregationPhone = digits(congregation?.telefone)
  const message = outgoing
    ? `Olá! Confirmamos o discurso de ${oradorNome(speakerId, speaker)} em ${congregation?.nome ?? 'sua congregação'}, no dia ${formatDate(talk.data)}, com o tema ${talk.temaNumero ?? ''} ${talk.temaTitulo ?? ''}.`
    : `Olá, ${oradorNome(speakerId, speaker)}! Confirmamos seu discurso em nossa congregação no dia ${formatDate(talk.data)}, com o tema ${talk.temaNumero ?? ''} ${talk.temaTitulo ?? ''}.`
  const overlay = document.createElement('div'); overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal"><h2>Mensagem de intercâmbio</h2><div class="form-group"><label class="form-label">Destinatário</label><select id="exchangeTarget" class="form-select"><option value="${speakerPhone}">Orador: ${escapeHtml(oradorNome(speakerId, speaker))}</option>${congregationPhone ? `<option value="${congregationPhone}">Congregação: ${escapeHtml(congregation?.nome ?? '')}</option>` : ''}</select></div><div class="form-group"><label class="form-label">Texto</label><textarea id="exchangeText" class="form-input" rows="10">${escapeHtml(message)}</textarea></div><div style="display:flex;gap:8px"><button id="exchangeCancel" class="btn btn-ghost">Cancelar</button><button id="exchangeWhats" class="btn btn-primary">Abrir WhatsApp</button></div></div>`
  document.body.appendChild(overlay)
  overlay.querySelector('#exchangeCancel')?.addEventListener('click', () => overlay.remove())
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove() })
  overlay.querySelector('#exchangeWhats')?.addEventListener('click', () => void sendIntercambioMessage(id, overlay))
}

async function sendIntercambioMessage(id: string, overlay: HTMLElement): Promise<void> {
  const phone = (overlay.querySelector('#exchangeTarget') as HTMLSelectElement).value
  const message = (overlay.querySelector('#exchangeText') as HTMLTextAreaElement).value.trim()
  if (!phone) { toast('Cadastre o WhatsApp no Admin ou na congregação'); return }
  if (!message) { toast('Escreva a mensagem'); return }
  const popup = window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
  if (!popup) { toast('Permita pop-ups para abrir o WhatsApp'); return }
  const stamp = new Date().toISOString()
  try {
    await update(tarefasDiscursosRef, { [`programacao/${id}/avisadoEm`]: stamp })
    if (discursos.programacao?.[id]) discursos.programacao[id].avisadoEm = stamp
    overlay.remove(); toast('WhatsApp aberto; revise antes de enviar'); render()
  } catch { toast('WhatsApp aberto, mas não foi possível registrar o aviso') }
}

const EVENT_LABELS: Record<string, string> = {
  congresso_assembleia: 'Congresso ou assembleia', visita_superintendente: 'Visita do superintendente',
  reuniao_especial: 'Reunião especial', celebracao: 'Celebração',
}

function eventosView(): string {
  const rows = Object.entries(discursos.eventos ?? {}).sort(([, a], [, b]) => String(a.data ?? '').localeCompare(String(b.data ?? '')))
  return `<div style="margin-top:14px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px"><h3 style="font-size:.95rem;color:#5C6062">Eventos</h3><button class="btn btn-primary" type="button" data-add-evento>Adicionar</button></div><div class="module-option-list">${rows.length ? rows.map(([id, event]) => `<div class="module-menu-btn" style="cursor:default"><div style="flex:1"><div class="mod-label">${escapeHtml(event.titulo || EVENT_LABELS[event.tipo ?? ''] || 'Evento')}</div><div class="mod-desc">${escapeHtml(formatDate(event.data))}</div></div><button class="btn btn-ghost" data-edit-evento="${escapeHtml(id)}">Editar</button><button class="btn btn-danger" data-delete-evento="${escapeHtml(id)}">Excluir</button></div>`).join('') : '<p class="empty-state">Nenhum evento especial cadastrado.</p>'}</div></div>`
}

function openEventoModal(id: string | null): void {
  const current = id ? discursos.eventos?.[id] : undefined
  const overlay = document.createElement('div'); overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal"><h2>${id ? 'Editar evento' : 'Novo evento'}</h2><div class="form-group"><label class="form-label">Data</label><input id="eventData" class="form-input" type="date" value="${escapeHtml(current?.data ?? '')}"></div><div class="form-group"><label class="form-label">Tipo</label><select id="eventType" class="form-select">${Object.entries(EVENT_LABELS).map(([value, label]) => `<option value="${value}" ${current?.tipo === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div class="form-group"><label class="form-label">Título opcional</label><input id="eventTitle" class="form-input" value="${escapeHtml(current?.titulo ?? '')}"></div><div class="form-group"><label class="form-label">Observações</label><textarea id="eventObs" class="form-input">${escapeHtml(current?.observacoes ?? '')}</textarea></div><div style="display:flex;gap:8px"><button id="eventCancel" class="btn btn-ghost">Cancelar</button><button id="eventSave" class="btn btn-primary">Salvar</button></div></div>`
  document.body.appendChild(overlay)
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove() })
  overlay.querySelector('#eventCancel')?.addEventListener('click', () => overlay.remove())
  overlay.querySelector('#eventSave')?.addEventListener('click', () => void saveEvento(id, overlay))
}

async function saveEvento(id: string | null, overlay: HTMLElement): Promise<void> {
  const data = (overlay.querySelector('#eventData') as HTMLInputElement).value
  if (!data) { toast('Informe a data do evento'); return }
  const record: LegacyEvento = { data, tipo: (overlay.querySelector('#eventType') as HTMLSelectElement).value, titulo: (overlay.querySelector('#eventTitle') as HTMLInputElement).value.trim(), observacoes: (overlay.querySelector('#eventObs') as HTMLTextAreaElement).value.trim() }
  const finalId = id ?? `e_${Date.now().toString(36)}`
  await update(tarefasDiscursosRef, { [`eventos/${finalId}`]: record })
  discursos.eventos = { ...(discursos.eventos ?? {}), [finalId]: record }; overlay.remove(); toast('Evento salvo'); render()
}

async function deleteEvento(id: string): Promise<void> {
  if (!id || !discursos.eventos?.[id] || !window.confirm('Excluir este evento?')) return
  await update(tarefasDiscursosRef, { [`eventos/${id}`]: null })
  const next = { ...(discursos.eventos ?? {}) }; delete next[id]; discursos.eventos = next; toast('Evento excluído'); render()
}

function congregacoesView(): string {
  const rows = Object.entries(discursos.congregacoes ?? {}).sort(([, a], [, b]) => (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR'))
  return `<div style="margin-top:14px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px"><h3 style="font-size:.95rem;color:#5C6062">Congregações</h3><button class="btn btn-primary" type="button" data-add-congregacao style="padding:6px 10px;font-size:.78rem">Adicionar</button></div><div class="module-option-list">${rows.length ? rows.map(([id, c]) => `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 12px;display:flex;justify-content:space-between;gap:10px;align-items:center"><div style="flex:1;min-width:0"><strong>${escapeHtml(c.nome ?? id)}</strong><div style="font-size:.75rem;color:var(--ink-3)">${escapeHtml(c.cidade ?? 'Cidade não informada')} · ${c.tipo === 'local' ? 'Local' : 'Visitante'}${c.telefone ? ` · ${escapeHtml(c.telefone)}` : ''}</div></div><span style="font-size:.72rem;color:${c.ativa === false ? '#B3261E' : '#1A6B3C'}">${c.ativa === false ? 'Inativa' : 'Ativa'}</span><button class="btn btn-ghost" type="button" data-edit-congregacao="${escapeHtml(id)}" style="padding:4px 8px;font-size:.72rem">Editar</button><button class="btn btn-danger" type="button" data-delete-congregacao="${escapeHtml(id)}" style="padding:4px 8px;font-size:.72rem">Excluir</button></div>`).join('') : '<p class="empty-state">Nenhuma congregação cadastrada.</p>'}</div></div>`
}

function openCongregacaoModal(id: string | null): void {
  const current = id ? discursos.congregacoes?.[id] : undefined
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal"><h2>${id ? 'Editar congregação' : 'Nova congregação'}</h2><div class="form-group"><label class="form-label" for="congNome">Nome</label><input id="congNome" class="form-input" value="${escapeHtml(current?.nome ?? '')}"></div><div class="form-group"><label class="form-label" for="congCidade">Cidade</label><input id="congCidade" class="form-input" value="${escapeHtml(current?.cidade ?? '')}"></div><div class="form-group"><label class="form-label" for="congTipo">Tipo</label><select id="congTipo" class="form-select"><option value="visitante" ${current?.tipo !== 'local' ? 'selected' : ''}>Visitante</option><option value="local" ${current?.tipo === 'local' ? 'selected' : ''}>Local</option></select></div><div class="form-group"><label class="form-label" for="congContato">Contato</label><input id="congContato" class="form-input" value="${escapeHtml(current?.contato ?? '')}"></div><div class="form-group"><label class="form-label" for="congTelefone">Telefone do contato</label><input id="congTelefone" class="form-input" type="tel" value="${escapeHtml(current?.telefone ?? '')}"></div><div class="module-form-grid"><div class="form-group"><label class="form-label" for="congDia">Dia da reunião</label><input id="congDia" class="form-input" value="${escapeHtml(current?.diaReuniao ?? '')}" placeholder="Domingo"></div><div class="form-group"><label class="form-label" for="congHorario">Horário</label><input id="congHorario" class="form-input" type="time" value="${escapeHtml(current?.horario ?? '')}"></div></div><div class="form-group"><label class="form-label" for="congLocal">Localização</label><input id="congLocal" class="form-input" value="${escapeHtml(current?.localizacao ?? '')}"></div><div class="form-group"><label class="form-label" for="congObs">Observações</label><textarea id="congObs" class="form-input">${escapeHtml(current?.observacoes ?? '')}</textarea></div><div class="form-group"><label style="display:flex;align-items:center;gap:8px"><input id="congAtiva" type="checkbox" ${current?.ativa !== false ? 'checked' : ''}> <span class="form-label" style="margin:0">Ativa</span></label></div><div style="display:flex;gap:8px;margin-top:8px"><button id="cancelCong" class="btn btn-ghost" type="button" style="flex:1">Cancelar</button><button id="saveCong" class="btn btn-primary" type="button" style="flex:1">Salvar</button></div></div>`
  document.body.appendChild(overlay)
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove() })
  overlay.querySelector('#cancelCong')?.addEventListener('click', () => overlay.remove())
  overlay.querySelector('#saveCong')?.addEventListener('click', () => void saveCongregacao(id, overlay))
}

async function saveCongregacao(id: string | null, overlay: HTMLElement): Promise<void> {
  const nome = (overlay.querySelector('#congNome') as HTMLInputElement).value.trim()
  if (!nome) { toast('Preencha o nome da congregação'); return }
  const record: LegacyCongregacao = { ...(id ? discursos.congregacoes?.[id] : {}), nome, cidade: (overlay.querySelector('#congCidade') as HTMLInputElement).value.trim(), tipo: (overlay.querySelector('#congTipo') as HTMLSelectElement).value, contato: (overlay.querySelector('#congContato') as HTMLInputElement).value.trim(), telefone: (overlay.querySelector('#congTelefone') as HTMLInputElement).value.trim(), diaReuniao: (overlay.querySelector('#congDia') as HTMLInputElement).value.trim(), horario: (overlay.querySelector('#congHorario') as HTMLInputElement).value, localizacao: (overlay.querySelector('#congLocal') as HTMLInputElement).value.trim(), observacoes: (overlay.querySelector('#congObs') as HTMLTextAreaElement).value.trim(), ativa: (overlay.querySelector('#congAtiva') as HTMLInputElement).checked }
  const finalId = id ?? `c_${Date.now().toString(36)}`
  try { await update(tarefasDiscursosRef, { [`congregacoes/${finalId}`]: record }); discursos.congregacoes = { ...(discursos.congregacoes ?? {}), [finalId]: record }; overlay.remove(); toast(id ? 'Congregação atualizada' : 'Congregação adicionada'); render() } catch { toast('Erro ao salvar congregação') }
}

async function deleteCongregacao(id: string): Promise<void> {
  if (!id || !discursos.congregacoes?.[id]) return
  if (Object.values(discursos.programacao ?? {}).some(p => p.congregacaoId === id)) { toast('Esta congregação está vinculada a uma programação'); return }
  if (!window.confirm(`Excluir a congregação "${discursos.congregacoes[id].nome ?? id}"?`)) return
  try { await update(tarefasDiscursosRef, { [`congregacoes/${id}`]: null }); const next = { ...(discursos.congregacoes ?? {}) }; delete next[id]; discursos.congregacoes = next; toast('Congregação excluída'); render() } catch { toast('Erro ao excluir congregação') }
}

function cadastroView(): string {
  const rows = Object.entries(discursos.oradores ?? {}).sort(([idA, a], [idB, b]) => oradorNome(idA, a).localeCompare(oradorNome(idB, b), 'pt-BR'))
  return `<div style="margin-top:14px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:2px"><div><h3 style="font-size:.95rem;color:#5C6062">Cadastro</h3><p style="font-size:.75rem;color:var(--ink-3)">Oradores locais e visitantes vinculados ao Admin.</p></div><button class="btn btn-primary" type="button" data-add-orador style="padding:6px 10px;font-size:.78rem;white-space:nowrap">Adicionar</button></div><div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:0 12px">${rows.length ? rows.map(([id, o]) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)"><div style="flex:1;min-width:0"><strong>${escapeHtml(oradorNome(id, o))}</strong><div style="font-size:.75rem;color:var(--ink-3)">${escapeHtml(o.tipo ?? 'tipo não informado')}${oradorTelefone(o) ? ` · ${escapeHtml(oradorTelefone(o))}` : ' · sem WhatsApp'}${o.pessoaId ? '' : ' · vínculo pendente'}</div></div><span style="font-size:.72rem;font-weight:700;color:${o.ativo === false ? '#B3261E' : '#1A6B3C'}">${o.ativo === false ? 'Inativo' : 'Ativo'}</span><button class="btn btn-ghost" type="button" data-edit-orador="${escapeHtml(id)}" style="padding:4px 8px;font-size:.72rem">Editar</button><button class="btn btn-danger" type="button" data-delete-orador="${escapeHtml(id)}" style="padding:4px 8px;font-size:.72rem">Excluir</button></div>`).join('') : '<p style="padding:16px 0;color:var(--ink-3);text-align:center;font-size:.82rem">Nenhum orador cadastrado.</p>'}</div></div>`
}

function newOradorId(): string {
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  return `o_${Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('')}`
}

function openOradorModal(id: string | null): void {
  const current = id ? discursos.oradores?.[id] : undefined
  const linked = new Set(Object.entries(discursos.oradores ?? {}).filter(([other]) => other !== id).map(([, item]) => item.pessoaId).filter(Boolean))
  const personOptions = Object.entries(pessoas).filter(([mid, person]) => person.active !== false && (!linked.has(mid) || mid === current?.pessoaId)).sort(([, a], [, b]) => a.name.localeCompare(b.name, 'pt-BR')).map(([mid, person]) => `<option value="${escapeHtml(mid)}" ${current?.pessoaId === mid ? 'selected' : ''}>${escapeHtml(person.name)}</option>`).join('')
  const themeChecks = Object.entries(discursos.temas ?? {}).filter(([, theme]) => theme.ativo !== false).sort(([, a], [, b]) => Number(a.numero ?? 0) - Number(b.numero ?? 0)).map(([themeId, theme]) => `<label style="display:flex;gap:8px;padding:6px 0"><input type="checkbox" data-orador-theme="${escapeHtml(themeId)}" ${current?.temaIds?.includes(themeId) ? 'checked' : ''}> ${escapeHtml(`${theme.numero ?? ''} ${theme.titulo ?? ''}`.trim())}</label>`).join('')
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal"><h2>${id ? 'Editar orador' : 'Adicionar orador'}</h2><div class="form-group"><label class="form-label" for="oradorPessoa">Pessoa do cadastro Admin</label><select id="oradorPessoa" class="form-select"><option value="">Selecionar...</option>${personOptions}</select><p class="form-help">Nome e WhatsApp são editados somente no Admin.</p></div><div class="form-group"><label class="form-label" for="oradorTipo">Tipo</label><select id="oradorTipo" class="form-select"><option value="local" ${current?.tipo === 'local' ? 'selected' : ''}>Local</option><option value="visitante" ${current?.tipo === 'visitante' ? 'selected' : ''}>Visitante</option></select></div><div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px"><label><input id="oradorAtivo" type="checkbox" ${current?.ativo !== false ? 'checked' : ''}> Ativo</label><label><input id="oradorSaida" type="checkbox" ${current?.aprovadoParaSaida ? 'checked' : ''}> Aprovado para saídas</label><label><input id="oradorPreside" type="checkbox" ${current?.podePresidir ? 'checked' : ''}> Pode presidir</label><label><input id="oradorSentinela" type="checkbox" ${current?.sentinelaDirigente ? 'checked' : ''}> Dirigente da Sentinela</label><label><input id="oradorSentinelaSub" type="checkbox" ${current?.sentinelaSubstituto ? 'checked' : ''}> Substituto da Sentinela</label></div><div class="form-group"><label class="form-label">Temas aprovados</label><div style="max-height:220px;overflow:auto;border:1px solid var(--border);padding:6px 10px;border-radius:8px">${themeChecks || '<p class="empty-state">Nenhum tema ativo cadastrado.</p>'}</div></div><div style="display:flex;gap:8px;margin-top:8px"><button id="cancelOrador" class="btn btn-ghost" type="button" style="flex:1">Cancelar</button><button id="saveOrador" class="btn btn-primary" type="button" style="flex:1">Salvar</button></div></div>`
  document.body.appendChild(overlay)
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove() })
  overlay.querySelector('#cancelOrador')?.addEventListener('click', () => overlay.remove())
  overlay.querySelector('#saveOrador')?.addEventListener('click', () => void saveOrador(id, overlay))
}

async function saveOrador(id: string | null, overlay: HTMLElement): Promise<void> {
  const pessoaId = (overlay.querySelector('#oradorPessoa') as HTMLSelectElement).value
  if (!pessoaId || !pessoas[pessoaId]) { toast('Selecione uma pessoa do Admin'); return }
  const sentinelaDirigente = (overlay.querySelector('#oradorSentinela') as HTMLInputElement).checked
  const sentinelaSubstituto = (overlay.querySelector('#oradorSentinelaSub') as HTMLInputElement).checked
  if (sentinelaDirigente && sentinelaSubstituto) { toast('A mesma pessoa não pode ser dirigente e substituto da Sentinela'); return }
  const temaIds = Array.from(overlay.querySelectorAll<HTMLInputElement>('[data-orador-theme]:checked')).map(input => input.dataset['oradorTheme']!).filter(Boolean)
  const record: LegacyOrador = {
    ...(id ? discursos.oradores?.[id] : {}),
    pessoaId,
    tipo: (overlay.querySelector('#oradorTipo') as HTMLSelectElement).value,
    ativo: (overlay.querySelector('#oradorAtivo') as HTMLInputElement).checked,
    aprovadoParaSaida: (overlay.querySelector('#oradorSaida') as HTMLInputElement).checked,
    podePresidir: (overlay.querySelector('#oradorPreside') as HTMLInputElement).checked,
    sentinelaDirigente,
    sentinelaSubstituto,
    temaIds,
  }
  delete record.nome; delete record.name; delete record.telefone
  const finalId = id ?? newOradorId()
  try {
    const patch: Record<string, unknown> = { [`oradores/${finalId}`]: record }
    Object.entries(discursos.oradores ?? {}).forEach(([otherId, other]) => {
      if (otherId === finalId) return
      if (sentinelaDirigente && other.sentinelaDirigente) patch[`oradores/${otherId}/sentinelaDirigente`] = false
      if (sentinelaSubstituto && other.sentinelaSubstituto) patch[`oradores/${otherId}/sentinelaSubstituto`] = false
    })
    await update(tarefasDiscursosRef, patch)
    Object.entries(discursos.oradores ?? {}).forEach(([otherId, other]) => {
      if (otherId === finalId) return
      if (sentinelaDirigente) other.sentinelaDirigente = false
      if (sentinelaSubstituto) other.sentinelaSubstituto = false
    })
    discursos.oradores = { ...(discursos.oradores ?? {}), [finalId]: record }
    overlay.remove()
    toast(id ? 'Orador atualizado' : 'Orador adicionado')
    render()
  } catch { toast('Erro ao salvar o orador') }
}

async function deleteOrador(id: string): Promise<void> {
  if (!id || !discursos.oradores?.[id]) return
  if (!window.confirm(`Excluir o orador "${oradorNome(id, discursos.oradores[id])}"?`)) return
  try {
    await update(tarefasDiscursosRef, { [`oradores/${id}`]: null })
    const next = { ...(discursos.oradores ?? {}) }
    delete next[id]
    discursos.oradores = next
    toast('Orador excluído')
    render()
  } catch { toast('Erro ao excluir o orador') }
}

function programacaoView(): string {
  const rows = Object.entries(discursos.programacao ?? {}).filter(([, p]) => !p.data || p.data >= todayStr()).sort(([, a], [, b]) => String(a.data ?? '').localeCompare(String(b.data ?? '')))
  return `<div style="margin-top:14px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:2px"><div><h3 style="font-size:.95rem;color:#5C6062">Programação</h3><p style="font-size:.75rem;color:var(--ink-3)">Compromissos futuros e confirmação dos oradores.</p></div><button class="btn btn-primary" type="button" data-add-programacao style="padding:6px 10px;font-size:.78rem;white-space:nowrap">Adicionar</button></div><div class="module-option-list">${rows.length ? rows.map(([id, p]) => `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 12px;display:flex;justify-content:space-between;gap:10px"><div style="flex:1;min-width:0"><strong>${escapeHtml(p.data ? formatDate(p.data) : 'Sem data')}</strong><div style="font-size:.76rem;color:var(--ink-3)">${escapeHtml(p.oradorNome ?? discursos.oradores?.[p.oradorId ?? '']?.nome ?? p.oradorId ?? 'Orador a definir')} · ${escapeHtml(p.temaTitulo ?? (p.temaNumero ? `Tema ${p.temaNumero}` : 'Tema a definir'))}</div></div><span style="font-size:.72rem;font-weight:700;color:${p.status === 'confirmado' ? '#1A6B3C' : '#B3261E'}">${p.status === 'confirmado' ? 'Confirmado' : 'A confirmar'}</span><button class="btn btn-ghost" type="button" data-edit-programacao="${escapeHtml(id)}" style="padding:4px 8px;font-size:.72rem">Editar</button><button class="btn btn-danger" type="button" data-delete-programacao="${escapeHtml(id)}" style="padding:4px 8px;font-size:.72rem">Excluir</button></div>`).join('') : '<p class="empty-state">Nenhum compromisso futuro.</p>'}</div></div>`
}

function openProgramacaoModal(id: string | null): void {
  const current = id ? discursos.programacao?.[id] : undefined
  const speakers = Object.entries(discursos.oradores ?? {}).sort(([idA, a], [idB, b]) => oradorNome(idA, a).localeCompare(oradorNome(idB, b), 'pt-BR'))
  const speakerOptions = (selected?: string) => speakers.map(([speakerId, speaker]) => `<option value="${escapeHtml(speakerId)}" ${speakerId === selected ? 'selected' : ''}>${escapeHtml(oradorNome(speakerId, speaker))}</option>`).join('')
  const congregacoes = Object.entries(discursos.congregacoes ?? {}).filter(([, c]) => c.ativa !== false).sort(([, a], [, b]) => (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR'))
  const currentCongregationId = canonicalTalkType(current?.tipo) === 'saida_orador' ? current?.congregacaoDestinoId ?? current?.congregacaoId : current?.congregacaoOrigemId ?? current?.congregacaoId
  const congregationOptions = congregacoes.map(([congId, congregation]) => `<option value="${escapeHtml(congId)}" ${congId === currentCongregationId ? 'selected' : ''}>${escapeHtml(congregation.nome ?? congId)}</option>`).join('')
  const themeOptions = Object.entries(discursos.temas ?? {}).filter(([, theme]) => theme.ativo !== false).sort(([, a], [, b]) => Number(a.numero ?? 0) - Number(b.numero ?? 0)).map(([themeId, theme]) => `<option value="${escapeHtml(themeId)}" ${themeId === current?.temaId ? 'selected' : ''}>${escapeHtml(`${theme.numero ?? ''} ${theme.titulo ?? ''}`.trim())}</option>`).join('')
  const currentType = canonicalTalkType(current?.tipo)
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal"><h2>${id ? 'Editar programação' : 'Nova programação'}</h2><div class="form-group"><label class="form-label" for="progData">Data</label><input id="progData" class="form-input" type="date" value="${escapeHtml(current?.data ?? '')}"></div><div class="form-group"><label class="form-label" for="progTipo">Tipo</label><select id="progTipo" class="form-select"><option value="discurso_local" ${currentType === 'discurso_local' ? 'selected' : ''}>Discurso local</option><option value="discurso_visitante" ${currentType === 'discurso_visitante' ? 'selected' : ''}>Orador visitante</option><option value="saida_orador" ${currentType === 'saida_orador' ? 'selected' : ''}>Saída de orador</option></select></div><div class="form-group"><label class="form-label" for="progOrador">Orador original</label><select id="progOrador" class="form-select"><option value="">A definir</option>${speakerOptions(current?.oradorId)}</select></div><label style="display:flex;gap:8px;margin-bottom:12px"><input id="progDesistiu" type="checkbox" ${current?.desistiu ? 'checked' : ''}> O orador original desistiu</label><div class="form-group"><label class="form-label" for="progSubstituto">Substituto</label><select id="progSubstituto" class="form-select"><option value="">Ainda não definido</option>${speakerOptions(current?.substitutoId)}</select></div><div class="form-group"><label class="form-label" for="progRealizado">Quem realizou</label><select id="progRealizado" class="form-select"><option value="">Registrar depois</option>${speakerOptions(current?.realizadoPorId)}</select></div><div class="form-group"><label class="form-label" for="progCongregacao">Congregação de origem ou destino</label><select id="progCongregacao" class="form-select"><option value="">Nenhuma</option>${congregationOptions}</select></div><div class="form-group"><label class="form-label" for="progTema">Tema aprovado</label><select id="progTema" class="form-select"><option value="">A definir</option>${themeOptions}</select></div><div class="form-group"><label class="form-label" for="progStatus">Status</label><select id="progStatus" class="form-select"><option value="por_definir" ${current?.status === 'por_definir' ? 'selected' : ''}>Por definir</option><option value="por_confirmar" ${current?.status !== 'confirmado' && current?.status !== 'por_definir' ? 'selected' : ''}>A confirmar</option><option value="confirmado" ${current?.status === 'confirmado' ? 'selected' : ''}>Confirmado</option></select></div><label style="display:flex;gap:8px;margin-bottom:12px"><input id="progReconfirmado" type="checkbox" ${current?.reconfirmacao?.status ? 'checked' : ''}> Reconfirmado para a semana da reunião</label><div style="display:flex;gap:8px;margin-top:8px"><button id="cancelProg" class="btn btn-ghost" type="button" style="flex:1">Cancelar</button><button id="saveProg" class="btn btn-primary" type="button" style="flex:1">Salvar</button></div></div>`
  document.body.appendChild(overlay)
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove() })
  overlay.querySelector('#cancelProg')?.addEventListener('click', () => overlay.remove())
  overlay.querySelector('#saveProg')?.addEventListener('click', () => void saveProgramacao(id, overlay))
}

async function saveProgramacao(id: string | null, overlay: HTMLElement): Promise<void> {
  const current = id ? discursos.programacao?.[id] : undefined
  const oradorId = (overlay.querySelector('#progOrador') as HTMLSelectElement).value
  const orador = oradorId ? discursos.oradores?.[oradorId] : undefined
  const substitutoId = (overlay.querySelector('#progSubstituto') as HTMLSelectElement).value
  const substituto = substitutoId ? discursos.oradores?.[substitutoId] : undefined
  const realizadoPorId = (overlay.querySelector('#progRealizado') as HTMLSelectElement).value
  const realizadoPor = realizadoPorId ? discursos.oradores?.[realizadoPorId] : undefined
  const desistiu = (overlay.querySelector('#progDesistiu') as HTMLInputElement).checked
  const reconfirmado = (overlay.querySelector('#progReconfirmado') as HTMLInputElement).checked
  const tipo = (overlay.querySelector('#progTipo') as HTMLSelectElement).value as 'discurso_local' | 'discurso_visitante' | 'saida_orador'
  const congregacaoId = (overlay.querySelector('#progCongregacao') as HTMLSelectElement).value
  const congregacao = congregacaoId ? discursos.congregacoes?.[congregacaoId] : undefined
  const temaId = (overlay.querySelector('#progTema') as HTMLSelectElement).value
  const tema = temaId ? discursos.temas?.[temaId] : undefined
  const status = (overlay.querySelector('#progStatus') as HTMLSelectElement).value as 'por_definir' | 'por_confirmar' | 'confirmado'
  const record: LegacyProgramacao = {
    ...(id ? discursos.programacao?.[id] : {}),
    data: (overlay.querySelector('#progData') as HTMLInputElement).value,
    tipo,
    oradorId: oradorId || undefined,
    oradorNome: orador ? oradorNome(oradorId, orador) : undefined,
    oradorOriginalId: current?.oradorOriginalId ?? (desistiu ? oradorId || undefined : undefined),
    oradorOriginalNome: current?.oradorOriginalNome ?? (desistiu && orador ? oradorNome(oradorId, orador) : undefined),
    desistiu,
    substitutoId: substitutoId || undefined,
    substitutoNome: substituto ? oradorNome(substitutoId, substituto) : undefined,
    realizadoPorId: realizadoPorId || undefined,
    realizadoPorNome: realizadoPor ? oradorNome(realizadoPorId, realizadoPor) : undefined,
    congregacaoId: congregacaoId || undefined,
    congregacaoOrigemId: tipo === 'discurso_visitante' ? congregacaoId || undefined : undefined,
    congregacaoOrigemNome: tipo === 'discurso_visitante' ? congregacao?.nome : undefined,
    congregacaoDestinoId: tipo === 'saida_orador' ? congregacaoId || undefined : undefined,
    congregacaoDestinoNome: tipo === 'saida_orador' ? congregacao?.nome : undefined,
    temaId: temaId || undefined,
    temaNumero: tema?.numero,
    temaTitulo: tema?.titulo,
    ...(status === 'por_definir' ? { status, confirmacao: undefined } : confirmationPatch(status, new Date().toISOString())),
    reconfirmacao: reconfirmado ? { status: true, confirmadoEm: current?.reconfirmacao?.confirmadoEm || new Date().toISOString() } : undefined,
  }
  if (!record.data) { toast('Preencha a data'); return }
  const finalId = id ?? `p_${Date.now().toString(36)}`
  if (tipo === 'discurso_local' && eventBlocksLocal(discursos.eventos ?? {}, record.data)) { toast('Há um evento especial nesta data; não pode haver discurso local'); return }
  if (orador?.ativo === false) { toast('Selecione um orador ativo'); return }
  if (substituto?.ativo === false || realizadoPor?.ativo === false) { toast('Substituto e responsável pela realização precisam estar ativos'); return }
  if (desistiu && substitutoId === oradorId) { toast('O substituto deve ser outra pessoa'); return }
  if ((tipo === 'discurso_visitante' || tipo === 'saida_orador') && !congregacaoId) { toast('Selecione a congregação de origem ou destino'); return }
  if (tipo === 'saida_orador' && orador?.aprovadoParaSaida === false) { toast('Este orador não está aprovado para saídas'); return }
  const effectiveSpeaker = desistiu && substituto ? substituto : orador
  if (temaId && effectiveSpeaker && !allowedTheme(temaId, effectiveSpeaker, discursos.temas ?? {})) { toast('O tema não está aprovado para quem fará o discurso'); return }
  const conflicts = talkConflicts(finalId, record, discursos.programacao ?? {}, taskMeetings, discursos.oradores ?? {})
  if (conflicts.length) { toast(conflicts[0]); return }
  try {
    await update(tarefasDiscursosRef, { [`programacao/${finalId}`]: record })
    discursos.programacao = { ...(discursos.programacao ?? {}), [finalId]: record }
    overlay.remove(); toast(id ? 'Programação atualizada' : 'Programação adicionada'); render()
  } catch { toast('Erro ao salvar a programação') }
}

async function deleteProgramacao(id: string): Promise<void> {
  if (!id || !discursos.programacao?.[id]) return
  if (!window.confirm('Excluir esta programação?')) return
  try {
    await update(tarefasDiscursosRef, { [`programacao/${id}`]: null })
    const next = { ...(discursos.programacao ?? {}) }; delete next[id]; discursos.programacao = next
    toast('Programação excluída'); render()
  } catch { toast('Erro ao excluir a programação') }
}

function temasView(): string {
  const rows = Object.entries(discursos.temas ?? {}).sort(([, a], [, b]) => (a.numero ?? 0) - (b.numero ?? 0))
  const history = themeHistory(discursos.programacao ?? {}, todayStr())
  return `<div style="margin-top:14px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:2px"><div><h3 style="font-size:.95rem;color:#5C6062">Temas</h3><p style="font-size:.75rem;color:var(--ink-3)">Catálogo e histórico dos discursos públicos.</p></div><button class="btn btn-primary" type="button" data-add-tema style="padding:6px 10px;font-size:.78rem">Adicionar</button></div><div class="module-option-list">${rows.length ? rows.map(([id, t]) => { const usage = history[id]; return `<div class="module-menu-btn" style="cursor:default;border-radius:8px;padding:10px 12px"><div style="flex:1"><div class="mod-label">${t.numero ? `${String(t.numero).padStart(3, '0')} — ` : ''}${escapeHtml(t.titulo ?? id)}</div><div class="mod-desc">Último uso: ${escapeHtml(usage?.lastPerformed ? formatDate(usage.lastPerformed) : 'não registrado')} · Próximos: ${escapeHtml(usage?.future.length ? usage.future.map(formatDate).join(', ') : 'nenhum')}</div></div><span style="font-size:.72rem;color:${t.ativo === false ? '#B3261E' : '#1A6B3C'}">${t.ativo === false ? 'Inativo' : 'Ativo'}</span><button class="btn btn-ghost" type="button" data-edit-tema="${escapeHtml(id)}" style="padding:4px 8px;font-size:.72rem">Editar</button><button class="btn btn-danger" type="button" data-delete-tema="${escapeHtml(id)}" style="padding:4px 8px;font-size:.72rem">Excluir</button></div>` }).join('') : '<p class="empty-state">Nenhum tema cadastrado.</p>'}</div></div>`
}

function openTemaModal(id: string | null): void {
  const current = id ? discursos.temas?.[id] : undefined
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal"><h2>${id ? 'Editar tema' : 'Novo tema'}</h2><div class="form-group"><label class="form-label" for="temaNumero">Número</label><input id="temaNumero" class="form-input" type="number" min="1" value="${current?.numero ?? ''}"></div><div class="form-group"><label class="form-label" for="temaTitulo">Título</label><input id="temaTitulo" class="form-input" value="${escapeHtml(current?.titulo ?? '')}"></div><div class="form-group"><label style="display:flex;align-items:center;gap:8px"><input id="temaAtivo" type="checkbox" ${current?.ativo !== false ? 'checked' : ''}> <span class="form-label" style="margin:0">Ativo</span></label></div><div style="display:flex;gap:8px;margin-top:8px"><button id="cancelTema" class="btn btn-ghost" type="button" style="flex:1">Cancelar</button><button id="saveTema" class="btn btn-primary" type="button" style="flex:1">Salvar</button></div></div>`
  document.body.appendChild(overlay)
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove() })
  overlay.querySelector('#cancelTema')?.addEventListener('click', () => overlay.remove())
  overlay.querySelector('#saveTema')?.addEventListener('click', () => void saveTema(id, overlay))
}

async function saveTema(id: string | null, overlay: HTMLElement): Promise<void> {
  const numero = Number((overlay.querySelector('#temaNumero') as HTMLInputElement).value)
  const titulo = (overlay.querySelector('#temaTitulo') as HTMLInputElement).value.trim()
  if (!numero || !titulo) { toast('Preencha número e título'); return }
  const finalId = id ?? `tema_${String(numero).padStart(3, '0')}`
  const record: LegacyTema = { ...(id ? discursos.temas?.[id] : {}), numero, titulo, ativo: (overlay.querySelector('#temaAtivo') as HTMLInputElement).checked }
  try {
    await update(tarefasDiscursosRef, { [`temas/${finalId}`]: record })
    discursos.temas = { ...(discursos.temas ?? {}), [finalId]: record }
    overlay.remove(); toast(id ? 'Tema atualizado' : 'Tema adicionado'); render()
  } catch { toast('Erro ao salvar o tema') }
}

async function deleteTema(id: string): Promise<void> {
  if (!id || !discursos.temas?.[id]) return
  if (!window.confirm('Excluir este tema?')) return
  try {
    await update(tarefasDiscursosRef, { [`temas/${id}`]: null })
    const next = { ...(discursos.temas ?? {}) }; delete next[id]; discursos.temas = next
    toast('Tema excluído'); render()
  } catch { toast('Erro ao excluir o tema') }
}

function pendenciasView(): string {
  const items: string[] = []
  Object.entries(discursos.programacao ?? {}).forEach(([, p]) => {
    if (p.data && p.data < todayStr()) return
    if (!p.oradorId && !p.oradorNome) items.push('Há uma programação sem orador definido.')
    if (p.desistiu && !p.substitutoId) items.push(`Compromisso de ${formatDate(p.data)} está sem substituto.`)
    if (deriveStatus(p) !== 'confirmado' && !(p.desistiu && !p.substitutoId)) items.push(`Compromisso de ${formatDate(p.data)} aguardando confirmação.`)
    if (needsReconfirmation(p, todayStr())) items.push(`Compromisso de ${formatDate(p.data)} precisa ser reconfirmado.`)
  })
  Object.entries(discursos.oradores ?? {}).forEach(([, o]) => {
    if (o.ativo !== false && !o.pessoaId) items.push(`${oradorNome('', o) || 'Orador'} está sem vínculo com o Admin.`)
    else if (o.ativo !== false && !oradorTelefone(o)) items.push(`${oradorNome('', o) || 'Orador'} está sem WhatsApp no Admin.`)
    if (o.ativo !== false && !(o.temaIds?.length)) items.push(`${oradorNome('', o) || 'Orador'} está sem temas aprovados.`)
  })
  watchtowerIssues(discursos.oradores ?? {}).forEach(issue => items.push(issue))
  Object.values(discursos.congregacoes ?? {}).forEach(congregation => {
    if (congregation.ativa !== false && (!congregation.contato || !congregation.telefone || !congregation.diaReuniao || !congregation.horario)) items.push(`${congregation.nome ?? 'Congregação'} está com contato ou reunião incompletos.`)
  })
  return `<div style="margin-top:14px"><h3 style="font-size:.95rem;color:#5C6062;margin-bottom:2px">Pendências</h3><p style="font-size:.75rem;color:var(--ink-3);margin-bottom:10px">Itens que precisam de revisão antes da entrega.</p>${items.length ? `<div style="display:flex;flex-direction:column;gap:8px">${items.map(item => `<div style="border:1px solid #E6C7C4;background:#FFF7F6;color:#7E2B25;border-radius:8px;padding:12px;font-size:.82rem">${escapeHtml(item)}</div>`).join('')}</div>` : '<div style="padding:18px;border:1px solid #B7DEC7;background:#F1FAF4;border-radius:8px;color:#1A6B3C;font-size:.84rem">Nenhuma pendência identificada.</div>'}</div>`
}

function formatDate(value: string | undefined): string {
  if (!value) return 'Sem data'
  const [y, m, d] = value.split('-')
  return y && m && d ? `${d}/${m}/${y}` : value
}


function metricCard(label: string, value: string, color: string): string {
  return `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 12px">
      <div style="font-size:1.15rem;font-weight:800;color:${color};line-height:1"><span data-kpi-value="${escapeHtml(value)}">0</span></div>
      <div style="font-size:.72rem;color:var(--ink-3);margin-top:4px;text-transform:uppercase;font-weight:700">
        ${label}
      </div>
    </div>`
}
