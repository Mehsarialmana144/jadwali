import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../App'
import ItemCard from '../components/ItemCard'
import Modal from '../components/Modal'
import { todayStr } from '../lib/dateUtils'

const EMPTY = {
  course_name: '', course_code: '', exam_date: '', exam_time: '',
  location: '', difficulty: '', study_topics: '', notes: '',
}

export default function Exams() {
  const { session } = useAuth()
  const userId = session.user.id

  const [exams, setExams] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // null | 'add' | 'edit'
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('upcoming') // 'upcoming' | 'all'

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('exams').select('*').eq('user_id', userId).order('exam_date')
    setExams(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [userId])

  function openAdd() {
    setForm({ ...EMPTY, exam_date: todayStr() })
    setEditId(null)
    setError('')
    setModal('add')
  }

  function openEdit(exam) {
    setForm({
      course_name: exam.course_name || '',
      course_code: exam.course_code || '',
      exam_date:   exam.exam_date   || '',
      exam_time:   exam.exam_time   || '',
      location:    exam.location    || '',
      difficulty:  exam.difficulty  || '',
      study_topics:exam.study_topics|| '',
      notes:       exam.notes       || '',
    })
    setEditId(exam.id)
    setError('')
    setModal('edit')
  }

  function closeModal() {
    setModal(null)
    setError('')
  }

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.course_name.trim()) { setError('Course name is required.'); return }
    if (!form.exam_date)          { setError('Exam date is required.'); return }
    setSaving(true)
    setError('')

    const payload = {
      course_name:  form.course_name.trim(),
      course_code:  form.course_code.trim() || null,
      exam_date:    form.exam_date,
      exam_time:    form.exam_time || null,
      location:     form.location.trim() || null,
      difficulty:   form.difficulty || null,
      study_topics: form.study_topics.trim() || null,
      notes:        form.notes.trim() || null,
    }

    let err
    if (modal === 'add') {
      ({ error: err } = await supabase.from('exams').insert({ ...payload, user_id: userId }))
    } else {
      ({ error: err } = await supabase.from('exams').update(payload).eq('id', editId).eq('user_id', userId))
    }

    if (err) { setError(err.message); setSaving(false); return }
    await load()
    closeModal()
    setSaving(false)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this exam?')) return
    await supabase.from('exams').delete().eq('id', id).eq('user_id', userId)
    await load()
  }

  const today = todayStr()
  const visible = filter === 'upcoming'
    ? exams.filter(e => e.exam_date >= today)
    : exams

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col min-[380px]:flex-row min-[380px]:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="page-title">Exams</h1>
          <p className="text-sm text-ink-muted mt-0.5">{exams.length} total · {exams.filter(e => e.exam_date >= today).length} upcoming</p>
        </div>
        <button onClick={openAdd} className="btn-primary w-full min-[380px]:w-auto">
          + Add Exam
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-1 mb-5 bg-surface border border-surface-border p-1 rounded-lg w-fit">
        {[['upcoming', 'Upcoming'], ['all', 'All']].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setFilter(val)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              filter === val ? 'bg-white text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <Spinner />
      ) : visible.length === 0 ? (
        <EmptyState
          text={filter === 'upcoming' ? 'No upcoming exams.' : 'No exams yet.'}
          action={<button onClick={openAdd} className="btn-primary mt-3">Add Exam</button>}
        />
      ) : (
        <div className="grid gap-3">
          {visible.map(exam => (
            <ItemCard
              key={exam.id}
              type="exam"
              item={exam}
              onEdit={() => openEdit(exam)}
              onDelete={() => handleDelete(exam.id)}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <Modal title={modal === 'add' ? 'Add Exam' : 'Edit Exam'} onClose={closeModal}>
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="label">Course Name *</label>
                <input name="course_name" className="input" placeholder="e.g. Data Structures" value={form.course_name} onChange={handleChange} required />
              </div>
              <div>
                <label className="label">Course Code</label>
                <input name="course_code" className="input" placeholder="e.g. CS201" value={form.course_code} onChange={handleChange} />
              </div>
              <div>
                <label className="label">Difficulty</label>
                <select name="difficulty" className="input" value={form.difficulty} onChange={handleChange}>
                  <option value="">Select…</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              <div>
                <label className="label">Exam Date *</label>
                <input name="exam_date" type="date" className="input" value={form.exam_date} onChange={handleChange} required />
              </div>
              <div>
                <label className="label">Exam Time</label>
                <input name="exam_time" type="time" className="input" value={form.exam_time} onChange={handleChange} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Location</label>
                <input name="location" className="input" placeholder="e.g. Hall B, Room 204" value={form.location} onChange={handleChange} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Study Topics</label>
                <textarea name="study_topics" className="input resize-none" rows={2} placeholder="Topics to cover…" value={form.study_topics} onChange={handleChange} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Notes</label>
                <textarea name="notes" className="input resize-none" rows={2} placeholder="Any other notes…" value={form.notes} onChange={handleChange} />
              </div>
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

            <div className="flex flex-col min-[380px]:flex-row gap-2 justify-end pt-1">
              <button type="button" onClick={closeModal} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function EmptyState({ text, action }) {
  return (
    <div className="card p-10 text-center">
      <p className="text-ink-muted">{text}</p>
      {action}
    </div>
  )
}
