import { useEffect } from 'react'

export default function Modal({ title, onClose, children }) {
  // Close on Escape key
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 overflow-x-hidden">
      {/* Backdrop */}
       <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative bg-surface-card rounded-2xl shadow-md w-[calc(100vw-1.5rem)] sm:w-full max-w-md max-h-[90vh] overflow-y-auto overflow-x-hidden min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-surface-border sticky top-0 bg-surface-card rounded-t-2xl z-10 min-w-0">
          <h2 className="font-display font-semibold text-ink text-[15px] min-w-0 break-words">{title}</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface-raised text-ink-muted transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-4 sm:px-5 py-4 min-w-0">
          {children}
        </div>
      </div>
    </div>
  )
}
