export function lockPublicationUi(): () => void {
  const shell = document.getElementById('appShell')
  const button = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null
  const label = button?.textContent ?? ''
  const previousInert = shell?.inert ?? false
  if (shell) { shell.inert = true; shell.setAttribute('aria-busy', 'true') }
  if (button) button.textContent = 'Aguarde...'
  return () => {
    if (shell) { shell.inert = previousInert; shell.removeAttribute('aria-busy') }
    if (button?.isConnected) button.textContent = label
  }
}
