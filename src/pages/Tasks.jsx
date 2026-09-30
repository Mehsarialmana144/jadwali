import { useState, useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../App'
import TaskRow from '../components/TaskRow'
import CompanyBadge from '../components/CompanyBadge'
import Modal from '../components/Modal'
import Switch from '../components/Switch'
import { todayStr, addDays, relativeDate, formatTime } from '../lib/dateUtils'
import { useRefetchOnFocus } from '../lib/useRefetchOnFocus'

const EMPTY = {
  title: '', due_date: '', due_time: '', category: '', priority: 'medium',
  status: 'todo', notes: '', company_id: '',
  remind_before: false, remind_minutes: '15', notify_at_time: false,
}

// How long before a task the "remind me before" notification is sent
const REMIND_LEADS = [
  [5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'], [30, '30 minutes'],
  [60, '1 hour'], [120, '2 hours'], [1440, '1 day'],
]

// Tasks with a date but no time count as 09:00 (same rule as the server)
const notifyMoment = (date, time) => new Date(`${date}T${(time || '09:00').slice(0, 5)}:00`).getTime()

const VIEW_STORAGE_KEY = 'jadwali-tasks-view'

const COLUMNS = [
  { key: 'todo', label: 'To Do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'done', label: 'Done' },
]

export default function Tasks() {
  const { session } = useAuth()
  const userId = session.user.id
  const location = useLocation()
  const navigate = useNavigate()

  const [tasks, setTasks] = useState([])
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [view, setView] = useState(() => {
    try { return localStorage.getItem(VIEW_STORAGE_KEY) || 'list' } catch { return 'list' }
  })
  const [statusFilter, setStatusFilter] = useState('active') // 'active' | 'all' | 'done'
  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [dueFilter, setDueFilter] = useState('all') // 'all' | 'overdue' | 'today' | 'week' | 'none'
  const [dragOverColumn, setDragOverColumn] = useState(null)

  useEffect(() => {
    try { localStorage.setItem(VIEW_STORAGE_KEY, view) } catch { /* ignore */ }
  }, [view])

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

  useEffect(() => {
    if (location.state?.openAdd) {
      openAdd()
      navigate(location.pathname, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  function openAdd() {
    setForm(EMPTY)
    setEditId(null)
    setError('')
    setModal('add')
  }

  function openEdit(task) {
    setForm({
      title:      task.title      || '',
      due_date:   task.due_date   || '',
      due_time:   task.due_time   || '',
      category:   task.category   || '',
      priority:   task.priority   || 'medium',
      status:     task.status     || 'todo',
      notes:      task.notes      || '',
      company_id: task.company_id || '',
      remind_before:  task.remind_before_minutes != null,
      remind_minutes: String(task.remind_before_minutes ?? 15),
      notify_at_time: !!task.notify_at_time,
    })
    setEditId(task.id)
    setError('')
    setModal('edit')
  }

  function closeModal() { setModal(null); setError('') }
  function handleChange(e) { setForm(f => ({ ...f, [e.target.name]: e.target.value })) }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.title.trim()) { setError('Task title is required.'); return }
    setSaving(true)
    setError('')

    const payload = {
      title:      form.title.trim(),
      due_date:   form.due_date || null,
      due_time:   form.due_time || null,
      category:   form.category || null,
      priority:   form.priority || 'medium',
      status:     form.status   || 'todo',
      notes:      form.notes.trim() || null,
      company_id: form.company_id || null,
      remind_before_minutes: form.due_date && form.remind_before ? Number(form.remind_minutes) : null,
      notify_at_time:        !!(form.due_date && form.notify_at_time),
    }

    const save = body => (modal === 'add'
      ? supabase.from('tasks').insert({ ...body, user_id: userId })
      : supabase.from('tasks').update(body).eq('id', editId).eq('user_id', userId))

    let { error: err } = await save(payload)
    if (err && /remind_before_minutes|notify_at_time/.test(err.message) && payload.remind_before_minutes === null && !payload.notify_at_time) {
      // Database not migrated yet (new columns missing): still let the task save.
      const { remind_before_minutes, notify_at_time, ...withoutNotify } = payload
      ;({ error: err } = await save(withoutNotify))
    }

    if (err) { setError(err.message); setSaving(false); return }
    await load()
    closeModal()
    setSaving(false)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this task?')) return
    const { error: err } = await supabase.from('tasks').delete().eq('id', id).eq('user_id', userId)
    if (err) { alert(`Could not delete task: ${err.message}`); return }
    await load()
  }

  async function handleStatusChange(id, status) {
    const prev = tasks
    setTasks(ts => ts.map(t => t.id === id ? { ...t, status } : t))
    const { error: err } = await supabase.from('tasks').update({ status }).eq('id', id).eq('user_id', userId)
    if (err) {
      setTasks(prev)
      alert(`Could not update task: ${err.message}`)
    }
  }

  const today = todayStr()
  const weekEnd = addDays(today, 6)

  const counts = {
    active: tasks.filter(t => t.status !== 'done').length,
    done:   tasks.filter(t => t.status === 'done').length,
    all:    tasks.length,
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tasks.filter(t => {
      if (view === 'list' && statusFilter === 'active' && t.status === 'done') return false
      if (view === 'list' && statusFilter === 'done' && t.status !== 'done') return false
      if (q && !t.title.toLowerCase().includes(q)) return false
      if (companyFilter === 'personal' && t.company_id) return false
      if (companyFilter !== 'all' && companyFilter !== 'personal' && t.company_id !== companyFilter) return false
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false
      if (dueFilter === 'overdue' && !(t.due_date && t.due_date < today && t.status !== 'done')) return false
      if (dueFilter === 'today' && t.due_date !== today) return false
      if (dueFilter === 'week' && !(t.due_date && t.due_date >= today && t.due_date <= weekEnd)) return false
      if (dueFilter === 'none' && t.due_date) return false
      return true
    })
  }, [tasks, view, statusFilter, search, companyFilter, priorityFilter, dueFilter, today, weekEnd])

  const groups = useMemo(() => {
    const overdue = [], todayG = [], thisWeek = [], later = [], noDate = []
    for (const t of filtered) {
      if (!t.due_date) { noDate.push(t); continue }
      if (t.due_date < today) { (t.status !== 'done' ? overdue : todayG).push(t); continue }
      if (t.due_date === today) { todayG.push(t); continue }
      if (t.due_date <= weekEnd) { thisWeek.push(t); continue }
      later.push(t)
    }
    const sortByDate = arr => [...arr].sort((a, b) => (a.due_date + (a.due_time || '')).localeCompare(b.due_date + (b.due_time || '')))
    return [
      { label: 'Overdue', items: sortByDate(overdue), accent: true },
      { label: 'Today', items: sortByDate(todayG) },
      { label: 'This Week', items: sortByDate(thisWeek) },
      { label: 'Later', items: sortByDate(later) },
      { label: 'No Due Date', items: noDate },
    ].filter(g => g.items.length > 0)
  }, [filtered, today, weekEnd])

  const board = useMemo(() => {
    const map = { todo: [], in_progress: [], done: [] }
    for (const t of filtered) {
      (map[t.status] || map.todo).push(t)
    }
    return map
  }, [filtered])

  const hasActiveFilters = search || companyFilter !== 'all' || priorityFilter !== 'all' || dueFilter !== 'all'

  function handleDrop(e, columnKey) {
    e.preventDefault()
    setDragOverColumn(null)
    const taskId = e.dataTransfer.getData('text/plain')
    const task = tasks.find(t => t.id === taskId)
    if (task && task.status !== columnKey) handleStatusChange(taskId, columnKey)
  }

  return (
    <div className="min-w-0 max-w-full overflow-x-hidden">
      <div className="flex flex-col min-[380px]:flex-row min-[380px]:items-center justify-between gap-3 mb-4 min-w-0">
        <div className="min-w-0">
          <h1 className="page-title">Tasks</h1>
          <p className="text-xs text-ink-muted mt-0.5">{counts.active} active · {counts.done} done</p>
        </div>
        <button onClick={openAdd} className="btn-primary w-full min-[380px]:w-auto">+ Add Task</button>
      </div>

      {loadError && (
        <div className="mb-3 text-sm text-red-600 dark:text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">
          Couldn't load tasks: {loadError}
        </div>
      )}

      {/* View switch + status tabs + search */}
      <div className="flex flex-col sm:flex-row gap-2 mb-2.5 min-w-0">
        <div className="filter-bar w-fit">
          <button onClick={() => setView('list')} className={`chip ${view === 'list' ? 'chip-active' : 'chip-inactive'}`}>List</button>
          <button onClick={() => setView('board')} className={`chip ${view === 'board' ? 'chip-active' : 'chip-inactive'}`}>Board</button>
        </div>
        {view === 'list' && (
          <div className="filter-bar w-full sm:w-fit">
            {[['active', `Active (${counts.active})`], ['done', `Done (${counts.done})`], ['all', 'All']].map(([val, label]) => (
              <button key={val} onClick={() => setStatusFilter(val)} className={`chip flex-1 sm:flex-none ${statusFilter === val ? 'chip-active' : 'chip-inactive'}`}>
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="relative flex-1 min-w-0">
          <SearchIcon className="w-4 h-4 text-ink-faint absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tasks…"
            className="input pl-8 py-1.5 text-sm"
          />
        </div>
      </div>

      {/* Lightweight filters */}
      <div className="flex flex-wrap items-center gap-1.5 mb-4 min-w-0">
        <select value={companyFilter} onChange={e => setCompanyFilter(e.target.value)} className="input w-auto text-xs py-1.5 px-2.5">
          <option value="all">All companies</option>
          <option value="personal">Personal</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} className="input w-auto text-xs py-1.5 px-2.5">
          <option value="all">Any priority</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <div className="filter-bar">
          {[['all', 'Any date'], ['overdue', 'Overdue'], ['today', 'Today'], ['week', 'This week'], ['none', 'No date']].map(([val, label]) => (
            <button key={val} onClick={() => setDueFilter(val)} className={`chip ${dueFilter === val ? 'chip-active' : 'chip-inactive'}`}>
              {label}
            </button>
          ))}
        </div>
        {hasActiveFilters && (
          <button
            onClick={() => { setSearch(''); setCompanyFilter('all'); setPriorityFilter('all'); setDueFilter('all') }}
            className="text-xs text-ink-faint hover:text-ink-muted px-1"
          >
            Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <Spinner />
      ) : view === 'list' ? (
        groups.length === 0 ? (
          <EmptyState
            text={hasActiveFilters ? 'No tasks match your filters.' : statusFilter === 'active' ? 'No active tasks.' : statusFilter === 'done' ? 'No completed tasks yet.' : 'No tasks yet.'}
            action={!hasActiveFilters && <button onClick={openAdd} className="btn-primary mt-2">Add Task</button>}
          />
        ) : (
          <div className="space-y-4 min-w-0">
            {groups.map(group => (
              <div key={group.label} className="min-w-0">
                <div className="flex items-center gap-2 mb-1 px-1">
                  <p className={`section-label ${group.accent ? 'text-red-500' : ''}`}>{group.label}</p>
                  <span className="text-[11px] text-ink-faint">{group.items.length}</span>
                </div>
                <div className="card divide-y divide-surface-border overflow-hidden">
                  {group.items.map(task => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      onStatusChange={handleStatusChange}
                      onEdit={openEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 min-w-0">
          {COLUMNS.map(col => (
            <div
              key={col.key}
              onDragOver={e => { e.preventDefault(); setDragOverColumn(col.key) }}
              onDragLeave={() => setDragOverColumn(prev => (prev === col.key ? null : prev))}
              onDrop={e => handleDrop(e, col.key)}
              className={`rounded-xl min-w-0 transition-colors ${dragOverColumn === col.key ? 'bg-brand-600/5 ring-2 ring-brand-500/40' : ''}`}
            >
              <div className="flex items-center gap-2 mb-2 px-1">
                <p className="section-label">{col.label}</p>
                <span className="text-[11px] text-ink-faint">{board[col.key].length}</span>
              </div>
              <div className="space-y-2 min-h-[60px]">
                {board[col.key].length === 0 ? (
                  <div className="card empty-state py-6">
                    <p className="text-xs text-ink-faint">No tasks</p>
                  </div>
                ) : (
                  board[col.key].map(task => (
                    <KanbanCard
                      key={task.id}
                      task={task}
                      onEdit={() => openEdit(task)}
                      onDelete={() => handleDelete(task.id)}
                    />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <Modal title={modal === 'add' ? 'Add Task' : 'Edit Task'} onClose={closeModal}>
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="label">Title *</label>
                <input name="title" className="input" placeholder="Task title" value={form.title} onChange={handleChange} required />
              </div>

              <div className="sm:col-span-2">
                <label className="label">Company</label>
                <select name="company_id" className="input" value={form.company_id} onChange={handleChange}>
                  <option value="">Personal (no company)</option>
                  {companies.map(company => (
                    <option key={company.id} value={company.id}>{company.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Due Date</label>
                <input name="due_date" type="date" className="input" value={form.due_date} onChange={handleChange} />
              </div>
              <div>
                <label className="label">Due Time</label>
                <input name="due_time" type="time" className="input" value={form.due_time} onChange={handleChange} />
              </div>
              <div>
                <label className="label">Category</label>
                <select name="category" className="input" value={form.category} onChange={handleChange}>
                  <option value="">Select…</option>
                  <option value="project">Project</option>
                  <option value="university">University</option>
                  <option value="interview">Interview</option>
                  <option value="personal">Personal</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="label">Priority</label>
                <select name="priority" className="input" value={form.priority} onChange={handleChange}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label">Status</label>
                <select name="status" className="input" value={form.status} onChange={handleChange}>
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="done">Done</option>
                </select>
              </div>
              <NotificationsBlock form={form} setForm={setForm} handleChange={handleChange} />
              <div className="sm:col-span-2">
                <label className="label">Notes</label>
                <textarea name="notes" className="input resize-none" rows={2} placeholder="Any notes…" value={form.notes} onChange={handleChange} />
              </div>
            </div>

            {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>}

            <div className="flex flex-col min-[380px]:flex-row gap-2 justify-end pt-1">
              <button type="button" onClick={closeModal} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

const priorityDot = {
  low:    'bg-slate-400',
  medium: 'bg-amber-500',
  high:   'bg-red-500',
}

function KanbanCard({ task, onEdit, onDelete }) {
  const isOverdue = task.due_date && task.status !== 'done' && task.due_date < todayStr()

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData('text/plain', task.id); e.dataTransfer.effectAllowed = 'move' }}
      className="card card-hover p-2.5 cursor-grab active:cursor-grabbing min-w-0"
    >
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${priorityDot[task.priority] || 'bg-slate-400'}`} />
          <p className="text-sm font-medium text-ink break-words min-w-0">{task.title}</p>
        </div>
        <button onClick={onEdit} className="p-3 -m-2 sm:p-1 sm:m-0 rounded hover:bg-surface-raised text-ink-faint hover:text-ink flex-shrink-0" aria-label="Edit task">
          <EditIcon className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-xs min-w-0">
        {task.due_date && (
          <span className={isOverdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-ink-muted'}>
            {relativeDate(task.due_date)}{task.due_time ? ` · ${formatTime(task.due_time)}` : ''}
          </span>
        )}
        {task.companies?.name && <CompanyBadge company={task.companies} className="text-ink-muted" />}
      </div>
      <button onClick={onDelete} className="text-xs sm:text-[11px] text-ink-faint hover:text-red-600 dark:hover:text-red-400 mt-0.5 sm:mt-1.5 py-2.5 sm:py-0 -mb-2 sm:mb-0 pr-6 sm:pr-0">
        Delete
      </button>
    </div>
  )
}

function Spinner() {
  return <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>
}
function EmptyState({ text, action }) {
  return <div className="card empty-state"><p className="text-sm text-ink-muted">{text}</p>{action}</div>
}
function SearchIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  )
}
function EditIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
    </svg>
  )
}

function NotificationsBlock({ form, setForm, handleChange }) {
  const hasDate = !!form.due_date
  const dueMs = hasDate ? notifyMoment(form.due_date, form.due_time) : null
  const minutes = Number(form.remind_minutes)
  const leads = REMIND_LEADS.some(([m]) => m === minutes) ? REMIND_LEADS : [...REMIND_LEADS, [minutes, `${minutes} minutes`]]
  const beforeOn = hasDate && form.remind_before
  const atOn = hasDate && form.notify_at_time
  // a notification whose moment is already in the past when you save is skipped by the server
  const beforePassed = beforeOn && dueMs - minutes * 60_000 <= Date.now()
  const atPassed = atOn && dueMs <= Date.now()
  const warn = 'text-[11px] text-amber-700 dark:text-amber-400 mt-1'

  return (
    <div className="sm:col-span-2 rounded-xl border border-surface-border p-3 space-y-3">
      <p className="label !mb-0">Notifications</p>

      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-ink">Remind me before</p>
          <Switch label="Remind me before" checked={beforeOn} disabled={!hasDate} onChange={v => setForm(f => ({ ...f, remind_before: v }))} />
        </div>
        {beforeOn && (
          <div className="mt-2">
            <label className="label" htmlFor="remind_minutes">How long before</label>
            <select id="remind_minutes" name="remind_minutes" className="input" value={form.remind_minutes} onChange={handleChange}>
              {leads.map(([m, label]) => <option key={m} value={m}>{label}</option>)}
            </select>
            {beforePassed && <p className={warn}>That moment has already passed, so no reminder will be sent.</p>}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-ink">Notify me at task time</p>
          <Switch label="Notify me at task time" checked={atOn} disabled={!hasDate} onChange={v => setForm(f => ({ ...f, notify_at_time: v }))} />
        </div>
        {atPassed && <p className={warn}>That time has already passed, so no notification will be sent.</p>}
      </div>

      <p className="text-[11px] text-ink-faint">
        {!hasDate
          ? 'Set a due date to turn on notifications.'
          : form.due_time
            ? 'Sent as a push notification to your devices with notifications turned on.'
            : 'No due time set, so this task counts as 9:00 AM.'}
      </p>
    </div>
  )
}
