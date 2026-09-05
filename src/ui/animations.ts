function numericParts(value: string): number[] | null {
  const parts = value.split('/').map(part => Number(part))
  return parts.every(Number.isFinite) ? parts : null
}

export function animateKpis(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-kpi-value]:not([data-kpi-animated])').forEach(element => {
    const finalValue = element.dataset.kpiValue ?? element.textContent ?? '0'
    const target = numericParts(finalValue)
    if (!target) return
    element.dataset.kpiAnimated = 'true'
    const initial = target.map(() => 0)
    const started = performance.now()
    const duration = 1000
    const frame = (now: number) => {
      const progress = Math.min((now - started) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      element.textContent = target.map((value, index) => String(Math.round(initial[index]! + (value - initial[index]!) * eased))).join('/')
      if (progress < 1) requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  })
}
