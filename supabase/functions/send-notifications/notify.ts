// Orchestrates one scheduler tick. All I/O goes through the `Deps` interface so the
// flow (dedupe, retry, dead-subscription pruning) can be tested with in-memory fakes.
import {
  addDays,
  buildSummaryNotification,
  buildTaskNotifications,
  localParts,
  summaryLocalDateIfDue,
  type Notification,
  type Settings,
  type SummaryTask,
  type Task,
} from './logic.ts'

export type Subscription = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }

export type Deps = {
  listSubscriptions(): Promise<Subscription[]>
  listSettings(userIds: string[]): Promise<Settings[]>
  listTasks(userIds: string[], dateFrom: string, dateTo: string): Promise<Task[]>
  /** Tasks due on `localToday` that are not done. */
  todaysTasks(userId: string, localToday: string): Promise<SummaryTask[]>
  summarySent(userId: string, localDate: string): Promise<boolean>
  /** Inserts log rows; returns ONLY the rows that were newly inserted (unique key prevents duplicates). */
  insertLog(rows: Notification[]): Promise<Notification[]>
  deleteLog(rows: Notification[]): Promise<void>
  deleteSubscription(id: string): Promise<void>
  /** Throws an error with `statusCode` on failure (404/410 = subscription is gone). */
  send(sub: Subscription, payload: Notification['payload']): Promise<void>
}

export type TickResult = { candidates: number; sent: number; duplicates: number; failed: number; pruned: number }

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

export async function runTick(deps: Deps, nowMs: number): Promise<TickResult> {
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
    const todays = await deps.todaysTasks(settings.user_id, localParts(nowMs, settings.timezone).date)
    const n = buildSummaryNotification(settings.user_id, date, todays)
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
export async function sendTest(deps: Deps, userId: string, subs: Subscription[]) {
  return deliver(deps, subs.filter(s => s.user_id === userId), {
    title: 'Jadwali notifications are on',
    body: 'This is a test notification. You will get reminders here.',
    url: '/profile',
    tag: 'test',
  })
}
