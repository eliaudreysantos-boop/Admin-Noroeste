import type { AppContext } from '../types'
import { get, update, tarefasDiscursosRef } from '../firebase'

interface LegacyOrador { nome?: string; name?: string; telefone?: string; ativo?: boolean; tipo?: string; temaIds?: string[]; pessoaId?: string }
interface LegacyProgramacao { status?: string; data?: string; oradorId?: string; oradorNome?: string; temaNumero?: number; temaTitulo?: string }
interface LegacyTema { titulo?: string; ativo?: boolean; numero?: number }
interface LegacyDiscursos {
  oradores?: Record<string, LegacyOrador>
  programacao?: Record<string, LegacyProgramacao>
  temas?: Record<string, LegacyTema>
  congregacoes?: Record<string, { ativa?: boolean; tipo?: string }>
}

let discursos: LegacyDiscursos = {}
type OradoresTab = 'resumo' | 'cadastro' | 'programacao' | 'temas' | 'pendencias'
let activeTab: OradoresTab = 'resumo'

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

  activeTab = 'resumo'
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
    <div style="margin-bottom:14px">
      <h2 style="font-size:1.05rem;color:#5C6062;margin-bottom:2px">Oradores</h2>
      <p style="font-size:.8rem;color:var(--ink-3)">
        Discursos públicos, temas, congregações e substituições.
      </p>
    </div>

    <div class="module-tabs" role="tablist" aria-label="Áreas de Oradores">
      ${tabButton('resumo', 'Resumo')}
      ${tabButton('cadastro', 'Cadastro')}
      ${tabButton('programacao', 'Programação')}
      ${tabButton('temas', 'Temas')}
      ${tabButton('pendencias', 'Pendências')}
    </div>
    ${activeTab === 'resumo' ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      ${metricCard('Oradores', `${oradoresAtivos}/${totalOradores}`, '#5C6062')}
      ${metricCard('Locais', String(locais), '#003F72')}
      ${metricCard('Visitantes', String(visitantes), '#7E3AF2')}
      ${metricCard('Temas ativos', String(temasAtivos), '#1A6B3C')}
      ${metricCard('Congregações', String(congregacoesAtivas), '#006EB6')}
      ${metricCard('A confirmar', String(aConfirmar), '#B3261E')}
    </div><div class="module-option-list">
      ${actionCard('Cadastro', 'Oradores da congregação', 'cadastro')}
      ${actionCard('Programação', `${programacoesFuturas} compromisso${programacoesFuturas === 1 ? '' : 's'} futuro${programacoesFuturas === 1 ? '' : 's'}`, 'programacao')}
      ${actionCard('Temas', 'Catálogo dos discursos públicos', 'temas')}
      ${actionCard('Pendências', `${aConfirmar} compromisso${aConfirmar === 1 ? '' : 's'} a confirmar`, 'pendencias')}
    </div>` : renderTabContent(activeTab)}`

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
}

function tabButton(tab: OradoresTab, label: string): string {
  return `<button class="module-tab${activeTab === tab ? ' active' : ''}" type="button" data-oradores-tab="${tab}" role="tab" aria-selected="${activeTab === tab}">${label}</button>`
}

function renderTabContent(tab: OradoresTab): string {
  if (tab === 'cadastro') return cadastroView()
  if (tab === 'programacao') return programacaoView()
  if (tab === 'temas') return temasView()
  return pendenciasView()
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
  return `<div style="margin-top:14px"><h3 style="font-size:.95rem;color:#5C6062;margin-bottom:2px">Programação</h3><p style="font-size:.75rem;color:var(--ink-3);margin-bottom:10px">Compromissos futuros e confirmação dos oradores.</p><div class="module-option-list">${rows.length ? rows.map(([, p]) => `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 12px;display:flex;justify-content:space-between;gap:12px"><div><strong>${escapeHtml(p.data ? formatDate(p.data) : 'Sem data')}</strong><div style="font-size:.76rem;color:var(--ink-3)">${escapeHtml(p.oradorNome ?? discursos.oradores?.[p.oradorId ?? '']?.nome ?? p.oradorId ?? 'Orador a definir')} · ${escapeHtml(p.temaTitulo ?? (p.temaNumero ? `Tema ${p.temaNumero}` : 'Tema a definir'))}</div></div><span style="font-size:.72rem;font-weight:700;color:${p.status === 'confirmado' ? '#1A6B3C' : '#B3261E'}">${p.status === 'confirmado' ? 'Confirmado' : 'A confirmar'}</span></div>`).join('') : '<p class="empty-state">Nenhum compromisso futuro.</p>'}</div></div>`
}

function temasView(): string {
  const rows = Object.entries(discursos.temas ?? {}).sort(([, a], [, b]) => (a.numero ?? 0) - (b.numero ?? 0))
  return `<div style="margin-top:14px"><h3 style="font-size:.95rem;color:#5C6062;margin-bottom:2px">Temas</h3><p style="font-size:.75rem;color:var(--ink-3);margin-bottom:10px">Catálogo e disponibilidade dos discursos públicos.</p><div class="module-option-list">${rows.length ? rows.map(([id, t]) => `<div class="module-menu-btn" style="cursor:default;border-radius:8px;padding:10px 12px"><div style="flex:1"><div class="mod-label">${t.numero ? `${String(t.numero).padStart(3, '0')} — ` : ''}${escapeHtml(t.titulo ?? id)}</div></div><span style="font-size:.72rem;color:${t.ativo === false ? '#B3261E' : '#1A6B3C'}">${t.ativo === false ? 'Inativo' : 'Ativo'}</span></div>`).join('') : '<p class="empty-state">Nenhum tema cadastrado.</p>'}</div></div>`
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

function actionCard(title: string, desc: string, tab: OradoresTab): string {
  return `<button class="module-menu-btn" type="button" data-oradores-tab="${tab}" style="border-radius:8px;padding:12px 14px"><div style="flex:1;min-width:0"><div class="mod-label">${escapeHtml(title)}</div><div class="mod-desc">${escapeHtml(desc)}</div></div><span style="font-size:1.1rem;color:var(--ink-3)">›</span></button>`
}

function metricCard(label: string, value: string, color: string): string {
  return `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 12px">
      <div style="font-size:1.15rem;font-weight:800;color:${color};line-height:1">${value}</div>
      <div style="font-size:.72rem;color:var(--ink-3);margin-top:4px;text-transform:uppercase;font-weight:700">
        ${label}
      </div>
    </div>`
}
