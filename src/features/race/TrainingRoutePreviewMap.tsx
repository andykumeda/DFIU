import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

interface TrainingRoutePreviewMapProps {
  coordinates: [number, number][]
  className?: string
  /** Interactive detail map; default is static/preview. */
  interactive?: boolean
  courseCoordinates?: [number, number][]
  overlapSegments?: { trainingStartMi: number; trainingEndMi: number }[]
}

function mapStyleReady(map: mapboxgl.Map | null): map is mapboxgl.Map {
  return !!map && !!map.style && map.isStyleLoaded()
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
    const miles = 2 * 3958.8 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    cum.push(cum[i] + miles)
  }
  return cum
}

/** Slice training coords to miles within [startMi, endMi]. */
function sliceByMiles(
  line: [number, number][],
  startMi: number,
  endMi: number
): [number, number][] {
  if (line.length < 2) return line
  const cum = cumulativeMiles(line)
  const out: [number, number][] = []
  for (let i = 0; i < line.length; i++) {
    if (cum[i] >= startMi - 0.01 && cum[i] <= endMi + 0.01) {
      out.push(line[i])
    }
  }
  return out.length >= 2 ? out : line.slice(0, 2)
}

export function TrainingRoutePreviewMap({
  coordinates,
  className,
  interactive = false,
  courseCoordinates,
  overlapSegments,
}: TrainingRoutePreviewMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const [styleLoaded, setStyleLoaded] = useState(false)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    if (!import.meta.env.VITE_MAPBOX_TOKEN) {
      console.error('Mapbox token missing')
      return
    }
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

    let cancelled = false
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: coordinates[0] ?? [-107.8, 37.9],
      zoom: 11,
      attributionControl: false,
      interactive,
      dragPan: interactive,
      scrollZoom: interactive,
      boxZoom: interactive,
      dragRotate: interactive,
      keyboard: interactive,
      doubleClickZoom: interactive,
      touchZoomRotate: interactive,
    })
    mapRef.current = map

    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')
    if (interactive) {
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
    }

    const onStyleLoad = () => {
      if (!cancelled) setStyleLoaded(true)
    }
    map.on('style.load', onStyleLoad)

    return () => {
      cancelled = true
      map.off('style.load', onStyleLoad)
      map.remove()
      mapRef.current = null
      setStyleLoaded(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive])

  useEffect(() => {
    const map = mapRef.current
    if (!mapStyleReady(map) || !styleLoaded || coordinates.length === 0) return

    try {
      const trainingData: GeoJSON.Feature<GeoJSON.LineString> = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates },
      }

      const setOrAdd = (
        id: string,
        data: GeoJSON.Feature | GeoJSON.FeatureCollection,
        paint: mapboxgl.LinePaint,
        width: number
      ) => {
        const source = map.getSource(id) as mapboxgl.GeoJSONSource | undefined
        if (source) {
          source.setData(data)
        } else {
          map.addSource(id, { type: 'geojson', data })
          map.addLayer({
            id,
            type: 'line',
            source: id,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { ...paint, 'line-width': width },
          })
        }
      }

      if (courseCoordinates && courseCoordinates.length >= 2) {
        setOrAdd(
          'course',
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: courseCoordinates },
          },
          { 'line-color': '#737373', 'line-opacity': 0.55 },
          3
        )
      }

      setOrAdd('training', trainingData, { 'line-color': '#2563eb', 'line-opacity': 0.95 }, interactive ? 4 : 3)

      if (overlapSegments && overlapSegments.length > 0) {
        const features: GeoJSON.Feature<GeoJSON.LineString>[] = overlapSegments
          .map(seg => {
            const slice = sliceByMiles(coordinates, seg.trainingStartMi, seg.trainingEndMi)
            return {
              type: 'Feature' as const,
              properties: {},
              geometry: { type: 'LineString' as const, coordinates: slice },
            }
          })
          .filter(f => f.geometry.coordinates.length >= 2)

        setOrAdd(
          'overlap',
          { type: 'FeatureCollection', features },
          { 'line-color': '#ea580c', 'line-opacity': 1 },
          interactive ? 6 : 4
        )
      } else if (map.getLayer('overlap')) {
        map.removeLayer('overlap')
        if (map.getSource('overlap')) map.removeSource('overlap')
      }

      const bounds = new mapboxgl.LngLatBounds()
      coordinates.forEach(c => bounds.extend(c as [number, number]))
      if (courseCoordinates && interactive) {
        courseCoordinates.forEach(c => bounds.extend(c as [number, number]))
      }
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: interactive ? 40 : 16, maxZoom: interactive ? 14 : 13, duration: 0 })
      }
    } catch (e) {
      console.error('TrainingRoutePreviewMap draw error', e)
    }
  }, [coordinates, courseCoordinates, overlapSegments, styleLoaded, interactive])

  if (!import.meta.env.VITE_MAPBOX_TOKEN) {
    return (
      <div className={`bg-neutral-900 flex items-center justify-center text-neutral-500 text-xs ${className ?? ''}`}>
        Map unavailable
      </div>
    )
  }

  return <div ref={containerRef} className={className ?? 'w-full h-full'} />
}
