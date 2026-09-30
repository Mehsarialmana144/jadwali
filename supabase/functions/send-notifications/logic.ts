// Pure scheduling logic for Jadwali notifications. No I/O, so it can be unit tested with Node.

export type Task = {
  id: string
  user_id: string
  title: string
  due_date: string | null // YYYY-MM-DD
  due_time: string | null // HH:MM[:SS]
  status: string
  reminder: string | null
  companies?: { name: string } | null
}

export type Settings = {
  user_id: string
  timezone: string
  due_soon_enabled: boolean
  overdue_enabled: boolean
  daily_summary_enabled: boolean
  daily_summary_time: string // HH:MM[:SS]
}

export type Kind = 'reminder' | 'due_soon' | 'overdue' | 'daily_summary'

export type Notification = {
  user_id: string
  task_id: string | null
  kind: Kind
  dedupe_key: string
  payload: { title: string; body: string; url: string; tag: string }
}

export const DEFAULT_DUE_TIME = '09:00'
export const DUE_SOON_MINUTES = 60
// A trigger is only sent if it fired within this window. This keeps a delayed
// cron run from sending stale alerts, and stops a flood of old overdue tasks
// the moment someone enables notifications.
export const GRACE_MS = 3 * 60 * 60 * 1000

export const REMINDER_MINUTES: Record<string, number> = {
  at_time: 0,
  '15m': 15,
  '30m': 30,
  '1h': 60,
  '1d': 1440,
}

function safeTimeZone(tz: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return tz
  } catch {
    return 'UTC'
  }
}

function tzOffsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const get = (t: string) => Number(parts.find(p => p.type === t)!.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - Math.floor(utcMs / 1000) * 1000
}

/** Converts a wall-clock date + time in `tz` to a UTC epoch (ms). */
export function zonedTimeToUtcMs(dateStr: string, timeStr: string, tz: string): number {
  const zone = safeTimeZone(tz)
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  const off1 = tzOffsetMs(guess, zone)
  let t = guess - off1
  const off2 = tzOffsetMs(t, zone)
  if (off2 !== off1) t = guess - off2
  return t
}

/** The wall-clock date (YYYY-MM-DD) and time (HH:MM) of `nowMs` in `tz`. */
export function localParts(nowMs: number, tz: string): { date: string; time: string } {
  const zone = safeTimeZone(tz)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(nowMs))
  const get = (t: string) => parts.find(p => p.type === t)!.value
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

function formatTime12(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function formatDateShort(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

function relativeDay(dateStr: string, today: string): string {
  if (dateStr === today) return 'today'
  if (dateStr === addDays(today, 1)) return 'tomorrow'
  return formatDateShort(dateStr)
}

const hhmm = (t: string) => t.slice(0, 5)

function suffix(task: Task): string {
  return task.companies?.name ? ` · ${task.companies.name}` : ''
}

/**
 * Decides which task notifications (reminder / due soon / overdue) should be
 * sent right now. Returns candidates only; the caller de-duplicates via the log.
 */
export function buildTaskNotifications(nowMs: number, tasks: Task[], settingsByUser: Map<string, Settings>): Notification[] {
  const out: Notification[] = []

  for (const task of tasks) {
    const settings = settingsByUser.get(task.user_id)
    if (!settings || !task.due_date || task.status === 'done') continue

    const tz = settings.timezone
    const timed = !!task.due_time
    const dueTime = hhmm(task.due_time || DEFAULT_DUE_TIME)
    const dueMs = zonedTimeToUtcMs(task.due_date, dueTime, tz)
    const today = localParts(nowMs, tz).date
    const baseKey = `${task.id}|${task.due_date}|${task.due_time || ''}`
    const url = '/tasks'
    const inWindow = (triggerMs: number) => nowMs >= triggerMs && nowMs < triggerMs + GRACE_MS

    // Reminder
    const reminder = task.reminder || 'none'
    const offsetMin = REMINDER_MINUTES[reminder]
    if (offsetMin !== undefined && inWindow(dueMs - offsetMin * 60_000)) {
      const when = `${relativeDay(task.due_date, today)} at ${formatTime12(dueTime)}`
      out.push({
        user_id: task.user_id,
        task_id: task.id,
        kind: 'reminder',
        dedupe_key: `${baseKey}|${reminder}`,
        payload: {
          title: `Reminder: ${task.title}`,
          body: `${offsetMin === 0 ? 'Due now' : `Due ${when}`}${suffix(task)}`,
          url,
          tag: `${task.id}-reminder`,
        },
      })
    }

    // Due soon (skipped when the task's own reminder already fires at the same moment)
    if (
      settings.due_soon_enabled &&
      offsetMin !== DUE_SOON_MINUTES &&
      nowMs < dueMs &&
      inWindow(dueMs - DUE_SOON_MINUTES * 60_000)
    ) {
      const mins = Math.max(1, Math.round((dueMs - nowMs) / 60_000))
      out.push({
        user_id: task.user_id,
        task_id: task.id,
        kind: 'due_soon',
        dedupe_key: baseKey,
        payload: {
          title: `Due soon: ${task.title}`,
          body: `Due in ${mins} min (${formatTime12(dueTime)})${suffix(task)}`,
          url,
          tag: `${task.id}-due-soon`,
        },
      })
    }

    // Overdue: at the due time for timed tasks; 09:00 the next day for date-only tasks
    if (settings.overdue_enabled) {
      const overdueMs = timed ? dueMs : zonedTimeToUtcMs(addDays(task.due_date, 1), DEFAULT_DUE_TIME, tz)
      if (inWindow(overdueMs)) {
        out.push({
          user_id: task.user_id,
          task_id: task.id,
          kind: 'overdue',
          dedupe_key: baseKey,
          payload: {
            title: `Overdue: ${task.title}`,
            body: `Was due ${formatDateShort(task.due_date)}${timed ? ` at ${formatTime12(dueTime)}` : ''}${suffix(task)}`,
            url,
            tag: `${task.id}-overdue`,
          },
        })
      }
    }
  }

  return out
}

/** True when this user's daily summary should be considered right now. */
export function summaryLocalDateIfDue(nowMs: number, settings: Settings): string | null {
  if (!settings.daily_summary_enabled) return null
  const tz = settings.timezone
  const { date } = localParts(nowMs, tz)
  const triggerMs = zonedTimeToUtcMs(date, hhmm(settings.daily_summary_time), tz)
  return nowMs >= triggerMs && nowMs < triggerMs + GRACE_MS ? date : null
}

export type SummaryTask = { title: string; due_time: string | null; priority: string | null }

const SUMMARY_MAX_TITLES = 8
const SUMMARY_MAX_CHARS = 170 // lock screens show only a few lines
const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 }

function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text
}

/** Today's tasks in the order you'd do them: timed ones by time first, then by priority. */
export function sortSummaryTasks(tasks: SummaryTask[]): SummaryTask[] {
  return [...tasks].sort((a, b) => {
    if (!!a.due_time !== !!b.due_time) return a.due_time ? -1 : 1
    if (a.due_time && b.due_time && a.due_time !== b.due_time) return a.due_time < b.due_time ? -1 : 1
    const pa = PRIORITY_RANK[a.priority || ''] ?? 1
    const pb = PRIORITY_RANK[b.priority || ''] ?? 1
    return pa !== pb ? pa - pb : a.title.localeCompare(b.title)
  })
}

/** "Good morning, are you ready?" + today's task titles ("task1, task2, +N more"). Null when nothing is due. */
export function buildSummaryNotification(userId: string, localDate: string, todaysTasks: SummaryTask[]): Notification | null {
  if (todaysTasks.length === 0) return null
  const titles = sortSummaryTasks(todaysTasks).map(t => clip(t.title.trim(), 60))
  const shown: string[] = []
  for (const t of titles) {
    const next = [...shown, t].join(', ')
    if (shown.length > 0 && (shown.length >= SUMMARY_MAX_TITLES || next.length > SUMMARY_MAX_CHARS)) break
    shown.push(t)
  }
  const more = titles.length - shown.length
  return {
    user_id: userId,
    task_id: null,
    kind: 'daily_summary',
    dedupe_key: localDate,
    payload: {
      title: 'Good morning, are you ready?',
      body: shown.join(', ') + (more > 0 ? `, +${more} more` : ''),
      url: '/dashboard',
      tag: 'daily-summary',
    },
  }
}
