import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../App'
import StatCard from '../components/StatCard'
import TaskRow from '../components/TaskRow'
import { todayStr, addDays, startOfWeek } from '../lib/dateUtils'
import { useRefetchOnFocus } from '../lib/useRefetchOnFocus'

function formatDateNoYear(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(`${dateStr}T00:00:00`)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function monthKeyOf(dateStr) {
  return dateStr.slice(0, 7)
}

function buildMonthDays(monthAnchorStr) {
  const [year, month] = monthAnchorStr.split('-').map(Number)
  const totalDays = new Date(year, month, 0).getDate()
  return Array.from({ length: totalDays }, (_, index) => {
    const day = index + 1
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  })
}

function shiftMonth(monthAnchorStr, delta) {
  const [year, month] = monthAnchorStr.split('-').map(Number)
  const d = new Date(year, month - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function Dashboard() {
  const { session } = useAuth()
  const userId = session.user.id
  const name = session.user.user_metadata?.full_name || 'there'

  const [tasks, setTasks] = useState([])
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [companyFilter, setCompanyFilter] = useState('all') // 'all' | 'personal' | company id

  const today = todayStr()
  const [selectedDate, setSelectedDate] = useState(today)
  const [calendarView, setCalendarView] = useState('month') // 'month' | 'week'
  const [monthAnchor, setMonthAnchor] = useState(monthKeyOf(today)) // 'YYYY-MM'
  const [weekAnchor, setWeekAnchor] = useState(startOfWeek(today)) // 'YYYY-MM-DD' (Sunday)

  async function load() {
    setLoadError('')
    const [taskRes, companyRes] = await Promise.all([
      supabase.from('tasks').select('*, companies(name, logo_url, accent_color)').eq('user_id', userId).order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('companies').select('id,name').eq('user_id', userId).order('name'),
    ])
    if (taskRes.error) {
      setLoadError(taskRes.error.message)
      setTasks([])
    } else {
      setTasks(taskRes.data || [])
    }
    setCompanies(companyRes.data || [])
    setCompanyFilter(f => (f === 'all' || f === 'personal' || (companyRes.data || []).some(c => c.id === f)) ? f : 'all')
    setLoading(false)
  }

  useEffect(() => { load() }, [userId])
  useRefetchOnFocus(load)

  async function handleStatusChange(id, status) {
    const prev = tasks
    setTasks(ts => ts.map(t => t.id === id ? { ...t, status } : t))
    const { error: err } = await supabase.from('tasks').update({ status }).eq('id', id).eq('user_id', userId)
    if (err) {
      setTasks(prev)
      alert(`Could not update task: ${err.message}`)
    }
  }

  async function handleToggleDone(task) {
    const next = task.status === 'done' ? 'todo' : 'done'
    await handleStatusChange(task.id, next)
  }

  const currentMonthKey = monthAnchor

  const scopedTasks = tasks.filter(t => {
    if (companyFilter === 'all') return true
    if (companyFilter === 'personal') return !t.company_id
    return t.company_id === companyFilter
  })

  const dueTodayCount = scopedTasks.filter(t => t.due_date === today && t.status !== 'done').length
  const overdueCount = scopedTasks.filter(t => t.due_date && t.due_date < today && t.status !== 'done').length
  const pendingCount = scopedTasks.filter(t => t.status !== 'done').length
  const upcomingCount = scopedTasks.filter(t => t.due_date && t.due_date > today && t.status !== 'done').length

  const todaysFocus = scopedTasks
    .filter(t => (t.due_date === today || (t.due_date && t.due_date < today)) && t.status !== 'done')
    .sort((a, b) => (a.due_date + (a.due_time || '')).localeCompare(b.due_date + (b.due_time || '')))

  const upcoming = scopedTasks
    .filter(t => t.due_date && t.due_date > today && t.status !== 'done')
    .sort((a, b) => (a.due_date + (a.due_time || '')).localeCompare(b.due_date + (b.due_time || '')))
    .slice(0, 6)

  // Build a lookup of every scoped task by date (not just current month) so week view works across month boundaries.
  const itemsByDate = scopedTasks.reduce((acc, task) => {
    if (!task.due_date || task.status === 'done') return acc
    acc[task.due_date] = acc[task.due_date] || []
    acc[task.due_date].push(task)
    return acc
  }, {})

  const monthDays = buildMonthDays(monthAnchor)
  const firstDayOffset = new Date(`${monthDays[0]}T00:00:00`).getDay()
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekAnchor, i))
  const visibleDays = calendarView === 'month' ? monthDays : weekDays
  const visibleTaskCount = visibleDays.reduce((sum, d) => sum + (itemsByDate[d]?.length || 0), 0)

  const selectedItems = itemsByDate[selectedDate] || []
  const monthTitle = new Date(`${monthAnchor}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const weekTitle = `${formatDateNoYear(weekDays[0])} – ${formatDateNoYear(weekDays[6])}`

  function goPrev() {
    if (calendarView === 'month') setMonthAnchor(m => shiftMonth(m, -1))
    else setWeekAnchor(w => addDays(w, -7))
  }
  function goNext() {
    if (calendarView === 'month') setMonthAnchor(m => shiftMonth(m, 1))
    else setWeekAnchor(w => addDays(w, 7))
  }
  function goToday() {
    setMonthAnchor(monthKeyOf(today))
    setWeekAnchor(startOfWeek(today))
    setSelectedDate(today)
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const filterTabs = [
    { key: 'all', label: 'All' },
    { key: 'personal', label: 'Personal' },
    ...companies.map(c => ({ key: c.id, label: c.name })),
  ]

  if (loading) return <LoadingState />

  return (
    <div className="space-y-4 min-w-0 max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col min-[420px]:flex-row min-[420px]:items-center justify-between gap-3 min-w-0">
        <div className="min-w-0 max-w-full overflow-hidden">
          <h1 className="page-title max-w-full text-pretty">{greeting}, <span className="break-words">{name.split(' ')[0]}</span></h1>
          <p className="text-ink-muted mt-0.5 text-xs">Here's what's on your plate.</p>
        </div>
        <Link to="/tasks" state={{ openAdd: true }} className="btn-primary w-full min-[420px]:w-auto flex-shrink-0">
          + Add Task
        </Link>
      </div>

      {loadError && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">
          Couldn't load tasks: {loadError}
        </div>
      )}

      {/* Company filter */}
      {companies.length > 0 && (
        <div className="filter-bar w-full">
          {filterTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setCompanyFilter(tab.key)}
              className={`chip flex-shrink-0 ${companyFilter === tab.key ? 'chip-active' : 'chip-inactive'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 min-w-0 max-w-full">
        <StatCard label="Due Today" value={dueTodayCount} sub={dueTodayCount === 1 ? 'task' : 'tasks'} color={dueTodayCount > 0 ? 'rose' : 'green'} icon={<ClockIcon />} />
        <StatCard label="Overdue" value={overdueCount} sub={overdueCount === 1 ? 'task' : 'tasks'} color={overdueCount > 0 ? 'rose' : 'green'} icon={<AlertIcon />} />
        <StatCard label="Pending" value={pendingCount} sub="not done" color={pendingCount > 5 ? 'amber' : 'green'} icon={<CheckIcon />} />
        <StatCard label="Upcoming" value={upcomingCount} sub="ahead" color="brand" icon={<CalendarIcon />} />
      </div>

      {/* Main content + calendar sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-w-0">
        <div className="lg:col-span-2 space-y-4 min-w-0">
          {/* Today's Focus */}
          <div className="card overflow-hidden">
            <div className="px-3.5 sm:px-4 py-3 border-b border-surface-border flex items-center justify-between gap-3 min-w-0">
              <h2 className="font-semibold text-sm text-ink">Today's Focus</h2>
              <span className="text-[11px] text-ink-faint">{todaysFocus.length}</span>
            </div>
            {todaysFocus.length === 0 ? (
              <div className="empty-state">
                <p className="text-sm text-ink-muted">Nothing due today.</p>
              </div>
            ) : (
              <div className="divide-y divide-surface-border">
                {todaysFocus.map(task => (
                  <TaskRow key={task.id} task={task} onToggleDone={handleToggleDone} onStatusChange={handleStatusChange} />
                ))}
              </div>
            )}
          </div>

          {/* Upcoming */}
          <div className="card overflow-hidden">
            <div className="px-3.5 sm:px-4 py-3 border-b border-surface-border flex items-center justify-between gap-3 min-w-0">
              <h2 className="font-semibold text-sm text-ink">Upcoming</h2>
              <Link to="/timeline" className="text-xs text-brand-600 dark:text-brand-400 hover:underline font-medium whitespace-nowrap py-3 -my-3 pl-3 -ml-3">
                View timeline →
              </Link>
            </div>
            {upcoming.length === 0 ? (
              <div className="empty-state">
                <p className="text-sm text-ink-muted">Nothing coming up.</p>
              </div>
            ) : (
              <div className="divide-y divide-surface-border">
                {upcoming.map(task => (
                  <TaskRow key={task.id} task={task} onToggleDone={handleToggleDone} onStatusChange={handleStatusChange} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Calendar sidebar */}
        <div className="lg:col-span-1 min-w-0">
          <section className="card overflow-hidden lg:sticky lg:top-[4.5rem]">
            <div className="px-3.5 py-2.5 border-b border-surface-border min-w-0">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1 sm:gap-1">
                  <button onClick={goPrev} className="p-3 -m-2 sm:p-1 sm:m-0 rounded hover:bg-surface-raised text-ink-muted" aria-label="Previous">
                    <ChevronLeftIcon className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                  </button>
                  <h2 className="font-semibold text-xs text-ink whitespace-nowrap px-0.5">
                    {calendarView === 'month' ? monthTitle : weekTitle}
                  </h2>
                  <button onClick={goNext} className="p-3 -m-2 sm:p-1 sm:m-0 rounded hover:bg-surface-raised text-ink-muted" aria-label="Next">
                    <ChevronRightIcon className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                  </button>
                </div>
                <button onClick={goToday} className="text-xs sm:text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline flex-shrink-0 py-3 -my-3 pl-3 -ml-3">
                  Today
                </button>
              </div>
              <div className="filter-bar w-full">
                <button onClick={() => setCalendarView('month')} className={`chip flex-1 ${calendarView === 'month' ? 'chip-active' : 'chip-inactive'}`}>Month</button>
                <button onClick={() => setCalendarView('week')} className={`chip flex-1 ${calendarView === 'week' ? 'chip-active' : 'chip-inactive'}`}>Week</button>
              </div>
            </div>

            <div className="p-2.5">
              <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium text-ink-faint mb-1">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                  <span key={i} className="truncate">{day}</span>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-0.5">
                {calendarView === 'month' && Array.from({ length: firstDayOffset }).map((_, index) => (
                  <div key={`empty-${index}`} className="w-full aspect-square" />
                ))}
                {visibleDays.map(date => {
                  const dayItems = itemsByDate[date] || []
                  const isMarked = dayItems.length > 0
                  const isSelected = date === selectedDate
                  const isToday = date === today

                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => setSelectedDate(date)}
                      className={`w-full aspect-square rounded text-xs font-medium flex flex-col items-center justify-center gap-px transition-colors min-w-0 ${
                        isSelected
                          ? 'bg-brand-600 text-white'
                          : isToday
                            ? 'bg-brand-600/10 text-brand-600 dark:text-brand-400'
                            : 'text-ink hover:bg-surface-raised'
                      }`}
                      aria-label={`${formatDateNoYear(date)}${isMarked ? `, ${dayItems.length} item${dayItems.length === 1 ? '' : 's'}` : ''}`}
                    >
                      <span>{Number(date.slice(-2))}</span>
                      {isMarked && (
                        <span className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-brand-500'}`} />
                      )}
                    </button>
                  )
                })}
              </div>

              <p className="text-[10px] text-ink-faint mt-1.5 px-0.5">{visibleTaskCount} task{visibleTaskCount === 1 ? '' : 's'} this {calendarView}</p>

              <div className="mt-2 rounded-lg bg-surface-raised px-2.5 py-2 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <p className="text-xs font-medium text-ink min-w-0">{formatDateNoYear(selectedDate)}</p>
                </div>

                {selectedItems.length === 0 ? (
                  <p className="text-xs text-ink-muted">No tasks.</p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedItems.map(task => (
                      <p key={task.id} className="text-xs text-ink truncate">{task.title}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="flex flex-col items-center gap-3">
        <div className="w-7 h-7 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-ink-muted">Loading dashboard…</p>
      </div>
    </div>
  )
}

function ClockIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
function AlertIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  )
}
function CheckIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  )
}
function CalendarIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}
function ChevronLeftIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  )
}
function ChevronRightIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}
