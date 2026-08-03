import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

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

function mapStyleReady(map: mapboxgl.Map | null): map is mapboxgl.Map {
  return !!map && !!map.style && map.isStyleLoaded()
}

export interface TrainingRouteMapboxProps {
  coordinates: [number, number][]
  courseCoordinates?: [number, number][]
  overlapSegments?: { trainingStartMi: number; trainingEndMi: number }[]
  className?: string
  onFail?: () => void
}

/** Interactive Mapbox detail map — loaded only when Training detail is opened. */
export function TrainingRouteMapbox({
  coordinates,
  courseCoordinates,
  overlapSegments,
  className,
  onFail,
}: TrainingRouteMapboxProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const [styleLoaded, setStyleLoaded] = useState(false)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    if (!import.meta.env.VITE_MAPBOX_TOKEN) {
      console.error('Mapbox token missing')
      onFail?.()
      return
    }
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

    let cancelled = false
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: coordinates[0] ?? [-118.2, 34.3],
      zoom: 11,
      attributionControl: false,
    })
    mapRef.current = map

    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')

    const onStyleLoad = () => {
      if (cancelled) return
      map.resize()
      setStyleLoaded(true)
    }
    map.on('style.load', onStyleLoad)
    map.on('error', e => {
      console.warn('TrainingRouteMapbox error', e)
    })

    const ro = new ResizeObserver(() => {
      if (mapStyleReady(mapRef.current)) mapRef.current.resize()
    })
    ro.observe(containerRef.current)

    return () => {
      cancelled = true
      ro.disconnect()
      map.off('style.load', onStyleLoad)
      map.remove()
      mapRef.current = null
      setStyleLoaded(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!mapStyleReady(map) || !styleLoaded || coordinates.length < 2) return

    try {
      const training = downsample(coordinates, 4000)
      const course =
        courseCoordinates && courseCoordinates.length >= 2
          ? downsample(courseCoordinates, 5000)
          : null

      const setOrAddLine = (
        id: string,
        data: GeoJSON.Feature | GeoJSON.FeatureCollection,
        paint: mapboxgl.LinePaint,
        width: number
      ) => {
        const source = map.getSource(id) as mapboxgl.GeoJSONSource | undefined
        if (source) {
          source.setData(data)
          return
        }
        map.addSource(id, { type: 'geojson', data })
        map.addLayer({
          id,
          type: 'line',
          source: id,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { ...paint, 'line-width': width },
        })
      }

      if (course) {
        setOrAddLine(
          'course',
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: course },
          },
          { 'line-color': '#737373', 'line-opacity': 0.55 },
          3
        )
      }

      setOrAddLine(
        'training',
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: training },
        },
        { 'line-color': '#2563eb', 'line-opacity': 0.95 },
        4
      )

      if (overlapSegments && overlapSegments.length > 0) {
        const features: GeoJSON.Feature<GeoJSON.LineString>[] = overlapSegments
          .map(seg => {
            const slice = downsample(
              sliceByMiles(coordinates, seg.trainingStartMi, seg.trainingEndMi),
              2000
            )
            return {
              type: 'Feature' as const,
              properties: {},
              geometry: { type: 'LineString' as const, coordinates: slice },
            }
          })
          .filter(f => f.geometry.coordinates.length >= 2)

        if (features.length > 0) {
          setOrAddLine(
            'overlap',
            { type: 'FeatureCollection', features },
            { 'line-color': '#ea580c', 'line-opacity': 1 },
            6
          )
        }
      }

      const bounds = new mapboxgl.LngLatBounds()
      training.forEach(c => bounds.extend(c as [number, number]))
      if (!bounds.isEmpty()) {
        map.resize()
        map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 0 })
      }
    } catch (err) {
      console.warn('TrainingRouteMapbox draw failed', err)
      onFail?.()
    }
  }, [coordinates, courseCoordinates, overlapSegments, styleLoaded, onFail])

  return <div ref={containerRef} className={className ?? 'w-full h-full'} />
}
