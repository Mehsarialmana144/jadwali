import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../App'
import { useTheme } from '../lib/theme.jsx'
import { removeThisDevice } from '../lib/push'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: HomeIcon },
  { to: '/tasks',     label: 'Tasks',     icon: CheckIcon },
  { to: '/timeline',  label: 'Timeline',  icon: CalendarIcon },
]

const themeOptions = [
  { key: 'light',  label: 'Light',  icon: SunIcon },
  { key: 'dark',   label: 'Dark',   icon: MoonIcon },
  { key: 'system', label: 'System', icon: MonitorIcon },
]

export default function Navbar() {
  const { session } = useAuth()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    await removeThisDevice() // must run while still signed in (RLS)
    await supabase.auth.signOut()
    navigate('/auth')
  }

  const name = session?.user?.user_metadata?.full_name || session?.user?.email || 'You'
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <header className="w-full max-w-full bg-surface-card border-b border-surface-border sticky top-0 z-30">
      <div className="app-container">
        <div className="flex items-center justify-between h-14 min-w-0 gap-2">
          {/* Logo */}
          <NavLink to="/dashboard" className="flex items-center gap-2 min-w-0 p-2 -m-2">
            <img src="/logo-mark.png" alt="Jadwali" width="32" height="32" className="w-8 h-8 rounded-lg ring-1 ring-black/10 flex-shrink-0" />
            <span className="font-display font-semibold text-ink text-lg hidden sm:block">Jadwali</span>
          </NavLink>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center justify-center gap-1 min-w-0 flex-1 px-2">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `min-w-0 flex items-center gap-1.5 px-2.5 lg:px-3 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
                    isActive
                      ? 'bg-brand-600/10 text-brand-600 dark:text-brand-400'
                      : 'text-ink-muted hover:text-ink hover:bg-surface-raised'
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                <span className="truncate">{label}</span>
              </NavLink>
            ))}
          </nav>

          {/* User Menu */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-surface-raised transition-colors max-w-full"
            >
              <div className="w-7 h-7 rounded-full bg-brand-600/10 text-brand-600 dark:text-brand-400 flex items-center justify-center text-xs font-semibold">
                {initials}
              </div>
              <span className="hidden sm:block text-sm text-ink-muted max-w-[120px] truncate">{name}</span>
              <ChevronIcon className="w-3.5 h-3.5 text-ink-faint hidden sm:block" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-[min(17rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] bg-surface-card border border-surface-border rounded-xl shadow-md py-1.5 z-50">
                <div className="px-3 py-2 border-b border-surface-border min-w-0">
                  <p className="text-sm font-medium text-ink break-words">{name}</p>
                  <p className="text-xs text-ink-faint break-all mt-0.5">{session?.user?.email}</p>
                </div>

                <NavLink
                  to="/profile"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-ink hover:bg-surface-raised transition-colors"
                >
                  <UserIcon className="w-4 h-4 text-ink-faint" />
                  Profile
                </NavLink>

                <div className="px-3 py-2">
                  <p className="section-label mb-1.5">Appearance</p>
                  <div className="filter-bar w-full">
                    {themeOptions.map(opt => (
                      <button
                        key={opt.key}
                        onClick={() => setTheme(opt.key)}
                        className={`chip flex-1 flex items-center justify-center gap-1 ${theme === opt.key ? 'chip-active' : 'chip-inactive'}`}
                      >
                        <opt.icon className="w-3.5 h-3.5" />
                        <span className="hidden min-[340px]:inline">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors border-t border-surface-border"
                >
                  {signingOut ? 'Signing out…' : 'Sign Out'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Nav */}
        <nav className="md:hidden grid grid-cols-3 gap-0.5 min-[390px]:gap-1 pb-2 w-full max-w-full">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `min-w-0 flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 rounded-lg text-[10px] min-[390px]:text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-600/10 text-brand-600 dark:text-brand-400'
                    : 'text-ink-muted hover:text-ink hover:bg-surface-raised'
                }`
              }
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="max-w-full truncate leading-tight">{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Backdrop for user menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
      )}
    </header>
  )
}

// ---- Inline SVG Icons ----

function HomeIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l9-9 9 9M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9" />
    </svg>
  )
}

function CheckIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  )
}

function CalendarIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}

function ChevronIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

function UserIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  )
}

function SunIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1.5M12 19.5V21M4.22 4.22l1.06 1.06M18.72 18.72l1.06 1.06M3 12h1.5M19.5 12H21M4.22 19.78l1.06-1.06M18.72 5.28l1.06-1.06M16.5 12a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
    </svg>
  )
}

function MoonIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  )
}

function MonitorIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25M3.75 17.25h16.5a1.5 1.5 0 001.5-1.5V5.25a1.5 1.5 0 00-1.5-1.5H3.75a1.5 1.5 0 00-1.5 1.5v10.5a1.5 1.5 0 001.5 1.5z" />
    </svg>
  )
}
