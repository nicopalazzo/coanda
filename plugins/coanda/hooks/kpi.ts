// KPI counting for the two-week test (onboarding-v1.html part D, approved by Nicolas 14 Nov 2026):
// week 1 with the band off but counting (/coanda-baseline), week 2 with it on, compared per session.
// Only counts are kept, never the words of a message or a command. Pure: no host calls.

import type { KpiCounts, KpiDoc, KpiMode } from '../types'

export const NO_COUNTS: KpiCounts = { sessions: 0, turns: 0, corrections: 0, interrupts: 0, rework: 0, decided: 0, decideMs: 0 }
export const NO_KPI: KpiDoc = { v: 1, mode: 'on', days: {} }

// Days older than this are dropped, so the document stays small.
export const KEEP_DAYS = 60

export function toKpi(raw: unknown): KpiDoc {
  const doc = raw as KpiDoc | null
  if (doc?.v !== 1 || (doc.mode !== 'on' && doc.mode !== 'off') || typeof doc.days !== 'object' || doc.days === null) return NO_KPI

  return doc
}

// A correction: the message starts with a word that redirects Claude. First-word counting misses some
// corrections and catches some false ones; the KPI page says so.
const REDIRECT = /^\s*(?:no|nope|stop|wrong|not that|undo|revert|actually|instead)\b/i

export function isCorrection(text: string): boolean {
  return REDIRECT.test(text)
}

// Rework: a git command that throws work away.
const UNDO = /\bgit\s+(?:revert|restore|reset)\b|\bgit\s+checkout\s+(?:\S+\s+)?--(?:\s|$)/

export function isRework(command: string): boolean {
  return UNDO.test(command)
}

// Add to today's counts under the current mode; old days are dropped.
export function addKpi(doc: KpiDoc, day: string, add: Partial<KpiCounts>): KpiDoc {
  const today = doc.days[day] ?? {}
  const was = today[doc.mode] ?? NO_COUNTS
  const next: KpiCounts = { ...was }
  for (const key of Object.keys(add) as (keyof KpiCounts)[]) next[key] = was[key] + (add[key] ?? 0)

  const days = { ...doc.days, [day]: { ...today, [doc.mode]: next } }
  const kept = Object.keys(days).sort().slice(-KEEP_DAYS)

  return { ...doc, days: Object.fromEntries(kept.map(d => [d, days[d]!])) }
}

// All days of one mode added up.
export function totalOf(doc: KpiDoc, mode: KpiMode): KpiCounts & { days: number } {
  const out = { ...NO_COUNTS, days: 0 }
  for (const one of Object.values(doc.days)) {
    const c = one[mode]
    if (c === undefined) continue
    out.days += 1
    for (const key of Object.keys(NO_COUNTS) as (keyof KpiCounts)[]) out[key] += c[key]
  }

  return out
}

const perSession = (n: number, sessions: number): string => (sessions === 0 ? '—' : (n / sessions).toFixed(1))
const seconds = (c: KpiCounts): string => (c.decided === 0 ? '—' : `${Math.round(c.decideMs / c.decided / 1000)} s`)

export type KpiLine = { name: string; off: string; on: string }

// The KPI page: each KPI per session, the off (band hidden) days next to the on days.
export function kpiLines(doc: KpiDoc): { off: string; on: string; lines: KpiLine[] } {
  const off = totalOf(doc, 'off')
  const on = totalOf(doc, 'on')
  const head = (t: ReturnType<typeof totalOf>) => `${t.days} day${t.days === 1 ? '' : 's'}, ${t.sessions} session${t.sessions === 1 ? '' : 's'}`

  return {
    off: head(off),
    on: head(on),
    lines: [
      { name: 'Corrections / session', off: perSession(off.corrections, off.sessions), on: perSession(on.corrections, on.sessions) },
      { name: 'Interrupted turns / session', off: perSession(off.interrupts, off.sessions), on: perSession(on.interrupts, on.sessions) },
      { name: 'Rework / session', off: perSession(off.rework, off.sessions), on: perSession(on.rework, on.sessions) },
      { name: 'Turns / session', off: perSession(off.turns, off.sessions), on: perSession(on.turns, on.sessions) },
      { name: 'Time to decide (band)', off: seconds(off), on: seconds(on) },
    ],
  }
}
