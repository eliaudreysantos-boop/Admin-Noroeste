export function moduleBackButton(): string {
  return '<span data-module-index-marker hidden></span>'
}

export function moduleTitle(title: string, color = 'var(--blue-deep)'): string {
  return `<div class="module-title"><h2 style="color:${color}">${title}</h2></div>`
}
