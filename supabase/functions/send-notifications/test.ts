// Run with: node supabase/functions/send-notifications/test.ts   (Node 22.18+/24+ strips types natively)
import assert from 'node:assert/strict'
import {
  buildTaskNotifications, buildSummaryNotification, localParts, summaryLocalDateIfDue, zonedTimeToUtcMs, type SummaryTask,
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
  user_id: 'u1', timezone: RIYADH, due_soon_enabled: true, overdue_enabled: true,
  daily_summary_enabled: false, daily_summary_time: '08:00:00', ...over,
})
const task = (over: Partial<Task> = {}): Task => ({
  id: 't1', user_id: 'u1', title: 'Send invoice', due_date: '2026-09-29', due_time: '14:00:00',
  status: 'todo', reminder: 'none', companies: null, ...over,
})
const quiet = () => settings({ due_soon_enabled: false, overdue_enabled: false })
const map = (s: Settings) => new Map([[s.user_id, s]])
const kinds = (ns: Notification[]) => ns.map(n => n.kind).sort()

console.log('time zone math')
await test('Riyadh 14:00 is 11:00Z', () => assert.equal(zonedTimeToUtcMs('2026-09-29', '14:00', RIYADH), at('2026-09-29T11:00:00Z')))
await test('New York 09:00 in September (EDT) is 13:00Z', () => assert.equal(zonedTimeToUtcMs('2026-09-29', '09:00', NY), at('2026-09-29T13:00:00Z')))
await test('New York 09:00 in January (EST) is 14:00Z', () => assert.equal(zonedTimeToUtcMs('2026-01-15', '09:00', NY), at('2026-01-15T14:00:00Z')))
await test('invalid timezone falls back to UTC', () => assert.equal(zonedTimeToUtcMs('2026-09-29', '10:00', 'Not/AZone'), at('2026-09-29T10:00:00Z')))
await test('localParts rolls the date over per zone', () => {
  assert.deepEqual(localParts(at('2026-09-29T22:30:00Z'), RIYADH), { date: '2026-09-30', time: '01:30' })
  assert.deepEqual(localParts(at('2026-09-29T22:30:00Z'), NY), { date: '2026-09-29', time: '18:30' })
})

console.log('task notifications')
await test('30m reminder fires at 13:30 local, not before', () => {
  const s = settings({ due_soon_enabled: false, overdue_enabled: false })
  const t = task({ reminder: '30m' })
  assert.equal(buildTaskNotifications(at('2026-09-29T10:29:00Z'), [t], map(s)).length, 0)
  const hit = buildTaskNotifications(at('2026-09-29T10:31:00Z'), [t], map(s))
  assert.deepEqual(kinds(hit), ['reminder'])
  assert.match(hit[0].payload.body, /Due today at 2:00 PM/)
})
await test('reminder "none" sends no reminder', () => {
  const s = settings({ due_soon_enabled: false, overdue_enabled: false })
  assert.equal(buildTaskNotifications(at('2026-09-29T10:59:00Z'), [task()], map(s)).length, 0)
})
await test('at_time reminder fires at the due moment', () => {
  const s = settings({ due_soon_enabled: false, overdue_enabled: false })
  const hit = buildTaskNotifications(at('2026-09-29T11:00:30Z'), [task({ reminder: 'at_time' })], map(s))
  assert.equal(hit[0].payload.body, 'Due now')
})
await test('1d reminder fires the previous day', () => {
  const s = settings({ due_soon_enabled: false, overdue_enabled: false })
  const hit = buildTaskNotifications(at('2026-09-28T11:05:00Z'), [task({ reminder: '1d' })], map(s))
  assert.equal(hit.length, 1)
  assert.match(hit[0].payload.body, /Due tomorrow at 2:00 PM/)
})
await test('due soon fires 1h before, with minutes left', () => {
  const hit = buildTaskNotifications(at('2026-09-29T10:05:00Z'), [task()], map(settings()))
  assert.deepEqual(kinds(hit), ['due_soon'])
  assert.match(hit[0].payload.body, /Due in 55 min/)
})
await test('due soon is skipped when a 1h reminder already covers it', () => {
  const hit = buildTaskNotifications(at('2026-09-29T10:05:00Z'), [task({ reminder: '1h' })], map(settings()))
  assert.deepEqual(kinds(hit), ['reminder'])
})
await test('due soon can be turned off', () => {
  assert.equal(buildTaskNotifications(at('2026-09-29T10:05:00Z'), [task()], map(settings({ due_soon_enabled: false }))).length, 0)
})
await test('timed task is overdue at its due time', () => {
  const hit = buildTaskNotifications(at('2026-09-29T11:02:00Z'), [task()], map(settings()))
  assert.deepEqual(kinds(hit), ['overdue'])
})
await test('date-only task is overdue at 09:00 the next day, not on the due day', () => {
  const t = task({ due_time: null })
  assert.equal(buildTaskNotifications(at('2026-09-29T20:00:00Z'), [t], map(settings())).length, 0)
  const hit = buildTaskNotifications(at('2026-09-30T06:05:00Z'), [t], map(settings())) // 09:05 Riyadh
  assert.deepEqual(kinds(hit), ['overdue'])
})
await test('date-only task uses 09:00 as its reminder base', () => {
  const t = task({ due_time: null, reminder: 'at_time' })
  const s = map(settings({ due_soon_enabled: false, overdue_enabled: false }))
  assert.equal(buildTaskNotifications(at('2026-09-29T05:59:00Z'), [t], s).length, 0) // 08:59 local
  assert.equal(buildTaskNotifications(at('2026-09-29T06:01:00Z'), [t], s).length, 1) // 09:01 local
})
await test('stale triggers (older than the grace window) are ignored', () => {
  assert.equal(buildTaskNotifications(at('2026-09-29T20:00:00Z'), [task()], map(settings())).length, 0)
})
await test('done tasks and users without settings are ignored', () => {
  assert.equal(buildTaskNotifications(at('2026-09-29T11:02:00Z'), [task({ status: 'done' })], map(settings())).length, 0)
  assert.equal(buildTaskNotifications(at('2026-09-29T11:02:00Z'), [task({ user_id: 'nobody' })], map(settings())).length, 0)
})
await test('changing the due time produces a new dedupe key (re-notifies)', () => {
  const a = buildTaskNotifications(at('2026-09-29T11:02:00Z'), [task()], map(settings()))[0].dedupe_key
  const b = buildTaskNotifications(at('2026-09-29T12:32:00Z'), [task({ due_time: '15:30:00' })], map(settings()))[0].dedupe_key
  assert.notEqual(a, b)
})
await test('company name is appended to the body', () => {
  const hit = buildTaskNotifications(at('2026-09-29T11:02:00Z'), [task({ companies: { name: 'Boud Ai' } })], map(settings()))
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
    listSettings: async () => opts.settings ?? [{ ...quiet(), daily_summary_enabled: true, daily_summary_time: '13:00:00' }],
    listTasks: async () => opts.tasks ?? [task({ reminder: '30m' })],
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
    settings: [quiet()],
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
    settings: [quiet()],
    sendImpl: s => { if (s.id === 'dead') throw Object.assign(new Error('gone'), { statusCode: 410 }) },
  })
  const r = await runTick(f.deps, at('2026-09-29T10:31:00Z'))
  assert.deepEqual(f.deleted, ['dead'])
  assert.deepEqual(f.sent.map(s => s.sub), ['live'])
  assert.equal(r.pruned, 1)
})
await test('a transient send failure frees the dedupe slot and the next tick retries', async () => {
  let fail = true
  const f = fake({ settings: [quiet()], sendImpl: () => { if (fail) throw Object.assign(new Error('503'), { statusCode: 503 }) } })
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
