import type { FocusResult, Lane, Setup } from '../types'
import { dayKey } from './time'

// What the Focus source says (spine AD-5): one FocusResult, made by one of two parsers.
//   focus-md  a file with a `## Today` heading: the `**Primary` line under it, and Lanes from
//             `**Lane N — Name:** text` lines. The Primary's Lane is the first `Lane N` on its line.
//   plain     any other file: the first non-empty line is the Primary, and there are no Lanes.
// Neither throws. The words "no Primary set" or "not readable" are drawn from `status`
// (primaryText), never stored as Primary text.
export const NO_FOCUS: FocusResult = { status: 'none', primary: '', laneId: '', lanes: [] }
// A file that could not be read: said in plain words in its row, never an exception.
export const UNREADABLE_FOCUS: FocusResult = { status: 'unreadable', primary: '', laneId: '', lanes: [] }

const MAX_PRIMARY = 200
const MAX_LANE = 60

const isClosed = (line: string): boolean => /\bCLOSED\b/.test(line)

const clip = (text: string, max: number): string => {
  const one = text.trim().replace(/\s+/g, ' ')

  return one.length <= max ? one : `${one.slice(0, max - 1).trimEnd()}…`
}

// The Focus source the person saved in setup, as an absolute path; null when none is saved.
// A path that is not absolute is never read (spine AD-4: a relative path is refused when entered).
export function focusSourceOf(setup: unknown): string | null {
  const focus = (setup as { focus?: { kind?: unknown; path?: unknown } | null } | null | undefined)?.focus
  const path = focus?.kind === 'file' ? focus.path : undefined

  return typeof path === 'string' && path.startsWith('/') ? path : null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const isRealDay = (year: number, month: number, day: number): boolean => {
  const made = new Date(Date.UTC(year, month, day))

  return made.getUTCFullYear() === year && made.getUTCMonth() === month && made.getUTCDate() === day
}

const dayText = (year: number, month: number, day: number): string => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

// A date written in a file ("18 Oct", "14 Dec 2026") as 'YYYY-MM-DD', or null when it cannot be read
// as a day. A date with no year takes the year that puts it nearest to `now` (inferred; with no
// `now` it cannot be placed and stays text). Pure: the clock comes in as an argument.
function dayOfFile(day: number, month: number, year: number | null, now: number | undefined): string | null {
  if (month < 0) return null
  if (year !== null) return isRealDay(year, month, day) ? dayText(year, month, day) : null
  if (now === undefined) return null

  const here = new Date(now).getFullYear()
  const near = [here - 1, here, here + 1]
    .filter(one => isRealDay(one, month, day))
    .sort((a, b) => Math.abs(Date.UTC(a, month, day) - now) - Math.abs(Date.UTC(b, month, day) - now))[0]

  return near === undefined ? null : dayText(near, month, day)
}

// A month written out or abbreviated ("Oct", "sept", "October"); any other word is not a month.
const MONTH_WORD = /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)$/i
const monthOf = (word: string): number => (MONTH_WORD.test(word) ? MONTHS.findIndex(one => one.toLowerCase() === word.slice(0, 3).toLowerCase()) : -1)

// "21 Sep → 14 Dec" and "by Sun 18 Oct" are an end date; "by Q1" or "by 31 Feb" is an end that cannot be
// read as a day and is kept as text. The date is taken out of the outcome, so the row says it once.
// Both patterns are global: the first match whose words are really a month wins, so "by 3 weeks, by 18 Oct" finds 18 Oct.
const RANGE = /,?\s*(\d{1,2})\s+([a-z]{3,9})\.?(?:\s+\d{4})?\s*(?:→|->|–|—)\s*(\d{1,2})\s+([a-z]{3,9})\.?(?:\s+(\d{4}))?/gi
const BY = /,?\s*\bby\s+(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+)?(\d{1,2})\s+([a-z]{3,9})\.?(?:\s+(\d{4}))?/gi
// A "by …" tail that is not a day but still reads as a date: "by Q1", "by end of March", "by 2027", "by 3/12".
const DATE_LIKE = /^(?:q[1-4](?:\s+\d{4})?|(?:end|start|mid)[ -]of\s+.+|\d{4}|\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?)$/i
const BY_TEXT = /,?\s*\bby\s+([^,;]+)$/i

function endOfClause(clause: string, now: number | undefined): { rest: string; end: Pick<Lane, 'endDay' | 'endText'> } {
  // [pattern, group of the end day, group of its month word, group of its year, group of the start month word (ranges)]
  for (const [pattern, dayAt, wordAt, yearAt, startAt] of [[RANGE, 3, 4, 5, 2], [BY, 1, 2, 3, 0]] as const) {
    for (const found of clause.matchAll(pattern)) {
      const month = monthOf(found[wordAt]!)
      if (month < 0 || (startAt > 0 && monthOf(found[startAt]!) < 0)) continue

      const day = Number(found[dayAt])
      const year = found[yearAt]
      const iso = dayOfFile(day, month, year === undefined ? null : Number(year), now)
      const text = `${day} ${MONTHS[month]}${year === undefined ? '' : ` ${year}`}`

      return { rest: clause.replace(found[0], ''), end: iso === null ? { endText: text } : { endDay: iso } }
    }
  }

  const tail = clause.match(BY_TEXT)

  return tail !== null && DATE_LIKE.test(tail[1]!.trim())
    ? { rest: clause.replace(tail[0], ''), end: { endText: clip(tail[1]!, 30) } }
    : { rest: clause, end: {} }
}

// `**Lane 2 — Proof:** portfolio MVP live by Sun 18 Oct. More.` becomes the Lane
// "Proof: portfolio MVP live", ending 18 Oct.
function lanesOf(text: string, now: number | undefined): Lane[] {
  const lanes: Lane[] = []

  for (const line of text.split('\n')) {
    const found = line.match(/\*\*Lane\s+(\d+)\s*[—–-]\s*(.+?):\*\*\s*(.*)$/)
    if (found === null) continue

    const name = found[2]!.replace(/\s*\([^)]*\)\s*$/, '').trim()
    const { rest, end } = endOfClause(found[3]!.split(/[.;](?:\s|$)/)[0]!.trim(), now)
    const clause = rest.trim().replace(/[\s,:;-]+$/, '')

    lanes.push({ id: `lane-${found[1]}`, outcome: clip(clause ? `${name}: ${clause}` : name, MAX_LANE), ...end })
  }

  return lanes
}

export function parseFocusMd(text: string, now?: number): FocusResult {
  const lanes = lanesOf(text, now)
  const today = text.split(/^## /m).find(part => part.startsWith('Today'))
  const line = today?.split('\n').find(one => one.includes('**Primary'))

  if (line === undefined) return { ...NO_FOCUS, lanes }

  // A line marked CLOSED ("CLOSED 28 Oct 12:44") means there is no Primary until a new one is set.
  if (isClosed(line)) {
    const time = line.match(/\bCLOSED\b\s+(?:\d{1,2}\s+\w+\s+)?(\d{1,2}:\d{2})/)?.[1]

    return { status: 'closed', primary: '', laneId: '', lanes, ...(time === undefined ? {} : { closedAt: time }) }
  }

  // The label ends at "): " (it may hold a time, "switch 17:08"), or at the first colon when it has no brackets.
  const bold = line.match(/\*\*Primary(?:\s*\([^)]*\))?:\s*(.*?)\*\*/)
  const raw = bold?.[1] ?? line.replace(/^[-\s*]*Primary[^:]*:\s*/, '')
  const primary = clip(raw.replace(/\s*\(Lane[^)]*\)\.?$/, ''), MAX_PRIMARY)

  if (primary === '') return { ...NO_FOCUS, lanes }

  const lane = line.match(/\bLane\s+(\d+)/)?.[1]

  return { status: 'ok', primary, laneId: lane === undefined ? '' : `lane-${lane}`, lanes }
}

export function parsePlain(text: string): FocusResult {
  const first = text.split('\n').find(line => line.trim() !== '')

  return first === undefined ? NO_FOCUS : { status: 'ok', primary: clip(first, MAX_PRIMARY), laneId: '', lanes: [] }
}

// The parser is picked by the file: a `## Today` heading means focus-md.
export const parseFocus = (text: string, now?: number): FocusResult => (/^## Today\b/m.test(text) ? parseFocusMd(text, now) : parsePlain(text))

// The Primary's head, short enough for one row: up to the first comma, bracket or dash.
export function shortPrimary(primary: string, max = 60): string {
  const head = primary.split(/,|\s\(|\s—\s/)[0]!.trim()
  if (head.length <= max) return head

  return `${head.slice(0, head.lastIndexOf(' ', max)).trim()}…`
}

// What the Primary row says, drawn from the status.
export function primaryText(focus: FocusResult): string {
  switch (focus.status) {
    case 'ok':
      return shortPrimary(focus.primary) || 'no Primary set'
    case 'closed':
      return focus.closedAt === undefined ? 'Closed · no Primary set' : `Closed ${focus.closedAt} · no Primary set`
    case 'unreadable':
      return 'Focus file not readable'
    case 'none':
      return 'no Primary set'
  }
}

// When a Lane ends, in words: "by 14 Dec"; a past day is marked "· past"; a date that could not be read
// is kept as the file wrote it and never marked past. A year is shown only when it is not this year.
export function endLabel(lane: Lane, now?: number): string {
  // A saved Lane may hold anything: only a real 'YYYY-MM-DD' is drawn as a day, else its text (if any).
  const [y, m, d] = (typeof lane.endDay === 'string' ? lane.endDay : '').split('-').map(Number)
  if (typeof lane.endDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(lane.endDay) && isRealDay(y!, m! - 1, d!)) {
    const [year, month, day] = lane.endDay.split('-').map(Number) as [number, number, number]
    const shown = `${day} ${MONTHS[month - 1]}${now !== undefined && year !== new Date(now).getFullYear() ? ` ${year}` : ''}`

    return `by ${shown}${now !== undefined && lane.endDay < dayKey(now) ? ' · past' : ''}`
  }

  return typeof lane.endText === 'string' && lane.endText !== '' ? `by ${lane.endText}` : ''
}

// The outcome of the Primary's Lane with its end date; empty when it has none or the id matches no Lane
// (the Primary draws alone).
export function laneText(focus: FocusResult, now?: number): string {
  const lane = focus.lanes.find(one => one.id === focus.laneId)
  if (lane === undefined) return ''

  const end = endLabel(lane, now)

  return end === '' ? lane.outcome : `${lane.outcome} · ${end}`
}

// ---------------------------------------------------------------------------------------------
// The Setup moment reads the goals file; it asks the person for nothing (band-rebuild-plan.md, D2, D3).
// ---------------------------------------------------------------------------------------------
export const MAX_LANES = 3

// What Setup finds in the goals file: goals to confirm, nothing yet, or a file it cannot read.
// A Primary or at least one Lane counts as goals; a closed Primary with no Lane does not.
export type GoalsState = 'found' | 'nothing' | 'unreadable'

export function goalsState(focus: FocusResult): GoalsState {
  if (focus.status === 'unreadable') return 'unreadable'

  return focus.status === 'ok' || focus.lanes.length > 0 ? 'found' : 'nothing'
}

// The saved setup document, held to its shape; null when there is nothing usable (then the person has not been asked).
export function toSetup(raw: unknown): Setup | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null

  const doc = raw as Record<string, unknown>
  const lanes = (Array.isArray(doc.lanes) ? doc.lanes : [])
    .filter((one): one is Lane => typeof one === 'object' && one !== null && typeof (one as Lane).id === 'string' && typeof (one as Lane).outcome === 'string')
    .slice(0, MAX_LANES)
  const path = (doc.focus as { kind?: unknown; path?: unknown } | null | undefined)?.path
  const focus: Setup['focus'] =
    (doc.focus as { kind?: unknown } | null | undefined)?.kind === 'file' && typeof path === 'string'
      ? { kind: 'file', path }
      : (doc.focus as { kind?: unknown } | null | undefined)?.kind === 'typed'
        ? { kind: 'typed' }
        : null

  return {
    v: 1,
    doneAt: typeof doc.doneAt === 'number' ? doc.doneAt : null,
    focus,
    lanes,
    partsOff: Array.isArray(doc.partsOff) ? (doc.partsOff as Setup['partsOff']) : [],
    rules: doc.rules === 'added' || doc.rules === 'copied' || doc.rules === 'declined' ? doc.rules : 'none',
    counting: doc.counting === true,
  }
}
