const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export function shouldRefreshServiceWorker(lastUpdate: number, now = Date.now()): boolean {
  return !Number.isFinite(lastUpdate) || lastUpdate <= 0 || now - lastUpdate >= WEEK_MS
}

export function refreshServiceWorkerWeekly(registration: ServiceWorkerRegistration, storageKey: string): void {
  if (!shouldRefreshServiceWorker(Number(localStorage.getItem(storageKey) ?? 0))) return
  void registration.update().then(() => {
    const worker = registration.waiting ?? registration.active
    worker?.postMessage({ type:'REFRESH_SHELL' })
    localStorage.setItem(storageKey, String(Date.now()))
  }).catch(() => undefined)
}
