import type { Standup } from '../types'
import { t } from './i18n'

// The stand-up nudge: after RUNS long runs in a row, one quiet line on the Working or Resting row.
// A run is one Claude turn; "long" is over LONG_MS; a break longer than BREAK_MS between two runs
// ends the streak; a short run in the middle ends it too. Change the numbers here.

// Flip to true to see the nudge fast (1 s counts as long, a minute of rest is a break), then reinstall.
export const FAST_CHECK = false

export const RUNS = 3
export const LONG_MS = FAST_CHECK ? 1_000 : 2 * 60_000
export const BREAK_MS = FAST_CHECK ? 60_000 : 5 * 60_000

export const NO_STANDUP: Standup = { streak: 0, lastEndAt: 0 }

// One finished run (end time and wall-clock length). An aborted turn is the person stepping in, so it
// leaves the log as it was.
export function noteRun(log: Standup, endAt: number, durationMs: number, isAborted: boolean): Standup {
  if (isAborted) return log

  const startAt = endAt - durationMs
  const hadBreak = log.lastEndAt !== 0 && startAt - log.lastEndAt > BREAK_MS
  const streak = durationMs > LONG_MS ? (hadBreak ? 0 : log.streak) + 1 : 0

  return { streak, lastEndAt: endAt }
}

// Whether the line shows. While Claude works it shows as long as the streak stands; at rest it goes
// once the break is longer than BREAK_MS (the person did stand up).
export function nudgeShows(log: Standup, now: number, isWorking: boolean): boolean {
  if (log.streak < RUNS) return false

  return isWorking || now - log.lastEndAt <= BREAK_MS
}

export const nudgeText = (log: Standup): string => t('nudge.text', { n: log.streak })
