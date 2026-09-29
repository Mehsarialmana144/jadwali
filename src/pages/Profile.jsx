import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../App'
import Modal from '../components/Modal'
import NotificationSettings from '../components/NotificationSettings'
import { useRefetchOnFocus } from '../lib/useRefetchOnFocus'

const EMPTY = { name: '', logo_url: '', position_title: '', notes: '', accent_color: '' }

const ACCENT_PRESETS = ['#4f52eb', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#64748b']

function initials(name) {
  return (name || '?').trim().slice(0, 2).toUpperCase()
}

export default function Profile() {
  const { session } = useAuth()
  const userId = session.user.id
  const name = session.user.user_metadata?.full_name || 'You'

  const [companies, setCompanies] = useState([])
  const [taskCounts, setTaskCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

  async function load() {
    setLoadError('')
    const [companyRes, taskRes] = await Promise.all([
      supabase.from('companies').select('*').eq('user_id', userId).order('name'),
      supabase.from('tasks').select('company_id').eq('user_id', userId).not('company_id', 'is', null),
    ])
    if (companyRes.error) {
      setLoadError(companyRes.error.message)
      setCompanies([])
      setLoading(false)
      return
    }
    setCompanies(companyRes.data || [])
    const counts = {}
    for (const task of taskRes.data || []) {
      counts[task.company_id] = (counts[task.company_id] || 0) + 1
    }
    setTaskCounts(counts)
    setLoading(false)
  }

  useEffect(() => { load() }, [userId])
  useRefetchOnFocus(load)

  function openAdd() {
    setForm(EMPTY)
    setEditId(null)
    setError('')
    setModal('add')
  }

  function openEdit(company) {
    setForm({
      name:           company.name           || '',
      logo_url:       company.logo_url       || '',
      position_title: company.position_title || '',
      notes:          company.notes          || '',
      accent_color:   company.accent_color   || '',
    })
    setEditId(company.id)
    setError('')
    setModal('edit')
  }

  function closeModal() { setModal(null); setError('') }
  function handleChange(e) { setForm(f => ({ ...f, [e.target.name]: e.target.value })) }

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setUploading(true)

    const ext = file.name.includes('.') ? file.name.split('.').pop() : (file.type.split('/')[1] || 'png')
    const path = `${userId}/${crypto.randomUUID()}.${ext}`

    const { error: uploadErr } = await supabase.storage.from('company-logos').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    })

    if (uploadErr) {
      setError(`Logo upload failed: ${uploadErr.message}`)
      setUploading(false)
      return
    }

    const { data } = supabase.storage.from('company-logos').getPublicUrl(path)
    setForm(f => ({ ...f, logo_url: data.publicUrl }))
    setUploading(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Company name is required.'); return }
    setSaving(true)
    setError('')

    const payload = {
      name:           form.name.trim(),
      logo_url:       form.logo_url.trim()       || null,
      position_title: form.position_title.trim() || null,
      notes:          form.notes.trim()          || null,
      accent_color:   form.accent_color          || null,
    }

    let err
    if (modal === 'add') {
      ({ error: err } = await supabase.from('companies').insert({ ...payload, user_id: userId }))
    } else {
      ({ error: err } = await supabase.from('companies').update(payload).eq('id', editId).eq('user_id', userId))
    }

    if (err) { setError(err.message); setSaving(false); return }
    await load()
    closeModal()
    setSaving(false)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this company? Tasks linked to it will stay but become unlinked.')) return
    const { error: err } = await supabase.from('companies').delete().eq('id', id).eq('user_id', userId)
    if (err) { alert(`Could not delete company: ${err.message}`); return }
    await load()
  }

  return (
    <div className="min-w-0 max-w-full overflow-x-hidden space-y-5">
      {/* Profile header */}
      <div className="card p-4 flex items-center gap-3 min-w-0">
        <div className="w-11 h-11 rounded-full bg-brand-600/10 text-brand-600 dark:text-brand-400 flex items-center justify-center text-sm font-semibold flex-shrink-0">
          {initials(name)}
        </div>
        <div className="min-w-0">
          <h1 className="page-title">{name}</h1>
          <p className="text-sm text-ink-muted mt-0.5 break-all">{session?.user?.email}</p>
        </div>
      </div>

      <NotificationSettings />

      {/* My Companies */}
      <div>
        <div className="flex flex-col min-[380px]:flex-row min-[380px]:items-center justify-between gap-3 mb-3 min-w-0">
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold text-ink">My Companies</h2>
            <p className="text-xs text-ink-muted mt-0.5">{companies.length} {companies.length === 1 ? 'company' : 'companies'}</p>
          </div>
          <button onClick={openAdd} className="btn-primary w-full min-[380px]:w-auto">+ Add Company</button>
        </div>

        {loadError && (
          <div className="text-sm text-red-600 dark:text-red-400 bg-red-500/10 px-3 py-2 rounded-lg mb-3">
            Couldn't load companies: {loadError}
          </div>
        )}

        {loading ? (
          <Spinner />
        ) : companies.length === 0 ? (
          <EmptyState text="No companies yet." action={<button onClick={openAdd} className="btn-primary mt-2">Add Company</button>} />
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 min-w-0">
            {companies.map(company => (
              <div
                key={company.id}
                className="card card-hover p-3 min-w-0 border-l-2"
                style={{ borderLeftColor: company.accent_color || '#4f52eb' }}
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  {company.logo_url ? (
                    <img
                      src={company.logo_url}
                      alt=""
                      className="w-8 h-8 rounded-lg object-cover flex-shrink-0 border border-surface-border"
                      onError={e => { e.currentTarget.style.display = 'none' }}
                    />
                  ) : (
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold flex-shrink-0 text-white"
                      style={{ backgroundColor: company.accent_color || '#4f52eb' }}
                    >
                      {initials(company.name)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink leading-snug break-words">{company.name}</p>
                    {company.position_title && (
                      <p className="text-xs text-ink-muted leading-snug break-words">{company.position_title}</p>
                    )}
                  </div>
                  <span className="badge bg-brand-600/10 text-brand-600 dark:text-brand-400 flex-shrink-0 w-fit">
                    {taskCounts[company.id] || 0}
                  </span>
                </div>
                {company.notes && <p className="text-xs text-ink-muted mt-2 line-clamp-2">{company.notes}</p>}
                <div className="flex flex-wrap gap-1 mt-2.5 pt-2.5 border-t border-surface-border min-w-0">
                  <button onClick={() => openEdit(company)} className="btn-ghost text-xs px-2.5 py-1">Edit</button>
                  <button onClick={() => handleDelete(company.id)} className="btn-ghost text-xs px-2.5 py-1 text-red-600 dark:text-red-400 hover:bg-red-500/10">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <Modal title={modal === 'add' ? 'Add Company' : 'Edit Company'} onClose={closeModal}>
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div>
              <label className="label">Company Name *</label>
              <input name="name" className="input" placeholder="e.g. Google" value={form.name} onChange={handleChange} required />
            </div>

            <div>
              <label className="label">Logo</label>
              <div className="flex items-center gap-3">
                {form.logo_url ? (
                  <img src={form.logo_url} alt="" className="w-12 h-12 rounded-lg object-cover border border-surface-border flex-shrink-0" />
                ) : (
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center text-sm font-semibold text-white flex-shrink-0"
                    style={{ backgroundColor: form.accent_color || '#4f52eb' }}
                  >
                    {initials(form.name)}
                  </div>
                )}
                <div className="flex flex-col gap-1.5 min-w-0">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoUpload}
                  />
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="btn-secondary text-xs px-3 py-1.5 w-fit">
                    {uploading ? 'Uploading…' : form.logo_url ? 'Replace logo' : 'Upload logo'}
                  </button>
                  {form.logo_url && (
                    <button type="button" onClick={() => setForm(f => ({ ...f, logo_url: '' }))} className="text-xs text-ink-faint hover:text-ink-muted text-left w-fit">
                      Remove logo
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="label">Accent Color</label>
              <div className="flex flex-wrap items-center gap-1.5">
                {ACCENT_PRESETS.map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, accent_color: color }))}
                    className={`w-6 h-6 rounded-full flex-shrink-0 transition-transform ${form.accent_color === color ? 'ring-2 ring-offset-2 ring-offset-surface-card ring-brand-500 scale-110' : ''}`}
                    style={{ backgroundColor: color }}
                    aria-label={color}
                  />
                ))}
                <input
                  type="color"
                  value={form.accent_color || '#4f52eb'}
                  onChange={e => setForm(f => ({ ...f, accent_color: e.target.value }))}
                  className="w-6 h-6 rounded-full overflow-hidden border-0 cursor-pointer flex-shrink-0"
                  title="Custom color"
                />
              </div>
            </div>

            <div>
              <label className="label">My Position / Job Title</label>
              <input name="position_title" className="input" placeholder="e.g. Software Engineer Intern" value={form.position_title} onChange={handleChange} />
            </div>
            <div>
              <label className="label">Details / Notes</label>
              <textarea name="notes" className="input resize-none" rows={3} placeholder="Anything worth remembering…" value={form.notes} onChange={handleChange} />
            </div>

            {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>}

            <div className="flex flex-col min-[380px]:flex-row gap-2 justify-end pt-1">
              <button type="button" onClick={closeModal} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving || uploading} className="btn-primary">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

function Spinner() {
  return <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>
}
function EmptyState({ text, action }) {
  return <div className="card empty-state"><p className="text-sm text-ink-muted">{text}</p>{action}</div>
}
