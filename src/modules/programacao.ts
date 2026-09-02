import type { AppContext } from '../types'

export default function mount(_ctx: AppContext): void {
  const el = document.getElementById('appContent')
  if (!el) return
  el.innerHTML = `
    <div class="module-placeholder">
      <div style="font-size:2.5rem">📅</div>
      <h2 style="color:#003F72">Módulo: Programação</h2>
      <p>Em construção — Fase 3</p>
    </div>`
}
