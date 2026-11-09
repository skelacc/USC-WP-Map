import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet.markercluster'
import { MapContainer, Marker, TileLayer, ZoomControl, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import './map.css'
import { categoryOf } from '@/lib/categories'
import { BERLIN_CENTER, BERLIN_ZOOM, type LatLng } from '@/lib/geo'
import type { Bounds, Category, Studio } from '@/types/studio'
import { clusterIcon, selectedIcon, studioIcon, userIcon } from './markerIcons'

export interface FocusRequest {
  id: string
  nonce: number
}

export interface FitRequest {
  nonce: number
  /** auf alle angezeigten Studios statt auf fitStudios zoomen */
  all?: boolean
}

export interface MapView {
  center: LatLng
  bounds: Bounds
  zoom: number
}

export interface FlyRequest {
  lat: number
  lng: number
  zoom: number
  nonce: number
}

interface Props {
  studios: Studio[]
  /** Studios, auf die „fit“ zoomt (z. B. Suchtreffer im gewählten Bereich); Standard: studios */
  fitStudios?: Studio[]
  active: Studio | null
  onMarkerClick: (id: string) => void
  onMapClick: () => void
  focus: FocusRequest | null
  fit: FitRequest | null
  userLocation: LatLng | null
  onViewChange: (v: MapView) => void
  flyTo?: FlyRequest | null
  /** Höhe (px), die unten von Karte/Sheet verdeckt wird. */
  bottomInset?: number
  showZoomControl?: boolean
}

type CategoryMarker = L.Marker & { options: L.MarkerOptions & { category: Category } }

const canHover = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches

/**
 * Verhalten wie bei Urban Sports Club:
 *  – Cluster fassen Pins im ~60-px-Raster zusammen; ab Zoom 15/17 nur noch sehr nahe Pins.
 *  – Tipp auf Cluster: auf dessen Ausdehnung zoomen. Liegen alle Pins an derselben
 *    Adresse (mehrere Angebote in einem Haus), werden sie aufgefächert.
 *  – Tipp auf Pin: Pin wird aktiv, unten erscheint die Vorschaukarte.
 *  – Tipp auf die freie Karte: Auswahl aufheben.
 */
function ClusterLayer({ studios, fitStudios, onMarkerClick, focus, fit, bottomInset = 0 }: Pick<Props, 'studios' | 'fitStudios' | 'onMarkerClick' | 'focus' | 'fit' | 'bottomInset'>) {
  const map = useMap()
  const groupRef = useRef<L.MarkerClusterGroup | null>(null)
  const markersRef = useRef(new Map<string, L.Marker>())
  const onClickRef = useRef(onMarkerClick)
  const insetRef = useRef(bottomInset)
  useEffect(() => {
    onClickRef.current = onMarkerClick
    insetRef.current = bottomInset
  }, [onMarkerClick, bottomInset])

  useEffect(() => {
    const group = L.markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      spiderfyOnMaxZoom: true,
      spiderfyDistanceMultiplier: 1.6,
      maxClusterRadius: (zoom) => (zoom >= 17 ? 12 : zoom >= 15 ? 35 : 60),
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

  // Marker nur für Änderungen anpassen: Bei ~19.000 Studios wäre ein kompletter
  // Neuaufbau (z. B. beim Nachladen einer Kachel oder bei jedem Tastendruck) spürbar langsam.
  const signatureRef = useRef(new Map<string, string>())
  useEffect(() => {
    const group = groupRef.current
    if (!group) return
    const prev = markersRef.current
    const prevSig = signatureRef.current
    const markers = new Map<string, L.Marker>()
    const sigs = new Map<string, string>()
    const toAdd: L.Marker[] = []
    for (const s of studios) {
      if (!s.coordinates) continue
      const category = categoryOf(s)
      const approx = s.coordinates.precision === 'geocoded'
      const sig = `${category}|${approx}|${s.coordinates.latitude}|${s.coordinates.longitude}|${s.name}`
      const old = prev.get(s.id)
      if (old && prevSig.get(s.id) === sig) {
        markers.set(s.id, old)
        sigs.set(s.id, sig)
        continue
      }
      const m = L.marker([s.coordinates.latitude, s.coordinates.longitude], {
        icon: studioIcon(category, approx),
        keyboard: true,
        category,
      } as L.MarkerOptions)
      if (canHover) m.bindTooltip(s.name, { direction: 'top', offset: [0, -10], opacity: 0.95 })
      m.on('click', (e) => {
        L.DomEvent.stopPropagation(e)
        onClickRef.current(s.id)
      })
      markers.set(s.id, m)
      sigs.set(s.id, sig)
      toAdd.push(m)
    }
    const toRemove: L.Marker[] = []
    for (const [id, m] of prev) if (markers.get(id) !== m) toRemove.push(m)
    if (toRemove.length > prev.size / 2) {
      group.clearLayers()
      group.addLayers([...markers.values()])
    } else {
      if (toRemove.length) group.removeLayers(toRemove)
      if (toAdd.length) group.addLayers(toAdd)
    }
    markersRef.current = markers
    signatureRef.current = sigs
  }, [studios])

  // Zu einem Studio springen (aus Liste, Suche, Vorschaukarte)
  useEffect(() => {
    if (!focus) return
    const m = markersRef.current.get(focus.id)
    const group = groupRef.current
    if (!m || !group) return
    group.zoomToShowLayer(m, () => {
      const zoom = Math.max(map.getZoom(), 16)
      const target = map.unproject(map.project(m.getLatLng(), zoom).add([0, insetRef.current / 2]), zoom)
      map.setView(target, zoom, { animate: true })
    })
  }, [focus, map])

  const studiosRef = useRef(fitStudios ?? studios)
  useEffect(() => {
    studiosRef.current = fitStudios ?? studios
  }, [studios, fitStudios])
  useEffect(() => {
    if (!fit) return
    const pts = studiosRef.current.filter((s) => s.coordinates).map((s) => [s.coordinates!.latitude, s.coordinates!.longitude] as [number, number])
    if (!pts.length) return
    if (pts.length === 1) map.setView(pts[0], 16)
    else map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [30, 30], paddingBottomRight: [30, 90], maxZoom: 16 })
  }, [fit, map])

  return null
}

/** Hält den aktiven Pin sichtbar, wenn unten etwas die Karte verdeckt. */
function KeepVisible({ active, bottomInset = 0 }: Pick<Props, 'active' | 'bottomInset'>) {
  const map = useMap()
  useEffect(() => {
    if (!active?.coordinates) return
    const p = map.latLngToContainerPoint([active.coordinates.latitude, active.coordinates.longitude])
    const size = map.getSize()
    const visibleHeight = size.y - bottomInset
    if (p.y > visibleHeight - 40 || p.y < 40 || p.x < 20 || p.x > size.x - 20) {
      map.panBy([p.x - size.x / 2, p.y - visibleHeight / 2], { animate: true })
    }
  }, [active, bottomInset, map])
  return null
}

function FlyTo({ flyTo }: Pick<Props, 'flyTo'>) {
  const map = useMap()
  useEffect(() => {
    if (flyTo) map.flyTo([flyTo.lat, flyTo.lng], flyTo.zoom, { duration: 0.8 })
  }, [flyTo, map])
  return null
}

function MapEvents({ onMapClick, onViewChange }: Pick<Props, 'onMapClick' | 'onViewChange'>) {
  const report = (m: L.Map) => {
    const c = m.getCenter()
    const b = m.getBounds()
    onViewChange({ center: { lat: c.lat, lng: c.lng }, bounds: { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() }, zoom: m.getZoom() })
  }
  const map = useMapEvents({
    click: () => onMapClick(),
    moveend: () => report(map),
  })
  // Anfangsausschnitt melden
  useEffect(() => {
    map.whenReady(() => report(map))
  }, [map]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

export function StudioMap(props: Props) {
  const { studios, fitStudios, active, onMarkerClick, onMapClick, focus, fit, userLocation, onViewChange, flyTo, bottomInset = 0, showZoomControl = true } = props
  return (
    <MapContainer
      center={[BERLIN_CENTER.lat, BERLIN_CENTER.lng]}
      zoom={BERLIN_ZOOM}
      minZoom={5}
      maxZoom={19}
      zoomControl={false}
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      {showZoomControl && <ZoomControl position="topright" />}
      <ClusterLayer studios={studios} fitStudios={fitStudios} onMarkerClick={onMarkerClick} focus={focus} fit={fit} bottomInset={bottomInset} />
      <KeepVisible active={active} bottomInset={bottomInset} />
      <FlyTo flyTo={flyTo} />
      <MapEvents onMapClick={onMapClick} onViewChange={onViewChange} />
      {active?.coordinates && (
        <Marker position={[active.coordinates.latitude, active.coordinates.longitude]} icon={selectedIcon} interactive={false} zIndexOffset={1000} />
      )}
      {userLocation && <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon} interactive={false} />}
    </MapContainer>
  )
}
