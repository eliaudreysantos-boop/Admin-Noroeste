import type { AppContext } from '../types'
import { get, tarefasDiscursosRef } from '../firebase'

interface LegacyDiscursos {
  oradores?: Record<string, { ativo?: boolean; tipo?: string }>
  programacao?: Record<string, { status?: string; data?: string }>
  temas?: Record<string, { ativo?: boolean }>
  congregacoes?: Record<string, { ativa?: boolean; tipo?: string }>
}

let discursos: LegacyDiscursos = {}

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

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      ${metricCard('Oradores', `${oradoresAtivos}/${totalOradores}`, '#5C6062')}
      ${metricCard('Locais', String(locais), '#003F72')}
      ${metricCard('Visitantes', String(visitantes), '#7E3AF2')}
      ${metricCard('Temas ativos', String(temasAtivos), '#1A6B3C')}
      ${metricCard('Congregações', String(congregacoesAtivas), '#006EB6')}
      ${metricCard('A confirmar', String(aConfirmar), '#B3261E')}
    </div>

    <div style="display:flex;flex-direction:column;gap:8px">
      ${optionCard('Programação', `${programacoesFuturas} compromisso${programacoesFuturas === 1 ? '' : 's'} futuro${programacoesFuturas === 1 ? '' : 's'}`)}
      ${optionCard('Temas', 'Catálogo dos discursos públicos')}
      ${optionCard('Eventos', 'Datas especiais que afetam discursos')}
      ${optionCard('Cadastro', 'Oradores da congregação')}
      ${optionCard('Designações', 'Compromissos dos nossos oradores')}
      ${optionCard('Congregações', 'Congregações locais e visitantes')}
      ${optionCard('Intercâmbios', 'Entradas e saídas de oradores')}
      ${optionCard('Emergência', 'Substituição de discurso')}
    </div>

    <p style="font-size:.72rem;color:var(--ink-3);margin-top:14px">
      Revise primeiro os compromissos a confirmar e depois mantenha temas e cadastros em dia.
    </p>`
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

function optionCard(title: string, desc: string): string {
  return `
    <button class="module-menu-btn" type="button" disabled
      style="opacity:.72;cursor:not-allowed;border-radius:8px;padding:12px 14px">
      <div style="flex:1;min-width:0">
        <div class="mod-label">${title}</div>
        <div class="mod-desc">${desc}</div>
      </div>
      <span style="font-size:.72rem;color:var(--ink-3);font-weight:700">Em preparo</span>
    </button>`
}
