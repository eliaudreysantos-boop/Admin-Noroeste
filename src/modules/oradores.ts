import type { AppContext } from '../types'
import { get, update, tarefasDiscursosRef } from '../firebase'
import { renderMenuCards, type ItemMenu } from '../ui/menu-cards'
import { moduleBackButton, moduleTitle } from '../ui/module-header'

interface LegacyOrador { nome?: string; name?: string; telefone?: string; ativo?: boolean; tipo?: string; temaIds?: string[]; pessoaId?: string }
interface LegacyProgramacao { status?: string; data?: string; oradorId?: string; oradorNome?: string; temaNumero?: number; temaTitulo?: string; tipo?: string; congregacaoId?: string }
interface LegacyTema { titulo?: string; ativo?: boolean; numero?: number }
interface LegacyCongregacao { nome?: string; cidade?: string; tipo?: string; contato?: string; telefone?: string; ativa?: boolean }
interface LegacyDiscursos {
  oradores?: Record<string, LegacyOrador>
  programacao?: Record<string, LegacyProgramacao>
  temas?: Record<string, LegacyTema>
  congregacoes?: Record<string, LegacyCongregacao>
}

let discursos: LegacyDiscursos = {}
type OradoresTab = 'indice' | 'resumo' | 'cadastro' | 'programacao' | 'temas' | 'congregacoes' | 'pendencias'
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
    const snap = await get(tarefasDiscursosRef)
    discursos = snap.exists() ? (snap.val() as LegacyDiscursos) : {}
  } catch {
    toast('Erro ao carregar Oradores')
  }
  render()
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
}

function renderTabContent(tab: OradoresTab): string {
  if (tab === 'cadastro') return cadastroView()
  if (tab === 'programacao') return programacaoView()
  if (tab === 'temas') return temasView()
  if (tab === 'congregacoes') return congregacoesView()
  return pendenciasView()
}

function congregacoesView(): string {
  const rows = Object.entries(discursos.congregacoes ?? {}).sort(([, a], [, b]) => (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR'))
  return `<div style="margin-top:14px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px"><h3 style="font-size:.95rem;color:#5C6062">Congregações</h3><button class="btn btn-primary" type="button" data-add-congregacao style="padding:6px 10px;font-size:.78rem">Adicionar</button></div><div class="module-option-list">${rows.length ? rows.map(([id, c]) => `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 12px;display:flex;justify-content:space-between;gap:10px;align-items:center"><div style="flex:1;min-width:0"><strong>${escapeHtml(c.nome ?? id)}</strong><div style="font-size:.75rem;color:var(--ink-3)">${escapeHtml(c.cidade ?? 'Cidade não informada')} · ${c.tipo === 'local' ? 'Local' : 'Visitante'}${c.telefone ? ` · ${escapeHtml(c.telefone)}` : ''}</div></div><span style="font-size:.72rem;color:${c.ativa === false ? '#B3261E' : '#1A6B3C'}">${c.ativa === false ? 'Inativa' : 'Ativa'}</span><button class="btn btn-ghost" type="button" data-edit-congregacao="${escapeHtml(id)}" style="padding:4px 8px;font-size:.72rem">Editar</button><button class="btn btn-danger" type="button" data-delete-congregacao="${escapeHtml(id)}" style="padding:4px 8px;font-size:.72rem">Excluir</button></div>`).join('') : '<p class="empty-state">Nenhuma congregação cadastrada.</p>'}</div></div>`
}

function openCongregacaoModal(id: string | null): void {
  const current = id ? discursos.congregacoes?.[id] : undefined
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal"><h2>${id ? 'Editar congregação' : 'Nova congregação'}</h2><div class="form-group"><label class="form-label" for="congNome">Nome</label><input id="congNome" class="form-input" value="${escapeHtml(current?.nome ?? '')}"></div><div class="form-group"><label class="form-label" for="congCidade">Cidade</label><input id="congCidade" class="form-input" value="${escapeHtml(current?.cidade ?? '')}"></div><div class="form-group"><label class="form-label" for="congTipo">Tipo</label><select id="congTipo" class="form-select"><option value="visitante" ${current?.tipo !== 'local' ? 'selected' : ''}>Visitante</option><option value="local" ${current?.tipo === 'local' ? 'selected' : ''}>Local</option></select></div><div class="form-group"><label class="form-label" for="congTelefone">Telefone</label><input id="congTelefone" class="form-input" type="tel" value="${escapeHtml(current?.telefone ?? '')}"></div><div class="form-group"><label style="display:flex;align-items:center;gap:8px"><input id="congAtiva" type="checkbox" ${current?.ativa !== false ? 'checked' : ''}> <span class="form-label" style="margin:0">Ativa</span></label></div><div style="display:flex;gap:8px;margin-top:8px"><button id="cancelCong" class="btn btn-ghost" type="button" style="flex:1">Cancelar</button><button id="saveCong" class="btn btn-primary" type="button" style="flex:1">Salvar</button></div></div>`
  document.body.appendChild(overlay)
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove() })
  overlay.querySelector('#cancelCong')?.addEventListener('click', () => overlay.remove())
  overlay.querySelector('#saveCong')?.addEventListener('click', () => void saveCongregacao(id, overlay))
}

async function saveCongregacao(id: string | null, overlay: HTMLElement): Promise<void> {
  const nome = (overlay.querySelector('#congNome') as HTMLInputElement).value.trim()
  if (!nome) { toast('Preencha o nome da congregação'); return }
  const record: LegacyCongregacao = { ...(id ? discursos.congregacoes?.[id] : {}), nome, cidade: (overlay.querySelector('#congCidade') as HTMLInputElement).value.trim(), tipo: (overlay.querySelector('#congTipo') as HTMLSelectElement).value, telefone: (overlay.querySelector('#congTelefone') as HTMLInputElement).value.trim(), ativa: (overlay.querySelector('#congAtiva') as HTMLInputElement).checked }
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
  const rows = Object.entries(discursos.oradores ?? {}).sort(([, a], [, b]) => (a.nome ?? a.name ?? '').localeCompare(b.nome ?? b.name ?? '', 'pt-BR'))
  return `<div style="margin-top:14px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:2px"><div><h3 style="font-size:.95rem;color:#5C6062">Cadastro</h3><p style="font-size:.75rem;color:var(--ink-3)">Oradores locais e visitantes já registrados.</p></div><button class="btn btn-primary" type="button" data-add-orador style="padding:6px 10px;font-size:.78rem;white-space:nowrap">Adicionar</button></div><div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:0 12px">${rows.length ? rows.map(([id, o]) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)"><div style="flex:1;min-width:0"><strong>${escapeHtml(o.nome ?? o.name ?? id)}</strong><div style="font-size:.75rem;color:var(--ink-3)">${escapeHtml(o.tipo ?? 'tipo não informado')}${o.telefone ? ` · ${escapeHtml(o.telefone)}` : ' · sem telefone'}</div></div><span style="font-size:.72rem;font-weight:700;color:${o.ativo === false ? '#B3261E' : '#1A6B3C'}">${o.ativo === false ? 'Inativo' : 'Ativo'}</span><button class="btn btn-ghost" type="button" data-edit-orador="${escapeHtml(id)}" style="padding:4px 8px;font-size:.72rem">Editar</button><button class="btn btn-danger" type="button" data-delete-orador="${escapeHtml(id)}" style="padding:4px 8px;font-size:.72rem">Excluir</button></div>`).join('') : '<p style="padding:16px 0;color:var(--ink-3);text-align:center;font-size:.82rem">Nenhum orador cadastrado.</p>'}</div></div>`
}

function newOradorId(): string {
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  return `o_${Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('')}`
}

function openOradorModal(id: string | null): void {
  const current = id ? discursos.oradores?.[id] : undefined
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal"><h2>${id ? 'Editar orador' : 'Novo orador'}</h2><div class="form-group"><label class="form-label" for="oradorNome">Nome</label><input id="oradorNome" class="form-input" value="${escapeHtml(current?.nome ?? current?.name ?? '')}"></div><div class="form-group"><label class="form-label" for="oradorTipo">Tipo</label><select id="oradorTipo" class="form-select"><option value="local" ${current?.tipo === 'local' ? 'selected' : ''}>Local</option><option value="visitante" ${current?.tipo === 'visitante' ? 'selected' : ''}>Visitante</option></select></div><div class="form-group"><label class="form-label" for="oradorTelefone">Telefone</label><input id="oradorTelefone" class="form-input" type="tel" value="${escapeHtml(current?.telefone ?? '')}"></div><div class="form-group"><label style="display:flex;align-items:center;gap:8px"><input id="oradorAtivo" type="checkbox" ${current?.ativo !== false ? 'checked' : ''}> <span class="form-label" style="margin:0">Ativo</span></label></div><div style="display:flex;gap:8px;margin-top:8px"><button id="cancelOrador" class="btn btn-ghost" type="button" style="flex:1">Cancelar</button><button id="saveOrador" class="btn btn-primary" type="button" style="flex:1">Salvar</button></div></div>`
  document.body.appendChild(overlay)
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove() })
  overlay.querySelector('#cancelOrador')?.addEventListener('click', () => overlay.remove())
  overlay.querySelector('#saveOrador')?.addEventListener('click', () => void saveOrador(id, overlay))
}

async function saveOrador(id: string | null, overlay: HTMLElement): Promise<void> {
  const nome = (overlay.querySelector('#oradorNome') as HTMLInputElement).value.trim()
  if (!nome) { toast('Preencha o nome'); return }
  const record: LegacyOrador = {
    ...(id ? discursos.oradores?.[id] : {}),
    nome,
    tipo: (overlay.querySelector('#oradorTipo') as HTMLSelectElement).value,
    telefone: (overlay.querySelector('#oradorTelefone') as HTMLInputElement).value.trim(),
    ativo: (overlay.querySelector('#oradorAtivo') as HTMLInputElement).checked,
  }
  const finalId = id ?? newOradorId()
  try {
    await update(tarefasDiscursosRef, { [`oradores/${finalId}`]: record })
    discursos.oradores = { ...(discursos.oradores ?? {}), [finalId]: record }
    overlay.remove()
    toast(id ? 'Orador atualizado' : 'Orador adicionado')
    render()
  } catch { toast('Erro ao salvar o orador') }
}

async function deleteOrador(id: string): Promise<void> {
  if (!id || !discursos.oradores?.[id]) return
  if (!window.confirm(`Excluir o orador "${discursos.oradores[id].nome ?? discursos.oradores[id].name ?? id}"?`)) return
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
  const speakers = Object.entries(discursos.oradores ?? {}).sort(([, a], [, b]) => (a.nome ?? a.name ?? '').localeCompare(b.nome ?? b.name ?? '', 'pt-BR'))
  const options = speakers.map(([speakerId, speaker]) => `<option value="${escapeHtml(speakerId)}" ${speakerId === current?.oradorId ? 'selected' : ''}>${escapeHtml(speaker.nome ?? speaker.name ?? speakerId)}</option>`).join('')
  const congregacoes = Object.entries(discursos.congregacoes ?? {}).filter(([, c]) => c.ativa !== false).sort(([, a], [, b]) => (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR'))
  const congregationOptions = congregacoes.map(([congId, congregation]) => `<option value="${escapeHtml(congId)}" ${congId === current?.congregacaoId ? 'selected' : ''}>${escapeHtml(congregation.nome ?? congId)}</option>`).join('')
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal"><h2>${id ? 'Editar programação' : 'Nova programação'}</h2><div class="form-group"><label class="form-label" for="progData">Data</label><input id="progData" class="form-input" type="date" value="${escapeHtml(current?.data ?? '')}"></div><div class="form-group"><label class="form-label" for="progTipo">Tipo</label><select id="progTipo" class="form-select"><option value="local" ${current?.tipo !== 'saida_orador' && current?.tipo !== 'visitante' ? 'selected' : ''}>Discurso local</option><option value="visitante" ${current?.tipo === 'visitante' ? 'selected' : ''}>Orador visitante</option><option value="saida_orador" ${current?.tipo === 'saida_orador' ? 'selected' : ''}>Saída de orador</option></select></div><div class="form-group"><label class="form-label" for="progOrador">Orador</label><select id="progOrador" class="form-select"><option value="">A definir</option>${options}</select></div><div class="form-group"><label class="form-label" for="progCongregacao">Congregação relacionada</label><select id="progCongregacao" class="form-select"><option value="">Nenhuma</option>${congregationOptions}</select></div><div class="form-group"><label class="form-label" for="progTemaNumero">Número do tema</label><input id="progTemaNumero" class="form-input" type="number" value="${current?.temaNumero ?? ''}"></div><div class="form-group"><label class="form-label" for="progTemaTitulo">Título do tema</label><input id="progTemaTitulo" class="form-input" value="${escapeHtml(current?.temaTitulo ?? '')}"></div><div class="form-group"><label class="form-label" for="progStatus">Status</label><select id="progStatus" class="form-select"><option value="por_confirmar" ${current?.status !== 'confirmado' ? 'selected' : ''}>A confirmar</option><option value="confirmado" ${current?.status === 'confirmado' ? 'selected' : ''}>Confirmado</option></select></div><div style="display:flex;gap:8px;margin-top:8px"><button id="cancelProg" class="btn btn-ghost" type="button" style="flex:1">Cancelar</button><button id="saveProg" class="btn btn-primary" type="button" style="flex:1">Salvar</button></div></div>`
  document.body.appendChild(overlay)
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove() })
  overlay.querySelector('#cancelProg')?.addEventListener('click', () => overlay.remove())
  overlay.querySelector('#saveProg')?.addEventListener('click', () => void saveProgramacao(id, overlay))
}

async function saveProgramacao(id: string | null, overlay: HTMLElement): Promise<void> {
  const oradorId = (overlay.querySelector('#progOrador') as HTMLSelectElement).value
  const orador = oradorId ? discursos.oradores?.[oradorId] : undefined
  const record: LegacyProgramacao = {
    ...(id ? discursos.programacao?.[id] : {}),
    data: (overlay.querySelector('#progData') as HTMLInputElement).value,
    tipo: (overlay.querySelector('#progTipo') as HTMLSelectElement).value,
    oradorId: oradorId || undefined,
    oradorNome: orador ? (orador.nome ?? orador.name) : undefined,
    congregacaoId: (overlay.querySelector('#progCongregacao') as HTMLSelectElement).value || undefined,
    temaNumero: Number((overlay.querySelector('#progTemaNumero') as HTMLInputElement).value) || undefined,
    temaTitulo: (overlay.querySelector('#progTemaTitulo') as HTMLInputElement).value.trim() || undefined,
    status: (overlay.querySelector('#progStatus') as HTMLSelectElement).value,
  }
  if (!record.data) { toast('Preencha a data'); return }
  const finalId = id ?? `p_${Date.now().toString(36)}`
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
  return `<div style="margin-top:14px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:2px"><div><h3 style="font-size:.95rem;color:#5C6062">Temas</h3><p style="font-size:.75rem;color:var(--ink-3)">Catálogo e disponibilidade dos discursos públicos.</p></div><button class="btn btn-primary" type="button" data-add-tema style="padding:6px 10px;font-size:.78rem">Adicionar</button></div><div class="module-option-list">${rows.length ? rows.map(([id, t]) => `<div class="module-menu-btn" style="cursor:default;border-radius:8px;padding:10px 12px"><div style="flex:1"><div class="mod-label">${t.numero ? `${String(t.numero).padStart(3, '0')} — ` : ''}${escapeHtml(t.titulo ?? id)}</div></div><span style="font-size:.72rem;color:${t.ativo === false ? '#B3261E' : '#1A6B3C'}">${t.ativo === false ? 'Inativo' : 'Ativo'}</span><button class="btn btn-ghost" type="button" data-edit-tema="${escapeHtml(id)}" style="padding:4px 8px;font-size:.72rem">Editar</button><button class="btn btn-danger" type="button" data-delete-tema="${escapeHtml(id)}" style="padding:4px 8px;font-size:.72rem">Excluir</button></div>`).join('') : '<p class="empty-state">Nenhum tema cadastrado.</p>'}</div></div>`
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
    if (p.status !== 'confirmado') items.push(`Compromisso de ${formatDate(p.data)} aguardando confirmação.`)
  })
  Object.entries(discursos.oradores ?? {}).forEach(([, o]) => {
    if (o.ativo !== false && !o.telefone) items.push(`${o.nome ?? o.name ?? 'Orador'} está sem telefone.`)
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
