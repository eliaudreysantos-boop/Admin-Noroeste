export function downloadPdf(bytes: Uint8Array, filename: string): void {
  const copy = Uint8Array.from(bytes)
  const url = URL.createObjectURL(new Blob([copy.buffer], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  try { link.click() } finally {
    link.remove()
    // Allow the browser to consume the blob before releasing it.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}
