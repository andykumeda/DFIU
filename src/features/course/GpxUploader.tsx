'use client'

import { useState, useRef } from 'react'
import { parseGpx, GpxParseResult } from '@/lib/gpx-parser'
import styles from './GpxUploader.module.css'

interface GpxUploaderProps {
    onUpload: (result: GpxParseResult, rawGpx: string) => void
    disabled?: boolean
    className?: string
}

export function GpxUploader({ onUpload, disabled, className }: GpxUploaderProps) {
    const [isDragging, setIsDragging] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isProcessing, setIsProcessing] = useState(false)
    const [fileName, setFileName] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const processFile = async (file: File) => {
        setError(null)
        setIsProcessing(true)
        setFileName(file.name)

        try {
            // Validate file size (max 10MB as per PRD)
            if (file.size > 10 * 1024 * 1024) {
                throw new Error('File too large. Maximum size is 10MB.')
            }

            // Validate file type
            if (!file.name.toLowerCase().endsWith('.gpx')) {
                throw new Error('Please upload a GPX file.')
            }

            const text = await file.text()
            const result = parseGpx(text)

            onUpload(result, text)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to process GPX file')
            setFileName(null)
        } finally {
            setIsProcessing(false)
        }
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)

        const file = e.dataTransfer.files[0]
        if (file) {
            processFile(file)
        }
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            processFile(file)
        }
    }

    const handleClick = () => {
        fileInputRef.current?.click()
    }

    return (
        <div
            className={`${styles.uploader} ${isDragging ? styles.dragging : ''} ${disabled ? styles.disabled : ''} ${className || ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={disabled ? undefined : handleClick}
        >
            <input
                ref={fileInputRef}
                type="file"
                accept=".gpx"
                onChange={handleFileSelect}
                className={styles.fileInput}
                disabled={disabled}
            />

            {isProcessing ? (
                <div className={styles.processing}>
                    <div className={styles.spinner}></div>
                    <p>Processing {fileName}...</p>
                </div>
            ) : error ? (
                <div className={styles.errorState}>
                    <span className={styles.errorIcon}>⚠️</span>
                    <p className={styles.errorMessage}>{error}</p>
                    <button
                        className={styles.retryBtn}
                        onClick={(e) => { e.stopPropagation(); setError(null); setFileName(null); }}
                    >
                        Try Again
                    </button>
                </div>
            ) : (
                <div className={styles.prompt}>
                    <span className={styles.icon}>📍</span>
                    <p className={styles.title}>
                        {fileName ? `Uploaded: ${fileName}` : 'Drop your GPX file here'}
                    </p>
                    <p className={styles.subtitle}>
                        or click to browse (max 10MB)
                    </p>
                </div>
            )}
        </div>
    )
}
