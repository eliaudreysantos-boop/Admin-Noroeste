export function moduleBackButton(): string {
  return '<button class="module-back-btn" type="button" data-module-index aria-label="Voltar ao índice do módulo">← Voltar</button>'
}

export function moduleTitle(title: string, color = 'var(--blue-deep)'): string {
  return `<div class="module-title"><h2 style="color:${color}">${title}</h2></div>`
}
