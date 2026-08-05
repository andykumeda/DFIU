import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

/** Keep in sync with TrainingRouteDetailMap legend / SVG strokes. */
const COURSE_COLOR = '#9333ea'
const TRAINING_COLOR = '#2563eb'
const OVERLAP_COLOR = '#ea580c'

function downsample(line: [number, number][], maxPoints: number): [number, number][] {
  if (line.length <= maxPoints) return line
  const step = Math.ceil(line.length / maxPoints)
  const out: [number, number][] = []
  for (let i = 0; i < line.length; i += step) out.push(line[i])
  const last = line[line.length - 1]
  if (out[out.length - 1] !== last) out.push(last)
  return out
}

function cumulativeMiles(line: [number, number][]): number[] {
  const cum = [0]
  for (let i = 0; i < line.length - 1; i++) {
    const [lon1, lat1] = line[i]
    const [lon2, lat2] = line[i + 1]
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLon = ((lon2 - lon1) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
    cum.push(cum[i] + 2 * 3958.8 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
  }
  return cum
}

function sliceByMiles(line: [number, number][], startMi: number, endMi: number): [number, number][] {
  if (line.length < 2) return line
  const cum = cumulativeMiles(line)
  const out: [number, number][] = []
  for (let i = 0; i < line.length; i++) {
    if (cum[i] >= startMi - 0.01 && cum[i] <= endMi + 0.01) out.push(line[i])
  }
  return out.length >= 2 ? out : line.slice(0, Math.min(2, line.length))
}

export interface TrainingRouteMapboxProps {
  coordinates: [number, number][]
  courseCoordinates?: [number, number][]
  overlapSegments?: { trainingStartMi: number; trainingEndMi: number }[]
  className?: string
  onFail?: () => void
  interactive?: boolean
  showControls?: boolean
}

type MapData = Pick<
  TrainingRouteMapboxProps,
  'coordinates' | 'courseCoordinates' | 'overlapSegments'
>

const SOURCE_IDS = {
  course: 'training-detail-course',
  training: 'training-detail-route',
  overlap: 'training-detail-overlap',
} as const

function lineFeature(coordinates: [number, number][]): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates },
  }
}

function setOrAddLine(
  map: mapboxgl.Map,
  id: string,
  data: GeoJSON.Feature | GeoJSON.FeatureCollection,
  paint: mapboxgl.LinePaint,
  width: number
) {
  const source = map.getSource(id) as mapboxgl.GeoJSONSource | undefined
  if (source) {
    source.setData(data)
  } else {
    map.addSource(id, { type: 'geojson', data })
  }
  if (!map.getLayer(id)) {
    map.addLayer({
      id,
      type: 'line',
      source: id,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { ...paint, 'line-width': width },
    })
  }
}

function drawRouteData(map: mapboxgl.Map, data: MapData) {
  if (data.coordinates.length < 2) return

  const training = downsample(data.coordinates, 4000)
  const course =
    data.courseCoordinates && data.courseCoordinates.length >= 2
      ? downsample(data.courseCoordinates, 5000)
      : null

  if (course) {
    setOrAddLine(
      map,
      SOURCE_IDS.course,
      lineFeature(course),
      { 'line-color': COURSE_COLOR, 'line-opacity': 0.85 },
      3
    )
  } else {
    const source = map.getSource(SOURCE_IDS.course) as mapboxgl.GeoJSONSource | undefined
    if (source) source.setData(lineFeature([]))
  }

  setOrAddLine(
    map,
    SOURCE_IDS.training,
    lineFeature(training),
    { 'line-color': TRAINING_COLOR, 'line-opacity': 0.95 },
    4
  )

  if (data.overlapSegments && data.overlapSegments.length > 0) {
    const features: GeoJSON.Feature<GeoJSON.LineString>[] = data.overlapSegments
      .map(segment =>
        lineFeature(
          downsample(
            sliceByMiles(data.coordinates, segment.trainingStartMi, segment.trainingEndMi),
            2000
          )
        )
      )
      .filter(feature => feature.geometry.coordinates.length >= 2)

    if (features.length > 0) {
      setOrAddLine(
        map,
        SOURCE_IDS.overlap,
        { type: 'FeatureCollection', features },
        { 'line-color': OVERLAP_COLOR, 'line-opacity': 1 },
        6
      )
    }
  }

  const bounds = new mapboxgl.LngLatBounds()
  training.forEach(coordinate => bounds.extend(coordinate))
  if (!bounds.isEmpty()) {
    map.resize()
    map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 0 })
  }
}

/** Interactive Mapbox detail map — loaded only when Training detail is opened. */
export function TrainingRouteMapbox({
  coordinates,
  courseCoordinates,
  overlapSegments,
  className,
  onFail,
  interactive = true,
  showControls = true,
}: TrainingRouteMapboxProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const styleReadyRef = useRef(false)
  const dataRef = useRef<MapData>({ coordinates, courseCoordinates, overlapSegments })
  const onFailRef = useRef(onFail)

  useEffect(() => {
    dataRef.current = { coordinates, courseCoordinates, overlapSegments }
    onFailRef.current = onFail
  }, [coordinates, courseCoordinates, overlapSegments, onFail])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    if (!import.meta.env.VITE_MAPBOX_TOKEN) {
      console.error('Mapbox token missing')
      onFailRef.current?.()
      return
    }
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

    let disposed = false
    let map: mapboxgl.Map
    try {
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/outdoors-v12',
        center: dataRef.current.coordinates[0] ?? [-118.2, 34.3],
        zoom: 11,
        attributionControl: false,
        interactive,
      })
    } catch (error) {
      console.warn('TrainingRouteMapbox initialization failed', error)
      onFailRef.current?.()
      return
    }
    mapRef.current = map
    let initialDrawFrame: number | null = null

    if (showControls) {
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
    }

    const handleStyleLoad = () => {
      styleReadyRef.current = true
      if (initialDrawFrame !== null) cancelAnimationFrame(initialDrawFrame)
      initialDrawFrame = requestAnimationFrame(() => {
        if (disposed || mapRef.current !== map) return
        initialDrawFrame = null
        try {
          drawRouteData(map, dataRef.current)
        } catch (error) {
          console.warn('TrainingRouteMapbox initial draw failed', error)
          onFailRef.current?.()
        }
      })
    }
    const handleError = (event: mapboxgl.ErrorEvent) =>
      console.warn('TrainingRouteMapbox error', event.error)
    map.on('style.load', handleStyleLoad)
    map.on('error', handleError)

    const ro = new ResizeObserver(() => {
      if (!disposed && mapRef.current === map && styleReadyRef.current) map.resize()
    })
    ro.observe(containerRef.current)

    return () => {
      disposed = true
      styleReadyRef.current = false
      if (initialDrawFrame !== null) cancelAnimationFrame(initialDrawFrame)
      ro.disconnect()
      map.off('style.load', handleStyleLoad)
      map.off('error', handleError)
      if (mapRef.current === map) mapRef.current = null
      try {
        map.remove()
      } catch (error) {
        console.warn('TrainingRouteMapbox cleanup failed', error)
      }
    }
  }, [interactive, showControls])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !styleReadyRef.current || coordinates.length < 2) return

    const frame = requestAnimationFrame(() => {
      if (mapRef.current !== map) return
      try {
        drawRouteData(map, dataRef.current)
      } catch (error) {
        console.warn('TrainingRouteMapbox update draw failed', error)
        onFailRef.current?.()
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [coordinates, courseCoordinates, overlapSegments])

  return <div ref={containerRef} className={className ?? 'w-full h-full'} />
}
