export default function StatCard({ label, value, sub, color = 'brand', icon }) {
  const colorMap = {
    brand:  { bg: 'bg-brand-600/10',  text: 'text-brand-600 dark:text-brand-400',  icon: 'text-brand-500'  },
    green:  { bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', icon: 'text-emerald-500' },
    amber:  { bg: 'bg-amber-500/10',  text: 'text-amber-600 dark:text-amber-400',  icon: 'text-amber-500'  },
    rose:   { bg: 'bg-rose-500/10',   text: 'text-rose-600 dark:text-rose-400',   icon: 'text-rose-500'   },
    purple: { bg: 'bg-purple-500/10', text: 'text-purple-600 dark:text-purple-400', icon: 'text-purple-500' },
  }
  const c = colorMap[color] || colorMap.brand

  return (
    <div className="card w-full max-w-full overflow-hidden p-3 flex items-center gap-2.5 min-w-0">
      {icon && (
        <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center flex-shrink-0`}>
          <span className={c.icon}>{icon}</span>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-ink-muted uppercase tracking-wide truncate">{label}</p>
        <p className={`text-lg font-semibold leading-tight ${c.text}`}>{value}</p>
        {sub && <p className="text-[11px] text-ink-faint leading-snug truncate">{sub}</p>}
      </div>
    </div>
  )
}
