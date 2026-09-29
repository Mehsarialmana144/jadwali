// Jadwali service worker: receives Web Push messages and shows them.
// Every push MUST show a notification (required by iOS/Safari), so we always fall back to a generic one.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

self.addEventListener('push', event => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'Jadwali'
  const options = {
    body: data.body || 'You have an update.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || undefined, // same tag replaces the previous notification instead of stacking
    data: { url: data.url || '/dashboard' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const target = new URL((event.notification.data && event.notification.data.url) || '/dashboard', self.location.origin).href

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          return client.focus().then(c => ('navigate' in c ? c.navigate(target) : c))
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
