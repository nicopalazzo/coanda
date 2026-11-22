import type { MirrorAnswer, MirrorBand, MirrorButton, MirrorNudge } from '../types'

// The band's side of the Mirror contract (BAND-CONTRACT-v1, 22 Nov 2026). Pure: no host, no files.
// Mirror writes `nudge-now.json` and the band reads it; the band writes `band.json` (a heartbeat per session and the
// last button pressed per session) and Mirror reads it. io.ts and register.tsx do the reading and writing.

export const NUDGE_FILE = 'nudge-now.json'
export const BAND_FILE = 'band.json'
// Mirror counts a heartbeat as fresh for 60 s (BAND_FRESH_SECONDS): write twice as often.
export const HEARTBEAT_MS = 30_000
// Mirror holds a message while the person's prompt is being submitted, so the band looks for its nudge a few times just
// after each message (these delays, in ms), and at every heartbeat. A steady short poll was tried and dropped: the test
// host refuses a clock advance of a whole day across so many ticks, and a poll all day is a cost with nothing to see.
export const POLL_AFTER_MS: readonly number[] = [300, 1_000, 2_500, 6_000]
// Heartbeats and answers older than a day are dropped when the file is rewritten, so it does not grow for ever.
export const KEEP_MS = 24 * 60 * 60 * 1000
// A prompt Coanda saw this long before the nudge may be the one Mirror held.
export const HELD_MS = 60_000

export const BUTTONS: readonly MirrorButton[] = ['check', 'send', 'snooze', 'dismiss', 'off']
const isButton = (value: unknown): value is MirrorButton => typeof value === 'string' && (BUTTONS as readonly string[]).includes(value)

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

// The nudge for this session, or null: shown only when `v` is 1, `session_id` is this session's and `shown_in` is "band".
// A missing file, a parse error or any other shape shows nothing (the contract's rule).
export function parseNudge(raw: string, sessionId: string): MirrorNudge | null {
  const doc = parseJson(raw)
  if (!isRecord(doc) || doc['v'] !== 1 || doc['shown_in'] !== 'band') return null
  if (typeof doc['session_id'] !== 'string' || doc['session_id'] === '' || doc['session_id'] !== sessionId) return null

  const { at, text, ask } = doc
  if (typeof at !== 'string' || typeof text !== 'string' || text.trim() === '') return null

  return { at, text, ask: typeof ask === 'string' ? ask : '' }
}

export const NO_BAND: MirrorBand = { v: 1, sessions: {}, answers: {} }

// band.json as it stands. A file that is missing, cut off or of another shape is read as empty, so the next write
// replaces it with a good one; an entry that is not the right shape is left out.
export function parseBand(raw: string | null): MirrorBand {
  const doc = raw === null ? undefined : parseJson(raw)
  if (!isRecord(doc)) return NO_BAND

  const sessions: Record<string, string> = {}
  if (isRecord(doc['sessions'])) {
    for (const [id, at] of Object.entries(doc['sessions'])) if (typeof at === 'string') sessions[id] = at
  }
  const answers: Record<string, MirrorAnswer> = {}
  if (isRecord(doc['answers'])) {
    for (const [id, one] of Object.entries(doc['answers'])) {
      if (isRecord(one) && typeof one['at'] === 'string' && isButton(one['button'])) answers[id] = { at: one['at'], button: one['button'] }
    }
  }

  return { v: 1, sessions, answers }
}

// Local time with its offset, to the second: "2026-11-22T19:10:05+01:00".
export function isoOf(ms: number): string {
  const d = new Date(ms)
  const two = (n: number): string => String(n).padStart(2, '0')
  const offset = -d.getTimezoneOffset()
  const sign = offset < 0 ? '-' : '+'
  const abs = Math.abs(offset)

  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}${sign}${two(Math.floor(abs / 60))}:${two(abs % 60)}`
}

const young = (at: string, now: number): boolean => {
  const ms = Date.parse(at)

  return Number.isNaN(ms) || now - ms <= KEEP_MS
}

const fresh = (band: MirrorBand, now: number): MirrorBand => ({
  v: 1,
  sessions: Object.fromEntries(Object.entries(band.sessions).filter(([, at]) => young(at, now))),
  answers: Object.fromEntries(Object.entries(band.answers).filter(([, one]) => young(one.at, now))),
})

// This session's heartbeat, other sessions' entries and every answer kept.
export function withHeartbeat(band: MirrorBand, sessionId: string, now: number): MirrorBand {
  const kept = fresh(band, now)

  return { ...kept, sessions: { ...kept.sessions, [sessionId]: isoOf(now) } }
}

// The time an answer carries: never before the nudge it answers (Mirror applies an answer only when `at` is at or after
// the nudge's), and rounded up to the next whole second so a nudge stamped later in the same second still counts.
export function answerAt(now: number, nudgeAt: string): number {
  const nudge = Date.parse(nudgeAt)

  return Math.ceil(Math.max(now, Number.isNaN(nudge) ? 0 : nudge) / 1000) * 1000
}

// This session's answer: the last button pressed. Other sessions' entries and answers stay.
export function withAnswer(band: MirrorBand, sessionId: string, at: number, button: MirrorButton): MirrorBand {
  const kept = fresh(band, at)

  return { ...kept, answers: { ...kept.answers, [sessionId]: { at: isoOf(at), button } } }
}

export const bandText = (band: MirrorBand): string => `${JSON.stringify(band, null, 2)}\n`

// Which prompt "Send anyway" submits: the box as it stands, else the last message the band saw when it came just before
// the nudge (or after it), else none (the person presses Enter). `nudgeAt` and `seenAt` are the nudge's own time and
// the clock's when the band saw the message.
export function heldPrompt(box: string, last: string, seenAt: number, nudgeAt: string): string {
  if (box.trim() !== '') return box
  const nudge = Date.parse(nudgeAt)
  if (last.trim() === '' || seenAt === 0 || Number.isNaN(nudge)) return ''

  return nudge - seenAt <= HELD_MS ? last : ''
}
