import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check your .env file.')
}

// "Stay signed in": by default the login is kept in localStorage (survives closing the
// browser / app). If the user unticks the box, it is kept in sessionStorage instead and is
// gone once the browser or Home Screen app is fully closed. The choice itself is remembered
// in localStorage so the checkbox shows the last selection.
const STAY_KEY = 'jadwali-stay-signed-in'

export function getStayPreference() {
  try {
    return localStorage.getItem(STAY_KEY) !== 'no'
  } catch {
    return true
  }
}

export function setStayPreference(stay) {
  try {
    if (stay) {
      localStorage.removeItem(STAY_KEY)
    } else {
      localStorage.setItem(STAY_KEY, 'no')
      // make sure no long-lived copy of a previous session is left behind
      Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token')).forEach(k => localStorage.removeItem(k))
    }
  } catch {
    // storage unavailable (private mode etc.) - fall back to defaults
  }
}

const authStorage = {
  getItem: key => (getStayPreference() ? localStorage : sessionStorage).getItem(key),
  setItem: (key, value) => (getStayPreference() ? localStorage : sessionStorage).setItem(key, value),
  removeItem: key => {
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
  },
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: authStorage },
})
