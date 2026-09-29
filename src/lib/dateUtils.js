/**
 * Format a date string (YYYY-MM-DD) to a human-readable string.
 */
export function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Format a time string (HH:MM) to 12-hour format.
 */
export function formatTime(timeStr) {
  if (!timeStr) return ''
  const [h, m] = timeStr.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${period}`
}

/**
 * Formats a Date object as a YYYY-MM-DD string using its LOCAL
 * calendar date (never via toISOString/UTC, which shifts the day
 * for any timezone ahead of UTC).
 */
function toDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Returns today's date as YYYY-MM-DD string, in the local timezone.
 */
export function todayStr() {
  return toDateStr(new Date())
}

/**
 * Returns dateStr shifted by `days` (may be negative), as YYYY-MM-DD.
 */
export function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + days)
  return toDateStr(d)
}

/**
 * Returns the Sunday (start of week) on or before dateStr, as YYYY-MM-DD.
 */
export function startOfWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`)
  return addDays(dateStr, -d.getDay())
}

/**
 * Returns a short relative label: "Today", "Tomorrow", or the formatted date.
 */
export function relativeDate(dateStr) {
  if (!dateStr) return '—'
  const today = todayStr()
  const tomorrowStr = addDays(today, 1)

  if (dateStr === today) return 'Today'
  if (dateStr === tomorrowStr) return 'Tomorrow'
  return formatDate(dateStr)
}
