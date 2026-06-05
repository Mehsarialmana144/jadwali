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
 * Returns today's date as YYYY-MM-DD string.
 */
export function todayStr() {
  return new Date().toISOString().split('T')[0]
}

/**
 * Returns true if dateStr is today.
 */
export function isToday(dateStr) {
  return dateStr === todayStr()
}

/**
 * Returns true if dateStr is in the future or today.
 */
export function isFutureOrToday(dateStr) {
  if (!dateStr) return false
  return dateStr >= todayStr()
}

/**
 * Returns a short relative label: "Today", "Tomorrow", or the formatted date.
 */
export function relativeDate(dateStr) {
  if (!dateStr) return '—'
  const today = todayStr()
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]

  if (dateStr === today) return 'Today'
  if (dateStr === tomorrowStr) return 'Tomorrow'
  return formatDate(dateStr)
}

/**
 * Sort items by date then time ascending.
 */
export function sortByDateTime(items, dateKey, timeKey) {
  return [...items].sort((a, b) => {
    const da = (a[dateKey] || '') + 'T' + (a[timeKey] || '00:00')
    const db = (b[dateKey] || '') + 'T' + (b[timeKey] || '00:00')
    return da.localeCompare(db)
  })
}
