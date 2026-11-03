import { useEffect, useState } from 'react'
import { loadSetting, saveSetting } from '@/lib/storage'

/** useState, dessen Wert im LocalStorage gespeichert wird. */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => loadSetting(key, initial))
  useEffect(() => saveSetting(key, value), [key, value])
  return [value, setValue] as const
}
