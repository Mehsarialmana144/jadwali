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

export function dateTimeFromParts(dateStr, timeStr) {
  if (!dateStr) return null
  const parsed = new Date(`${dateStr}T${timeStr || '00:00'}`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function isFutureDateTime(dateStr, timeStr) {
  const date = dateTimeFromParts(dateStr, timeStr)
  return Boolean(date && date.getTime() > Date.now())
}

export function examCountdownParts(dateStr, timeStr) {
  const date = dateTimeFromParts(dateStr, timeStr)
  if (!date) return null

  const diffMs = date.getTime() - Date.now()
  if (diffMs <= 0) return null

  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000))
  const days = Math.floor(totalSeconds / (24 * 60 * 60))
  const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60))
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60)
  const seconds = totalSeconds % 60

  return { days, hours, minutes, seconds }
}

export function examCountdownLabel(dateStr, timeStr) {
  const date = dateTimeFromParts(dateStr, timeStr)
  if (!date) return ''

  const diffMs = date.getTime() - Date.now()
  if (diffMs <= 0) return ''

  const minuteMs = 60 * 1000
  const hourMs = 60 * minuteMs
  const dayMs = 24 * hourMs
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const startOfExamDay = new Date(date)
  startOfExamDay.setHours(0, 0, 0, 0)
  const dayDiff = Math.round((startOfExamDay - startOfToday) / dayMs)

  if (dayDiff === 1) return 'Tomorrow'
  if (dayDiff > 1) return `${dayDiff} days left`

  const totalMinutes = Math.max(1, Math.ceil(diffMs / minuteMs))
  if (totalMinutes < 60) return `${totalMinutes}m left`

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const timeLeft = minutes ? `${hours}h ${minutes}m left` : `${hours}h left`
  return dayDiff === 0 ? `Today · ${timeLeft}` : timeLeft
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
