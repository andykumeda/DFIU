import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

type LonLat = [number, number]

interface TrainingRouteCreatorMapProps {
  coordinates: LonLat[]
  courseCoordinates: LonLat[]
  showCourse: boolean
  onChange: (coordinates: LonLat[]) => void
}

function lineFeature(coordinates: LonLat[]): GeoJSON.Feature<GeoJSON.LineString> {
  return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }
}

export function TrainingRouteCreatorMap({ coordinates, courseCoordinates, showCourse, onChange }: TrainingRouteCreatorMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const coordsRef = useRef(coordinates)
  const courseRef = useRef(courseCoordinates)
  const showCourseRef = useRef(showCourse)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    coordsRef.current = coordinates
    courseRef.current = courseCoordinates
    showCourseRef.current = showCourse
    onChangeRef.current = onChange
    const map = mapRef.current
    const source = map?.getSource('manual-route') as mapboxgl.GeoJSONSource | undefined
    if (source) source.setData(lineFeature(coordinates))
  }, [coordinates, courseCoordinates, showCourse, onChange])

  useEffect(() => {
    const map = mapRef.current
    const source = map?.getSource('manual-course') as mapboxgl.GeoJSONSource | undefined
    if (source) source.setData(lineFeature(showCourse ? courseCoordinates : []))
  }, [courseCoordinates, showCourse])

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !import.meta.env.VITE_MAPBOX_TOKEN) return
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN
    const initial = coordsRef.current[0] ?? courseRef.current[0] ?? [-118.2, 34.3]
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: initial,
      zoom: coordsRef.current.length ? 12 : 10,
      attributionControl: false,
    })
    mapRef.current = map
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')

    const onLoad = () => {
      map.addSource('manual-course', { type: 'geojson', data: lineFeature(showCourseRef.current ? courseRef.current : []) })
      map.addLayer({ id: 'manual-course', type: 'line', source: 'manual-course', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#737373', 'line-opacity': 0.75, 'line-width': 3 } })
      map.addSource('manual-route', { type: 'geojson', data: lineFeature(coordsRef.current) })
      map.addLayer({ id: 'manual-route', type: 'line', source: 'manual-route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#2563eb', 'line-width': 4 } })
      if (courseRef.current.length >= 2 && !coordsRef.current.length) {
        const bounds = new mapboxgl.LngLatBounds()
        courseRef.current.forEach(point => bounds.extend(point))
        map.fitBounds(bounds, { padding: 48, maxZoom: 12, duration: 0 })
      }
    }
    const onClick = (event: mapboxgl.MapMouseEvent) => onChangeRef.current([...coordsRef.current, [event.lngLat.lng, event.lngLat.lat]])
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
  return <div ref={containerRef} className="h-80 md:h-[420px] rounded-lg overflow-hidden" />
}
