/** LocalStorage mit Fehlertoleranz (z. B. privater Modus, volle Quota). */
const PREFIX = 'studio-map:'

export function loadSetting<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function saveSetting<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    /* ignorieren – Einstellungen sind nicht kritisch */
  }
}
