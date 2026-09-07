export interface ItemMenu {
  id: string
  titulo: string
  subtitulo: string
  icone: string
  corFundo: string
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function renderMenuCards(
  container: HTMLElement,
  itens: ItemMenu[],
  onSelect: (id: string) => void,
): void {
  container.innerHTML = `<div class="module-menu">${itens.map(item => `
    <button class="module-menu-btn" type="button" data-menu-card="${escapeHtml(item.id)}">
      <div class="mod-icon" style="background:${item.corFundo}20;color:${item.corFundo}">${escapeHtml(item.icone)}</div>
      <div><div class="mod-label">${escapeHtml(item.titulo)}</div><div class="mod-desc">${escapeHtml(item.subtitulo)}</div></div>
    </button>`).join('')}</div>`
  container.querySelectorAll<HTMLButtonElement>('[data-menu-card]').forEach(button => {
    button.addEventListener('click', () => onSelect(button.dataset['menuCard']!))
  })
}
