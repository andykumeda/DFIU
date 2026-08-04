import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

type LonLat = [number, number]
type AidStation = { coordinates: LonLat; name: string }

interface TrainingRouteCreatorMapProps {
  coordinates: LonLat[]
  courseCoordinates: LonLat[]
  aidStations: AidStation[]
  showCourse: boolean
  onChange: (coordinates: LonLat[]) => void
}

function lineFeature(coordinates: LonLat[]): GeoJSON.Feature<GeoJSON.LineString> {
  return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }
}

function aidStationFeatures(stations: AidStation[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: stations.map(station => ({ type: 'Feature', properties: { name: station.name }, geometry: { type: 'Point', coordinates: station.coordinates } })),
  }
}

export function TrainingRouteCreatorMap({ coordinates, courseCoordinates, aidStations, showCourse, onChange }: TrainingRouteCreatorMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const coordsRef = useRef(coordinates)
  const courseRef = useRef(courseCoordinates)
  const aidStationsRef = useRef(aidStations)
  const showCourseRef = useRef(showCourse)
  const onChangeRef = useRef(onChange)
  const routingRef = useRef(false)
  const [routing, setRouting] = useState(false)
  const [routingError, setRoutingError] = useState<string | null>(null)

  useEffect(() => {
    coordsRef.current = coordinates
    courseRef.current = courseCoordinates
    aidStationsRef.current = aidStations
    showCourseRef.current = showCourse
    onChangeRef.current = onChange
    const map = mapRef.current
    const routeSource = map?.getSource('manual-route') as mapboxgl.GeoJSONSource | undefined
    if (routeSource) routeSource.setData(lineFeature(coordinates))
  }, [coordinates, courseCoordinates, aidStations, showCourse, onChange])

  useEffect(() => {
    const map = mapRef.current
    const courseSource = map?.getSource('manual-course') as mapboxgl.GeoJSONSource | undefined
    const stationSource = map?.getSource('manual-aid-stations') as mapboxgl.GeoJSONSource | undefined
    if (courseSource) courseSource.setData(lineFeature(showCourse ? courseCoordinates : []))
    if (stationSource) stationSource.setData(aidStationFeatures(showCourse ? aidStations : []))
  }, [courseCoordinates, aidStations, showCourse])

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !import.meta.env.VITE_MAPBOX_TOKEN) return
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN
    const initial = coordsRef.current[0] ?? courseRef.current[0] ?? [-118.2, 34.3]
    const map = new mapboxgl.Map({ container: containerRef.current, style: 'mapbox://styles/mapbox/outdoors-v12', center: initial, zoom: coordsRef.current.length ? 12 : 10, attributionControl: false })
    mapRef.current = map
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')

    const onLoad = () => {
      map.addSource('manual-course', { type: 'geojson', data: lineFeature(showCourseRef.current ? courseRef.current : []) })
      map.addLayer({ id: 'manual-course', type: 'line', source: 'manual-course', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#737373', 'line-opacity': 0.75, 'line-width': 3 } })
      map.addSource('manual-aid-stations', { type: 'geojson', data: aidStationFeatures(showCourseRef.current ? aidStationsRef.current : []) })
      map.addLayer({ id: 'manual-aid-stations', type: 'circle', source: 'manual-aid-stations', paint: { 'circle-radius': 5, 'circle-color': '#22c55e', 'circle-stroke-color': '#052e16', 'circle-stroke-width': 2 } })
      map.addLayer({ id: 'manual-aid-station-labels', type: 'symbol', source: 'manual-aid-stations', layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-allow-overlap': false }, paint: { 'text-color': '#dcfce7', 'text-halo-color': '#171717', 'text-halo-width': 1 } })
      map.addSource('manual-route', { type: 'geojson', data: lineFeature(coordsRef.current) })
      map.addLayer({ id: 'manual-route', type: 'line', source: 'manual-route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#2563eb', 'line-width': 4 } })
      if (courseRef.current.length >= 2 && !coordsRef.current.length) {
        const bounds = new mapboxgl.LngLatBounds()
        courseRef.current.forEach(point => bounds.extend(point))
        map.fitBounds(bounds, { padding: 48, maxZoom: 12, duration: 0 })
      }
    }
    const onClick = async (event: mapboxgl.MapMouseEvent) => {
      if (routingRef.current) return
      const next: LonLat = [event.lngLat.lng, event.lngLat.lat]
      const last = coordsRef.current[coordsRef.current.length - 1]
      if (!last) {
        onChangeRef.current([next])
        return
      }
      routingRef.current = true
      setRouting(true)
      setRoutingError(null)
      try {
        const endpoint = `${last[0]},${last[1]};${next[0]},${next[1]}`
        const token = mapboxgl.accessToken || ''
        const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${endpoint}?geometries=geojson&overview=full&access_token=${encodeURIComponent(token)}`
        const response = await fetch(url)
        const data = await response.json()
        const snapped = data.routes?.[0]?.geometry?.coordinates
        if (!response.ok || !Array.isArray(snapped) || snapped.length < 2) throw new Error(data.message || 'No walkable trail connection found')
        onChangeRef.current([...coordsRef.current, ...snapped.slice(1) as LonLat[]])
      } catch (error) {
        setRoutingError(error instanceof Error ? error.message : 'Unable to snap this section to the trail network')
      } finally {
        routingRef.current = false
        setRouting(false)
      }
    }
    map.on('load', onLoad)
    map.on('click', onClick)
    return () => {
      map.off('load', onLoad)
      map.off('click', onClick)
      if (mapRef.current === map) mapRef.current = null
      map.remove()
    }
  }, [])

  if (!import.meta.env.VITE_MAPBOX_TOKEN) return <div className="h-80 rounded-lg bg-neutral-950 grid place-items-center text-sm text-neutral-500">Map editing is unavailable.</div>
  return <div className="relative"><div ref={containerRef} className="h-80 md:h-[420px] rounded-lg overflow-hidden" />{routing && <p className="absolute left-3 bottom-3 rounded bg-neutral-950/90 px-2 py-1 text-xs text-white">Snapping to trail…</p>}{routingError && <p className="mt-2 text-xs text-red-300">{routingError}</p>}</div>
}
