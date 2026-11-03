import { useCallback, useRef, useState } from 'react'

/** Liefert einen Ref-Callback und die aktuelle Höhe des Elements (ResizeObserver). */
export function useElementHeight<T extends HTMLElement>() {
  const [height, setHeight] = useState(0)
  const observer = useRef<ResizeObserver | null>(null)
  const ref = useCallback((el: T | null) => {
    observer.current?.disconnect()
    if (!el) {
      setHeight(0)
      return
    }
    observer.current = new ResizeObserver(([entry]) => setHeight(Math.round(entry.contentRect.height)))
    observer.current.observe(el)
  }, [])
  return [ref, height] as const
}
