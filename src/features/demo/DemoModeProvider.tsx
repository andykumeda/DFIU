import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import {
  buildDemoOverlay,
  loadDemoOverlay,
  saveDemoOverlay,
  type DemoOverlay,
} from './demoStore'
import { DemoModeContext, type DemoModeContextValue } from './DemoModeContext'

export function DemoModeProvider({
  raceId,
  children,
}: {
  raceId: string
  children: ReactNode
}) {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const wantsDemo = searchParams.get('demo') === '1'
  const isDemoMode = wantsDemo && !user

  const [overlay, setOverlay] = useState<DemoOverlay | null>(null)
  const [loadedForRaceId, setLoadedForRaceId] = useState<string | null>(null)
  const [overlayTooLarge, setOverlayTooLarge] = useState(false)
  const overlayReady = !isDemoMode || loadedForRaceId === raceId

  useEffect(() => {
    if (!isDemoMode) return

    let cancelled = false
    void loadDemoOverlay(raceId).then((loaded) => {
      if (cancelled) return
      setOverlay(loaded)
      setLoadedForRaceId(raceId)
    })
    return () => {
      cancelled = true
    }
  }, [isDemoMode, raceId])

  const refreshOverlay = useCallback(async () => {
    if (!isDemoMode) return
    const loaded = await loadDemoOverlay(raceId)
    setOverlay(loaded)
    setLoadedForRaceId(raceId)
  }, [isDemoMode, raceId])

  const persistOverlay = useCallback(async (next: DemoOverlay) => {
    const result = await saveDemoOverlay(next)
    if (!result.ok) {
      if (result.reason === 'too_large') setOverlayTooLarge(true)
      return false
    }
    setOverlayTooLarge(false)
    setOverlay(next)
    return true
  }, [])

  const value = useMemo<DemoModeContextValue>(() => ({
    isDemoMode,
    sourceRaceId: raceId,
    overlay: isDemoMode ? overlay : null,
    overlayReady,
    overlayTooLarge,
    persistOverlay,
    refreshOverlay,
  }), [isDemoMode, raceId, overlay, overlayReady, overlayTooLarge, persistOverlay, refreshOverlay])

  return (
    <DemoModeContext.Provider value={value}>
      {children}
    </DemoModeContext.Provider>
  )
}

export { buildDemoOverlay }
