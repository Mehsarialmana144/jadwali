export default function StatCard({ label, value, sub, color = 'brand', icon }) {
  const colorMap = {
    brand:  { bg: 'bg-brand-50',  text: 'text-brand-700',  icon: 'text-brand-500'  },
    green:  { bg: 'bg-green-50',  text: 'text-green-700',  icon: 'text-green-500'  },
    amber:  { bg: 'bg-amber-50',  text: 'text-amber-700',  icon: 'text-amber-500'  },
    rose:   { bg: 'bg-rose-50',   text: 'text-rose-700',   icon: 'text-rose-500'   },
    purple: { bg: 'bg-purple-50', text: 'text-purple-700', icon: 'text-purple-500' },
  }
  const c = colorMap[color] || colorMap.brand

  return (
    <div className={`card p-5 flex items-start gap-4`}>
      {icon && (
        <div className={`w-10 h-10 rounded-lg ${c.bg} flex items-center justify-center flex-shrink-0`}>
          <span className={c.icon}>{icon}</span>
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium text-ink-muted uppercase tracking-wide">{label}</p>
        <p className={`text-2xl font-semibold mt-0.5 ${c.text} truncate`}>{value}</p>
        {sub && <p className="text-xs text-ink-faint mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  )
}
