import { supabase } from './supabaseClient'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

export function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function isIOS() {
  const ua = navigator.userAgent
  // iPadOS 13+ reports itself as a Mac with touch support.
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

function supportsPush() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function urlBase64ToUint8Array(base64) {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  } catch (err) {
    console.warn('Service worker registration failed', err)
    return null
  }
}

async function currentSubscription() {
  if (!supportsPush()) return null
  const reg = await navigator.serviceWorker.getRegistration('/')
  return reg ? reg.pushManager.getSubscription() : null
}

/**
 * One of:
 *  'unsupported'      - browser can't do push at all
 *  'needs-install'    - iPhone/iPad Safari tab: push only works from the Home Screen app
 *  'no-key'           - VITE_VAPID_PUBLIC_KEY is missing from the build
 *  'denied'           - permission blocked in browser/system settings
 *  'off'              - can be enabled (permission not granted yet, or granted but not subscribed)
 *  'on'               - subscribed on this device
 */
export async function getPushStatus() {
  if (isIOS() && !isStandalone()) return 'needs-install'
  if (!supportsPush()) return 'unsupported'
  if (!VAPID_PUBLIC_KEY) return 'no-key'
  if (Notification.permission === 'denied') return 'denied'
  const sub = await currentSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

/** Saves the browser timezone so the server can compute local due times. Safe to call repeatedly. */
export async function syncTimezone(userId) {
  const { error } = await supabase
    .from('notification_settings')
    .upsert({ user_id: userId, timezone: browserTimezone() }, { onConflict: 'user_id' })
  if (error) console.warn('Could not save timezone:', error.message)
  return !error
}

/** Must be called from a user gesture (button click), especially on iOS. */
export async function enablePush(userId) {
  if (!supportsPush()) throw new Error('This browser does not support push notifications.')
  if (!VAPID_PUBLIC_KEY) throw new Error('Push is not configured (missing VITE_VAPID_PUBLIC_KEY).')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Notifications are blocked. Allow them for Jadwali in your browser or device settings, then try again.'
        : 'Notification permission was not granted.',
    )
  }

  const reg = (await navigator.serviceWorker.getRegistration('/')) || (await registerServiceWorker())
  if (!reg) throw new Error('Could not start the service worker.')
  await navigator.serviceWorker.ready

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }

  const json = sub.toJSON()
  const { error } = await supabase.rpc('register_push_subscription', {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
    p_user_agent: navigator.userAgent.slice(0, 250),
  })
  if (error) {
    await sub.unsubscribe().catch(() => {})
    throw new Error(`Could not save this device: ${error.message}`)
  }

  await syncTimezone(userId)
}

/** Turns push off for this device and removes it from the server. */
export async function disablePush() {
  const sub = await currentSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe().catch(() => {})
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  if (error) console.warn('Could not remove device from server:', error.message)
}

/** Best-effort cleanup used on sign-out so a shared device stops getting the previous user's alerts. */
export async function removeThisDevice() {
  try {
    await disablePush()
  } catch {
    // ignore
  }
}

export async function sendTestNotification() {
  const { data, error } = await supabase.functions.invoke('send-notifications', { body: { action: 'test' } })
  if (error) {
    let detail = error.message
    try {
      const body = await error.context?.json?.()
      if (body?.error) detail = body.error
    } catch {
      // keep generic message
    }
    throw new Error(detail)
  }
  return data
}
