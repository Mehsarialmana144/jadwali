import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../App'
import ItemCard from '../components/ItemCard'
import Modal from '../components/Modal'

const EMPTY = {
  title: '', due_date: '', due_time: '', category: '', priority: 'medium',
  status: 'todo', notes: '',
}

export default function Tasks() {
  const { session } = useAuth()
  const userId = session.user.id

  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('active') // 'active' | 'all' | 'done'

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('tasks').select('*').eq('user_id', userId).order('due_date', { nullsLast: true })
    setTasks(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [userId])

  function openAdd() {
    setForm(EMPTY)
    setEditId(null)
    setError('')
    setModal('add')
  }

  function openEdit(task) {
    setForm({
      title:    task.title    || '',
      due_date: task.due_date || '',
      due_time: task.due_time || '',
      category: task.category || '',
      priority: task.priority || 'medium',
      status:   task.status   || 'todo',
      notes:    task.notes    || '',
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
      title:    form.title.trim(),
      due_date: form.due_date || null,
      due_time: form.due_time || null,
      category: form.category || null,
      priority: form.priority || 'medium',
      status:   form.status   || 'todo',
      notes:    form.notes.trim() || null,
    }

    let err
    if (modal === 'add') {
      ({ error: err } = await supabase.from('tasks').insert({ ...payload, user_id: userId }))
    } else {
      ({ error: err } = await supabase.from('tasks').update(payload).eq('id', editId).eq('user_id', userId))
    }

    if (err) { setError(err.message); setSaving(false); return }
    await load()
    closeModal()
    setSaving(false)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this task?')) return
    await supabase.from('tasks').delete().eq('id', id).eq('user_id', userId)
    await load()
  }

  async function handleStatusChange(id, status) {
    await supabase.from('tasks').update({ status }).eq('id', id).eq('user_id', userId)
    setTasks(ts => ts.map(t => t.id === id ? { ...t, status } : t))
  }

  const counts = {
    active: tasks.filter(t => t.status !== 'done').length,
    done:   tasks.filter(t => t.status === 'done').length,
    all:    tasks.length,
  }

  const visible = filter === 'active'
    ? tasks.filter(t => t.status !== 'done')
    : filter === 'done'
    ? tasks.filter(t => t.status === 'done')
    : tasks

  return (
    <div className="min-w-0 max-w-full overflow-x-hidden">
      <div className="flex flex-col min-[380px]:flex-row min-[380px]:items-center justify-between gap-3 mb-6 min-w-0">
        <div className="min-w-0">
          <h1 className="page-title">Tasks</h1>
          <p className="text-sm text-ink-muted mt-0.5">{counts.active} active · {counts.done} done</p>
        </div>
        <button onClick={openAdd} className="btn-primary w-full min-[380px]:w-auto">+ Add Task</button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-5 bg-surface border border-surface-border p-1 rounded-lg w-full min-[380px]:w-fit overflow-x-auto">
        {[['active', `Active (${counts.active})`], ['done', `Done (${counts.done})`], ['all', 'All']].map(([val, label]) => (
          <button key={val} onClick={() => setFilter(val)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${filter === val ? 'bg-white text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : visible.length === 0 ? (
        <EmptyState text={filter === 'active' ? 'No active tasks.' : filter === 'done' ? 'No completed tasks yet.' : 'No tasks yet.'} action={<button onClick={openAdd} className="btn-primary mt-3">Add Task</button>} />
      ) : (
        <div className="grid gap-3 min-w-0">
          {visible.map(task => (
            <ItemCard
              key={task.id} type="task" item={task}
              onEdit={() => openEdit(task)}
              onDelete={() => handleDelete(task.id)}
              onStatusChange={handleStatusChange}
            />
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
                  <option value="university">University</option>
                  <option value="interview">Interview</option>
                  <option value="project">Project</option>
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
              <div className="sm:col-span-2">
                <label className="label">Notes</label>
                <textarea name="notes" className="input resize-none" rows={2} placeholder="Any notes…" value={form.notes} onChange={handleChange} />
              </div>
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

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

function Spinner() {
  return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>
}
function EmptyState({ text, action }) {
  return <div className="card p-10 text-center"><p className="text-ink-muted">{text}</p>{action}</div>
}
