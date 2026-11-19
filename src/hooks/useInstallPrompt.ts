import { useSyncExternalStore } from 'react'
import { canInstall, promptInstall, subscribeInstall } from '@/lib/install'

/** true, solange der Browser das Installieren anbietet; `install` öffnet seinen Dialog. */
export function useInstallPrompt() {
  const available = useSyncExternalStore(subscribeInstall, canInstall, () => false)
  return { available, install: promptInstall }
}
