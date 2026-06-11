import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../App'
import ExamCountdown from '../components/ExamCountdown'
import { formatDate, formatTime, isFutureDateTime, todayStr } from '../lib/dateUtils'

export default function Timeline() {
  const { session } = useAuth()
  const userId = session.user.id

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showPast, setShowPast] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [exRes, intRes, taskRes] = await Promise.all([
        supabase.from('exams').select('id,course_name,exam_date,exam_time,difficulty,location').eq('user_id', userId),
        supabase.from('interviews').select('id,company_name,position_title,interview_date,interview_time,interview_type').eq('user_id', userId),
        supabase.from('tasks').select('id,title,due_date,due_time,category,priority,status').eq('user_id', userId),
      ])
 
      const combined = [
        ...(exRes.data || []).map(e => ({
          id:    'exam-' + e.id,
          type:  'exam',
          title: e.course_name,
          sub:   e.location || '',
          badge: e.difficulty || '',
          date:  e.exam_date,
          time:  e.exam_time,
        })),
        ...(intRes.data || []).map(i => ({
          id:    'int-' + i.id,
          type:  'interview',
          title: i.company_name,
          sub:   i.position_title || '',
          badge: i.interview_type || '',
          date:  i.interview_date,
          time:  i.interview_time,
        })),
        ...(taskRes.data || []).filter(t => t.due_date).map(t => ({
          id:    'task-' + t.id,
          type:  'task',
          title: t.title,
          sub:   t.category || '',
          badge: t.status || '',
          date:  t.due_date,
          time:  t.due_time,
          done:  t.status === 'done',
        })),
      ]
        .filter(item => item.date)
        .sort((a, b) => {
          const da = a.date + 'T' + (a.time || '00:00')
          const db = b.date + 'T' + (b.time || '00:00')
          return da.localeCompare(db)
        })

      setItems(combined)
      setLoading(false)
    }
    load()
  }, [userId])

  const today = todayStr()
  const visible = showPast ? items : items.filter(i => i.type === 'exam' ? isFutureDateTime(i.date, i.time) : i.date >= today)

  // Group by date
  const grouped = visible.reduce((acc, item) => {
    const key = item.date
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {})

  const dates = Object.keys(grouped).sort()

  const typeMeta = {
    exam:      { label: 'Exam',      bg: 'bg-brand-50',   text: 'text-brand-700',  dot: 'bg-brand-500'   },
    interview: { label: 'Interview', bg: 'bg-purple-50',  text: 'text-purple-700', dot: 'bg-purple-500'  },
    task:      { label: 'Task',      bg: 'bg-amber-50',   text: 'text-amber-700',  dot: 'bg-amber-500'   },
  }

  const badgeColors = {
    easy: 'bg-green-50 text-green-700',
    medium: 'bg-amber-50 text-amber-700',
    hard: 'bg-red-50 text-red-700',
    onsite: 'bg-teal-50 text-teal-700',
    online: 'bg-blue-50 text-blue-700',
    phone: 'bg-purple-50 text-purple-700',
    todo: 'bg-slate-100 text-slate-600',
    in_progress: 'bg-blue-50 text-blue-700',
    done: 'bg-green-50 text-green-700',
  }

  const badgeLabels = {
    in_progress: 'In Progress',
  }

  if (loading) return (
    <div className="flex justify-center py-24">
      <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-w-0 max-w-full overflow-x-hidden">
      <div className="flex flex-col min-[380px]:flex-row min-[380px]:items-center justify-between gap-3 mb-6 min-w-0">
        <div className="min-w-0">
          <h1 className="page-title">Timeline</h1>
          <p className="text-sm text-ink-muted mt-0.5">All your events in one view</p>
        </div>
        <button
          onClick={() => setShowPast(p => !p)}
          className="btn-secondary text-sm w-full min-[380px]:w-auto"
        >
          {showPast ? 'Hide Past' : 'Show Past'}
        </button>
      </div>

      {dates.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-ink-muted">{showPast ? 'Nothing here yet.' : 'No upcoming events.'}</p>
          <p className="text-sm text-ink-faint mt-1">Add exams, interviews, or tasks to see them here.</p>
        </div>
      ) : (
        <div className="space-y-8 min-w-0">
          {dates.map(date => {
            const isToday = date === today
            const isPast = date < today

            return (
              <div key={date}>
                {/* Date header */}
                <div className="flex items-center gap-3 mb-3 min-w-0">
                  <div className={`px-3 py-1 rounded-full text-sm font-semibold ${
                    isToday ? 'bg-brand-600 text-white' :
                    isPast  ? 'bg-slate-100 text-slate-500' :
                              'bg-surface border border-surface-border text-ink'
                  }`}>
                    {isToday ? 'Today' : formatDate(date)}
                  </div>
                  <div className="flex-1 h-px bg-surface-border min-w-0" />
                </div>

                {/* Items for this date */}
                <div className="space-y-2 pl-0 sm:pl-2 min-w-0">
                  {grouped[date].map(item => {
                    const meta = typeMeta[item.type]
                    return (
                      <div
                        key={item.id}
                        className={`flex items-start gap-3 p-3 sm:p-3.5 rounded-xl border border-surface-border bg-white min-w-0 ${item.done ? 'opacity-60' : ''}`}
                      >
                        {/* Dot */}
                        <div className="mt-1.5 flex-shrink-0">
                          <div className={`w-2.5 h-2.5 rounded-full ${meta.dot}`} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col min-[420px]:flex-row min-[420px]:items-start justify-between gap-2 min-w-0">
                            <p className={`font-medium text-sm min-w-0 break-words ${item.done ? 'line-through text-ink-faint' : 'text-ink'}`}>
                              {item.title}
                            </p>
                            <div className="flex gap-1 flex-shrink-0 flex-wrap min-w-0">
                              <span className={`badge ${meta.bg} ${meta.text}`}>{meta.label}</span>
                              {item.type === 'exam' && (
                                <ExamCountdown date={item.date} time={item.time} compact />
                              )}
                              {item.type === 'interview' && (
                                <ExamCountdown date={item.date} time={item.time} compact tone="purple" />
                              )}
                              {item.badge && (
                                <span className={`badge ${badgeColors[item.badge] || 'bg-slate-100 text-slate-600'} capitalize`}>
                                  {badgeLabels[item.badge] || item.badge}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 min-w-0">
                            {item.time && (
                              <span className="text-xs text-ink-muted font-medium">{formatTime(item.time)}</span>
                            )}
                            {item.sub && (
                              <span className="text-xs sm:text-sm text-ink-muted leading-snug break-words">{item.sub}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
