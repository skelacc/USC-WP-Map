// Install-Knopf (PWA): Chrome/Edge melden mit `beforeinstallprompt`, dass die Seite installierbar ist.
// Das Ereignis kann vor dem ersten Rendern kommen, deshalb lauscht `initInstallPrompt` schon in main.tsx
// und merkt es sich hier. Der Eintrag „App installieren“ erscheint nur, solange ein gemerktes Ereignis da ist
// und die Seite nicht als installierte App läuft (`display-mode: standalone`).

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface InstallWindow {
  addEventListener: (type: string, fn: (e: Event) => void) => void
  matchMedia?: (q: string) => { matches: boolean }
  navigator?: object
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((fn) => fn())

export function isStandalone(win: InstallWindow): boolean {
  return Boolean(win.matchMedia?.('(display-mode: standalone)').matches || (win.navigator as { standalone?: boolean } | undefined)?.standalone)
}

/** Einmal beim Start aufrufen; merkt sich das Installieren-Angebot des Browsers. */
export function initInstallPrompt(win: InstallWindow) {
  win.addEventListener('beforeinstallprompt', (e) => {
    // Browser-eigene Mini-Leiste unterdrücken; wir zeigen den Eintrag in den Einstellungen
    e.preventDefault()
    deferred = isStandalone(win) ? null : (e as BeforeInstallPromptEvent)
    notify()
  })
  win.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

export function canInstall(): boolean {
  return deferred !== null
}

export function subscribeInstall(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Öffnet den Installieren-Dialog des Browsers. Ein Angebot lässt sich nur einmal nutzen. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const e = deferred
  if (!e) return 'unavailable'
  deferred = null
  notify()
  await e.prompt()
  const { outcome } = await e.userChoice
  return outcome
}

/** Nur für Tests: Zustand zurücksetzen. */
export function resetInstallPrompt() {
  deferred = null
  listeners.clear()
}
