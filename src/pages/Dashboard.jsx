import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../App'
import StatCard from '../components/StatCard'
import { relativeDate, formatTime, todayStr, isFutureOrToday } from '../lib/dateUtils'

export default function Dashboard() {
  const { session } = useAuth()
  const userId = session.user.id
  const name = session.user.user_metadata?.full_name || 'Student'

  const [data, setData] = useState({ exams: [], interviews: [], tasks: [] })
  const [loading, setLoading] = useState(true)

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

  // Next exam (future or today)
  const nextExam = data.exams
    .filter(e => e.exam_date >= today)
    .sort((a, b) => a.exam_date.localeCompare(b.exam_date))[0]

  // Next interview
  const nextInterview = data.interviews
    .filter(i => i.interview_date >= today)
    .sort((a, b) => a.interview_date.localeCompare(b.interview_date))[0]

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
      const da = a.date + 'T' + (a.time || '00:00')
      const db = b.date + 'T' + (b.time || '00:00')
      return da.localeCompare(db)
    })
    .slice(0, 5)

  const typeBadge = {
    exam:      'bg-brand-50 text-brand-700',
    interview: 'bg-purple-50 text-purple-700',
    task:      'bg-amber-50 text-amber-700',
  }

  const typeLink = { exam: '/exams', interview: '/interviews', task: '/tasks' }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  if (loading) return <LoadingState />

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="page-title">{greeting}, {name.split(' ')[0]} 👋</h1>
        <p className="text-ink-muted mt-1 text-sm">Here's what's coming up for you.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Next Exam"
          value={nextExam ? relativeDate(nextExam.exam_date) : 'None'}
          sub={nextExam ? nextExam.course_name : 'No upcoming exams'}
          color="brand"
          icon={<BookIcon />}
        />
        <StatCard
          label="Next Interview"
          value={nextInterview ? relativeDate(nextInterview.interview_date) : 'None'}
          sub={nextInterview ? nextInterview.company_name : 'No upcoming interviews'}
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

      {/* Upcoming */}
      <div className="card">
        <div className="px-5 py-4 border-b border-surface-border flex items-center justify-between">
          <h2 className="font-semibold text-ink">Upcoming</h2>
          <Link to="/timeline" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
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
              <div key={item.type + item.id} className="px-5 py-3.5 flex items-center gap-3">
                <span className={`badge ${typeBadge[item.type]} capitalize flex-shrink-0`}>
                  {item.type}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{item.title}</p>
                  {item.sub && <p className="text-xs text-ink-faint truncate">{item.sub}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-medium text-ink">{relativeDate(item.date)}</p>
                  {item.time && <p className="text-xs text-ink-faint">{formatTime(item.time)}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-3 gap-3 mt-4">
        {[
          { to: '/exams', label: 'Add Exam', color: 'brand' },
          { to: '/interviews', label: 'Add Interview', color: 'purple' },
          { to: '/tasks', label: 'Add Task', color: 'amber' },
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
