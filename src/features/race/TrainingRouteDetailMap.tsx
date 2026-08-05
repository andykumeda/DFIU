import { lazy, Suspense, useCallback, useState } from 'react'

/** Card previews stay SVG-only (no Mapbox in the main bundle). */

/** Race course reference — violet stands out on outdoors basemap vs blue training / orange overlap. */
const COURSE_COLOR = '#9333ea'
const TRAINING_COLOR = '#2563eb'
const OVERLAP_COLOR = '#ea580c'

function TrainingMapLegend() {
  return (
    <div className="absolute bottom-3 left-3 z-10 rounded-md border border-neutral-700 bg-neutral-950/90 px-3 py-2 text-[11px] text-neutral-200 shadow-lg backdrop-blur-sm pointer-events-none">
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="inline-block h-0.5 w-3 rounded" style={{ backgroundColor: COURSE_COLOR }} />
          <span>Race course</span>
        </div>
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="inline-block h-0.5 w-3 rounded" style={{ backgroundColor: TRAINING_COLOR }} />
          <span>Training</span>
        </div>
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="inline-block h-0.5 w-3 rounded" style={{ backgroundColor: OVERLAP_COLOR }} />
          <span>Overlap</span>
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

function sliceByMiles(line: [number, number][], startMi: number, endMi: number): [number, number][] {
  if (line.length < 2) return line
  const cum = cumulativeMiles(line)
  const out: [number, number][] = []
  for (let i = 0; i < line.length; i++) {
    if (cum[i] >= startMi - 0.01 && cum[i] <= endMi + 0.01) out.push(line[i])
  }
  return out.length >= 2 ? out : line.slice(0, Math.min(2, line.length))
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

export function TrainingRouteSvgPreview({
  coordinates,
  className,
}: {
  coordinates: [number, number][]
  className?: string
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

  const line = downsample(coordinates, 800)
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
  const points = project(line, minLon, maxLon, minLat, maxLat, vbW, vbH, 0.08)

  return (
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      preserveAspectRatio="xMidYMid meet"
      className={className ?? 'w-full h-full'}
      aria-hidden
    >
      <rect width={vbW} height={vbH} fill="#0a0a0a" />
      <polyline
        points={points}
        fill="none"
        stroke="#3b82f6"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

interface TrainingRouteDetailMapProps {
  coordinates: [number, number][]
  courseCoordinates?: [number, number][]
  overlapSegments?: { trainingStartMi: number; trainingEndMi: number }[]
  className?: string
  interactive?: boolean
  showControls?: boolean
}

const TrainingRouteMapbox = lazy(() =>
  import('./TrainingRouteMapbox').then(m => ({ default: m.TrainingRouteMapbox }))
)

/** Detail map: Mapbox basemap (lazy) with SVG fallback. */
export function TrainingRouteDetailMap(props: TrainingRouteDetailMapProps) {
  const [useSvg, setUseSvg] = useState(!import.meta.env.VITE_MAPBOX_TOKEN)
  const handleMapFailure = useCallback(() => setUseSvg(true), [])
  const { className, ...mapProps } = props

  return (
    <div className={`relative ${className ?? 'w-full h-full'}`}>
      {useSvg ? (
        <TrainingRouteSvgDetail {...mapProps} className="w-full h-full" />
      ) : (
        <Suspense fallback={<TrainingRouteSvgDetail {...mapProps} className="w-full h-full" />}>
          <TrainingRouteMapbox {...mapProps} className="w-full h-full" onFail={handleMapFailure} />
        </Suspense>
      )}
      <TrainingMapLegend />
    </div>
  )
}

function TrainingRouteSvgDetail({
  coordinates,
  courseCoordinates,
  overlapSegments,
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
  const overlapPolylines =
    overlapSegments
      ?.map(seg => {
        const slice = downsample(sliceByMiles(coordinates, seg.trainingStartMi, seg.trainingEndMi), 1500)
        if (slice.length < 2) return null
        return project(slice, minLon, maxLon, minLat, maxLat, vbW, vbH, pad)
      })
      .filter((p): p is string => !!p) ?? []

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
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  )
}
