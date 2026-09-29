import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../App'
import { browserTimezone, disablePush, enablePush, getPushStatus, isIOS, sendTestNotification, syncTimezone } from '../lib/push'

const DEFAULTS = {
  due_soon_enabled: true,
  overdue_enabled: true,
  daily_summary_enabled: false,
  daily_summary_time: '08:00',
}

export default function NotificationSettings() {
  const { session } = useAuth()
  const userId = session.user.id

  const [status, setStatus] = useState('checking')
  const [settings, setSettings] = useState(DEFAULTS)
  const [setupError, setSetupError] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  async function refreshStatus() {
    setStatus(await getPushStatus())
  }

  useEffect(() => {
    refreshStatus()
    let cancelled = false
    ;(async () => {
      await syncTimezone(userId)
      const { data, error: err } = await supabase.from('notification_settings').select('*').eq('user_id', userId).maybeSingle()
      if (cancelled) return
      if (err) {
        setSetupError(err.message)
        return
      }
      setSetupError('')
      if (data) setSettings({ ...DEFAULTS, ...data, daily_summary_time: (data.daily_summary_time || '08:00').slice(0, 5) })
    })()
    return () => { cancelled = true }
  }, [userId])

  async function update(patch) {
    const prev = settings
    const next = { ...settings, ...patch }
    setSettings(next)
    setError('')
    const { error: err } = await supabase.from('notification_settings').upsert(
      {
        user_id: userId,
        timezone: browserTimezone(),
        due_soon_enabled: next.due_soon_enabled,
        overdue_enabled: next.overdue_enabled,
        daily_summary_enabled: next.daily_summary_enabled,
        daily_summary_time: next.daily_summary_time || '08:00',
      },
      { onConflict: 'user_id' },
    )
    if (err) {
      setSettings(prev)
      setError(`Could not save: ${err.message}`)
    }
  }

  async function run(action, okMessage) {
    setBusy(true)
    setError('')
    setInfo('')
    try {
      await action()
      if (okMessage) setInfo(okMessage)
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    }
    await refreshStatus()
    setBusy(false)
  }

  return (
    <div>
      <div className="mb-3">
        <h2 className="font-display text-base font-semibold text-ink">Notifications</h2>
        <p className="text-xs text-ink-muted mt-0.5">Get reminders as push notifications on this device.</p>
      </div>

      <div className="card p-4 space-y-4 min-w-0">
        {setupError && (
          <p className="text-sm text-amber-700 dark:text-amber-400 bg-amber-500/10 px-3 py-2 rounded-lg break-words">
            Notification settings aren't set up in the database yet. Run the notifications section of{' '}
            <code>supabase-schema.sql</code> in the Supabase SQL Editor. ({setupError})
          </p>
        )}

        <DeviceStatus
          status={status}
          busy={busy}
          onEnable={() => run(() => enablePush(userId), 'Notifications are on for this device.')}
          onDisable={() => run(() => disablePush(), 'Notifications turned off for this device.')}
          onTest={() => run(async () => { await sendTestNotification() }, 'Test sent. It should arrive in a few seconds.')}
        />

        {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-500/10 px-3 py-2 rounded-lg break-words">{error}</p>}
        {info && <p className="text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-2 rounded-lg">{info}</p>}

        <div className="divide-y divide-surface-border border-t border-surface-border min-w-0">
          <ToggleRow
            label="Due soon"
            hint="About 1 hour before a task is due."
            checked={settings.due_soon_enabled}
            onChange={v => update({ due_soon_enabled: v })}
          />
          <ToggleRow
            label="Overdue"
            hint="When a task passes its due time. Tasks with only a date are flagged at 9:00 AM the next day."
            checked={settings.overdue_enabled}
            onChange={v => update({ overdue_enabled: v })}
          />
          <ToggleRow
            label="Daily summary"
            hint="One notification with what is due today and overdue."
            checked={settings.daily_summary_enabled}
            onChange={v => update({ daily_summary_enabled: v })}
          >
            {settings.daily_summary_enabled && (
              <input
                type="time"
                aria-label="Daily summary time"
                className="input w-auto text-sm py-1.5 mt-2"
                value={settings.daily_summary_time}
                onChange={e => e.target.value && update({ daily_summary_time: e.target.value })}
              />
            )}
          </ToggleRow>
        </div>

        <p className="text-[11px] text-ink-faint">
          Reminders per task are set when you add or edit a task. Timezone: {browserTimezone()} (detected automatically).
          Tasks with a date but no time are treated as 9:00 AM.
        </p>
      </div>
    </div>
  )
}

function DeviceStatus({ status, busy, onEnable, onDisable, onTest }) {
  if (status === 'checking') return <p className="text-sm text-ink-muted">Checking this device…</p>

  if (status === 'needs-install') {
    return (
      <div className="text-sm text-ink space-y-1.5">
        <p className="font-medium">Add Jadwali to your Home Screen first</p>
        <p className="text-ink-muted">
          {isIOS() ? 'iPhone and iPad only allow notifications for apps on the Home Screen.' : 'Install the app to enable notifications.'}
        </p>
        <ol className="list-decimal pl-5 text-ink-muted space-y-0.5">
          <li>Open Jadwali in Safari and tap the Share button.</li>
          <li>Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
          <li>Open Jadwali from your Home Screen, come back to Profile, and tap Enable.</li>
        </ol>
      </div>
    )
  }

  if (status === 'unsupported') return <p className="text-sm text-ink-muted">This browser doesn't support push notifications. Try a recent Chrome, Edge, Firefox or Safari.</p>
  if (status === 'no-key') return <p className="text-sm text-amber-700 dark:text-amber-400">Push isn't configured: <code>VITE_VAPID_PUBLIC_KEY</code> is missing from this build.</p>
  if (status === 'denied') return <p className="text-sm text-ink-muted">Notifications are blocked for Jadwali. Allow them in your browser or device settings, then reload this page.</p>

  if (status === 'on') {
    return (
      <div className="flex flex-col min-[420px]:flex-row min-[420px]:items-center justify-between gap-2.5">
        <p className="text-sm text-ink flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
          Notifications are on for this device
        </p>
        <div className="flex gap-2">
          <button onClick={onTest} disabled={busy} className="btn-secondary text-xs px-3 py-1.5">Send test</button>
          <button onClick={onDisable} disabled={busy} className="btn-ghost text-xs px-3 py-1.5">Turn off</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-[420px]:flex-row min-[420px]:items-center justify-between gap-2.5">
      <p className="text-sm text-ink-muted">Notifications are off on this device.</p>
      <button onClick={onEnable} disabled={busy} className="btn-primary text-sm">{busy ? 'Enabling…' : 'Enable notifications'}</button>
    </div>
  )
}

function ToggleRow({ label, hint, checked, onChange, children }) {
  return (
    <div className="py-3 first:pt-3 min-w-0">
      <div className="flex items-start justify-between gap-3 min-w-0">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{label}</p>
          <p className="text-xs text-ink-muted mt-0.5">{hint}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          onClick={() => onChange(!checked)}
          className={`relative w-9 h-5 rounded-full flex-shrink-0 transition-colors mt-0.5 ${checked ? 'bg-brand-600' : 'bg-surface-border'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
        </button>
      </div>
      {children}
    </div>
  )
}
