const pending = new Set<HTMLElement>()
const busy = new Set<HTMLElement>()
const scopes = '[data-editor-scope], .modal, #serviceTemplateForm, #manualServiceForm, #cleaningGroups, #cleaningConfig'
export function editorSaved(scope: HTMLElement | null): void {
  if (!scope) return
  for (const item of pending) if (item === scope || scope.contains(item)) pending.delete(item)
  scope.querySelector('[data-editor-error]')?.remove()
}
export function editorError(scope: HTMLElement | null, message = 'Não foi possível salvar. Seu preenchimento foi mantido.'): void {
  if (!scope) return
  scope = scope.querySelector<HTMLElement>('.modal') ?? scope
  let box = scope.querySelector<HTMLElement>('[data-editor-error]')
  if (!box) { box = document.createElement('p'); box.dataset.editorError = 'true'; box.className = 'notice warning'; box.setAttribute('role', 'alert'); scope.prepend(box) }
  box.textContent = message
}
export function editorBusy(scope: HTMLElement): () => void {
  busy.add(scope)
  const inputs = [...scope.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input,select,textarea')]
  const disabled = inputs.map(input => input.disabled)
  inputs.forEach(input => { input.disabled = true })
  const buttons = [...scope.querySelectorAll<HTMLButtonElement>('button')]
  const states = buttons.map(button => ({ disabled: button.disabled, label: button.textContent }))
  buttons.forEach(button => { button.disabled = true; if (/salvar/i.test(button.textContent ?? '')) button.textContent = 'Salvando…' })
  scope.setAttribute('aria-busy', 'true')
  return () => { inputs.forEach((input,i) => { input.disabled = disabled[i]! }); busy.delete(scope); scope.removeAttribute('aria-busy'); buttons.forEach((button, i) => { button.disabled = states[i]!.disabled; button.textContent = states[i]!.label }) }
}
export function installEditorFeedback(): void {
  const active = (set: Set<HTMLElement>) => [...set].filter(scope => { if (scope.isConnected) return true; set.delete(scope); return false })
  const allowLeave = (scope?:HTMLElement|null) => !active(busy).some(item=>!scope||scope.contains(item)) && (!active(pending).some(item=>!scope||scope.contains(item)) || confirm('Há alterações não salvas. Deseja descartá-las?'))
  const previousValues = new WeakMap<HTMLInputElement | HTMLSelectElement, string>()
  const periodSelector = 'input[type="month"], #eLocal, #tarefasPeriodMode'
  document.addEventListener('focusin', event => {
    const input = event.target as HTMLInputElement | HTMLSelectElement
    if (input.matches(periodSelector)) previousValues.set(input, input.value)
  })
  document.addEventListener('change', event => {
    const input = event.target as HTMLInputElement | HTMLSelectElement
    if (!input.matches(periodSelector) || input.closest('#oradoresRoot')) return
    if (!allowLeave()) { input.value = previousValues.get(input) ?? input.getAttribute('value') ?? ''; event.stopImmediatePropagation(); event.preventDefault() }
  }, true)
  const track = (event: Event) => {
    const target = event.target as HTMLElement
    if (target.closest('#oradoresRoot') && !target.closest('[data-editor-scope]') || target.matches('[data-person-search], input[type="search"]')) return
    const scope = target.closest<HTMLElement>(scopes)
    if (scope) pending.add(scope)
  }
  document.addEventListener('input', track); document.addEventListener('change', track)
  document.addEventListener('click', event => {
    const target = event.target as HTMLElement
    const button = target.closest('button, a')
    if (button?.closest('.month-navigation')) return // The cancellable change event handles this action once.
    const navigation = button?.matches('[data-operation-open], [data-workspace-tab], [data-cleaning-tab], [data-module-index], [data-module], [data-menu-card], #btnBack, #btnSair, [id*="Cancel"], [id^="cancel"], [id^="close"], #servicePrev, #serviceNext, [data-edit-service-template]') || target.classList.contains('modal-overlay') || Boolean(button && [...active(pending), ...active(busy)].some(scope => !scope.contains(button)))
    if (!navigation) return
    const closing=button?.matches('[id*="Cancel"], [id^="cancel"], [id^="close"]')?button.closest<HTMLElement>('.modal-overlay'):null
    if (!allowLeave(closing)) { event.preventDefault(); event.stopImmediatePropagation() }
  }, true)
  window.addEventListener('beforeunload', event => { if (active(pending).length || active(busy).length) { event.preventDefault(); event.returnValue = '' } })
}
