'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * Animated modal overlay with enter/exit scale + opacity transitions.
 * Handles: backdrop click to dismiss, Escape key, 200ms animated close.
 * Children receive `handleClose` to trigger the animated exit from within.
 */
export function Modal({ isDark, onClose, zIndex, children, className = '' }: {
  isDark: boolean
  onClose: () => void
  zIndex: string
  children: (handleClose: () => void) => React.ReactNode
  className?: string
}) {
  const [visible, setVisible] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  const handleClose = useCallback(() => {
    setVisible(false)
    setTimeout(onClose, 200)
  }, [onClose])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [handleClose])

  return (
    <div
      ref={overlayRef}
      className={`fixed inset-0 ${zIndex} flex items-center justify-center backdrop-blur-sm transition-opacity duration-200 ${
        isDark ? 'bg-black/50' : 'bg-black/30'
      } ${visible ? 'opacity-100' : 'opacity-0'}`}
      onMouseDown={(e) => { if (e.target === overlayRef.current) handleClose() }}
    >
      <div className={`rounded-2xl border shadow-2xl transition-all duration-200 ${
        visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
      } ${className}`}>
        {children(handleClose)}
      </div>
    </div>
  )
}

/**
 * Standard close button used in all modals and overlays.
 * `w-7 h-7 rounded-lg` container with a `w-4 h-4` X icon.
 * Dark: gray-600 → hover gray-300 + bg-white/10.
 * Light: gray-400 → hover gray-700 + bg-gray-100.
 */
export function CloseButton({ onClick, isDark, className = '' }: {
  onClick: () => void
  isDark: boolean
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
        isDark
          ? 'text-gray-600 hover:text-gray-300 hover:bg-white/10'
          : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
      } ${className}`}
      data-tooltip="Close" data-tooltip-pos="left"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  )
}

/**
 * Standard checkbox used in column/field selection lists.
 * `w-3.5 h-3.5 rounded` container with a `w-2 h-2` checkmark.
 * Active: gray-400 bg (dark), violet-600 bg (light).
 */
export function Checkbox({ checked, isDark }: {
  checked: boolean
  isDark: boolean
}) {
  return (
    <div className={`w-3.5 h-3.5 rounded flex-shrink-0 flex items-center justify-center border transition-all ${
      checked
        ? isDark ? 'border-gray-400 bg-gray-400' : 'border-violet-600 bg-violet-600'
        : isDark ? 'border-white/20 bg-white/5' : 'border-gray-300 bg-white'
    }`}>
      {checked && (
        <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      )}
    </div>
  )
}
