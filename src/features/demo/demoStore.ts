/** Browser-local demo overlay for try-before-signup editing. */

import type { Race, Waypoint, TerrainNode } from '@/types/database'
import type { PacePlans } from '@/features/race/usePacePlans'

export const DEMO_CLAIM_SESSION_KEY = 'dfiu_claim_demo_race_id'
export const DEMO_OVERLAY_SIZE_CAP_BYTES = 1_500_000

export type DemoPacePlans = PacePlans

export type DemoOverlay = {
  version: 1
  sourceRaceId: string
  baseOfficialRevision: number | null
  updatedAt: string
  race: Partial<Race> | null
  waypoints: Waypoint[] | null
  terrainNodes: TerrainNode[] | null
  pacePlans: DemoPacePlans | null
}

const DB_NAME = 'dfiu-demo'
const DB_VERSION = 1
const STORE = 'overlays'

function overlayKey(sourceRaceId: string) {
  return `demo:${sourceRaceId}`
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('Failed to open demo IndexedDB'))
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
  })
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

export async function loadDemoOverlay(sourceRaceId: string): Promise<DemoOverlay | null> {
  try {
    const db = await openDb()
    const tx = db.transaction(STORE, 'readonly')
    const value = await idbRequest(tx.objectStore(STORE).get(overlayKey(sourceRaceId)))
    db.close()
    if (!value || typeof value !== 'object') return null
    const overlay = value as DemoOverlay
    if (overlay.version !== 1 || overlay.sourceRaceId !== sourceRaceId) return null
    return overlay
  } catch (err) {
    console.error('Failed to load demo overlay', err)
    return null
  }
}

export async function saveDemoOverlay(overlay: DemoOverlay): Promise<{ ok: true } | { ok: false; reason: 'too_large' | 'error' }> {
  try {
    const serialized = JSON.stringify(overlay)
    if (serialized.length > DEMO_OVERLAY_SIZE_CAP_BYTES) {
      return { ok: false, reason: 'too_large' }
    }
    const db = await openDb()
    const tx = db.transaction(STORE, 'readwrite')
    await idbRequest(tx.objectStore(STORE).put(overlay, overlayKey(overlay.sourceRaceId)))
    db.close()
    return { ok: true }
  } catch (err) {
    console.error('Failed to save demo overlay', err)
    return { ok: false, reason: 'error' }
  }
}

export async function clearDemoOverlay(sourceRaceId: string): Promise<void> {
  try {
    const db = await openDb()
    const tx = db.transaction(STORE, 'readwrite')
    await idbRequest(tx.objectStore(STORE).delete(overlayKey(sourceRaceId)))
    db.close()
  } catch (err) {
    console.error('Failed to clear demo overlay', err)
  }
}

export function setClaimDemoIntent(sourceRaceId: string) {
  try {
    sessionStorage.setItem(DEMO_CLAIM_SESSION_KEY, sourceRaceId)
  } catch {
    /* ignore */
  }
}

export function peekClaimDemoIntent(): string | null {
  try {
    return sessionStorage.getItem(DEMO_CLAIM_SESSION_KEY)
  } catch {
    return null
  }
}

export function clearClaimDemoIntent() {
  try {
    sessionStorage.removeItem(DEMO_CLAIM_SESSION_KEY)
  } catch {
    /* ignore */
  }
}

export function mergeRaceWithOverlay(race: Race, overlay: DemoOverlay | null): Race {
  if (!overlay?.race) return race
  return { ...race, ...overlay.race, id: race.id }
}

export function buildDemoOverlay(args: {
  sourceRaceId: string
  baseOfficialRevision: number | null
  race?: Partial<Race> | null
  waypoints?: Waypoint[] | null
  terrainNodes?: TerrainNode[] | null
  pacePlans?: DemoPacePlans | null
  previous?: DemoOverlay | null
}): DemoOverlay {
  return {
    version: 1,
    sourceRaceId: args.sourceRaceId,
    baseOfficialRevision: args.baseOfficialRevision,
    updatedAt: new Date().toISOString(),
    race: args.race !== undefined ? args.race : (args.previous?.race ?? null),
    waypoints: args.waypoints !== undefined ? args.waypoints : (args.previous?.waypoints ?? null),
    terrainNodes: args.terrainNodes !== undefined ? args.terrainNodes : (args.previous?.terrainNodes ?? null),
    pacePlans: args.pacePlans !== undefined ? args.pacePlans : (args.previous?.pacePlans ?? null),
  }
}
