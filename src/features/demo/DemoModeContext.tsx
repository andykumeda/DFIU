import { createContext, useContext } from 'react'
import type { DemoOverlay } from './demoStore'

export type DemoModeContextValue = {
  isDemoMode: boolean
  sourceRaceId: string
  overlay: DemoOverlay | null
  overlayReady: boolean
  overlayTooLarge: boolean
  persistOverlay: (next: DemoOverlay) => Promise<boolean>
  refreshOverlay: () => Promise<void>
}

export const DemoModeContext = createContext<DemoModeContextValue | null>(null)

export function useDemoMode(): DemoModeContextValue {
  const ctx = useContext(DemoModeContext)
  if (!ctx) {
    return {
      isDemoMode: false,
      sourceRaceId: '',
      overlay: null,
      overlayReady: true,
      overlayTooLarge: false,
      persistOverlay: async () => true,
      refreshOverlay: async () => undefined,
    }
  }
  return ctx
}
