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

const REVIEW_EMPTY = {
  review_rating: '3',
  review_role_type: '',
  review_role_clarity: '',
  review_work_mode: '',
  review_reward: '',
  review_company_fit: '',
  review_pros: '',
  review_cons: '',
  review_questions_asked: '',
  review_decision: '',
  review_follow_up_notes: '',
} 

function decisionScore(item) {
  if (!item.review_rating) return 0
  let score = Number(item.review_rating) * 12
  if (item.review_company_fit === 'good') score += 12
  if (item.review_company_fit === 'maybe') score += 6
  if (item.review_role_clarity === 'clear') score += 10
  if (item.review_role_clarity === 'somewhat_clear') score += 5
  if (item.review_reward === 'yes') score += 8
  if (item.review_decision === 'interested') score += 10
  if (item.review_decision === 'waiting') score += 4
  return Math.min(100, Math.max(0, score))
}

function hasReview(item) {
  return Boolean(item.review_rating || item.review_decision || item.review_pros || item.review_cons || item.review_follow_up_notes)
}

const labelMap = {
  internship: 'Internship',
  coop: 'Coop',
  full_time: 'Full-time',
  part_time: 'Part-time',
  clear: 'Clear',
  somewhat_clear: 'Somewhat clear',
  not_clear: 'Not clear',
  onsite: 'Onsite',
  online: 'Online',
  hybrid: 'Hybrid',
  not_mentioned: 'Not mentioned',
  yes: 'Yes',
  no: 'No',
  good: 'Good',
  maybe: 'Maybe',
  not_good: 'Not good',
  interested: 'Interested',
  waiting: 'Waiting',
  not_interested: 'Not Interested',
  need_more_info: 'Need More Info',
}

export default function Interviews() {
  const { session } = useAuth()
  const userId = session.user.id

  const [interviews, setInterviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [reviewForm, setReviewForm] = useState(REVIEW_EMPTY)
  const [editId, setEditId] = useState(null)
  const [reviewId, setReviewId] = useState(null)
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

  function openReview(item) {
    setReviewForm({
      review_rating: String(item.review_rating || '3'),
      review_role_type: item.review_role_type || '',
      review_role_clarity: item.review_role_clarity || '',
      review_work_mode: item.review_work_mode || '',
      review_reward: item.review_reward || '',
      review_company_fit: item.review_company_fit || '',
      review_pros: item.review_pros || '',
      review_cons: item.review_cons || '',
      review_questions_asked: item.review_questions_asked || '',
      review_decision: item.review_decision || '',
      review_follow_up_notes: item.review_follow_up_notes || '',
    })
    setReviewId(item.id)
    setError('')
    setModal('review')
  }

  function closeModal() { setModal(null); setError('') }
  function handleChange(e) { setForm(f => ({ ...f, [e.target.name]: e.target.value })) }
  function handleReviewChange(e) { setReviewForm(f => ({ ...f, [e.target.name]: e.target.value })) }

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

  async function handleReviewSave(e) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const payload = {
      review_rating: Number(reviewForm.review_rating) || null,
      review_role_type: reviewForm.review_role_type || null,
      review_role_clarity: reviewForm.review_role_clarity || null,
      review_work_mode: reviewForm.review_work_mode || null,
      review_reward: reviewForm.review_reward || null,
      review_company_fit: reviewForm.review_company_fit || null,
      review_pros: reviewForm.review_pros.trim() || null,
      review_cons: reviewForm.review_cons.trim() || null,
      review_questions_asked: reviewForm.review_questions_asked.trim() || null,
      review_decision: reviewForm.review_decision || null,
      review_follow_up_notes: reviewForm.review_follow_up_notes.trim() || null,
    }

    const { error: err } = await supabase
      .from('interviews')
      .update(payload)
      .eq('id', reviewId)
      .eq('user_id', userId)

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
  const reviewed = interviews.filter(hasReview).map(item => ({ ...item, score: decisionScore(item) }))
  const best = reviewed
    .filter(item => item.review_decision !== 'not_interested')
    .sort((a, b) => b.score - a.score)[0]
  const waiting = reviewed.filter(item => item.review_decision === 'waiting')
  const followUp = reviewed.filter(item => item.review_decision === 'need_more_info' || item.review_follow_up_notes)
  const visible = filter === 'upcoming'
    ? interviews.filter(i => i.interview_date >= today)
    : filter === 'decision'
      ? reviewed.sort((a, b) => b.score - a.score)
    : interviews

  return (
    <div className="min-w-0 max-w-full overflow-x-hidden">
      <div className="flex flex-col min-[380px]:flex-row min-[380px]:items-center justify-between gap-3 mb-6 min-w-0">
        <div className="min-w-0">
          <h1 className="page-title">Interviews</h1>
          <p className="text-sm text-ink-muted mt-0.5">{interviews.length} total · {interviews.filter(i => i.interview_date >= today).length} upcoming · {reviewed.length} reviewed</p>
        </div>
        <button onClick={openAdd} className="btn-primary w-full min-[380px]:w-auto">+ Add Interview</button>
      </div>

      <div className="flex gap-1 mb-5 bg-surface border border-surface-border p-1 rounded-lg w-full min-[380px]:w-fit overflow-x-auto">
        {[['upcoming', 'Upcoming'], ['all', 'All'], ['decision', 'Decision']].map(([val, label]) => (
          <button key={val} onClick={() => setFilter(val)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${filter === val ? 'bg-white text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}>
            {label}
          </button>
        ))}
      </div>

      {filter === 'decision' && !loading && (
        <DecisionOverview best={best} waiting={waiting} followUp={followUp} />
      )}

      {loading ? (
        <Spinner />
      ) : visible.length === 0 ? (
        <EmptyState text={filter === 'decision' ? 'No reviewed interviews yet.' : filter === 'upcoming' ? 'No upcoming interviews.' : 'No interviews yet.'} action={<button onClick={openAdd} className="btn-primary mt-3">Add Interview</button>} />
      ) : filter === 'decision' ? (
        <div className="grid gap-3 min-w-0">
          {visible.map(item => <DecisionCard key={item.id} item={item} />)}
        </div>
      ) : (
        <div className="grid gap-3 min-w-0">
          {visible.map(item => (
            <ItemCard key={item.id} type="interview" item={item} onEdit={() => openEdit(item)} onDelete={() => handleDelete(item.id)} onReview={() => openReview(item)} />
          ))}
        </div>
      )}

      {(modal === 'add' || modal === 'edit') && (
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

      {modal === 'review' && (
        <Modal title="Interview Review" onClose={closeModal}>
          <form onSubmit={handleReviewSave} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SelectField label="Interview Rating" name="review_rating" value={reviewForm.review_rating} onChange={handleReviewChange} options={['1', '2', '3', '4', '5'].map(v => [v, v])} />
              <SelectField label="Role Type" name="review_role_type" value={reviewForm.review_role_type} onChange={handleReviewChange} options={[['internship', 'Internship'], ['coop', 'Coop'], ['full_time', 'Full-time'], ['part_time', 'Part-time']]} />
              <SelectField label="Role Clarity" name="review_role_clarity" value={reviewForm.review_role_clarity} onChange={handleReviewChange} options={[['clear', 'Clear'], ['somewhat_clear', 'Somewhat clear'], ['not_clear', 'Not clear']]} />
              <SelectField label="Work Mode" name="review_work_mode" value={reviewForm.review_work_mode} onChange={handleReviewChange} options={[['onsite', 'Onsite'], ['online', 'Online'], ['hybrid', 'Hybrid'], ['not_mentioned', 'Not mentioned']]} />
              <SelectField label="Reward" name="review_reward" value={reviewForm.review_reward} onChange={handleReviewChange} options={[['yes', 'Yes'], ['no', 'No'], ['not_mentioned', 'Not mentioned']]} />
              <SelectField label="Company Fit" name="review_company_fit" value={reviewForm.review_company_fit} onChange={handleReviewChange} options={[['good', 'Good'], ['maybe', 'Maybe'], ['not_good', 'Not good']]} />
              <TextArea label="Pros" name="review_pros" value={reviewForm.review_pros} onChange={handleReviewChange} />
              <TextArea label="Cons" name="review_cons" value={reviewForm.review_cons} onChange={handleReviewChange} />
              <TextArea label="Questions Asked" name="review_questions_asked" value={reviewForm.review_questions_asked} onChange={handleReviewChange} />
              <SelectField label="Decision" name="review_decision" value={reviewForm.review_decision} onChange={handleReviewChange} options={[['interested', 'Interested'], ['waiting', 'Waiting'], ['not_interested', 'Not Interested'], ['need_more_info', 'Need More Info']]} />
              <TextArea label="Follow-up Notes" name="review_follow_up_notes" value={reviewForm.review_follow_up_notes} onChange={handleReviewChange} wide />
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

            <div className="flex flex-col min-[380px]:flex-row gap-2 justify-end pt-1">
              <button type="button" onClick={closeModal} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save Review'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

function SelectField({ label, name, value, onChange, options }) {
  return (
    <div>
      <label className="label">{label}</label>
      <select name={name} className="input" value={value} onChange={onChange}>
        <option value="">Select…</option>
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </div>
  )
}

function TextArea({ label, name, value, onChange, wide }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <label className="label">{label}</label>
      <textarea name={name} className="input resize-none" rows={2} value={value} onChange={onChange} />
    </div>
  )
}

function DecisionOverview({ best, waiting, followUp }) {
  return (
    <section className="grid gap-3 sm:grid-cols-3 mb-5 min-w-0">
      <OverviewCard label="Best so far" value={best ? best.company_name : 'None yet'} sub={best ? `${best.position_title || 'Role'} · ${best.score}/100` : 'Add a review to compare'} />
      <OverviewCard label="Waiting" value={waiting.length} sub="interviews waiting for decision" />
      <OverviewCard label="Follow-up" value={followUp.length} sub="need notes or more info" />
    </section>
  )
}

function OverviewCard({ label, value, sub }) {
  return (
    <div className="card p-4 min-w-0">
      <p className="text-xs font-medium text-ink-muted uppercase tracking-wide">{label}</p>
      <p className="text-lg font-semibold text-ink mt-0.5 break-words">{value}</p>
      <p className="text-xs text-ink-faint mt-1 break-words">{sub}</p>
    </div>
  )
}

function DecisionCard({ item }) {
  return (
    <div className="card p-4 border-l-4 border-purple-300 min-w-0">
      <div className="flex flex-col min-[420px]:flex-row min-[420px]:items-start justify-between gap-2 min-w-0">
        <div className="min-w-0">
          <p className="font-medium text-ink leading-snug break-words">{item.company_name}</p>
          <p className="text-xs text-ink-muted leading-snug break-words mt-0.5">{item.position_title || 'No role title'}</p>
        </div>
        <span className="badge bg-purple-50 text-purple-700 w-fit flex-shrink-0">Score {item.score}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3 text-xs min-w-0">
        <DecisionMeta label="Rating" value={item.review_rating ? `${item.review_rating}/5` : '—'} />
        <DecisionMeta label="Work Mode" value={labelMap[item.review_work_mode] || '—'} />
        <DecisionMeta label="Reward" value={labelMap[item.review_reward] || '—'} />
        <DecisionMeta label="Decision" value={labelMap[item.review_decision] || '—'} />
        <DecisionMeta label="Score" value={`${item.score}/100`} />
      </div>
    </div>
  )
}

function DecisionMeta({ label, value }) {
  return (
    <div className="rounded-lg bg-surface px-2.5 py-2 min-w-0">
      <p className="text-[11px] text-ink-faint">{label}</p>
      <p className="font-medium text-ink break-words">{value}</p>
    </div>
  )
}

function Spinner() {
  return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>
}
function EmptyState({ text, action }) {
  return <div className="card p-10 text-center"><p className="text-ink-muted">{text}</p>{action}</div>
}
