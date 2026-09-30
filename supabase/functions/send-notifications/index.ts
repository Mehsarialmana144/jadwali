// Edge Function: send-notifications
//  - Cron path:  POST with header `x-cron-secret` (matches public.app_private 'cron_secret') -> runs one scheduler tick.
//  - Test path:  POST {"action":"test"} with the signed-in user's JWT -> pushes a test notification to that user's devices.
// Deploy with --no-verify-jwt (auth is checked here).
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { runTick, sendTest, type Deps, type Subscription } from './notify.ts'
import type { Notification, Settings, SummaryTask, Task } from './logic.ts'

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
      .select('id,user_id,title,due_date,due_time,status,remind_before_minutes,notify_at_time,updated_at,companies(name)')
      .in('user_id', userIds)
      .neq('status', 'done')
      .or('remind_before_minutes.not.is.null,notify_at_time.eq.true')
      .gte('due_date', dateFrom)
      .lte('due_date', dateTo)
    if (error) throw error
    return data as unknown as Task[]
  },
  async todaysTasks(userId, localToday) {
    const { data, error } = await admin
      .from('tasks')
      .select('title,due_time,priority')
      .eq('user_id', userId)
      .neq('status', 'done')
      .eq('due_date', localToday)
    if (error) throw error
    return data as SummaryTask[]
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
