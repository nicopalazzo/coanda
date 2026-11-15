import type { DayWins, Step, Win } from '../types'
import { dayHeading, t, tn } from './i18n'
import { BOOKKEEPING } from './plan'
import { dayKey } from './time'

// The day record (Amabile's progress principle: noticing small progress). Pure: what counts as a
// win, how the day's list grows, when the band offers it, and the journal text. Heard reliably only:
// a task-list step that went to completed, and a git commit whose call did not fail.

export const MAX_WINS = 12
// The hour (local, minutes after midnight) from which the band offers the record on its own: 17:30.
export const OFFER_FROM = 17 * 60 + 30
export const MAX_CHIPS = 5

export const NO_WINS = (now: number): DayWins => ({ v: 1, day: dayKey(now), items: [], answered: false, open: false })

// A stored document of another day (or none) is today's empty one.
export const winsOf = (doc: DayWins | null | undefined, now: number): DayWins => (doc && doc.day === dayKey(now) ? doc : NO_WINS(now))

// Steps that are completed now and were not before (by words), bookkeeping left out.
export function newlyCompleted(before: Step[], after: Step[]): string[] {
  const was = new Set(before.filter(s => s.status === 'completed').map(s => s.content))

  return after.filter(s => s.status === 'completed' && !was.has(s.content) && !BOOKKEEPING.test(s.content)).map(s => s.content)
}

// The message of a `git commit` command: -m "…" or -m '…', else the first line of a heredoc, else
// "Commit". Null when the command is no commit (or a dry run).
export function commitText(command: string): string | null {
  if (!/(^|[\s;&|(])git\s+(?:-C\s+\S+\s+)?commit\b/.test(command) || /--dry-run/.test(command)) return null

  const quoted = /\s-m\s*(?:"([^"]+)"|'([^']+)')/.exec(command)
  const heredoc = /<<-?\s*['"]?(\w+)['"]?\n([^\n]+)/.exec(command)
  const direct = quoted?.[1] ?? quoted?.[2] ?? ''
  const first = ((direct.startsWith('$(') ? heredoc?.[2] : direct) ?? heredoc?.[2] ?? '').split('\n')[0]!.replace(/\s+/g, ' ').trim().slice(0, 70)

  return first === '' ? t('wins.commit') : first
}

// Adds wins to today's record; the same words are one win. Only the newest MAX_WINS are kept.
export function addWins(doc: DayWins | null | undefined, now: number, found: Omit<Win, 'at'>[]): DayWins {
  const today = winsOf(doc, now)
  const fresh = found.filter((one, i) => one.text.trim() !== '' && !today.items.some(w => w.text === one.text) && found.findIndex(f => f.text === one.text) === i)
  if (fresh.length === 0) return today

  return { ...today, items: [...today.items, ...fresh.map(one => ({ ...one, at: now }))].slice(-MAX_WINS) }
}

// The band offers the record when asked for, or from 17:30 on; not once answered, not when empty.
export function isDue(doc: DayWins | null | undefined, now: number): boolean {
  const today = winsOf(doc, now)
  if (today.answered || today.items.length === 0) return false
  const d = new Date(now)

  return today.open || d.getHours() * 60 + d.getMinutes() >= OFFER_FROM
}

export const headline = (n: number): string => tn('wins.headline', n)

// The chips: up to MAX_CHIPS wins, then "+N more".
export function chipsOf(items: Win[]): string[] {
  const shown = items.slice(0, MAX_CHIPS).map(w => w.text)

  return items.length > MAX_CHIPS ? [...shown, t('wins.more', { n: items.length - MAX_CHIPS })] : shown
}

// The dated block for the journal, newest day first in the file (like the other journal files).
export function journalBlock(doc: DayWins): string {
  const [y, m, d] = doc.day.split('-').map(Number) as [number, number, number]
  const date = new Date(y, m - 1, d)
  const lines = doc.items.map(w => `- ${w.kind === 'commit' ? t('wins.commitLabel') : ''}${w.text}`)

  return [`## ${dayHeading(date)}`, t('wins.dateLine', { day: doc.day }), `- ${headline(doc.items.length)}`, ...lines, ''].join('\n')
}

export const journalFile = (day: string): string => `wins-${day.slice(0, 7)}.md`

// Puts the day's block into the month's file: a block of the same day is replaced, a new one goes
// right under the heading (newest first). An empty file gets the heading.
export function mergeJournal(existing: string, doc: DayWins): string {
  const block = journalBlock(doc)
  const [head, ...blocks] = existing.split(/^(?=## )/m)
  const title = head!.trim() === '' || head!.startsWith('## ') ? `# ${t('wins.title', { month: doc.day.slice(0, 7) })}\n\n` : head!
  // A block of this day is found by its date line, whatever language wrote it ("- Date: …", "- Fecha: …", "- 日期：…").
  const isThisDay = (b: string): boolean => new RegExp(`^- [^\\n:：]+[:：] ?${doc.day}$`, 'm').test(b)
  const rest = (head!.startsWith('## ') ? [head!, ...blocks] : blocks).filter(b => !isThisDay(b))

  return `${title.endsWith('\n\n') ? title : `${title.trimEnd()}\n\n`}${[block, ...rest.map(b => (b.endsWith('\n') ? b : `${b}\n`))].join('\n')}`
}
