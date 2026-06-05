import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../App'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: HomeIcon },
  { to: '/exams',     label: 'Exams',     icon: BookIcon },
  { to: '/interviews',label: 'Interviews',icon: BriefcaseIcon },
  { to: '/tasks',     label: 'Tasks',     icon: CheckIcon },
  { to: '/timeline',  label: 'Timeline',  icon: CalendarIcon },
]

export default function Navbar() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    await supabase.auth.signOut()
    navigate('/auth')
  }

  const name = session?.user?.user_metadata?.full_name || session?.user?.email || 'You'
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <header className="app-frame bg-white border-b border-surface-border sticky top-0 z-30">
      <div className="app-container">
        <div className="flex items-center justify-between h-14 min-w-0 gap-2">
          {/* Logo */}
          <NavLink to="/dashboard" className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 bg-brand-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-bold font-display">J</span>
            </div>
            <span className="font-display font-semibold text-ink text-lg hidden sm:block">Jadwali</span>
          </NavLink>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center justify-center gap-1 min-w-0 flex-1 px-2">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `min-w-0 flex items-center gap-1.5 px-2 lg:px-3 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
                    isActive
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-ink-muted hover:text-ink hover:bg-surface'
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
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface transition-colors max-w-full"
            >
              <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-semibold">
                {initials}
              </div>
              <span className="hidden sm:block text-sm text-ink-muted max-w-[120px] truncate">{name}</span>
              <ChevronIcon className="w-3.5 h-3.5 text-ink-faint hidden sm:block" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-[min(19rem,calc(100vw-2rem))] bg-white border border-surface-border rounded-xl shadow-lg py-1 z-40">
                <div className="px-3 py-2 border-b border-surface-border min-w-0">
                  <p className="text-sm font-medium text-ink break-words">{name}</p>
                  <p className="text-xs text-ink-faint break-all mt-0.5">{session?.user?.email}</p>
                </div>
                <button
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="w-full text-left px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  {signingOut ? 'Signing out…' : 'Sign Out'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Nav */}
        <nav className="md:hidden grid grid-cols-5 gap-0.5 min-[390px]:gap-1 pb-2 w-full max-w-full">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `min-w-0 flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 rounded-lg text-[10px] min-[390px]:text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-ink-muted hover:text-ink hover:bg-surface'
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

function BookIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  )
}

function BriefcaseIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2zM16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
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
