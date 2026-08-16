import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { computeTrainingMapOverlap } from '@/lib/training-overlap'

/** Card previews stay SVG-only (no Mapbox in the main bundle). */

/** Race course reference — violet stands out on outdoors basemap vs blue training / orange overlap. */
const COURSE_COLOR = '#9333ea'
const TRAINING_COLOR = '#2563eb'
const OVERLAP_COLOR = '#ea580c'
const HIGHLIGHT_HALO = '#fef08a'
const HIGHLIGHT_COLOR = '#facc15'

function TrainingMapLegend() {
  return (
    <div className="absolute bottom-3 left-3 z-10 rounded border border-neutral-700/80 bg-neutral-950/85 px-1.5 py-1 text-[9px] leading-tight text-neutral-200 shadow-md backdrop-blur-sm pointer-events-none sm:px-2 sm:py-1.5 sm:text-[10px]">
      <div className="space-y-0.5">
        <div className="flex items-center gap-1 whitespace-nowrap">
          <span className="inline-block h-0.5 w-2.5 rounded sm:w-3" style={{ backgroundColor: COURSE_COLOR }} />
          <span>Race course</span>
        </div>
        <div className="flex items-center gap-1 whitespace-nowrap">
          <span className="inline-block h-0.5 w-2.5 rounded sm:w-3" style={{ backgroundColor: TRAINING_COLOR }} />
          <span>Training</span>
        </div>
        <div className="flex items-center gap-1 whitespace-nowrap">
          <span className="inline-block h-0.5 w-2.5 rounded sm:w-3" style={{ backgroundColor: OVERLAP_COLOR }} />
          <span>Overlap</span>
        </div>
        <div className="flex items-center gap-1 whitespace-nowrap">
          <span className="inline-block h-0.5 w-2.5 rounded sm:w-3" style={{ backgroundColor: HIGHLIGHT_COLOR }} />
          <span>Selected section</span>
        </div>
      </div>
    </div>
  )
}

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

function sliceByMiles(
  line: [number, number][],
  startMi: number,
  endMi: number,
  fallbackToStart = true
): [number, number][] {
  if (line.length < 2) return line
  const lo = Math.min(startMi, endMi)
  const hi = Math.max(startMi, endMi)
  const cum = cumulativeMiles(line)
  const out: [number, number][] = []
  for (let i = 0; i < line.length; i++) {
    if (cum[i] >= lo - 0.01 && cum[i] <= hi + 0.01) out.push(line[i])
  }
  if (out.length >= 2) return out
  return fallbackToStart ? line.slice(0, Math.min(2, line.length)) : []
}

function mercatorY(lat: number): number {
  const clamped = Math.max(-85.051128, Math.min(85.051128, lat))
  return Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360))
}

function latFromMercatorY(y: number): number {
  return ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI
}

function project(
  coords: [number, number][],
  minLon: number,
  maxLon: number,
  minLat: number,
  maxLat: number,
  vbW: number,
  vbH: number,
  pad: number
): string {
  const w = Math.max(maxLon - minLon, 1e-6)
  const h = Math.max(maxLat - minLat, 1e-6)
  return coords
    .map(([lon, lat]) => {
      const x = ((lon - minLon) / w) * (1 - 2 * pad) * vbW + pad * vbW
      const y = (1 - (lat - minLat) / h) * (1 - 2 * pad) * vbH + pad * vbH
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

function projectMercator(
  coords: [number, number][],
  box: { minLon: number; minLat: number; maxLon: number; maxLat: number },
  vbW: number,
  vbH: number
): string {
  const minX = box.minLon
  const spanX = Math.max(box.maxLon - box.minLon, 1e-6)
  const maxY = mercatorY(box.maxLat)
  const spanY = Math.max(maxY - mercatorY(box.minLat), 1e-8)
  return coords
    .map(([lon, lat]) => {
      const x = ((lon - minX) / spanX) * vbW
      const y = ((maxY - mercatorY(lat)) / spanY) * vbH
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

/** Expand a lon/lat box so its Web Mercator aspect matches the thumbnail. */
export function fitLonLatBox(
  minLon: number,
  minLat: number,
  maxLon: number,
  maxLat: number,
  aspectWOverH: number
): { minLon: number; minLat: number; maxLon: number; maxLat: number } {
  const midLon = (minLon + maxLon) / 2
  const midY = (mercatorY(minLat) + mercatorY(maxLat)) / 2
  let lonSpan = Math.max(maxLon - minLon, 1e-5)
  let ySpan = Math.max(mercatorY(maxLat) - mercatorY(minLat), 1e-8)
  const xSpan = lonSpan * (Math.PI / 180)
  if (xSpan / ySpan < aspectWOverH) lonSpan = (aspectWOverH * ySpan * 180) / Math.PI
  else ySpan = xSpan / aspectWOverH
  lonSpan *= 1.16
  ySpan *= 1.16
  return {
    minLon: midLon - lonSpan / 2,
    maxLon: midLon + lonSpan / 2,
    minLat: latFromMercatorY(midY - ySpan / 2),
    maxLat: latFromMercatorY(midY + ySpan / 2),
  }
}

export function TrainingRouteSvgPreview({
  coordinates,
  className,
  showBasemap = true,
}: {
  coordinates: [number, number][]
  className?: string
  showBasemap?: boolean
}) {
  if (coordinates.length < 2) {
    return (
      <div
        className={`bg-neutral-950 flex items-center justify-center text-neutral-600 text-xs ${className ?? ''}`}
      >
        No map
      </div>
    )
  }

  const line = downsample(coordinates, 400)
  let minLon = Infinity
  let maxLon = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  for (const [lon, lat] of line) {
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  const vbW = 100
  const vbH = 56
  const fitted = fitLonLatBox(minLon, minLat, maxLon, maxLat, vbW / vbH)
  const points = projectMercator(line, fitted, vbW, vbH)
  const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
  const mapUrl =
    showBasemap && token
    ? `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static/[${fitted.minLon},${fitted.minLat},${fitted.maxLon},${fitted.maxLat}]/300x168@2x?attribution=false&logo=false&access_token=${token}`
    : null

  return (
    <div className={`relative overflow-hidden bg-[#d4ddd0] ${className ?? 'w-full h-full'}`}>
      {mapUrl ? (
        <img
          src={mapUrl}
          alt=""
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
      <svg
        viewBox={`0 0 ${vbW} ${vbH}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <polyline
          points={points}
          fill="none"
          stroke="#0a0a0a"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points={points}
          fill="none"
          stroke="#2563eb"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {mapUrl ? (
        <span className="absolute bottom-0.5 left-1 text-[7px] leading-none text-neutral-800/70 pointer-events-none">
          © Mapbox © OpenStreetMap
        </span>
      ) : null}
    </div>
  )
}

interface TrainingRouteDetailMapProps {
  coordinates: [number, number][]
  courseCoordinates?: [number, number][]
  overlapSegments?: {
    trainingStartMi: number
    trainingEndMi: number
    courseStartMi?: number
    courseEndMi?: number
  }[]
  highlightedOverlap?: { trainingStartMi: number; trainingEndMi: number } | null
  className?: string
  interactive?: boolean
  showControls?: boolean
  /** Color key for race / training / overlap — detail view only, not preview cards. */
  showLegend?: boolean
}

const TrainingRouteMapbox = lazy(() =>
  import('./TrainingRouteMapbox').then(m => ({ default: m.TrainingRouteMapbox }))
)

/** Detail map: Mapbox basemap (lazy) with SVG fallback. */
export function TrainingRouteDetailMap(props: TrainingRouteDetailMapProps) {
  const staticPreview = props.interactive === false
  const [useSvg, setUseSvg] = useState(staticPreview || !import.meta.env.VITE_MAPBOX_TOKEN)
  const handleMapFailure = useCallback(() => setUseSvg(true), [])
  const { className, showLegend = false, ...mapProps } = props
  const liveOverlap =
    !staticPreview && !!props.courseCoordinates && props.courseCoordinates.length >= 2
  const [computedOverlap, setComputedOverlap] = useState<typeof props.overlapSegments>(undefined)
  useEffect(() => {
    if (!liveOverlap || !props.courseCoordinates) return
    const training = props.coordinates
    const course = props.courseCoordinates
    const handle = window.setTimeout(() => {
      setComputedOverlap(computeTrainingMapOverlap(training, course))
    }, 0)
    return () => window.clearTimeout(handle)
  }, [liveOverlap, props.coordinates, props.courseCoordinates])
  const mapOverlapSegments = liveOverlap ? computedOverlap : props.overlapSegments
  const mapData = { ...mapProps, overlapSegments: mapOverlapSegments }

  return (
    <div className={`relative ${className ?? 'w-full h-full'}`}>
      {useSvg ? (
        <TrainingRouteSvgDetail {...mapData} className="w-full h-full" />
      ) : (
        <Suspense fallback={<TrainingRouteSvgDetail {...mapData} className="w-full h-full" />}>
          <TrainingRouteMapbox {...mapData} className="w-full h-full" onFail={handleMapFailure} />
        </Suspense>
      )}
      {showLegend ? <TrainingMapLegend /> : null}
    </div>
  )
}

function TrainingRouteSvgDetail({
  coordinates,
  courseCoordinates,
  overlapSegments,
  highlightedOverlap,
  className,
}: TrainingRouteDetailMapProps) {
  if (coordinates.length < 2) {
    return (
      <div
        className={`bg-neutral-950 flex items-center justify-center text-neutral-500 text-sm ${className ?? ''}`}
      >
        No route geometry
      </div>
    )
  }

  const training = downsample(coordinates, 2500)
  let minLon = Infinity
  let maxLon = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  for (const [lon, lat] of training) {
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  const lonPad = (maxLon - minLon) * 0.08 || 0.01
  const latPad = (maxLat - minLat) * 0.08 || 0.01
  minLon -= lonPad
  maxLon += lonPad
  minLat -= latPad
  maxLat += latPad

  const vbW = 800
  const vbH = 420
  const pad = 0.04
  const inView = (c: [number, number]) =>
    c[0] >= minLon && c[0] <= maxLon && c[1] >= minLat && c[1] <= maxLat

  let coursePts: [number, number][] = []
  if (courseCoordinates && courseCoordinates.length >= 2) {
    coursePts = downsample(courseCoordinates, 3000).filter(inView)
  }

  const trainingPoints = project(training, minLon, maxLon, minLat, maxLat, vbW, vbH, pad)
  const coursePoints =
    coursePts.length >= 2 ? project(coursePts, minLon, maxLon, minLat, maxLat, vbW, vbH, pad) : null
  const overlapSelected = Boolean(highlightedOverlap)
  const overlapPolylines =
    overlapSegments
      ?.map(seg => {
        const slice = downsample(sliceByMiles(coordinates, seg.trainingStartMi, seg.trainingEndMi), 1500)
        if (slice.length < 2) return null
        return project(slice, minLon, maxLon, minLat, maxLat, vbW, vbH, pad)
      })
      .filter((p): p is string => !!p) ?? []
  const highlightPts = highlightedOverlap
    ? downsample(
        sliceByMiles(coordinates, highlightedOverlap.trainingStartMi, highlightedOverlap.trainingEndMi, false),
        1500
      )
    : []
  const highlightPoints =
    highlightPts.length >= 2 ? project(highlightPts, minLon, maxLon, minLat, maxLat, vbW, vbH, pad) : null

  return (
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      preserveAspectRatio="xMidYMid meet"
      className={className ?? 'w-full h-full'}
      role="img"
      aria-label="Training route map"
    >
      <rect width={vbW} height={vbH} fill="#0a0a0a" />
      {coursePoints && (
        <polyline
          points={coursePoints}
          fill="none"
          stroke={COURSE_COLOR}
          strokeOpacity={0.85}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      <polyline
        points={trainingPoints}
        fill="none"
        stroke={TRAINING_COLOR}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {overlapPolylines.map((pts, i) => (
        <polyline
          key={i}
          points={pts}
          fill="none"
          stroke={OVERLAP_COLOR}
          strokeOpacity={overlapSelected ? 0.35 : 1}
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {highlightPoints && (
        <>
          <polyline
            points={highlightPoints}
            fill="none"
            stroke={HIGHLIGHT_HALO}
            strokeWidth="12"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polyline
            points={highlightPoints}
            fill="none"
            stroke={HIGHLIGHT_COLOR}
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  )
}
