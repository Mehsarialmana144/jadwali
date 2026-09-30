// Run with: node supabase/functions/send-notifications/test.ts   (Node 22.18+/24+ strips types natively)
import assert from 'node:assert/strict'
import {
  buildTaskNotifications, buildSummaryNotification, formatLead, localParts, summaryLocalDateIfDue, zonedTimeToUtcMs, type SummaryTask,
  type Notification, type Settings, type Task,
} from './logic.ts'
import { runTick, type Deps, type Subscription } from './notify.ts'

let passed = 0
const test = async (name: string, fn: () => void | Promise<void>) => {
  await fn()
  passed++
  console.log('  ok -', name)
}

const at = (iso: string) => Date.parse(iso)
const RIYADH = 'Asia/Riyadh' // UTC+3, no DST
const NY = 'America/New_York'

const settings = (over: Partial<Settings> = {}): Settings => ({
  user_id: 'u1', timezone: RIYADH, daily_summary_enabled: false, daily_summary_time: '08:00:00', ...over,
})
// Task due 2026-09-29 14:00 Riyadh (= 11:00Z), saved long before, both notifications OFF unless a test turns them on.
const task = (over: Partial<Task> = {}): Task => ({
  id: 't1', user_id: 'u1', title: 'Send invoice', due_date: '2026-09-29', due_time: '14:00:00',
  status: 'todo', remind_before_minutes: null, notify_at_time: false, updated_at: '2026-09-28T08:00:00Z', companies: null, ...over,
})
const map = (s: Settings) => new Map([[s.user_id, s]])
const kinds = (ns: Notification[]) => ns.map(n => n.kind).sort()
const has = (ns: Notification[], kind: string) => ns.some(n => n.kind === kind)
const run = (nowIso: string, t: Task, s: Settings = settings()) => buildTaskNotifications(at(nowIso), [t], map(s))

console.log('time zone math')
await test('Riyadh 14:00 is 11:00Z', () => assert.equal(zonedTimeToUtcMs('2026-09-29', '14:00', RIYADH), at('2026-09-29T11:00:00Z')))
await test('New York 09:00 in September (EDT) is 13:00Z', () => assert.equal(zonedTimeToUtcMs('2026-09-29', '09:00', NY), at('2026-09-29T13:00:00Z')))
await test('New York 09:00 in January (EST) is 14:00Z', () => assert.equal(zonedTimeToUtcMs('2026-01-15', '09:00', NY), at('2026-01-15T14:00:00Z')))
await test('invalid timezone falls back to UTC', () => assert.equal(zonedTimeToUtcMs('2026-09-29', '10:00', 'Not/AZone'), at('2026-09-29T10:00:00Z')))
await test('localParts rolls the date over per zone', () => {
  assert.deepEqual(localParts(at('2026-09-29T22:30:00Z'), RIYADH), { date: '2026-09-30', time: '01:30' })
  assert.deepEqual(localParts(at('2026-09-29T22:30:00Z'), NY), { date: '2026-09-29', time: '18:30' })
})

console.log('reminder before the task')
await test('fires exactly N minutes before, not a minute earlier', () => {
  const t = task({ remind_before_minutes: 30 })
  assert.equal(run('2026-09-29T10:29:59Z', t).length, 0) // 13:29:59 local
  const hit = run('2026-09-29T10:30:00Z', t) // 13:30:00 local
  assert.deepEqual(kinds(hit), ['reminder'])
  assert.match(hit[0].payload.title, /^Reminder: Send invoice$/)
  assert.match(hit[0].payload.body, /In 30 min · today at 2:00 PM/)
})
await test('every offered lead time fires at its own moment', () => {
  for (const [min, iso] of [[5, '2026-09-29T10:55:00Z'], [10, '2026-09-29T10:50:00Z'], [15, '2026-09-29T10:45:00Z'], [30, '2026-09-29T10:30:00Z'], [60, '2026-09-29T10:00:00Z'], [120, '2026-09-29T09:00:00Z'], [1440, '2026-09-28T11:00:00Z']] as const) {
    const t = task({ remind_before_minutes: min })
    assert.equal(run(iso, t).length, 1, `${min} min at ${iso}`)
    assert.equal(run(new Date(at(iso) - 1000).toISOString(), t).length, 0, `${min} min, 1s earlier`)
  }
})
await test('lead time wording', () => {
  assert.deepEqual([5, 15, 60, 120, 1440, 2880].map(formatLead), ['5 min', '15 min', '1 hour', '2 hours', '1 day', '2 days'])
})
await test('1 day before mentions tomorrow', () => {
  const hit = run('2026-09-28T11:00:00Z', task({ remind_before_minutes: 1440 }))
  assert.match(hit[0].payload.body, /In 1 day · tomorrow at 2:00 PM/)
})
await test('null / 0 means the reminder is off', () => {
  for (const off of [null, 0]) assert.equal(run('2026-09-29T10:59:00Z', task({ remind_before_minutes: off })).length, 0)
})

console.log('notify at task time')
await test('fires exactly at the task time, not a second before', () => {
  const t = task({ notify_at_time: true })
  assert.equal(run('2026-09-29T10:59:59Z', t).length, 0)
  const hit = run('2026-09-29T11:00:00Z', t)
  assert.deepEqual(kinds(hit), ['at_time'])
  assert.equal(hit[0].payload.title, 'Now: Send invoice')
  assert.equal(hit[0].payload.body, 'Scheduled for 2:00 PM')
})
await test('off means nothing at the task time', () => {
  assert.equal(run('2026-09-29T11:00:30Z', task({ notify_at_time: false })).length, 0)
  assert.equal(run('2026-09-29T11:00:30Z', task({ notify_at_time: null })).length, 0)
})

console.log('the two types are independent')
await test('only "before" on -> only a reminder, nothing at task time', () => {
  const t = task({ remind_before_minutes: 15 })
  assert.deepEqual(kinds(run('2026-09-29T10:45:30Z', t)), ['reminder'])
  assert.ok(!has(run('2026-09-29T11:00:30Z', t), 'at_time')) // (the earlier reminder is re-offered but the send log blocks it)
})
await test('only "at time" on -> nothing before', () => {
  const t = task({ notify_at_time: true })
  assert.equal(run('2026-09-29T10:45:30Z', t).length, 0)
  assert.deepEqual(kinds(run('2026-09-29T11:00:30Z', t)), ['at_time'])
})
await test('both on -> two separate notifications at two different moments', () => {
  const t = task({ remind_before_minutes: 15, notify_at_time: true })
  assert.deepEqual(kinds(run('2026-09-29T10:45:30Z', t)), ['reminder'])
  assert.ok(has(run('2026-09-29T11:00:30Z', t), 'at_time'))
  assert.notEqual(run('2026-09-29T10:45:30Z', t)[0].dedupe_key, run('2026-09-29T11:00:30Z', t).find(n => n.kind === 'at_time')!.dedupe_key)
})
await test('a 5-minute reminder and the at-time notification never share a dedupe key', () => {
  const t = task({ remind_before_minutes: 5, notify_at_time: true })
  const keys = run('2026-09-29T11:00:30Z', t).map(n => n.dedupe_key)
  assert.equal(keys.length, 2)
  assert.equal(new Set(keys).size, 2)
})
await test('neither on -> silent, and there is no due-soon / overdue any more', () => {
  const t = task()
  for (const iso of ['2026-09-29T10:00:00Z', '2026-09-29T10:59:00Z', '2026-09-29T11:00:30Z', '2026-09-29T11:30:00Z', '2026-09-30T06:05:00Z']) assert.equal(run(iso, t).length, 0, iso)
})

console.log('rules that apply to both')
await test('date-only task counts as 09:00 local', () => {
  const t = task({ due_time: null, notify_at_time: true, remind_before_minutes: 30 })
  assert.equal(run('2026-09-29T05:29:59Z', t).length, 0)
  assert.deepEqual(kinds(run('2026-09-29T05:30:00Z', t)), ['reminder']) // 08:30 local
  assert.ok(has(run('2026-09-29T06:00:00Z', t), 'at_time')) // 09:00 local
})
await test('done tasks and users without settings are ignored', () => {
  assert.equal(run('2026-09-29T11:00:30Z', task({ status: 'done', notify_at_time: true })).length, 0)
  assert.equal(run('2026-09-29T11:00:30Z', task({ user_id: 'nobody', notify_at_time: true })).length, 0)
})
await test('in-progress tasks still notify', () => {
  assert.deepEqual(kinds(run('2026-09-29T11:00:30Z', task({ status: 'in_progress', notify_at_time: true }))), ['at_time'])
})
await test('a task with no due date never notifies', () => {
  assert.equal(run('2026-09-29T11:00:30Z', task({ due_date: null, notify_at_time: true, remind_before_minutes: 15 })).length, 0)
})
await test('stale triggers (older than 3h) are dropped', () => {
  assert.equal(run('2026-09-29T14:30:00Z', task({ notify_at_time: true })).length, 0)
  assert.equal(run('2026-09-29T13:59:00Z', task({ notify_at_time: true })).length, 1) // still inside the window
})
await test('moments that had ALREADY passed when the task was saved are skipped', () => {
  // saved at 13:40 local (10:40Z) for a 14:00 task: the 30-min-before moment (13:30) was in the past
  const t = task({ remind_before_minutes: 30, notify_at_time: true, updated_at: '2026-09-29T10:40:00Z' })
  assert.equal(run('2026-09-29T10:41:00Z', t).length, 0)
  assert.deepEqual(kinds(run('2026-09-29T11:00:00Z', t)), ['at_time']) // 14:00 is still ahead -> fires
  // a task created AFTER its at-time never fires
  assert.equal(run('2026-09-29T11:00:30Z', task({ notify_at_time: true, updated_at: '2026-09-29T11:00:10Z' })).length, 0)
})
await test('changing status before the moment does not cancel it (unless done)', () => {
  const t = task({ notify_at_time: true, updated_at: '2026-09-29T10:20:00Z' }) // edited at 13:20, task at 14:00
  assert.deepEqual(kinds(run('2026-09-29T11:00:00Z', t)), ['at_time'])
})
await test('rescheduling the task creates a new dedupe key (notifies again for the new time)', () => {
  const a = run('2026-09-29T11:00:00Z', task({ notify_at_time: true }))[0].dedupe_key
  const b = run('2026-09-29T12:30:00Z', task({ notify_at_time: true, due_time: '15:30:00', updated_at: '2026-09-29T10:00:00Z' }))[0].dedupe_key
  assert.notEqual(a, b)
})
await test('changing the lead time creates a new dedupe key', () => {
  const a = run('2026-09-29T10:45:00Z', task({ remind_before_minutes: 15 }))[0].dedupe_key
  const b = run('2026-09-29T10:30:00Z', task({ remind_before_minutes: 30 }))[0].dedupe_key
  assert.notEqual(a, b)
})
await test('company name is appended to the body', () => {
  const hit = run('2026-09-29T11:00:00Z', task({ notify_at_time: true, companies: { name: 'Boud Ai' } }))
  assert.match(hit[0].payload.body, /· Boud Ai$/)
})

console.log('daily summary')
await test('due only inside the window after the chosen local time', () => {
  const s = settings({ daily_summary_enabled: true })
  assert.equal(summaryLocalDateIfDue(at('2026-09-29T04:59:00Z'), s), null) // 07:59 local
  assert.equal(summaryLocalDateIfDue(at('2026-09-29T05:01:00Z'), s), '2026-09-29') // 08:01 local
  assert.equal(summaryLocalDateIfDue(at('2026-09-29T09:00:00Z'), s), null) // 12:00 local, past grace
  assert.equal(summaryLocalDateIfDue(at('2026-09-29T05:01:00Z'), settings()), null) // disabled
})
const st = (title: string, due_time: string | null = null, priority: string | null = 'medium'): SummaryTask => ({ title, due_time, priority })
await test('title is "Good morning, are you ready?" and body lists today\'s tasks', () => {
  const n = buildSummaryNotification('u1', '2026-09-29', [st('Send invoice'), st('Book dentist'), st('Plan trip')])!
  assert.equal(n.payload.title, 'Good morning, are you ready?')
  assert.equal(n.payload.body, 'Book dentist, Plan trip, Send invoice') // same priority: alphabetical
  assert.equal(n.payload.url, '/dashboard')
  assert.equal(n.kind, 'daily_summary')
  assert.equal(n.dedupe_key, '2026-09-29')
})
await test('summary order: timed tasks by time first, then priority (high first)', () => {
  const n = buildSummaryNotification('u1', 'd', [st('Low untimed', null, 'low'), st('High untimed', null, 'high'), st('Afternoon', '14:00:00'), st('Morning', '09:00:00')])!
  assert.equal(n.payload.body, 'Morning, Afternoon, High untimed, Low untimed')
})
await test('summary is silent when nothing is due today', () => {
  assert.equal(buildSummaryNotification('u1', 'd', []), null)
})
await test('summary caps a long list with "+N more"', () => {
  const many = Array.from({ length: 12 }, (_, i) => st(`Task ${String(i + 1).padStart(2, '0')}`, `${String(8 + i).padStart(2, '0')}:00:00`))
  const n = buildSummaryNotification('u1', 'd', many)!
  assert.equal(n.payload.body, 'Task 01, Task 02, Task 03, Task 04, Task 05, Task 06, Task 07, Task 08, +4 more')
})
await test('summary cuts off by length and shortens very long titles', () => {
  const long = Array.from({ length: 6 }, (_, i) => st('A fairly long task title number ' + (i + 1) + ' for testing', `${String(8 + i).padStart(2, '0')}:00:00`))
  const n = buildSummaryNotification('u1', 'd', long)!
  assert.ok(n.payload.body.length <= 200, String(n.payload.body.length))
  assert.match(n.payload.body, /\+\d+ more$/)
  const one = buildSummaryNotification('u1', 'd', [st('x'.repeat(200))])!
  assert.ok(one.payload.body.length <= 60 && one.payload.body.endsWith('…'))
})

console.log('full tick (fake database + fake push service)')
function fake(opts: { subs?: Subscription[]; settings?: Settings[]; tasks?: Task[]; sendImpl?: (s: Subscription) => void } = {}) {
  const log = new Set<string>()
  const sent: Array<{ sub: string; title: string }> = []
  const sentBodies: string[] = []
  const deleted: string[] = []
  const subs = opts.subs ?? [{ id: 's1', user_id: 'u1', endpoint: 'https://push/1', p256dh: 'k', auth: 'a' }]
  const key = (n: Notification) => `${n.user_id}|${n.kind}|${n.dedupe_key}`
  const deps: Deps = {
    listSubscriptions: async () => subs.filter(s => !deleted.includes(s.id)),
    listSettings: async () => opts.settings ?? [{ ...settings(), daily_summary_enabled: true, daily_summary_time: '13:00:00' }],
    listTasks: async () => opts.tasks ?? [task({ remind_before_minutes: 30 })],
    todaysTasks: async () => [{ title: 'Send invoice', due_time: '09:00:00', priority: 'high' }, { title: 'Book dentist', due_time: null, priority: 'medium' }],
    summarySent: async (u, d) => log.has(`${u}|daily_summary|${d}`),
    insertLog: async rows => {
      const fresh = rows.filter(r => !log.has(key(r)))
      fresh.forEach(r => log.add(key(r)))
      return fresh
    },
    deleteLog: async rows => rows.forEach(r => log.delete(key(r))),
    deleteSubscription: async id => { deleted.push(id) },
    send: async (sub, payload) => {
      opts.sendImpl?.(sub)
      sent.push({ sub: sub.id, title: payload.title })
      sentBodies.push(payload.body)
    },
  }
  return { deps, sent, sentBodies, deleted, log }
}

await test('sends a due reminder and the daily summary once', async () => {
  const f = fake()
  const now = at('2026-09-29T10:31:00Z') // 13:31 Riyadh; summary set for 13:00 local
  const r = await runTick(f.deps, now)
  assert.equal(r.sent, 2)
  assert.deepEqual(f.sent.map(s => s.title).sort(), ['Good morning, are you ready?', 'Reminder: Send invoice'].sort())
  assert.equal(f.sentBodies.find(b => b.includes('Send invoice, Book dentist')), 'Send invoice, Book dentist')
})
await test('NO duplicates: the same minute or the next minute sends nothing new', async () => {
  const f = fake()
  const now = at('2026-09-29T10:31:00Z')
  await runTick(f.deps, now)
  const before = f.sent.length
  const again = await runTick(f.deps, now)
  const later = await runTick(f.deps, now + 60_000)
  assert.equal(f.sent.length, before)
  assert.equal(again.sent + later.sent, 0)
  assert.ok(again.duplicates >= 1)
})
await test('a second device of the same user also receives the push', async () => {
  const f = fake({
    subs: [
      { id: 's1', user_id: 'u1', endpoint: 'e1', p256dh: 'k', auth: 'a' },
      { id: 's2', user_id: 'u1', endpoint: 'e2', p256dh: 'k', auth: 'a' },
    ],
    settings: [settings()],
  })
  await runTick(f.deps, at('2026-09-29T10:31:00Z'))
  assert.deepEqual(f.sent.map(s => s.sub).sort(), ['s1', 's2'])
})
await test('a dead subscription (410) is pruned and the live one still gets it', async () => {
  const f = fake({
    subs: [
      { id: 'dead', user_id: 'u1', endpoint: 'e1', p256dh: 'k', auth: 'a' },
      { id: 'live', user_id: 'u1', endpoint: 'e2', p256dh: 'k', auth: 'a' },
    ],
    settings: [settings()],
    sendImpl: s => { if (s.id === 'dead') throw Object.assign(new Error('gone'), { statusCode: 410 }) },
  })
  const r = await runTick(f.deps, at('2026-09-29T10:31:00Z'))
  assert.deepEqual(f.deleted, ['dead'])
  assert.deepEqual(f.sent.map(s => s.sub), ['live'])
  assert.equal(r.pruned, 1)
})
await test('a transient send failure frees the dedupe slot and the next tick retries', async () => {
  let fail = true
  const f = fake({ settings: [settings()], sendImpl: () => { if (fail) throw Object.assign(new Error('503'), { statusCode: 503 }) } })
  const now = at('2026-09-29T10:31:00Z')
  const r1 = await runTick(f.deps, now)
  assert.equal(r1.sent, 0)
  assert.equal(r1.failed, 1)
  fail = false
  const r2 = await runTick(f.deps, now + 60_000)
  assert.equal(r2.sent, 1)
  const r3 = await runTick(f.deps, now + 120_000)
  assert.equal(r3.sent, 0)
})
await test('scheduler simulation: one tick per minute -> reminder on the 13:45 tick, at-time on the 14:00 tick, each exactly once', async () => {
  const f = fake({ settings: [settings()], tasks: [task({ remind_before_minutes: 15, notify_at_time: true })] })
  const sentAt: Array<{ tick: string; title: string }> = []
  let seen = 0
  for (let t = at('2026-09-29T10:20:00Z'); t <= at('2026-09-29T14:20:00Z'); t += 60_000) { // 13:20 .. 17:20 local, every minute
    await runTick(f.deps, t)
    while (seen < f.sent.length) { sentAt.push({ tick: new Date(t + 3 * 3600_000).toISOString().slice(11, 16), title: f.sent[seen].title }); seen++ }
  }
  assert.deepEqual(sentAt, [{ tick: '13:45', title: 'Reminder: Send invoice' }, { tick: '14:00', title: 'Now: Send invoice' }])
})
await test('scheduler simulation: turning both off, or marking done before the moment, sends nothing', async () => {
  for (const t of [task(), task({ remind_before_minutes: 15, notify_at_time: true, status: 'done' })]) {
    const f = fake({ settings: [settings()], tasks: [t] })
    for (let m = at('2026-09-29T10:00:00Z'); m <= at('2026-09-29T12:00:00Z'); m += 60_000) await runTick(f.deps, m)
    assert.equal(f.sent.length, 0)
  }
})
await test('no subscriptions means nothing is queried or sent', async () => {
  const f = fake({ subs: [] })
  const r = await runTick(f.deps, at('2026-09-29T10:31:00Z'))
  assert.deepEqual(r, { candidates: 0, sent: 0, duplicates: 0, failed: 0, pruned: 0 })
})
await test('a user without a settings row gets nothing', async () => {
  const f = fake({ settings: [] })
  const r = await runTick(f.deps, at('2026-09-29T10:31:00Z'))
  assert.equal(r.sent, 0)
})

console.log(`\n${passed} tests passed`)
