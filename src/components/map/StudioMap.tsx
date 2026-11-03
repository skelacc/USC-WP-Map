import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet.markercluster'
import { MapContainer, Marker, TileLayer, ZoomControl, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import './map.css'
import { categoryOf } from '@/lib/categories'
import { BERLIN_CENTER, BERLIN_ZOOM, type LatLng } from '@/lib/geo'
import type { Category, Studio } from '@/types/studio'
import { clusterIcon, selectedIcon, studioIcon, userIcon } from './markerIcons'

export interface FocusRequest {
  id: string
  nonce: number
}

export interface FitRequest {
  nonce: number
}

export interface FlyRequest {
  lat: number
  lng: number
  zoom: number
  nonce: number
}

interface Props {
  studios: Studio[]
  selected: Studio | null
  onSelect: (id: string | null) => void
  focus: FocusRequest | null
  fit: FitRequest | null
  userLocation: LatLng | null
  onCenterChange: (c: LatLng) => void
  flyTo?: FlyRequest | null
  /** Höhe (px), die unten von einem Bottom-Sheet verdeckt wird (mobil). */
  bottomInset?: number
  showZoomControl?: boolean
}

type CategoryMarker = L.Marker & { options: L.MarkerOptions & { category: Category } }

function ClusterLayer({ studios, onSelect, focus, fit, bottomInset = 0 }: Pick<Props, 'studios' | 'onSelect' | 'focus' | 'fit' | 'bottomInset'>) {
  const map = useMap()
  const groupRef = useRef<L.MarkerClusterGroup | null>(null)
  const markersRef = useRef(new Map<string, L.Marker>())
  const onSelectRef = useRef(onSelect)
  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  // Clustergruppe einmalig anlegen
  useEffect(() => {
    const group = L.markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: (zoom) => (zoom >= 15 ? 30 : 50),
      disableClusteringAtZoom: 18,
      iconCreateFunction: (cluster) => {
        const counts: Record<Category, number> = { both: 0, usc: 0, wellpass: 0 }
        for (const m of cluster.getAllChildMarkers() as CategoryMarker[]) counts[m.options.category]++
        return clusterIcon(counts, cluster.getChildCount())
      },
    })
    groupRef.current = group
    map.addLayer(group)
    return () => {
      map.removeLayer(group)
      groupRef.current = null
    }
  }, [map])

  // Marker bei geänderter Auswahl (Filter/Suche) neu setzen
  useEffect(() => {
    const group = groupRef.current
    if (!group) return
    const markers = new Map<string, L.Marker>()
    const list: L.Marker[] = []
    for (const s of studios) {
      if (!s.coordinates) continue
      const category = categoryOf(s)
      const m = L.marker([s.coordinates.latitude, s.coordinates.longitude], {
        icon: studioIcon(category, s.coordinates.precision === 'geocoded'),
        title: s.name,
        keyboard: true,
        category,
      } as L.MarkerOptions)
      m.on('click', () => onSelectRef.current(s.id))
      markers.set(s.id, m)
      list.push(m)
    }
    group.clearLayers()
    group.addLayers(list)
    markersRef.current = markers
  }, [studios])

  // Zu einem Studio springen (z. B. aus der Liste)
  useEffect(() => {
    if (!focus) return
    const m = markersRef.current.get(focus.id)
    const group = groupRef.current
    if (!m || !group) return
    group.zoomToShowLayer(m, () => {
      const zoom = Math.max(map.getZoom(), 16)
      // Marker oberhalb eines Bottom-Sheets zentrieren
      const target = map.unproject(map.project(m.getLatLng(), zoom).add([0, bottomInset / 2]), zoom)
      map.setView(target, zoom, { animate: true })
    })
    // bottomInset nur beim Fokussieren relevant
  }, [focus, map]) // eslint-disable-line react-hooks/exhaustive-deps

  // Kartenausschnitt an Suchergebnisse anpassen – nur bei neuer Anforderung
  const studiosRef = useRef(studios)
  useEffect(() => {
    studiosRef.current = studios
  }, [studios])
  useEffect(() => {
    if (!fit) return
    const pts = studiosRef.current.filter((s) => s.coordinates).map((s) => [s.coordinates!.latitude, s.coordinates!.longitude] as [number, number])
    if (!pts.length) return
    if (pts.length === 1) map.setView(pts[0], 16)
    else map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [30, 30], paddingBottomRight: [30, 30 + 60], maxZoom: 16 })
  }, [fit, map])

  return null
}

/** Hält das ausgewählte Studio sichtbar, wenn unten ein Bottom-Sheet liegt. */
function KeepVisible({ selected, bottomInset = 0 }: Pick<Props, 'selected' | 'bottomInset'>) {
  const map = useMap()
  useEffect(() => {
    if (!selected?.coordinates || !bottomInset) return
    const p = map.latLngToContainerPoint([selected.coordinates.latitude, selected.coordinates.longitude])
    const visibleHeight = map.getSize().y - bottomInset
    if (p.y > visibleHeight - 30 || p.y < 30) map.panBy([0, p.y - visibleHeight / 2], { animate: true })
  }, [selected, bottomInset, map])
  return null
}

function FlyTo({ flyTo }: Pick<Props, 'flyTo'>) {
  const map = useMap()
  useEffect(() => {
    if (flyTo) map.flyTo([flyTo.lat, flyTo.lng], flyTo.zoom, { duration: 0.8 })
  }, [flyTo, map])
  return null
}

function MapEvents({ onSelect, onCenterChange }: Pick<Props, 'onSelect' | 'onCenterChange'>) {
  const map = useMapEvents({
    click: () => onSelect(null),
    moveend: () => {
      const c = map.getCenter()
      onCenterChange({ lat: c.lat, lng: c.lng })
    },
  })
  return null
}

export function StudioMap({ studios, selected, onSelect, focus, fit, userLocation, onCenterChange, flyTo, bottomInset = 0, showZoomControl = true }: Props) {
  return (
    <MapContainer
      center={[BERLIN_CENTER.lat, BERLIN_CENTER.lng]}
      zoom={BERLIN_ZOOM}
      minZoom={9}
      maxZoom={19}
      zoomControl={false}
      preferCanvas={false}
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      {showZoomControl && <ZoomControl position="topright" />}
      <ClusterLayer studios={studios} onSelect={onSelect} focus={focus} fit={fit} bottomInset={bottomInset} />
      <KeepVisible selected={selected} bottomInset={bottomInset} />
      <FlyTo flyTo={flyTo} />
      <MapEvents onSelect={onSelect} onCenterChange={onCenterChange} />
      {selected?.coordinates && (
        <Marker
          position={[selected.coordinates.latitude, selected.coordinates.longitude]}
          icon={selectedIcon}
          interactive={false}
          zIndexOffset={1000}
        />
      )}
      {userLocation && <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon} interactive={false} />}
    </MapContainer>
  )
}
