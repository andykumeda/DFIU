'use client'

import { useMemo, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
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
  endNodeId?: string
  nodeIds: string[]
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
  onDeleteSegment: (segment: Segment) => Promise<void> | void
  onUpdateSegment?: (segment: Segment, startMile: number, endMile: number, type: TerrainTypeValue, difficulty: number) => Promise<void> | void
  canEnterEdit?: boolean
  onEditModeChange?: (editing: boolean) => void
}

export function TerrainSidebar({
  terrainNodes,
  totalDistance,
  canEdit,
  highlightedTerrainId,
  onHoverNode,
  onSaveSegment,
  onDeleteSegment,
  onUpdateSegment,
  canEnterEdit = false,
  onEditModeChange,
}: TerrainSidebarProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newStart, setNewStart] = useState('')
  const [newEnd, setNewEnd] = useState('')
  const [newType, setNewType] = useState<TerrainTypeValue>('single_track')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null)
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [editType, setEditType] = useState<TerrainTypeValue>('single_track')

  const segments = useMemo<Segment[]>(() => {
    const sorted = [...terrainNodes].sort((a, b) => a.mile - b.mile)
    const result: Segment[] = []
    const isKnownTerrain = (node: TerrainNode) => node.type !== 'other' && node.type !== 'default'
    const gapTol = 0.1 + 1e-6

    for (let i = 0; i < sorted.length; i++) {
      const node = sorted[i]
      const startNode = node
      const mergedIds = [node.id]
      let endIndex = i + 1

      while (endIndex < sorted.length) {
        const next = sorted[endIndex]
        const nextAfterGap = sorted[endIndex + 1]
        if (isKnownTerrain(node) && next.type === node.type) {
          mergedIds.push(next.id)
          endIndex += 1
          continue
        }
        if (
          isKnownTerrain(node) &&
          next.type === 'other' &&
          nextAfterGap?.type === node.type &&
          nextAfterGap.mile - next.mile <= gapTol
        ) {
          mergedIds.push(next.id, nextAfterGap.id)
          endIndex += 2
          continue
        }
        break
      }

      if (startNode.type !== 'other' && startNode.type !== 'default') {
        result.push({
          startNodeId: startNode.id,
          endNodeId: sorted[endIndex]?.id,
          nodeIds: mergedIds,
          startMile: startNode.mile,
          endMile: sorted[endIndex]?.mile ?? totalDistance,
          type: startNode.type as TerrainTypeValue,
          difficulty: startNode.difficulty ?? 100,
        })
      }
      i = endIndex - 1
    }

    return result
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
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
    setBusy(true)
    setError(null)
    try {
      await onDeleteSegment(seg)
      if (editingSegmentId === seg.startNodeId) cancelEditSegment()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete segment')
    } finally {
      setBusy(false)
    }
  }

  const startEditSegment = (seg: Segment) => {
    setEditingSegmentId(seg.startNodeId)
    setEditStart(seg.startMile.toFixed(2))
    setEditEnd(seg.endMile.toFixed(2))
    setEditType(seg.type)
    setError(null)
  }

  const cancelEditSegment = () => {
    setEditingSegmentId(null)
    setEditStart('')
    setEditEnd('')
    setEditType('single_track')
    setError(null)
  }

  const saveEditSegment = async (seg: Segment) => {
    const start = parseFloat(editStart)
    const end = parseFloat(editEnd)
    if (Number.isNaN(start) || Number.isNaN(end)) {
      setError('Enter numeric mile values')
      return
    }
    if (start < 0 || end < 0) {
      setError('Miles cannot be negative')
      return
    }
    if (end <= start) {
      setError('End must be greater than start')
      return
    }
    if (end - start < 0.05) {
      setError('Segment must be at least 0.05 mi')
      return
    }
    if (totalDistance && end > totalDistance + 0.01) {
      setError(`End exceeds total distance (${totalDistance.toFixed(2)} mi)`)
      return
    }

    setBusy(true)
    setError(null)
    try {
      if (onUpdateSegment) {
        await onUpdateSegment(seg, start, end, editType, getTerrainDefaultDifficulty(editType))
      } else {
        await onSaveSegment(start, end, editType, getTerrainDefaultDifficulty(editType))
      }
      cancelEditSegment()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save segment')
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
        {canEnterEdit && isOpen && (
          <div className="flex items-center gap-1.5 ml-2">
            <button
              onClick={(e) => { e.stopPropagation(); onEditModeChange?.(!canEdit) }}
              className={`text-xs px-2 py-1 rounded border transition-colors ${
                canEdit
                  ? 'bg-blue-600 text-white border-blue-500 hover:bg-blue-500'
                  : 'bg-neutral-800 hover:bg-neutral-700 text-white border-neutral-700'
              }`}
            >
              {canEdit ? 'Done' : 'Edit'}
            </button>
            {canEdit && !adding && (
              <button
                onClick={(e) => { e.stopPropagation(); setAdding(true) }}
                className="text-xs bg-neutral-800 hover:bg-neutral-700 text-white px-2 py-1 rounded border border-neutral-700 transition-colors"
              >
                + Add
              </button>
            )}
          </div>
        )}
      </div>

      {isOpen && canEdit && (
        <p className="mb-3 text-[10px] text-neutral-500 italic">
          Click the route to set start, then click it again for end. Drag the map normally to pan.
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
              No terrain segments defined.
            </p>
          ) : (
            segments.map(seg => {
              const pct = seg.difficulty - 100
              const isHighlighted = highlightedTerrainId === seg.startNodeId
              const isEditing = editingSegmentId === seg.startNodeId

              if (isEditing && canEdit) {
                return (
                  <div
                    key={seg.startNodeId}
                    className="bg-neutral-950/70 border border-neutral-700 rounded p-2 space-y-2"
                    onMouseEnter={() => onHoverNode?.(seg.startNodeId)}
                    onMouseLeave={() => onHoverNode?.(null)}
                  >
                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="text-[10px] text-neutral-500 uppercase tracking-wider">
                        Start
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editStart}
                          onChange={e => setEditStart(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveEditSegment(seg)
                            if (e.key === 'Escape') cancelEditSegment()
                          }}
                          autoFocus
                          disabled={busy}
                          className="mt-1 w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                        />
                      </label>
                      <label className="text-[10px] text-neutral-500 uppercase tracking-wider">
                        End
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editEnd}
                          onChange={e => setEditEnd(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveEditSegment(seg)
                            if (e.key === 'Escape') cancelEditSegment()
                          }}
                          disabled={busy}
                          className="mt-1 w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                        />
                      </label>
                    </div>
                    <select
                      value={editType}
                      onChange={e => setEditType(e.target.value as TerrainTypeValue)}
                      disabled={busy}
                      className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-orange-500"
                    >
                      {TERRAIN_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                    {error && <div className="text-xs text-red-400">{error}</div>}
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={cancelEditSegment}
                        disabled={busy}
                        className="text-xs px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => saveEditSegment(seg)}
                        disabled={busy}
                        className="text-xs px-3 py-1 rounded bg-orange-600 hover:bg-orange-500 text-white font-medium disabled:opacity-50"
                      >
                        {busy ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                )
              }

              return (
                <div
                  key={seg.startNodeId}
                  className={`flex items-center gap-1 px-1.5 py-1.5 rounded border transition-colors ${
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
                  <button
                    type="button"
                    className="text-xs text-neutral-300 font-mono shrink-0 w-[76px] text-left hover:text-orange-300"
                    onClick={() => canEdit && startEditSegment(seg)}
                    title="Edit segment mileage"
                  >
                    {seg.startMile.toFixed(2)}–{seg.endMile.toFixed(2)}
                  </button>
                  {canEdit ? (
                    <select
                      value={seg.type}
                      onChange={e => handleTypeChange(seg, e.target.value as TerrainTypeValue)}
                      disabled={busy}
                      className="min-w-0 flex-1 bg-neutral-900 border border-neutral-800 rounded px-1 py-0.5 text-xs text-white focus:outline-none focus:border-orange-500"
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
                  <span className="text-[10px] text-neutral-500 shrink-0 w-6 text-right">
                    {pct === 0 ? '' : `${pct > 0 ? '+' : ''}${pct}%`}
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        startEditSegment(seg)
                      }}
                      disabled={busy}
                      className="w-5 h-5 inline-flex items-center justify-center text-neutral-500 hover:text-blue-300 disabled:opacity-50 shrink-0"
                      title="Edit segment"
                      aria-label={`Edit terrain segment ${seg.startMile.toFixed(2)} to ${seg.endMile.toFixed(2)}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(seg)
                      }}
                      disabled={busy}
                      className="w-5 h-5 inline-flex items-center justify-center text-neutral-500 hover:text-red-400 disabled:opacity-50 shrink-0"
                      title="Delete segment"
                      aria-label={`Delete terrain segment ${seg.startMile.toFixed(2)} to ${seg.endMile.toFixed(2)}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
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
