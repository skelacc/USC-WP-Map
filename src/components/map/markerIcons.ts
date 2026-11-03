import L from 'leaflet'
import { CATEGORY_META } from '@/lib/categories'
import type { Category } from '@/types/studio'

/**
 * Marker: Farbe UND Form unterscheiden die Kategorien (auch bei Farbsehschwäche):
 *  – Nur USC: blauer Kreis
 *  – Nur Wellpass: oranges Quadrat (auf der Spitze)
 *  – Beide: größerer grüner Kreis mit weißem Innenring
 * Geokodierte (ungefähre) Positionen werden gestrichelt umrandet.
 */
const cache = new Map<string, L.DivIcon>()

export function studioIcon(category: Category, approximate = false): L.DivIcon {
  const key = `${category}-${approximate}`
  let icon = cache.get(key)
  if (!icon) {
    const size = category === 'both' ? 20 : 16
    icon = L.divIcon({
      className: '',
      html: `<span class="studio-marker studio-marker--${category}${approximate ? ' studio-marker--approx' : ''}" style="--c:${CATEGORY_META[category].color}"></span>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    })
    cache.set(key, icon)
  }
  return icon
}

export const selectedIcon = L.divIcon({
  className: '',
  html: '<span class="studio-marker-selected"></span>',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
})

export const userIcon = L.divIcon({
  className: '',
  html: '<span class="user-marker"></span>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

/** Cluster-Symbol: Anzahl + Ring mit den Anteilen der drei Kategorien. */
export function clusterIcon(counts: Record<Category, number>, total: number): L.DivIcon {
  const order: Category[] = ['both', 'usc', 'wellpass']
  let acc = 0
  const stops = order
    .filter((c) => counts[c] > 0)
    .map((c) => {
      const from = (acc / total) * 360
      acc += counts[c]
      const to = (acc / total) * 360
      return `${CATEGORY_META[c].color} ${from}deg ${to}deg`
    })
    .join(', ')
  const size = total < 10 ? 34 : total < 100 ? 40 : 48
  const label = `${total} Studios: ${counts.both} beide, ${counts.usc} nur USC, ${counts.wellpass} nur Wellpass`
  return L.divIcon({
    className: '',
    html: `<div class="studio-cluster" style="width:${size}px;height:${size}px;background:conic-gradient(${stops})" title="${label}" aria-label="${label}"><span>${total}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}
