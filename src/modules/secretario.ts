import type { AppContext, RawUsuarios, Usuario } from '../types'
import { get, secretarioRef, usuariosRef } from '../firebase'

type SecretarioTab = 'resumo' | 'publicadores' | 'relatorios' | 'assistencia' | 'arquivos'

let secretario: Record<string, unknown> = {}
let usuarios: RawUsuarios = {}
let activeTab: SecretarioTab = 'resumo'

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function records(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function count(value: unknown): number {
  return Object.keys(records(value)).length
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

function publicadores(): Array<[string, Usuario]> {
  return Object.entries(usuarios).filter(([, user]) => user.secretarioPapel === 'publicador')
}

function hasMonthlyReport(uid: string, masterId?: string): boolean {
  const reports = records(secretario.relatorios)
  const month = currentMonth()
  const byUser = records(reports[uid])
  const byMaster = masterId ? records(reports[masterId]) : {}
  const monthRecord = records(reports[month])
  return Boolean(byUser[month] || byMaster[month] || monthRecord.congregacao)
}

function toast(message: string): void {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = message
  el.classList.add('show')
  setTimeout(() => el.classList.remove('show'), 2600)
}

export default function mount(_ctx: AppContext): void {
  const el = document.getElementById('appContent')
  if (!el) return
  el.innerHTML = '<div id="secretarioRoot"><p style="padding:24px;color:var(--ink-3);text-align:center">Carregando...</p></div>'
  void load()
}

async function load(): Promise<void> {
  try {
    const [secretarioSnap, usuariosSnap] = await Promise.all([get(secretarioRef), get(usuariosRef)])
    secretario = secretarioSnap.exists() ? records(secretarioSnap.val()) : {}
    usuarios = usuariosSnap.exists() ? usuariosSnap.val() as RawUsuarios : {}
  } catch {
    toast('Erro ao carregar Secretário')
  }
  render()
}

function render(): void {
  const el = document.getElementById('secretarioRoot')
  if (!el) return

  const pubs = publicadores()
  const reports = records(secretario.relatorios)
  const assistance = secretario.assistencia ?? secretario.presenca
  const files = secretario.arquivoCongregacao ?? secretario.arquivos
  const linked = pubs.filter(([, user]) => Boolean(user.masterId)).length
  const sent = pubs.filter(([uid, user]) => hasMonthlyReport(uid, user.masterId)).length

  el.innerHTML = `
    <div style="margin-bottom:14px">
      <h2 style="font-size:1.05rem;color:#5C6062;margin-bottom:2px">Secretário</h2>
      <p style="font-size:.8rem;color:var(--ink-3)">Publicadores, relatórios mensais, assistência e arquivo da congregação.</p>
    </div>
    <div class="module-tabs" role="tablist" aria-label="Áreas do Secretário">
      ${tabButton('resumo', 'Resumo')}
      ${tabButton('publicadores', 'Publicadores')}
      ${tabButton('relatorios', 'Relatórios')}
      ${tabButton('assistencia', 'Assistência')}
      ${tabButton('arquivos', 'Arquivos')}
    </div>
    ${activeTab === 'resumo' ? summary(pubs.length, linked, sent, count(assistance), count(files)) : ''}
    ${activeTab === 'publicadores' ? publishers(pubs) : ''}
    ${activeTab === 'relatorios' ? reportsView(reports) : ''}
    ${activeTab === 'assistencia' ? assistanceView(assistance) : ''}
    ${activeTab === 'arquivos' ? filesView(files) : ''}`

  el.querySelectorAll<HTMLButtonElement>('[data-secretario-tab]').forEach(button => {
    button.addEventListener('click', () => {
      activeTab = button.dataset.secretarioTab as SecretarioTab
      render()
    })
  })
}

function tabButton(tab: SecretarioTab, label: string): string {
  return `<button class="module-tab${activeTab === tab ? ' active' : ''}" type="button" data-secretario-tab="${tab}" role="tab" aria-selected="${activeTab === tab}">${label}</button>`
}

function metric(label: string, value: string, color: string): string {
  return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 12px"><div style="font-size:1.15rem;font-weight:800;color:${color};line-height:1">${value}</div><div style="font-size:.72rem;color:var(--ink-3);margin-top:4px;text-transform:uppercase;font-weight:700">${label}</div></div>`
}

function summary(total: number, linked: number, sent: number, assistance: number, files: number): string {
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
    ${metric('Publicadores', String(total), '#5C6062')}
    ${metric('Vinculados', `${linked}/${total}`, '#003F72')}
    ${metric('Relatório do mês', `${sent}/${total}`, sent === total ? '#1A6B3C' : '#B3261E')}
    ${metric('Assistência', String(assistance), '#006EB6')}
    ${metric('Arquivos', String(files), '#7E3AF2')}
  </div>
  <div class="module-option-list">
    ${actionCard('Publicadores', 'Confira vínculos e pendências do mês.', 'publicadores')}
    ${actionCard('Relatórios mensais', 'Registre e acompanhe o fechamento.', 'relatorios')}
    ${actionCard('Assistência', 'Organize os registros por reunião e grupo.', 'assistencia')}
    ${actionCard('Arquivo da congregação', 'Mantenha os documentos e históricos acessíveis.', 'arquivos')}
  </div>`
}

function publishers(pubs: Array<[string, Usuario]>): string {
  const rows = pubs.length === 0
    ? '<p class="empty-state">Nenhum publicador encontrado no cadastro.</p>'
    : pubs.map(([uid, user]) => `<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)"><div><strong>${escapeHtml(user.nome)}</strong><div style="font-size:.75rem;color:var(--ink-3)">${user.masterId ? `Vinculado ao cadastro ${escapeHtml(user.masterId)}` : 'Sem vínculo com o cadastro Admin'}</div></div><span style="font-size:.72rem;font-weight:700;color:${hasMonthlyReport(uid, user.masterId) ? '#1A6B3C' : '#B3261E'}">${hasMonthlyReport(uid, user.masterId) ? 'Relatório recebido' : 'Pendente'}</span></div>`).join('')
  return section('Publicadores', `Competência ${currentMonth()}`, rows)
}

function reportsView(data: Record<string, unknown>): string {
  const rows = Object.entries(data).sort(([a], [b]) => b.localeCompare(a)).slice(0, 12)
    .map(([key, value]) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)"><div><strong>${escapeHtml(key)}</strong><div style="font-size:.75rem;color:var(--ink-3)">${escapeHtml(summaryValue(value))}</div></div><span style="font-size:.72rem;font-weight:700;color:#1A6B3C">Registrado</span></div>`).join('')
  return section('Relatórios mensais', `${count(data)} registro${count(data) === 1 ? '' : 's'} no histórico`, rows || '<p class="empty-state">Nenhum relatório registrado no banco de dados.</p>')
}

function assistanceView(data: unknown): string {
  const rows = Object.entries(records(data)).sort(([a], [b]) => b.localeCompare(a)).slice(0, 12)
    .map(([key, value]) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)"><strong>${escapeHtml(key)}</strong><span style="font-size:.8rem;color:var(--ink-3)">${escapeHtml(summaryValue(value))}</span></div>`).join('')
  return section('Assistência', `${count(data)} registro${count(data) === 1 ? '' : 's'} disponível${count(data) === 1 ? '' : 'is'}`, rows || '<p class="empty-state">Nenhum registro de assistência encontrado.</p>')
}

function filesView(data: unknown): string {
  const rows = Object.entries(records(data)).sort(([a], [b]) => b.localeCompare(a)).slice(0, 12)
    .map(([key, value]) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)"><strong>${escapeHtml(key)}</strong><span style="font-size:.8rem;color:var(--ink-3)">${escapeHtml(summaryValue(value))}</span></div>`).join('')
  return section('Arquivo da congregação', `${count(data)} item${count(data) === 1 ? '' : 's'} no arquivo`, rows || '<p class="empty-state">Nenhum arquivo registrado no banco de dados.</p>')
}

function summaryValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value !== 'object') return String(value)
  const row = records(value)
  const interesting = ['status', 'total', 'quantidade', 'mes', 'data', 'nome']
    .map(key => row[key] === undefined ? '' : `${key}: ${row[key]}`)
    .filter(Boolean)
  return interesting.join(' · ') || `${Object.keys(row).length} campos`
}

function section(title: string, subtitle: string, body: string): string {
  return `<div style="margin-top:14px"><h3 style="font-size:.95rem;color:#5C6062;margin-bottom:2px">${title}</h3><p style="font-size:.75rem;color:var(--ink-3);margin-bottom:10px">${subtitle}</p><div class="module-option-list">${body}</div></div>`
}

function actionCard(title: string, desc: string, tab?: SecretarioTab): string {
  const enabled = Boolean(tab)
  return `<button class="module-menu-btn" type="button" ${enabled ? `data-secretario-tab="${tab}"` : 'disabled'} style="${enabled ? '' : 'opacity:.72;cursor:not-allowed;'}border-radius:8px;padding:12px 14px"><div style="flex:1;min-width:0"><div class="mod-label">${title}</div><div class="mod-desc">${desc}</div></div><span style="font-size:.72rem;color:var(--ink-3);font-weight:700">${enabled ? 'Abrir' : 'Em preparo'}</span></button>`
}
