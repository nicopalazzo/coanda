import type { ShutdownDoc } from '../types'
import { t } from './i18n'
import { dayKey } from './time'

// The shutdown question (Cal Newport's ritual: write the open loop down so it stops pulling at the
// mind). Only when the person ends the day ("Nico out", "shutdown" or /coanda-shutdown), never by the
// clock: on Sun 22 Nov 2026 an 18:30 rule asked it in the middle of the working evening. The answer
// shows the next calendar day in the Primary area, until that day has a Primary.

// The placeholder when today has no Primary.
export const SHUTDOWN_FALLBACK = 'Answer R4 of the CEO review'
export const shutdownFallback = (): string => t('shutdown.fallback')

// The day key after `day` ("2026-11-14" gives "2026-11-15"), by the calendar, not by 24 hours.
export function nextDay(day: string): string {
  const [y = 0, m = 1, d = 1] = day.split('-').map(Number)

  return dayKey(new Date(y, m - 1, d + 1).getTime())
}

// Whether the row shows: only once asked (a ritual phrase or /coanda-shutdown), until Save or Skip.
export function shutdownDue(asked: boolean): boolean {
  return asked
}

// Last night's first step, only on the next calendar day; '' otherwise (or when it was skipped).
export function carriedStep(now: number, doc: ShutdownDoc | null): string {
  return doc !== null && doc.text !== '' && nextDay(doc.day) === dayKey(now) ? doc.text : ''
}

// An empty answer is refused with a short note; the rest is one line, 120 characters at most.
export function checkShutdown(text: string): { ok: true; value: string } | { ok: false; message: string } {
  const value = text.replace(/\s+/g, ' ').trim().slice(0, 120)

  return value === '' ? { ok: false, message: t('shutdown.empty') } : { ok: true, value }
}

// The ritual phrases that open the shutdown question when typed on their own ("Nico out", "shutdown"),
// whatever the case, spaces or end punctuation. The same words inside a sentence do not count.
export const SHUTDOWN_PHRASES = ['nico out', 'shutdown']

export function isShutdownPhrase(text: string): boolean {
  const said = text.toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.!?…。！？]+$/u, '').trim()

  return SHUTDOWN_PHRASES.includes(said)
}
