import type { ShutdownDoc } from '../types'
import { dayKey } from './time'

// The shutdown question (Cal Newport's ritual: write the open loop down so it stops pulling at the
// mind). After this local time, once per day, the band asks for tomorrow's first step; the answer
// shows the next calendar day in the Primary area, until that day has a Primary.
export const SHUTDOWN_HOUR = 18
export const SHUTDOWN_MINUTE = 30

// The placeholder when today has no Primary.
export const SHUTDOWN_FALLBACK = 'Answer R4 of the CEO review'

const isAfterHour = (now: number): boolean => {
  const d = new Date(now)

  return d.getHours() * 60 + d.getMinutes() >= SHUTDOWN_HOUR * 60 + SHUTDOWN_MINUTE
}

// The day key after `day` ("2026-11-14" gives "2026-11-15"), by the calendar, not by 24 hours.
export function nextDay(day: string): string {
  const [y = 0, m = 1, d = 1] = day.split('-').map(Number)

  return dayKey(new Date(y, m - 1, d + 1).getTime())
}

// Whether the row shows: past the hour and nothing stored for today (a skip is stored too), or
// forced by /coanda-shutdown for checking.
export function shutdownDue(now: number, doc: ShutdownDoc | null, forced: boolean): boolean {
  if (forced) return true

  return isAfterHour(now) && doc?.day !== dayKey(now)
}

// Last night's first step, only on the next calendar day; '' otherwise (or when it was skipped).
export function carriedStep(now: number, doc: ShutdownDoc | null): string {
  return doc !== null && doc.text !== '' && nextDay(doc.day) === dayKey(now) ? doc.text : ''
}

// An empty answer is refused with a short note; the rest is one line, 120 characters at most.
export function checkShutdown(text: string): { ok: true; value: string } | { ok: false; message: string } {
  const value = text.replace(/\s+/g, ' ').trim().slice(0, 120)

  return value === '' ? { ok: false, message: 'Write one step first, or skip.' } : { ok: true, value }
}
