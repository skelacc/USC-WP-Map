import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  onClose: () => void
  className?: string
  children: ReactNode
}

/**
 * Bottom-Sheet, das sich durch Wischen nach unten schließen lässt – wie in
 * nativen Apps. Gezogen wird am oberen Rand oder überall, solange der Inhalt
 * ganz nach oben gescrollt ist.
 */
export function SwipeDownSheet({ onClose, className, children }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let y0 = 0
    let x0 = 0
    let t0 = 0
    let dy = 0
    let active = false
    let decided = false

    const scrollerOf = (t: EventTarget | null): HTMLElement | null => {
      let n = t as HTMLElement | null
      while (n && n !== el) {
        if (n.scrollHeight > n.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(n).overflowY)) return n
        n = n.parentElement
      }
      return null
    }

    const start = (e: TouchEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, select, [role="tablist"]')) return
      const sc = scrollerOf(e.target)
      active = !sc || sc.scrollTop <= 0
      decided = false
      y0 = e.touches[0].clientY
      x0 = e.touches[0].clientX
      t0 = Date.now()
      dy = 0
    }
    const move = (e: TouchEvent) => {
      if (!active) return
      const ddy = e.touches[0].clientY - y0
      const ddx = e.touches[0].clientX - x0
      if (!decided) {
        if (Math.abs(ddy) < 6 && Math.abs(ddx) < 6) return
        decided = true
        // nur senkrecht nach unten ziehen
        if (ddy <= 0 || Math.abs(ddx) > Math.abs(ddy)) {
          active = false
          return
        }
      }
      dy = Math.max(0, ddy)
      e.preventDefault()
      el.style.transition = 'none'
      el.style.transform = `translateY(${dy}px)`
    }
    const end = () => {
      if (!active || !decided) return
      active = false
      const fast = dy / Math.max(1, Date.now() - t0) > 0.6
      el.style.transition = 'transform 180ms ease-out'
      if (dy > 110 || (fast && dy > 40)) {
        el.style.transform = 'translateY(100%)'
        window.setTimeout(() => closeRef.current(), 170)
      } else {
        el.style.transform = ''
      }
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
    }
  }, [])

  return (
    <div ref={ref} className={className}>
      <div className="pointer-events-none absolute top-1.5 left-1/2 z-10 h-1 w-10 -translate-x-1/2 rounded-full bg-foreground/25" aria-hidden />
      {children}
    </div>
  )
}
