import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

// ---- logic ----
// Pure scheduling logic for Jadwali notifications. No I/O, so it can be unit tested with Node.

type Task = {
  id: string
  user_id: string
  title: string
  due_date: string | null // YYYY-MM-DD
  due_time: string | null // HH:MM[:SS]
  status: string
  reminder: string | null
  companies?: { name: string } | null
}

type Settings = {
  user_id: string
  timezone: string
  due_soon_enabled: boolean
  overdue_enabled: boolean
  daily_summary_enabled: boolean
  daily_summary_time: string // HH:MM[:SS]
}

type Kind = 'reminder' | 'due_soon' | 'overdue' | 'daily_summary'

type Notification = {
  user_id: string
  task_id: string | null
  kind: Kind
  dedupe_key: string
  payload: { title: string; body: string; url: string; tag: string }
}

const DEFAULT_DUE_TIME = '09:00'
const DUE_SOON_MINUTES = 60
// A trigger is only sent if it fired within this window. This keeps a delayed
// cron run from sending stale alerts, and stops a flood of old overdue tasks
// the moment someone enables notifications.
const GRACE_MS = 3 * 60 * 60 * 1000

const REMINDER_MINUTES: Record<string, number> = {
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
function zonedTimeToUtcMs(dateStr: string, timeStr: string, tz: string): number {
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
function localParts(nowMs: number, tz: string): { date: string; time: string } {
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

function addDays(dateStr: string, days: number): string {
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
function buildTaskNotifications(nowMs: number, tasks: Task[], settingsByUser: Map<string, Settings>): Notification[] {
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
function summaryLocalDateIfDue(nowMs: number, settings: Settings): string | null {
  if (!settings.daily_summary_enabled) return null
  const tz = settings.timezone
  const { date } = localParts(nowMs, tz)
  const triggerMs = zonedTimeToUtcMs(date, hhmm(settings.daily_summary_time), tz)
  return nowMs >= triggerMs && nowMs < triggerMs + GRACE_MS ? date : null
}

function buildSummaryNotification(userId: string, localDate: string, dueToday: number, overdue: number): Notification | null {
  if (dueToday === 0 && overdue === 0) return null
  const parts: string[] = []
  if (dueToday > 0) parts.push(`${dueToday} due today`)
  if (overdue > 0) parts.push(`${overdue} overdue`)
  return {
    user_id: userId,
    task_id: null,
    kind: 'daily_summary',
    dedupe_key: localDate,
    payload: { title: 'Your day in Jadwali', body: parts.join(' · '), url: '/dashboard', tag: 'daily-summary' },
  }
}

// ---- orchestration ----
// Orchestrates one scheduler tick. All I/O goes through the `Deps` interface so the
// flow (dedupe, retry, dead-subscription pruning) can be tested with in-memory fakes.

type Subscription = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }

type Deps = {
  listSubscriptions(): Promise<Subscription[]>
  listSettings(userIds: string[]): Promise<Settings[]>
  listTasks(userIds: string[], dateFrom: string, dateTo: string): Promise<Task[]>
  countSummary(userId: string, localToday: string): Promise<{ dueToday: number; overdue: number }>
  summarySent(userId: string, localDate: string): Promise<boolean>
  /** Inserts log rows; returns ONLY the rows that were newly inserted (unique key prevents duplicates). */
  insertLog(rows: Notification[]): Promise<Notification[]>
  deleteLog(rows: Notification[]): Promise<void>
  deleteSubscription(id: string): Promise<void>
  /** Throws an error with `statusCode` on failure (404/410 = subscription is gone). */
  send(sub: Subscription, payload: Notification['payload']): Promise<void>
}

type TickResult = { candidates: number; sent: number; duplicates: number; failed: number; pruned: number }

async function deliver(deps: Deps, subs: Subscription[], payload: Notification['payload']) {
  let ok = 0
  let failed = 0
  let pruned = 0
  for (const sub of subs) {
    try {
      await deps.send(sub, payload)
      ok++
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        await deps.deleteSubscription(sub.id)
        pruned++
      } else {
        failed++
      }
    }
  }
  return { ok, failed, pruned }
}

async function runTick(deps: Deps, nowMs: number): Promise<TickResult> {
  const result: TickResult = { candidates: 0, sent: 0, duplicates: 0, failed: 0, pruned: 0 }

  const subs = await deps.listSubscriptions()
  if (subs.length === 0) return result

  const subsByUser = new Map<string, Subscription[]>()
  for (const s of subs) subsByUser.set(s.user_id, [...(subsByUser.get(s.user_id) || []), s])
  const userIds = [...subsByUser.keys()]

  const settingsByUser = new Map((await deps.listSettings(userIds)).map(s => [s.user_id, s]))

  // Wide enough to cover every timezone and the "1 day before" reminder.
  const utcToday = new Date(nowMs).toISOString().slice(0, 10)
  const tasks = await deps.listTasks(userIds, addDays(utcToday, -2), addDays(utcToday, 3))

  const candidates = buildTaskNotifications(nowMs, tasks, settingsByUser)

  for (const settings of settingsByUser.values()) {
    const date = summaryLocalDateIfDue(nowMs, settings)
    if (!date || (await deps.summarySent(settings.user_id, date))) continue
    const { dueToday, overdue } = await deps.countSummary(settings.user_id, localParts(nowMs, settings.timezone).date)
    const n = buildSummaryNotification(settings.user_id, date, dueToday, overdue)
    if (n) candidates.push(n)
  }

  result.candidates = candidates.length
  if (candidates.length === 0) return result

  const fresh = await deps.insertLog(candidates)
  result.duplicates = candidates.length - fresh.length

  for (const n of fresh) {
    const userSubs = subsByUser.get(n.user_id) || []
    const { ok, failed, pruned } = await deliver(deps, userSubs, n.payload)
    result.failed += failed
    result.pruned += pruned
    if (ok > 0) {
      result.sent++
    } else if (failed > 0) {
      // Nothing was delivered because of a transient error: free the dedupe slot so the next tick retries.
      await deps.deleteLog([n])
    }
  }

  return result
}

/** Sends a test push to every device of one user (no dedupe, no log). */
async function sendTest(deps: Deps, userId: string, subs: Subscription[]) {
  return deliver(deps, subs.filter(s => s.user_id === userId), {
    title: 'Jadwali notifications are on',
    body: 'This is a test notification. You will get reminders here.',
    url: '/profile',
    tag: 'test',
  })
}

// ---- entry point ----

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

let vapidReady = false
function ensureVapid() {
  if (vapidReady) return
  const subject = Deno.env.get('VAPID_SUBJECT')
  const pub = Deno.env.get('VAPID_PUBLIC_KEY')
  const priv = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!subject || !pub || !priv) throw new Error('VAPID_SUBJECT, VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY secrets are not set')
  webpush.setVapidDetails(subject, pub, priv)
  vapidReady = true
}

const logKey = (n: Pick<Notification, 'user_id' | 'kind' | 'dedupe_key'>) => `${n.user_id}|${n.kind}|${n.dedupe_key}`

const deps: Deps = {
  async listSubscriptions() {
    const { data, error } = await admin.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth')
    if (error) throw error
    return data as Subscription[]
  },
  async listSettings(userIds) {
    const { data, error } = await admin.from('notification_settings').select('*').in('user_id', userIds)
    if (error) throw error
    return data as Settings[]
  },
  async listTasks(userIds, dateFrom, dateTo) {
    const { data, error } = await admin
      .from('tasks')
      .select('id,user_id,title,due_date,due_time,status,reminder,companies(name)')
      .in('user_id', userIds)
      .neq('status', 'done')
      .gte('due_date', dateFrom)
      .lte('due_date', dateTo)
    if (error) throw error
    return data as unknown as Task[]
  },
  async countSummary(userId, localToday) {
    const base = () => admin.from('tasks').select('id', { count: 'exact', head: true }).eq('user_id', userId).neq('status', 'done')
    const [due, over] = await Promise.all([base().eq('due_date', localToday), base().lt('due_date', localToday)])
    if (due.error) throw due.error
    if (over.error) throw over.error
    return { dueToday: due.count ?? 0, overdue: over.count ?? 0 }
  },
  async summarySent(userId, localDate) {
    const { count, error } = await admin
      .from('notification_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('kind', 'daily_summary')
      .eq('dedupe_key', localDate)
    if (error) throw error
    return (count ?? 0) > 0
  },
  async insertLog(rows) {
    const { data, error } = await admin
      .from('notification_log')
      .upsert(
        rows.map(r => ({ user_id: r.user_id, task_id: r.task_id, kind: r.kind, dedupe_key: r.dedupe_key })),
        { onConflict: 'user_id,kind,dedupe_key', ignoreDuplicates: true },
      )
      .select('user_id,kind,dedupe_key')
    if (error) throw error
    const inserted = new Set((data || []).map(logKey))
    return rows.filter(r => inserted.has(logKey(r)))
  },
  async deleteLog(rows) {
    for (const r of rows) {
      await admin.from('notification_log').delete().eq('user_id', r.user_id).eq('kind', r.kind).eq('dedupe_key', r.dedupe_key)
    }
  },
  async deleteSubscription(id) {
    await admin.from('push_subscriptions').delete().eq('id', id)
  },
  async send(sub, payload) {
    ensureVapid()
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 60, urgency: 'high' },
    )
  },
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  try {
    // Cron path
    const secret = req.headers.get('x-cron-secret')
    if (secret) {
      const { data: row } = await admin.from('app_private').select('value').eq('key', 'cron_secret').maybeSingle()
      if (row?.value && safeEqual(secret, row.value)) {
        return json(await runTick(deps, Date.now()))
      }
    }

    // Signed-in user test path
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    const body = await req.json().catch(() => ({}))
    if (jwt && body?.action === 'test') {
      const { data, error } = await admin.auth.getUser(jwt)
      if (error || !data.user) return json({ error: 'unauthorized' }, 401)
      const { data: subs, error: subsError } = await admin
        .from('push_subscriptions')
        .select('id,user_id,endpoint,p256dh,auth')
        .eq('user_id', data.user.id)
      if (subsError) throw subsError
      if (!subs?.length) return json({ error: 'no devices registered' }, 404)
      const res = await sendTest(deps, data.user.id, subs as Subscription[])
      return json(res)
    }

    return json({ error: 'unauthorized' }, 401)
  } catch (err) {
    console.error('send-notifications failed', err)
    return json({ error: String((err as Error).message || err) }, 500)
  }
})
