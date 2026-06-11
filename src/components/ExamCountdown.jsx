import { useEffect, useState } from 'react'
import { examCountdownParts } from '../lib/dateUtils'

const toneClass = {
  brand: 'border-brand-100 bg-brand-50 text-brand-700',
  purple: 'border-purple-100 bg-purple-50 text-purple-700',
}

export default function ExamCountdown({ date, time, compact = false, tone = 'brand', className = '' }) {
  const [parts, setParts] = useState(() => examCountdownParts(date, time))

  useEffect(() => {
    setParts(examCountdownParts(date, time))
    const timer = window.setInterval(() => {
      setParts(examCountdownParts(date, time))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [date, time])

  if (!parts) return null

  const label = formatShortCountdown(parts)
  const colors = toneClass[tone] || toneClass.brand

  return (
    <span className={`inline-flex w-fit max-w-full items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none shadow-sm tabular-nums whitespace-nowrap ${colors} ${compact ? '' : 'text-xs px-3 py-1.5'} ${className}`}>
      {label}
    </span>
  )
}

function formatShortCountdown({ days, hours, minutes, seconds }) {
  if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${Math.max(1, seconds)}s left`
}
