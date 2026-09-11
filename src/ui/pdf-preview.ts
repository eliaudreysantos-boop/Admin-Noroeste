const esc = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;')

export function previewPdf(bytes: Uint8Array, filename: string, heading = 'Prévia do PDF'): void {
  const copy = Uint8Array.from(bytes)
  const url = URL.createObjectURL(new Blob([copy.buffer as ArrayBuffer], { type: 'application/pdf' }))
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `<div class="modal pdf-preview-modal" role="dialog" aria-modal="true" aria-labelledby="pdfPreviewTitle"><h2 id="pdfPreviewTitle">${esc(heading)} - ${esc(filename)}</h2><iframe title="Prévia do PDF ${esc(filename)}" src="${url}"></iframe><div class="pdf-preview-actions"><button class="btn btn-primary" data-pdf-download type="button">Baixar PDF</button><button class="btn btn-ghost" data-pdf-print type="button">Imprimir</button><button class="btn btn-ghost" data-pdf-close type="button">Fechar</button></div></div>`
  const close = (): void => { overlay.remove(); URL.revokeObjectURL(url) }
  document.body.appendChild(overlay)
  overlay.addEventListener('click', event => { if (event.target === overlay) close() })
  overlay.querySelector<HTMLButtonElement>('[data-pdf-close]')?.addEventListener('click', close)
  overlay.querySelector<HTMLButtonElement>('[data-pdf-download]')?.addEventListener('click', () => {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
  })
  overlay.querySelector<HTMLButtonElement>('[data-pdf-print]')?.addEventListener('click', () => {
    const frame = overlay.querySelector<HTMLIFrameElement>('iframe')
    if (frame?.contentWindow) frame.contentWindow.print()
    else window.open(url, '_blank', 'noopener,noreferrer')
  })
}
