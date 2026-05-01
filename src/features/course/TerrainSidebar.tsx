'use client'

import { useMemo, useState } from 'react'
import { TerrainNode } from '@/types/database'
import {
  TERRAIN_TYPES,
  TerrainTypeValue,
  getTerrainColor,
  getTerrainLabel,
  getTerrainDefaultDifficulty,
} from './terrain-constants'

interface Segment {
  startNodeId: string
  startMile: number
  endMile: number
  type: TerrainTypeValue
  difficulty: number
}

interface TerrainSidebarProps {
  terrainNodes: TerrainNode[]
  totalDistance: number
  canEdit: boolean
  highlightedTerrainId?: string | null
  onHoverNode?: (id: string | null) => void
  onSaveSegment: (startMile: number, endMile: number, type: string, difficulty: number) => Promise<void> | void
  onDeleteNode: (id: string) => Promise<void> | void
  onUpdateNodeMile?: (id: string, mile: number) => Promise<void> | void
}

export function TerrainSidebar({
  terrainNodes,
  totalDistance,
  canEdit,
  highlightedTerrainId,
  onHoverNode,
  onSaveSegment,
  onDeleteNode,
  onUpdateNodeMile,
}: TerrainSidebarProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newStart, setNewStart] = useState('')
  const [newEnd, setNewEnd] = useState('')
  const [newType, setNewType] = useState<TerrainTypeValue>('single_track')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editingMileId, setEditingMileId] = useState<string | null>(null)
  const [editMileVal, setEditMileVal] = useState('')

  const segments = useMemo<Segment[]>(() => {
    const sorted = [...terrainNodes].sort((a, b) => a.mile - b.mile)
    return sorted.map((n, i) => ({
      startNodeId: n.id,
      startMile: n.mile,
      endMile: sorted[i + 1]?.mile ?? totalDistance,
      type: n.type as TerrainTypeValue,
      difficulty: n.difficulty ?? 100,
    }))
  }, [terrainNodes, totalDistance])

  const resetForm = () => {
    setAdding(false)
    setNewStart('')
    setNewEnd('')
    setNewType('single_track')
    setError(null)
  }

  const handleAdd = async () => {
    const s = parseFloat(newStart)
    const e = parseFloat(newEnd)
    if (Number.isNaN(s) || Number.isNaN(e)) {
      setError('Enter numeric mile values')
      return
    }
    if (s < 0 || e < 0) {
      setError('Miles cannot be negative')
      return
    }
    if (e <= s) {
      setError('End must be greater than start')
      return
    }
    if (totalDistance && e > totalDistance + 0.01) {
      setError(`End exceeds total distance (${totalDistance.toFixed(2)} mi)`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSaveSegment(s, e, newType, getTerrainDefaultDifficulty(newType))
      resetForm()
    } catch (err: any) {
      setError(err?.message || 'Failed to save')
    } finally {
      setBusy(false)
    }
  }

  const handleTypeChange = async (seg: Segment, type: TerrainTypeValue) => {
    if (type === seg.type) return
    setBusy(true)
    try {
      await onSaveSegment(seg.startMile, seg.endMile, type, getTerrainDefaultDifficulty(type))
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (seg: Segment) => {
    if (!confirm(`Delete terrain at mi ${seg.startMile.toFixed(2)}?`)) return
    setBusy(true)
    try {
      await onDeleteNode(seg.startNodeId)
    } finally {
      setBusy(false)
    }
  }

  const startEditMile = (seg: Segment) => {
    setEditingMileId(seg.startNodeId)
    setEditMileVal(seg.startMile.toFixed(2))
  }

  const cancelEditMile = () => {
    setEditingMileId(null)
    setEditMileVal('')
  }

  const saveEditMile = async (seg: Segment) => {
    if (!onUpdateNodeMile) return
    const v = parseFloat(editMileVal)
    if (Number.isNaN(v) || v < 0) return
    if (totalDistance && v > totalDistance) return
    setBusy(true)
    try {
      await onUpdateNodeMile(seg.startNodeId, v)
      cancelEditMile()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-4 border-t border-neutral-800">
      <div
        className="flex items-center justify-between mb-3 cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <h3 className="text-sm font-semibold text-neutral-400 flex-1 uppercase tracking-wider flex items-center gap-2">
          {isOpen ? '▼' : '▶'} Terrain
        </h3>
        {canEdit && isOpen && !adding && (
          <button
            onClick={(e) => { e.stopPropagation(); setAdding(true) }}
            className="text-xs bg-neutral-800 hover:bg-neutral-700 text-white px-2 py-1 rounded border border-neutral-700 transition-colors ml-2"
          >
            + Add
          </button>
        )}
      </div>

      {isOpen && canEdit && (
        <p className="mb-3 text-[10px] text-neutral-500 italic">
          Click two points on the map (or drag the profile) to define a segment.
        </p>
      )}

      {isOpen && (
        <div className="space-y-1.5">
          {canEdit && adding && (
            <div className="bg-neutral-950/60 border border-neutral-800 rounded p-2 space-y-2">
              <div className="flex gap-1.5">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Start mi"
                  value={newStart}
                  onChange={e => setNewStart(e.target.value)}
                  className="w-20 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-orange-500"
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="End mi"
                  value={newEnd}
                  onChange={e => setNewEnd(e.target.value)}
                  className="w-20 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-orange-500"
                />
                <select
                  value={newType}
                  onChange={e => setNewType(e.target.value as TerrainTypeValue)}
                  className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-orange-500"
                >
                  {TERRAIN_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              {error && <div className="text-xs text-red-400">{error}</div>}
              <div className="flex justify-end gap-1.5">
                <button
                  onClick={resetForm}
                  disabled={busy}
                  className="text-xs px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdd}
                  disabled={busy}
                  className="text-xs px-3 py-1 rounded bg-orange-600 hover:bg-orange-500 text-white font-medium disabled:opacity-50"
                >
                  {busy ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {segments.length === 0 ? (
            <p className="text-xs text-neutral-600 italic">
              {canEdit ? 'No terrain segments. Click + Add to start.' : 'No terrain segments defined.'}
            </p>
          ) : (
            segments.map(seg => {
              const pct = seg.difficulty - 100
              const isHighlighted = highlightedTerrainId === seg.startNodeId
              return (
                <div
                  key={seg.startNodeId}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded border transition-colors ${
                    isHighlighted
                      ? 'bg-neutral-800 border-neutral-600'
                      : 'border-transparent hover:bg-neutral-800/60'
                  }`}
                  onMouseEnter={() => onHoverNode?.(seg.startNodeId)}
                  onMouseLeave={() => onHoverNode?.(null)}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: getTerrainColor(seg.type) }}
                  />
                  {editingMileId === seg.startNodeId && canEdit && onUpdateNodeMile ? (
                    <span className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editMileVal}
                        onChange={e => setEditMileVal(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveEditMile(seg)
                          if (e.key === 'Escape') cancelEditMile()
                        }}
                        autoFocus
                        disabled={busy}
                        className="w-16 bg-neutral-900 border border-neutral-700 rounded px-1 py-0.5 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                      />
                      <button
                        onClick={() => saveEditMile(seg)}
                        disabled={busy}
                        className="text-green-400 hover:text-green-300 text-xs disabled:opacity-50"
                        title="Save"
                      >
                        ✓
                      </button>
                      <button
                        onClick={cancelEditMile}
                        disabled={busy}
                        className="text-neutral-500 hover:text-neutral-300 text-xs disabled:opacity-50"
                        title="Cancel"
                      >
                        ×
                      </button>
                    </span>
                  ) : (
                    <span
                      className={`text-xs text-neutral-300 font-mono shrink-0 w-[88px] ${canEdit && onUpdateNodeMile ? 'cursor-pointer hover:text-orange-300' : ''}`}
                      onClick={() => canEdit && onUpdateNodeMile && startEditMile(seg)}
                      title={canEdit && onUpdateNodeMile ? 'Click to edit start mile' : undefined}
                    >
                      {seg.startMile.toFixed(2)}–{seg.endMile.toFixed(2)}
                    </span>
                  )}
                  {canEdit ? (
                    <select
                      value={seg.type}
                      onChange={e => handleTypeChange(seg, e.target.value as TerrainTypeValue)}
                      disabled={busy}
                      className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none focus:border-orange-500"
                    >
                      {TERRAIN_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="flex-1 text-xs text-neutral-300">
                      {getTerrainLabel(seg.type)}
                    </span>
                  )}
                  <span className="text-[10px] text-neutral-500 shrink-0 w-9 text-right">
                    {pct === 0 ? '' : `${pct > 0 ? '+' : ''}${pct}%`}
                  </span>
                  {canEdit && (
                    <button
                      onClick={() => handleDelete(seg)}
                      disabled={busy}
                      className="text-neutral-600 hover:text-red-400 text-xs disabled:opacity-50 shrink-0"
                      title="Delete"
                    >
                      ×
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
