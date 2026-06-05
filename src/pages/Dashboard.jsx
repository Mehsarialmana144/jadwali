import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../App'
import StatCard from '../components/StatCard'
import { formatTime, todayStr } from '../lib/dateUtils'

function dateTimeValue(date, time) {
  return `${date || ''}T${time || '00:00'}`
}


function shortDateTime(date, time) {
  if (!date) return ''
  return [formatDateNoYear(date), time ? formatTime(time) : ''].filter(Boolean).join(' · ')
}

function interviewMainValue(interview) {
  if (!interview) return 'None'
  return interview.company_name || interview.position_title || 'Interview'
}

function formatDateNoYear(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(`${dateStr}T00:00:00`)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function monthKey(date) {
  return date.toISOString().slice(0, 7)
}

function buildMonthDays(date) {
  const year = date.getFullYear()
  const month = date.getMonth()
  const totalDays = new Date(year, month + 1, 0).getDate()
  return Array.from({ length: totalDays }, (_, index) => {
    const day = index + 1
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  })
}

function itemLabel(item) {
  if (item.type === 'exam') return item.sub || item.title || 'Exam'
  return item.title || item.sub || item.type
}

export default function Dashboard() {
  const { session } = useAuth()
  const userId = session.user.id
  const name = session.user.user_metadata?.full_name || 'Student'

  const [data, setData] = useState({ exams: [], interviews: [], tasks: [] })
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(todayStr())

  useEffect(() => {
    async function load() {
      const [exRes, intRes, taskRes] = await Promise.all([
        supabase.from('exams').select('*').eq('user_id', userId).order('exam_date'),
        supabase.from('interviews').select('*').eq('user_id', userId).order('interview_date'),
        supabase.from('tasks').select('*').eq('user_id', userId).order('due_date'),
      ])
      setData({
        exams:      exRes.data || [],
        interviews: intRes.data || [],
        tasks:      taskRes.data || [],
      })
      setLoading(false)
    }
    load()
  }, [userId])

  const today = todayStr()
  const currentMonth = new Date()
  const currentMonthKey = monthKey(currentMonth)

  // Next exam (future or today)
  const nextExam = data.exams
    .filter(e => e.exam_date >= today)
    .sort((a, b) => dateTimeValue(a.exam_date, a.exam_time).localeCompare(dateTimeValue(b.exam_date, b.exam_time)))[0]

  // Next interview
  const nextInterview = data.interviews
    .filter(i => i.interview_date >= today)
    .sort((a, b) => dateTimeValue(a.interview_date, a.interview_time).localeCompare(dateTimeValue(b.interview_date, b.interview_time)))[0]

  // Tasks due today
  const dueTodayCount = data.tasks.filter(
    t => t.due_date === today && t.status !== 'done'
  ).length

  // Pending tasks total
  const pendingCount = data.tasks.filter(t => t.status !== 'done').length

  // Upcoming items (next 5, combined)
  const upcoming = [
    ...data.exams.filter(e => e.exam_date >= today).map(e => ({
      type: 'exam', date: e.exam_date, time: e.exam_time,
      title: e.course_name, sub: e.course_code, id: e.id,
    })),
    ...data.interviews.filter(i => i.interview_date >= today).map(i => ({
      type: 'interview', date: i.interview_date, time: i.interview_time,
      title: i.company_name, sub: i.position_title, id: i.id,
    })),
    ...data.tasks.filter(t => t.due_date && t.due_date >= today && t.status !== 'done').map(t => ({
      type: 'task', date: t.due_date, time: t.due_time,
      title: t.title, sub: t.category, id: t.id,
    })),
  ]
    .sort((a, b) => {
      return dateTimeValue(a.date, a.time).localeCompare(dateTimeValue(b.date, b.time))
    })
    .slice(0, 5)

  const calendarItems = [
    ...data.exams.filter(e => e.exam_date?.startsWith(currentMonthKey)).map(e => ({
      type: 'exam', date: e.exam_date, time: e.exam_time,
      title: e.course_name, sub: e.course_code, id: e.id,
    })),
    ...data.interviews.filter(i => i.interview_date?.startsWith(currentMonthKey)).map(i => ({
      type: 'interview', date: i.interview_date, time: i.interview_time,
      title: i.company_name, sub: i.position_title, id: i.id,
    })),
    ...data.tasks.filter(t => t.due_date?.startsWith(currentMonthKey) && t.status !== 'done').map(t => ({
      type: 'task', date: t.due_date, time: t.due_time,
      title: t.title, sub: t.category, id: t.id,
    })),
  ].sort((a, b) => dateTimeValue(a.date, a.time).localeCompare(dateTimeValue(b.date, b.time)))

  const itemsByDate = calendarItems.reduce((acc, item) => {
    acc[item.date] = acc[item.date] || []
    acc[item.date].push(item)
    return acc
  }, {})

  const monthDays = buildMonthDays(currentMonth)
  const firstDayOffset = new Date(`${monthDays[0]}T00:00:00`).getDay()
  const selectedItems = itemsByDate[selectedDate] || []
  const monthTitle = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const typeBadge = {
    exam:      'bg-brand-50 text-brand-700',
    interview: 'bg-purple-50 text-purple-700',
    task:      'bg-amber-50 text-amber-700',
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  if (loading) return <LoadingState />

  return (
    <div className="space-y-5 sm:space-y-6 min-w-0 max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="min-w-0 max-w-full overflow-hidden">
        <h1 className="page-title max-w-full text-pretty">{greeting}, <span className="break-words">{name.split(' ')[0]}</span> 👋</h1>
        <p className="text-ink-muted mt-1 text-sm">Here's what's coming up for you.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 min-w-0 max-w-full">
        <StatCard
          label="Next Exam"
          value={nextExam ? (nextExam.course_code || nextExam.course_name || 'Exam') : 'None'}
          sub={nextExam ? shortDateTime(nextExam.exam_date, nextExam.exam_time) : 'No upcoming exams'}
          color="brand"
          icon={<BookIcon />}
        />
        <StatCard
          label="Next Interview"
          value={interviewMainValue(nextInterview)}
          sub={nextInterview ? shortDateTime(nextInterview.interview_date, nextInterview.interview_time) : 'No upcoming interviews'}
          color="purple"
          icon={<BriefcaseIcon />}
        />
        <StatCard
          label="Due Today"
          value={dueTodayCount}
          sub={dueTodayCount === 1 ? 'task pending' : 'tasks pending'}
          color={dueTodayCount > 0 ? 'rose' : 'green'}
          icon={<ClockIcon />}
        />
        <StatCard
          label="Pending Tasks"
          value={pendingCount}
          sub="total not done"
          color={pendingCount > 5 ? 'amber' : 'green'}
          icon={<CheckIcon />}
        />
      </div>

      {/* Calendar */}
      <section className="card overflow-hidden max-w-full">
        <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-surface-border">
          <h2 className="font-semibold text-ink">Current Month</h2>
          <p className="text-xs text-ink-faint mt-0.5">{monthTitle}</p>
        </div>

        <div className="p-2 sm:p-5 max-w-full overflow-hidden">
          <div className="grid grid-cols-7 gap-px sm:gap-1 text-center text-[9px] min-[390px]:text-[10px] sm:text-[11px] font-medium text-ink-faint mb-1.5 sm:mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <span key={day} className="truncate">{day}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-px sm:gap-1 max-w-full">
            {Array.from({ length: firstDayOffset }).map((_, index) => (
              <div key={`empty-${index}`} className="h-7 min-[390px]:h-8 sm:aspect-square" />
            ))}
            {monthDays.map(date => {
              const dayItems = itemsByDate[date] || []
              const isMarked = dayItems.length > 0
              const isSelected = date === selectedDate
              const isToday = date === today

              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => setSelectedDate(date)}
                  className={`h-7 min-[390px]:h-8 sm:aspect-square rounded sm:rounded-lg border text-[11px] sm:text-sm font-medium flex flex-col items-center justify-center gap-px sm:gap-0.5 transition-colors min-w-0 ${
                    isSelected
                      ? 'bg-brand-600 text-white border-brand-600'
                      : isToday
                        ? 'bg-brand-50 text-brand-700 border-brand-200'
                        : 'bg-white text-ink border-surface-border hover:bg-surface'
                  }`}
                  aria-label={`${formatDateNoYear(date)}${isMarked ? `, ${dayItems.length} item${dayItems.length === 1 ? '' : 's'}` : ''}`}
                >
                  <span>{Number(date.slice(-2))}</span>
                  {isMarked && (
                    <span className={`w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-brand-500'}`} />
                  )}
                </button>
              )
            })}
          </div>

          <div className="mt-3 sm:mt-4 rounded-xl bg-surface px-3 py-2.5 sm:py-3 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <p className="text-sm font-medium text-ink min-w-0">{formatDateNoYear(selectedDate)}</p>
              {selectedItems.length > 0 && (
                <p className="text-xs text-ink-faint">{selectedItems.length} item{selectedItems.length === 1 ? '' : 's'}</p>
              )}
            </div>

            {selectedItems.length === 0 ? (
              <p className="text-sm text-ink-muted">No items for this day.</p>
            ) : (
              <div className="space-y-2">
                {selectedItems.map(item => (
                  <div key={`${item.type}-${item.id}`} className="flex flex-col min-[380px]:flex-row min-[380px]:items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`badge ${typeBadge[item.type]} capitalize`}>{item.type}</span>
                        <p className="text-sm font-medium text-ink break-words">{itemLabel(item)}</p>
                      </div>
                      {item.type === 'exam' && item.title && <p className="text-xs text-ink-faint mt-0.5 break-words">{item.title}</p>}
                      {item.type !== 'exam' && item.sub && <p className="text-xs text-ink-faint mt-0.5 break-words">{item.sub}</p>}
                    </div>
                    {item.time && <p className="text-xs text-ink-faint flex-shrink-0 min-[380px]:mt-1">{formatTime(item.time)}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 min-w-0">
        {[
          { to: '/tasks', label: 'Add Task', color: 'amber' },
          { to: '/interviews', label: 'Add Interview', color: 'purple' },
          { to: '/exams', label: 'Add Exam', color: 'brand' },
        ].map(({ to, label, color }) => (
          <Link
            key={to}
            to={to}
            className={`card p-3 text-center text-sm font-medium transition-shadow hover:shadow-md ${
              color === 'brand' ? 'text-brand-700' :
              color === 'purple' ? 'text-purple-700' : 'text-amber-700'
            }`}
          >
            + {label}
          </Link>
        ))}
      </div>

      {/* Upcoming */}
      <div className="card overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-surface-border flex items-center justify-between gap-3 min-w-0">
          <h2 className="font-semibold text-ink">Upcoming</h2>
          <Link to="/timeline" className="text-sm text-brand-600 hover:text-brand-700 font-medium whitespace-nowrap">
            View all →
          </Link>
        </div>

        {upcoming.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-ink-muted">Nothing coming up.</p>
            <p className="text-sm text-ink-faint mt-1">Add exams, interviews, or tasks to get started.</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-border">
            {upcoming.map(item => (
              <div key={item.type + item.id} className="px-4 sm:px-5 py-4 flex flex-col min-[420px]:flex-row min-[420px]:items-start gap-2 min-w-0">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className={`badge ${typeBadge[item.type]} capitalize flex-shrink-0`}>
                      {item.type}
                    </span>
                    <p className="text-sm font-medium text-ink leading-snug break-words">{item.title || item.sub || item.type}</p>
                  </div>
                  {item.sub && <p className="text-xs text-ink-faint leading-snug break-words mt-1 pl-0.5">{item.sub}</p>}
                </div>
                <div className="text-left min-[420px]:text-right flex-shrink-0 min-[420px]:w-[84px]">
                  <p className="text-xs sm:text-sm font-medium text-ink leading-snug">{formatDateNoYear(item.date)}</p>
                  {item.time && <p className="text-xs text-ink-faint">{formatTime(item.time)}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
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

function BookIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  )
}
function BriefcaseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2zM16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
    </svg>
  )
}
function ClockIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
function CheckIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  )
}
