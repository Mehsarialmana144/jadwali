import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../App'
import ItemCard from '../components/ItemCard'
import Modal from '../components/Modal'
import { todayStr } from '../lib/dateUtils'

const EMPTY = {
  company_name: '', position_title: '', interview_date: '', interview_time: '',
  interview_type: '', location_or_link: '', preparation_notes: '', notes: '',
}

export default function Interviews() {
  const { session } = useAuth()
  const userId = session.user.id

  const [interviews, setInterviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('upcoming')

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('interviews').select('*').eq('user_id', userId).order('interview_date')
    setInterviews(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [userId])

  function openAdd() {
    setForm({ ...EMPTY, interview_date: todayStr() })
    setEditId(null)
    setError('')
    setModal('add')
  }

  function openEdit(item) {
    setForm({
      company_name:      item.company_name      || '',
      position_title:    item.position_title    || '',
      interview_date:    item.interview_date    || '',
      interview_time:    item.interview_time    || '',
      interview_type:    item.interview_type    || '',
      location_or_link:  item.location_or_link  || '',
      preparation_notes: item.preparation_notes || '',
      notes:             item.notes             || '',
    })
    setEditId(item.id)
    setError('')
    setModal('edit')
  }

  function closeModal() { setModal(null); setError('') }
  function handleChange(e) { setForm(f => ({ ...f, [e.target.name]: e.target.value })) }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.company_name.trim()) { setError('Company name is required.'); return }
    if (!form.interview_date)      { setError('Interview date is required.'); return }
    setSaving(true)
    setError('')

    const payload = {
      company_name:      form.company_name.trim(),
      position_title:    form.position_title.trim()    || null,
      interview_date:    form.interview_date,
      interview_time:    form.interview_time            || null,
      interview_type:    form.interview_type            || null,
      location_or_link:  form.location_or_link.trim()  || null,
      preparation_notes: form.preparation_notes.trim() || null,
      notes:             form.notes.trim()              || null,
    }

    let err
    if (modal === 'add') {
      ({ error: err } = await supabase.from('interviews').insert({ ...payload, user_id: userId }))
    } else {
      ({ error: err } = await supabase.from('interviews').update(payload).eq('id', editId).eq('user_id', userId))
    }

    if (err) { setError(err.message); setSaving(false); return }
    await load()
    closeModal()
    setSaving(false)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this interview?')) return
    await supabase.from('interviews').delete().eq('id', id).eq('user_id', userId)
    await load()
  }

  const today = todayStr()
  const visible = filter === 'upcoming'
    ? interviews.filter(i => i.interview_date >= today)
    : interviews

  return (
    <div>
      <div className="flex flex-col min-[380px]:flex-row min-[380px]:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="page-title">Interviews</h1>
          <p className="text-sm text-ink-muted mt-0.5">{interviews.length} total · {interviews.filter(i => i.interview_date >= today).length} upcoming</p>
        </div>
        <button onClick={openAdd} className="btn-primary w-full min-[380px]:w-auto">+ Add Interview</button>
      </div>

      <div className="flex gap-1 mb-5 bg-surface border border-surface-border p-1 rounded-lg w-fit">
        {[['upcoming', 'Upcoming'], ['all', 'All']].map(([val, label]) => (
          <button key={val} onClick={() => setFilter(val)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${filter === val ? 'bg-white text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : visible.length === 0 ? (
        <EmptyState text={filter === 'upcoming' ? 'No upcoming interviews.' : 'No interviews yet.'} action={<button onClick={openAdd} className="btn-primary mt-3">Add Interview</button>} />
      ) : (
        <div className="grid gap-3">
          {visible.map(item => (
            <ItemCard key={item.id} type="interview" item={item} onEdit={() => openEdit(item)} onDelete={() => handleDelete(item.id)} />
          ))}
        </div>
      )}

      {modal && (
        <Modal title={modal === 'add' ? 'Add Interview' : 'Edit Interview'} onClose={closeModal}>
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="label">Company Name *</label>
                <input name="company_name" className="input" placeholder="e.g. Google" value={form.company_name} onChange={handleChange} required />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Position Title</label>
                <input name="position_title" className="input" placeholder="e.g. Software Engineer Intern" value={form.position_title} onChange={handleChange} />
              </div>
              <div>
                <label className="label">Interview Date *</label>
                <input name="interview_date" type="date" className="input" value={form.interview_date} onChange={handleChange} required />
              </div>
              <div>
                <label className="label">Interview Time</label>
                <input name="interview_time" type="time" className="input" value={form.interview_time} onChange={handleChange} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Interview Type</label>
                <select name="interview_type" className="input" value={form.interview_type} onChange={handleChange}>
                  <option value="">Select…</option>
                  <option value="onsite">Onsite</option>
                  <option value="online">Online</option>
                  <option value="phone">Phone</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label">Location / Link</label>
                <input name="location_or_link" className="input" placeholder="e.g. Zoom link or office address" value={form.location_or_link} onChange={handleChange} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Preparation Notes</label>
                <textarea name="preparation_notes" className="input resize-none" rows={2} placeholder="What to prepare…" value={form.preparation_notes} onChange={handleChange} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Notes</label>
                <textarea name="notes" className="input resize-none" rows={2} placeholder="Any other notes…" value={form.notes} onChange={handleChange} />
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
