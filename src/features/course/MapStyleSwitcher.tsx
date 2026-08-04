'use client'

import React from 'react'
import { Mountain, Map as MapIcon, Satellite, Milestone, Eye, EyeOff } from 'lucide-react'

export type MapStyle = 'outdoors' | 'streets' | 'satellite'

interface MapStyleSwitcherProps {
    currentStyle: MapStyle
    onStyleChange: (style: MapStyle) => void
    showMileMarkers?: boolean
    onToggleMileMarkers?: () => void
    showLandmarks?: boolean
    onToggleLandmarks?: () => void
}

const MapStyleSwitcher: React.FC<MapStyleSwitcherProps> = ({
    currentStyle,
    onStyleChange,
    showMileMarkers,
    onToggleMileMarkers,
    showLandmarks,
    onToggleLandmarks,
}) => {
    const styles: { id: MapStyle; name: string; icon: React.ReactNode }[] = [
        { id: 'outdoors', name: 'Outdoors', icon: <Mountain size={16} /> },
        { id: 'streets', name: 'Streets', icon: <MapIcon size={16} /> },
        { id: 'satellite', name: 'Satellite', icon: <Satellite size={16} /> },
    ]

    return (
        <div className="absolute top-2 left-2 sm:top-4 sm:left-4 bg-white rounded-md shadow-md p-1 flex flex-col gap-0.5 sm:gap-1 z-50 text-gray-800 border border-gray-200 [&_svg]:w-3.5 [&_svg]:h-3.5 sm:[&_svg]:w-4 sm:[&_svg]:h-4">
            {styles.map((style) => (
                <button
                    key={style.id}
                    onClick={() => onStyleChange(style.id)}
                    className={`
            p-1.5 sm:p-2 rounded hover:bg-gray-100 flex items-center gap-2 transition-colors
            ${currentStyle === style.id ? 'bg-blue-50 text-blue-600' : 'text-gray-700'}
          `}
                    title={style.name}
                >
                    {style.icon}
                    <span className="sr-only">{style.name}</span>
                </button>
            ))}

            {onToggleMileMarkers && (
                <>
                    <div className="h-px bg-gray-200 mx-1" />
                    <button
                        onClick={onToggleMileMarkers}
                        className={`
            p-1.5 sm:p-2 rounded hover:bg-gray-100 flex items-center gap-2 transition-colors
            ${showMileMarkers ? 'bg-blue-50 text-blue-600' : 'text-gray-700'}
          `}
                        title="Toggle Mile Markers"
                        type="button"
                    >
                        <Milestone size={16} />
                        <span className="sr-only">Mile Markers</span>
                    </button>
                </>
            )}

            {onToggleLandmarks && (
                <button
                    onClick={onToggleLandmarks}
                    className={`
            p-1.5 sm:p-2 rounded hover:bg-gray-100 flex items-center gap-2 transition-colors
            ${showLandmarks ? 'bg-blue-50 text-blue-600' : 'text-gray-700'}
          `}
                    title={showLandmarks ? 'Hide Landmarks' : 'Show Landmarks'}
                    type="button"
                >
                    {showLandmarks ? <Eye size={16} /> : <EyeOff size={16} />}
                    <span className="sr-only">{showLandmarks ? 'Hide Landmarks' : 'Show Landmarks'}</span>
                </button>
            )}
        </div>
    )
}

export default MapStyleSwitcher
