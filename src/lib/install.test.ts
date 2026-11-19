import { beforeEach, describe, expect, it, vi } from 'vitest'
import { canInstall, initInstallPrompt, isStandalone, promptInstall, resetInstallPrompt, subscribeInstall } from './install'

function fakeWindow(standalone = false) {
  const target = new EventTarget()
  return {
    addEventListener: (t: string, fn: (e: Event) => void) => target.addEventListener(t, fn),
    dispatch: (e: Event) => target.dispatchEvent(e),
    matchMedia: () => ({ matches: standalone }),
  }
}

function installEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
  e.prompt = vi.fn(async () => {})
  e.userChoice = Promise.resolve({ outcome })
  return e
}

describe('Install-Knopf', () => {
  beforeEach(() => resetInstallPrompt())

  it('erscheint erst nach beforeinstallprompt', () => {
    const win = fakeWindow()
    initInstallPrompt(win)
    expect(canInstall()).toBe(false)
    const changed = vi.fn()
    subscribeInstall(changed)
    const e = installEvent()
    win.dispatch(e)
    expect(canInstall()).toBe(true)
    expect(e.defaultPrevented).toBe(true)
    expect(changed).toHaveBeenCalled()
  })

  it('Tipp öffnet den Browser-Dialog, danach ist der Eintrag weg', async () => {
    const win = fakeWindow()
    initInstallPrompt(win)
    const e = installEvent('dismissed')
    win.dispatch(e)
    await expect(promptInstall()).resolves.toBe('dismissed')
    expect(e.prompt).toHaveBeenCalledOnce()
    expect(canInstall()).toBe(false)
    await expect(promptInstall()).resolves.toBe('unavailable')
  })

  it('verschwindet nach appinstalled', () => {
    const win = fakeWindow()
    initInstallPrompt(win)
    win.dispatch(installEvent())
    win.dispatch(new Event('appinstalled'))
    expect(canInstall()).toBe(false)
  })

  it('erscheint nicht, wenn die Seite als App läuft', () => {
    const win = fakeWindow(true)
    expect(isStandalone(win)).toBe(true)
    initInstallPrompt(win)
    win.dispatch(installEvent())
    expect(canInstall()).toBe(false)
  })
})
