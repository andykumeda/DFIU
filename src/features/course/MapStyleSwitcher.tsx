'use client'

import React from 'react'
import { Mountain, Map as MapIcon, Satellite } from 'lucide-react'

export type MapStyle = 'outdoors' | 'streets' | 'satellite'

interface MapStyleSwitcherProps {
    currentStyle: MapStyle
    onStyleChange: (style: MapStyle) => void
}

const MapStyleSwitcher: React.FC<MapStyleSwitcherProps> = ({ currentStyle, onStyleChange }) => {
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
        </div>
    )
}

export default MapStyleSwitcher
