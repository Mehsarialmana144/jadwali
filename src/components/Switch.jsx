// Accessible on/off switch with a large invisible tap area (the visible track is only 36x20).
export default function Switch({ checked, onChange, label, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative before:absolute before:-inset-3 before:content-[''] w-9 h-5 rounded-full flex-shrink-0 transition-colors ${
        checked ? 'bg-brand-600' : 'bg-surface-border'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </button>
  )
}
