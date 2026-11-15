import type { FocusResult, Lane, Setup } from '../types'
import { formatDay, t } from './i18n'
import { BY_TEXT, BY_TEXT_ZH, CLOSED, DATE_LIKE, LANE, PRIMARY, TODAY, findEndDate } from './lexicon'
import { dayKey } from './time'

// What the Focus source says (spine AD-5): one FocusResult, made by one of two parsers.
//   focus-md  a file with a `## Today` heading: the `**Primary` line under it, and Lanes from
//             `**Lane N — Name:** text` lines. The Primary's Lane is the first `Lane N` on its line.
//   plain     any other file: the first non-empty line is the Primary, and there are no Lanes.
// Neither throws. The words "no Primary set" or "not readable" are drawn from `status`
// (primaryText), never stored as Primary text.
// The words of the format (Today, Primary, Lane, CLOSED, by) and the dates are read in English, French,
// Spanish and Simplified Chinese (lexicon.ts); a file may mix them.
export const NO_FOCUS: FocusResult = { status: 'none', primary: '', laneId: '', lanes: [] }
// A file that could not be read: said in plain words in its row, never an exception.
export const UNREADABLE_FOCUS: FocusResult = { status: 'unreadable', primary: '', laneId: '', lanes: [] }

const MAX_PRIMARY = 200
const MAX_LANE = 60

const CLOSED_AT = new RegExp(CLOSED, 'u')
const isClosed = (line: string): boolean => CLOSED_AT.test(line)

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

// "21 Sep → 14 Dec" and "by Sun 18 Oct" (also "d'ici le 14 déc.", "para el 14 de diciembre", "12月14日前") are an end
// date; "by Q1" or "by 31 Feb" is an end that cannot be read as a day and is kept as text. The date is taken out of
// the outcome, so the row says it once. The first match whose words are really a month wins, so "by 3 weeks, by 18 Oct"
// finds 18 Oct.
function endOfClause(clause: string, now: number | undefined): { rest: string; end: Pick<Lane, 'endDay' | 'endText'> } {
  const found = findEndDate(clause)

  if (found !== null) {
    const iso = dayOfFile(found.day, found.month, found.year, now)
    const text = formatDay(found.day, found.month, found.year)

    return { rest: clause.replace(found.text, ''), end: iso === null ? { endText: text } : { endDay: iso } }
  }

  const tail = clause.match(BY_TEXT) ?? clause.match(BY_TEXT_ZH)

  return tail !== null && DATE_LIKE.test(tail[1]!.trim())
    ? { rest: clause.replace(tail[0], ''), end: { endText: clip(tail[1]!, 30) } }
    : { rest: clause, end: {} }
}

// `**Lane 2 — Proof:** portfolio MVP live by Sun 18 Oct. More.` becomes the Lane
// "Proof: portfolio MVP live", ending 18 Oct.
const LANE_LINE = new RegExp(String.raw`\*\*\s*${LANE}\s*(\d+)\s*[—–-]+\s*(.+?)\s*(?:[:：]\*\*|\*\*\s*[:：])\s*(.*)$`, 'u')

function lanesOf(text: string, now: number | undefined): Lane[] {
  const lanes: Lane[] = []

  for (const line of text.split('\n')) {
    const found = line.match(LANE_LINE)
    if (found === null) continue

    const name = found[2]!.replace(/\s*\([^)]*\)\s*$/, '').trim()
    const { rest, end } = endOfClause(found[3]!.split(/[.;](?:\s|$)|[。；]/)[0]!.trim(), now)
    const clause = rest.trim().replace(/[\s,，:：;；、-]+$/, '')

    lanes.push({ id: `lane-${found[1]}`, outcome: clip(clause ? `${name}: ${clause}` : name, MAX_LANE), ...end })
  }

  return lanes
}

const TODAY_START = new RegExp(`^${TODAY}`, 'iu')
const PRIMARY_MARK = new RegExp(String.raw`\*\*\s*${PRIMARY}`, 'iu')
const PRIMARY_BOLD = new RegExp(String.raw`\*\*\s*${PRIMARY}(?:\s*[(（][^)）]*[)）])?\s*[:：]\s*(.*?)\*\*`, 'iu')
const PRIMARY_LEAD = new RegExp(String.raw`^[-\s*]*${PRIMARY}[^:：]*[:：]\s*`, 'iu')
const LANE_TAIL = new RegExp(String.raw`\s*[(（]\s*${LANE}[^)）]*[)）][.。]?$`, 'iu')
const LANE_REF = new RegExp(String.raw`${LANE}\s*(\d+)`, 'iu')
const CLOSED_TIME = new RegExp(String.raw`${CLOSED}[^\n]*?(\d{1,2}[:：]\d{2})`, 'u')

export function parseFocusMd(text: string, now?: number): FocusResult {
  const lanes = lanesOf(text, now)
  const today = text.split(/^## /m).find(part => TODAY_START.test(part))
  const line = today?.split('\n').find(one => PRIMARY_MARK.test(one))

  if (line === undefined) return { ...NO_FOCUS, lanes }

  // A line marked CLOSED ("CLOSED 28 Oct 12:44") means there is no Primary until a new one is set.
  if (isClosed(line)) {
    const time = line.match(CLOSED_TIME)?.[1]?.replace('：', ':')

    return { status: 'closed', primary: '', laneId: '', lanes, ...(time === undefined ? {} : { closedAt: time }) }
  }

  // The label ends at "): " (it may hold a time, "switch 17:08"), or at the first colon when it has no brackets.
  const bold = line.match(PRIMARY_BOLD)
  const raw = bold?.[1] ?? line.replace(PRIMARY_LEAD, '')
  const primary = clip(raw.replace(LANE_TAIL, ''), MAX_PRIMARY)

  if (primary === '') return { ...NO_FOCUS, lanes }

  const lane = line.match(LANE_REF)?.[1]

  return { status: 'ok', primary, laneId: lane === undefined ? '' : `lane-${lane}`, lanes }
}

export function parsePlain(text: string): FocusResult {
  const first = text.split('\n').find(line => line.trim() !== '')

  return first === undefined ? NO_FOCUS : { status: 'ok', primary: clip(first, MAX_PRIMARY), laneId: '', lanes: [] }
}

// The parser is picked by the file: a `## Today` heading means focus-md.
const TODAY_HEADING = new RegExp(`^## ${TODAY}`, 'imu')
export const parseFocus = (text: string, now?: number): FocusResult => (TODAY_HEADING.test(text) ? parseFocusMd(text, now) : parsePlain(text))

// The Primary's head, short enough for one row: up to the first comma, bracket or dash. Chinese characters are
// twice as wide as letters, so a Chinese head gets half the length.
export function shortPrimary(primary: string, max = 60): string {
  const head = primary.split(/[,，、；]|\s\(|（|\s—\s|——/)[0]!.trim()
  const limit = /[\u3400-\u9fff]/u.test(head) ? Math.ceil(max / 2) : max
  if (head.length <= limit) return head

  const space = head.lastIndexOf(' ', limit)

  return `${head.slice(0, space > 0 ? space : limit).trim()}…`
}

// What the Primary row says, drawn from the status.
export function primaryText(focus: FocusResult): string {
  switch (focus.status) {
    case 'ok':
      return shortPrimary(focus.primary) || t('primary.none')
    case 'closed':
      return focus.closedAt === undefined ? t('primary.closed') : t('primary.closedAt', { time: focus.closedAt })
    case 'unreadable':
      return t('primary.unreadable')
    case 'none':
      return t('primary.none')
  }
}

// When a Lane ends, in words: "by 14 Dec"; a past day is marked "· past"; a date that could not be read
// is kept as the file wrote it and never marked past. A year is shown only when it is not this year.
export function endLabel(lane: Lane, now?: number): string {
  // A saved Lane may hold anything: only a real 'YYYY-MM-DD' is drawn as a day, else its text (if any).
  const [y, m, d] = (typeof lane.endDay === 'string' ? lane.endDay : '').split('-').map(Number)
  if (typeof lane.endDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(lane.endDay) && isRealDay(y!, m! - 1, d!)) {
    const [year, month, day] = lane.endDay.split('-').map(Number) as [number, number, number]
    const shown = formatDay(day, month - 1, now !== undefined && year !== new Date(now).getFullYear() ? year : null)

    return `${t('lane.by', { date: shown })}${now !== undefined && lane.endDay < dayKey(now) ? t('lane.past') : ''}`
  }

  return typeof lane.endText === 'string' && lane.endText !== '' ? t('lane.byText', { text: lane.endText }) : ''
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
