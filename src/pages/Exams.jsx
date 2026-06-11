import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../App'
import ItemCard from '../components/ItemCard'
import Modal from '../components/Modal'
import { isFutureDateTime, todayStr } from '../lib/dateUtils'

const EMPTY = {
  course_name: '', course_code: '', exam_date: '', exam_time: '',
  location: '', difficulty: '', study_topics: '', notes: '',
}

const IMPORT_COLUMNS = ['course_code', 'course_name', 'exam_date', 'exam_time', 'location']
const COLUMN_LABELS = {
  course_code: 'Course Code',
  course_name: 'Course Name',
  exam_date: 'Date',
  exam_time: 'Time',
  location: 'Location',
}

function normalizeHeader(value) {
  return value.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]/g, '')
}
 
function headerToColumn(value) {
  const normalized = normalizeHeader(value)
  if (['coursecode', 'code', 'رمزالمقرر', 'كودالمقرر', 'رمز', 'المقرر'].includes(normalized)) return 'course_code'
  if (['coursename', 'course', 'subject', 'name', 'اسمالمقرر', 'اسم', 'المادة'].includes(normalized)) return 'course_name'
  if (['section', 'الشعبة', 'شعبة'].includes(normalized)) return 'section'
  if (['examroom', 'room', 'hall', 'location', 'place', 'المكان', 'القاعة', 'قاعة', 'الغرفة'].includes(normalized)) return 'location'
  if (['examday', 'day', 'اليوم', 'يومالاختبار'].includes(normalized)) return 'exam_day'
  if (['examtime', 'time', 'الوقت', 'وقت', 'زمنالاختبار'].includes(normalized)) return 'exam_time'
  if (['hijrahexamdate', 'hijrahdate', 'hijri', 'hijridate', 'التاريخالهجري'].includes(normalized)) return 'hijrah_date'
  if (['gregorianexamdate', 'gregoriandate', 'date', 'examdate', 'التاريخالميلادي'].includes(normalized)) return 'exam_date'
  if (['date', 'examdate', 'day', 'التاريخ', 'تاريخ', 'اليوم'].includes(normalized)) return 'exam_date'
  if (['time', 'examtime', 'الوقت', 'وقت', 'الزمن'].includes(normalized)) return 'exam_time'
  if (['location', 'room', 'hall', 'place', 'المكان', 'القاعة', 'قاعة', 'الغرفة'].includes(normalized)) return 'location'
  return null
}

function isHeaderRow(cells) {
  const normalized = cells.map(normalizeHeader)
  return [
    'coursecode',
    'coursename',
    'section',
    'examroom',
    'gregorianexamdate',
  ].some(header => normalized.includes(header))
}

function splitImportRow(line) {
  const trimmed = line.trim()
  if (!trimmed) return []

  if (trimmed.includes('\t')) return trimmed.split('\t').map(cell => cell.trim())
  const spaced = trimmed.split(/\s{2,}/).map(cell => cell.trim()).filter(Boolean)
  if (spaced.length > 1) return spaced
  if (trimmed.includes('|')) return trimmed.split('|').map(cell => cell.trim())
  if (trimmed.includes(',')) return trimmed.split(',').map(cell => cell.trim())

  return trimmed.split(/\s+-\s+|\s+–\s+|\s+—\s+/).map(cell => cell.trim()).filter(Boolean)
}

function normalizeDate(value) {
  const raw = value.trim()
  if (!raw) return ''
  if (raw === '--') return ''

  const iso = raw.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/)
  if (iso) {
    const [, year, month, day] = iso
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  const dmy = raw.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/)
  if (dmy) {
    const [, day, month, yearPart] = dmy
    const year = yearPart.length === 2 ? `20${yearPart}` : yearPart
    const normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    const parsed = new Date(`${normalized}T00:00:00`)
    return Number.isNaN(parsed.getTime()) ? '' : normalized
  }

  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }

  return ''
}

function normalizeTime(value) {
  const raw = value.trim()
  if (!raw) return ''
  if (raw === '--') return ''

  const match = raw.match(/\b(\d{1,2})(?::|\.)(\d{2})\s*(am|pm|ص|م)?\b/i)
  if (!match) return ''

  let hours = Number(match[1])
  const minutes = match[2]
  const meridiem = (match[3] || '').toLowerCase()

  if ((meridiem === 'pm' || meridiem === 'م') && hours < 12) hours += 12
  if ((meridiem === 'am' || meridiem === 'ص') && hours === 12) hours = 0
  if (hours > 23) return ''

  return `${String(hours).padStart(2, '0')}:${minutes}`
}

function looksLikeDate(value) {
  return Boolean(normalizeDate(value))
}

function looksLikeTime(value) {
  return Boolean(normalizeTime(value))
}

function mapCellsByGuess(cells) {
  const result = { course_code: '', course_name: '', exam_date: '', exam_time: '', location: '' }
  const remaining = []

  cells.forEach(cell => {
    if (!result.exam_date && looksLikeDate(cell)) {
      result.exam_date = normalizeDate(cell)
    } else if (!result.exam_time && looksLikeTime(cell)) {
      result.exam_time = normalizeTime(cell)
    } else {
      remaining.push(cell)
    }
  })

  if (remaining.length >= 3) {
    result.course_code = remaining[0] || ''
    result.course_name = remaining[1] || ''
    result.location = remaining.slice(2).join(' ')
  } else if (remaining.length === 2) {
    const firstLooksCode = /^[A-Za-z]{2,}\s*[-]?\s*\d{2,}/.test(remaining[0])
    result.course_code = firstLooksCode ? remaining[0] : ''
    result.course_name = firstLooksCode ? remaining[1] : remaining[0]
    result.location = firstLooksCode ? '' : remaining[1]
  } else if (remaining.length === 1) {
    result.course_name = remaining[0]
  }

  return result
}

function mapUniversityCells(cells, headerColumns) {
  const parsed = {
    course_code: '',
    course_name: '',
    section: '',
    location: '',
    exam_day: '',
    exam_time: '',
    exam_date: '',
  }

  if (headerColumns) {
    cells.forEach((cell, index) => {
      const column = headerColumns[index]
      if (!column || column === 'hijrah_date') return
      parsed[column] = cell
    })
  } else {
    parsed.course_code = cells[0] || ''
    parsed.course_name = cells[1] || ''
    parsed.section = cells[2] || ''
    parsed.location = cells[3] || ''
    parsed.exam_day = cells[4] || ''
    parsed.exam_time = cells[5] || ''
    parsed.exam_date = cells[7] || ''
  }

  parsed.exam_date = normalizeDate(parsed.exam_date)
  parsed.exam_time = normalizeTime(parsed.exam_time)

  return parsed
}

function parseImportText(text) {
  const rows = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  if (rows.length === 0) return []

  const firstCells = splitImportRow(rows[0])
  const headerColumns = firstCells.map(headerToColumn)
  const hasHeader = isHeaderRow(firstCells) || headerColumns.filter(Boolean).length >= 2
  const looksLikeUniversityTable = firstCells.length >= 8 || headerColumns.includes('section') || headerColumns.includes('hijrah_date')

  return rows.slice(hasHeader ? 1 : 0).map((line, index) => {
    const cells = splitImportRow(line)
    let parsed = { course_code: '', course_name: '', exam_date: '', exam_time: '', location: '' }

    if (looksLikeUniversityTable) {
      parsed = mapUniversityCells(cells, hasHeader ? headerColumns : null)
    } else if (hasHeader) {
      cells.forEach((cell, cellIndex) => {
        const column = headerColumns[cellIndex]
        if (!column || column === 'hijrah_date') return
        parsed[column] = cell
      })
      parsed.exam_date = normalizeDate(parsed.exam_date)
      parsed.exam_time = normalizeTime(parsed.exam_time)
    } else {
      Object.assign(parsed, mapCellsByGuess(cells))
    }

    const errors = []
    if (!parsed.course_name.trim()) errors.push('Missing course name')
    if (!parsed.exam_date || !parsed.exam_time) errors.push('no exam date/time')
    if (looksLikeUniversityTable && cells.length < 8) errors.push('Not enough fields')
    if (!looksLikeUniversityTable && cells.length < 3) errors.push('Not enough fields')

    return {
      id: `${index}-${line}`,
      line,
      rowNumber: index + 1 + (hasHeader ? 1 : 0),
      data: {
        course_code: parsed.course_code.trim(),
        course_name: parsed.course_name.trim(),
        exam_date: parsed.exam_date,
        exam_time: parsed.exam_time,
        location: parsed.location.trim(),
      },
      valid: errors.length === 0,
      errors,
    }
  })
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
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importRows, setImportRows] = useState([])
  const [importError, setImportError] = useState('')
  const [importSaving, setImportSaving] = useState(false)

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

  function handlePreviewImport() {
    const parsed = parseImportText(importText)
    setImportRows(parsed)
    setImportError(parsed.length ? '' : 'Paste at least one exam row to preview.')
  }

  function clearImport() {
    setImportText('')
    setImportRows([])
    setImportError('')
  }

  async function handleConfirmImport() {
    const validRows = importRows.filter(row => row.valid)
    const invalidCount = importRows.length - validRows.length

    if (validRows.length === 0) {
      setImportError('No valid exams to import. Check the preview and paste rows with course name and date.')
      return
    }

    setImportSaving(true)
    setImportError('')

    const payload = validRows.map(row => ({
      user_id: userId,
      course_code: row.data.course_code || null,
      course_name: row.data.course_name,
      exam_date: row.data.exam_date,
      exam_time: row.data.exam_time || null,
      location: row.data.location || null,
      difficulty: 'medium',
      study_topics: null,
      notes: null,
    }))

    const { error: err } = await supabase.from('exams').insert(payload)

    if (err) {
      setImportError(err.message)
      setImportSaving(false)
      return
    }

    await load()
    setImportSaving(false)
    setImportRows([])
    setImportText('')
    setImportError(invalidCount ? `Imported ${validRows.length} exams. Skipped ${invalidCount} invalid row${invalidCount > 1 ? 's' : ''}.` : `Imported ${validRows.length} exams successfully.`)
  }

  const today = todayStr()
  const upcomingExams = exams.filter(e => isFutureDateTime(e.exam_date, e.exam_time))
  const visible = filter === 'upcoming'
    ? upcomingExams
    : exams
  const importableRows = importRows.filter(row => row.valid)
  const skippedRows = importRows.filter(row => !row.valid)
  const validImportCount = importableRows.length
  const invalidImportCount = skippedRows.length

  return (
    <div className="min-w-0 max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col min-[380px]:flex-row min-[380px]:items-center justify-between gap-3 mb-6 min-w-0">
        <div className="min-w-0">
          <h1 className="page-title">Exams</h1>
          <p className="text-sm text-ink-muted mt-0.5">{exams.length} total · {upcomingExams.length} upcoming</p>
        </div>
        <div className="flex flex-col min-[380px]:flex-row gap-2 w-full min-[380px]:w-auto">
          <button onClick={() => setShowImport(value => !value)} className="btn-secondary w-full min-[380px]:w-auto">
            Import Schedule
          </button>
          <button onClick={openAdd} className="btn-primary w-full min-[380px]:w-auto">
            + Add Exam
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-1 mb-5 bg-surface border border-surface-border p-1 rounded-lg w-full min-[380px]:w-fit overflow-x-auto">
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

      {/* Import Schedule */}
      {showImport && (
        <section className="card p-4 sm:p-5 mb-5 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4 min-w-0">
            <div className="min-w-0">
              <h2 className="font-display text-lg font-semibold text-ink">Import Schedule</h2>
              <p className="text-sm text-ink-muted mt-1">
                Paste the university exam table. Tabs are read first, then spaced columns or pipes.
              </p>
            </div>
            {importRows.length > 0 && (
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="badge bg-green-50 text-green-700">{validImportCount} valid</span>
                {invalidImportCount > 0 && <span className="badge bg-red-50 text-red-700">{invalidImportCount} invalid</span>}
              </div>
            )}
          </div>

          <div className="grid gap-3 min-w-0">
            <details className="rounded-lg border border-surface-border bg-surface/60 p-3 min-w-0">
              <summary className="cursor-pointer text-sm font-medium text-ink">
                How to import from Edugate?
              </summary>
              <div className="mt-3 text-sm text-ink-muted min-w-0">
                <h3 className="font-semibold text-ink mb-2">How to import your exam schedule</h3>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Open Edugate.</li>
                  <li>Change the language to English.</li>
                  <li>Go to the Final Exams page.</li>
                  <li>Select the exam table.</li>
                  <li>Copy the table.</li>
                  <li>Come back to Jadwali.</li>
                  <li>Paste it in the Import Schedule box.</li>
                  <li>Click Preview.</li>
                  <li>Review the exams.</li>
                  <li>Click Confirm Import.</li>
                </ol>
                <p className="mt-3 text-xs text-ink-muted">
                  Jadwali will ignore courses without final exam dates, such as Graduation Project or Career Skills.
                </p>
              </div>
            </details>

            <div className="min-w-0">
              <label className="label">Paste exam schedule</label>
              <textarea
                className="input min-h-36 resize-y max-w-full"
                value={importText}
                onChange={e => {
                  setImportText(e.target.value)
                  setImportRows([])
                  setImportError('')
                }}
                placeholder={'Course Code\tCourse Name\tSection\tExam Room\tExam Day\tExam Time\tHijrah exam date\tGregorian exam date\nCIS 383\tCyber Security and Cryptography\t379\tSports Center-1\tSunday\t11:30\t1448-01-06\t21-06-2026'}
              />
            </div>

            <div className="flex flex-col min-[380px]:flex-row gap-2">
              <button type="button" onClick={handlePreviewImport} className="btn-primary">
                Preview
              </button>
              <button type="button" onClick={clearImport} className="btn-secondary">
                Clear
              </button>
            </div>

            {importError && (
              <p className={`text-sm px-3 py-2 rounded-lg ${
                importError.startsWith('Imported') ? 'text-green-700 bg-green-50' : 'text-red-600 bg-red-50'
              }`}>
                {importError}
              </p>
            )}

            {importRows.length > 0 && (
              <div className="grid gap-3 min-w-0">
                {importableRows.length > 0 && (
                  <div className="hidden md:block overflow-x-auto max-w-full border border-surface-border rounded-lg">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead className="bg-surface text-ink-muted">
                        <tr>
                          {IMPORT_COLUMNS.map(column => (
                            <th key={column} className="text-left font-medium px-3 py-2 whitespace-nowrap">{COLUMN_LABELS[column]}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-border">
                        {importableRows.map(row => (
                          <tr key={row.id} className="bg-white">
                            {IMPORT_COLUMNS.map(column => (
                              <td key={column} className="px-3 py-2 align-top text-ink break-words">{row.data[column] || '—'}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="grid gap-2 md:hidden">
                  {importableRows.map(row => (
                    <div key={row.id} className="rounded-lg border p-3 bg-white border-surface-border min-w-0">
                      <div className="flex flex-col min-[380px]:flex-row min-[380px]:items-start justify-between gap-2 mb-2 min-w-0">
                        <div className="min-w-0">
                          <p className="font-medium text-ink">{row.data.course_name || 'Missing course name'}</p>
                          <p className="text-xs text-ink-muted">{row.data.course_code || 'No course code'}</p>
                        </div>
                        <span className="badge flex-shrink-0 bg-green-50 text-green-700 w-fit">Ready</span>
                      </div>
                      <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2 text-xs text-ink-muted">
                        <p><span className="font-medium text-ink">Date:</span> {row.data.exam_date || '—'}</p>
                        <p><span className="font-medium text-ink">Time:</span> {row.data.exam_time || '—'}</p>
                        <p className="min-[360px]:col-span-2"><span className="font-medium text-ink">Location:</span> {row.data.location || '—'}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {skippedRows.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 min-w-0">
                    <h3 className="text-sm font-semibold text-amber-900">Skipped rows</h3>
                    <div className="grid gap-1.5 mt-2">
                      {skippedRows.map(row => (
                        <p key={row.id} className="text-xs text-amber-900 break-words">
                          Skipped: {row.data.course_name || row.line || `Row ${row.rowNumber}`} — no final exam date/time
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-col min-[380px]:flex-row gap-2 justify-end">
                  <button
                    type="button"
                    onClick={handleConfirmImport}
                    disabled={importSaving || validImportCount === 0}
                    className="btn-primary"
                  >
                    {importSaving ? 'Importing…' : `Confirm Import${validImportCount ? ` (${validImportCount})` : ''}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* List */}
      {loading ? (
        <Spinner />
      ) : visible.length === 0 ? (
        <EmptyState
          text={filter === 'upcoming' ? 'No upcoming exams.' : 'No exams yet.'}
          action={<button onClick={openAdd} className="btn-primary mt-3">Add Exam</button>}
        />
      ) : (
        <div className="grid gap-3 min-w-0">
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
