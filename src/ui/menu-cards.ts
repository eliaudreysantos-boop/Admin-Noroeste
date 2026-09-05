export interface ItemMenu {
  id: string
  titulo: string
  subtitulo: string
  icone: string
  corFundo: string
}

export function renderMenuCards(
  container: HTMLElement,
  itens: ItemMenu[],
  onSelect: (id: string) => void,
): void {
  container.innerHTML = `<div class="module-menu">${itens.map(item => `
    <button class="module-menu-btn" type="button" data-menu-card="${item.id}">
      <div class="mod-icon" style="background:${item.corFundo}20;color:${item.corFundo}">${item.icone}</div>
      <div><div class="mod-label">${item.titulo}</div><div class="mod-desc">${item.subtitulo}</div></div>
    </button>`).join('')}</div>`
  container.querySelectorAll<HTMLButtonElement>('[data-menu-card]').forEach(button => {
    button.addEventListener('click', () => onSelect(button.dataset['menuCard']!))
  })
}
