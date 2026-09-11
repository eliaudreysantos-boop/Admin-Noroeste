const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export function refreshServiceWorkerWeekly(registration: ServiceWorkerRegistration, storageKey: string): void {
  const lastUpdate = Number(localStorage.getItem(storageKey) ?? 0)
  if (Date.now() - lastUpdate < WEEK_MS) return
  localStorage.setItem(storageKey, String(Date.now()))
  void registration.update().then(() => {
    const worker = registration.waiting ?? registration.active
    worker?.postMessage({ type:'REFRESH_SHELL' })
  }).catch(() => undefined)
}
