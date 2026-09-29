import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../App'
import CompanyBadge from '../components/CompanyBadge'
import { formatDate, formatTime, todayStr, addDays } from '../lib/dateUtils'
import { useRefetchOnFocus } from '../lib/useRefetchOnFocus'

const priorityDot = {
  low:    'bg-slate-400',
  medium: 'bg-amber-500',
  high:   'bg-red-500',
}

const statusColors = {
  todo:        'bg-slate-500/10 text-slate-600 dark:text-slate-300',
  in_progress: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  done:        'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
}

const statusLabels = {
  todo:        'To Do',
  in_progress: 'In Progress',
  done:        'Done',
}

export default function Timeline() {
  const { session } = useAuth()
  const userId = session.user.id

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [showPast, setShowPast] = useState(false)

  async function load() {
    setLoadError('')
    const { data, error } = await supabase
      .from('tasks')
      .select('id,title,due_date,due_time,priority,status,companies(name,logo_url,accent_color)')
      .eq('user_id', userId)

    if (error) {
      setLoadError(error.message)
      setItems([])
      setLoading(false)
      return
    }

    const combined = (data || [])
      .filter(t => t.due_date)
      .map(t => ({
        id:       t.id,
        title:    t.title,
        company:  t.companies,
        priority: t.priority || '',
        status:   t.status || 'todo',
        date:     t.due_date,
        time:     t.due_time,
        done:     t.status === 'done',
      }))
      .sort((a, b) => {
        const da = a.date + 'T' + (a.time || '00:00')
        const db = b.date + 'T' + (b.time || '00:00')
        return da.localeCompare(db)
      })

    setItems(combined)
    setLoading(false)
  }

  useEffect(() => { load() }, [userId])
  useRefetchOnFocus(load)

  const today = todayStr()
  const tomorrow = addDays(today, 1)

  const past = items.filter(i => i.date < today)
  const future = items.filter(i => i.date >= today)

  const grouped = future.reduce((acc, item) => {
    (acc[item.date] = acc[item.date] || []).push(item)
    return acc
  }, {})
  const dates = Object.keys(grouped).sort()

  const pastGrouped = past.reduce((acc, item) => {
    (acc[item.date] = acc[item.date] || []).push(item)
    return acc
  }, {})
  const pastDates = Object.keys(pastGrouped).sort()

  function dateLabel(date) {
    if (date === today) return 'Today'
    if (date === tomorrow) return 'Tomorrow'
    return formatDate(date)
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-5 h-5 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-w-0 max-w-full overflow-x-hidden">
      <div className="flex flex-col min-[380px]:flex-row min-[380px]:items-center justify-between gap-3 mb-5 min-w-0">
        <div className="min-w-0">
          <h1 className="page-title">Timeline</h1>
          <p className="text-xs text-ink-muted mt-0.5">Your agenda, day by day</p>
          {loadError && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-500/10 px-3 py-2 rounded-lg mt-2">
              Couldn't load tasks: {loadError}
            </p>
          )}
        </div>
        {pastDates.length > 0 && (
          <button onClick={() => setShowPast(p => !p)} className="btn-secondary text-xs w-full min-[380px]:w-auto">
            {showPast ? 'Hide past' : `Show past (${past.length})`}
          </button>
        )}
      </div>

      {dates.length === 0 && !showPast ? (
        <div className="card empty-state">
          <p className="text-sm text-ink-muted">No upcoming tasks.</p>
        </div>
      ) : (
        <div className="relative">
          {showPast && pastDates.length > 0 && (
            <div className="relative pl-6 mb-6 opacity-70">
              <div className="absolute left-[7px] top-2 bottom-0 w-px bg-surface-border" />
              {pastDates.map(date => (
                <AgendaDay key={date} label={formatDate(date)} isToday={false} items={pastGrouped[date]} />
              ))}
            </div>
          )}

          {dates.length > 0 && (
            <div className="relative pl-6">
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-surface-border" />
              {dates.map(date => (
                <AgendaDay key={date} label={dateLabel(date)} isToday={date === today} items={grouped[date]} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AgendaDay({ label, isToday, items }) {
  return (
    <div className="relative mb-6 last:mb-0">
      <div
        className={`absolute -left-6 top-1 w-3.5 h-3.5 rounded-full border-2 ${
          isToday ? 'bg-brand-600 border-brand-600' : 'bg-surface-card border-surface-border'
        }`}
      />
      <div className="flex items-center gap-2 mb-2">
        <p className={`text-sm font-semibold ${isToday ? 'text-brand-600 dark:text-brand-400' : 'text-ink'}`}>{label}</p>
        <span className="text-xs text-ink-faint">{items.length}</span>
      </div>
      <div className="space-y-1.5">
        {items.map(item => <AgendaCard key={item.id} item={item} />)}
      </div>
    </div>
  )
}

function AgendaCard({ item }) {
  return (
    <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border border-surface-border bg-surface-card min-w-0 ${item.done ? 'opacity-50' : ''}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${priorityDot[item.priority] || 'bg-slate-400'}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${item.done ? 'line-through text-ink-faint' : 'text-ink'}`}>{item.title}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-xs text-ink-muted min-w-0">
          {item.time && <span>{formatTime(item.time)}</span>}
          {item.company?.name && <CompanyBadge company={item.company} />}
        </div>
      </div>
      <span className={`badge flex-shrink-0 ${statusColors[item.status] || statusColors.todo}`}>{statusLabels[item.status] || item.status}</span>
    </div>
  )
}
