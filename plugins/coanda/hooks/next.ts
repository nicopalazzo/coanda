import type { Asked, Card, Moment, Suggestion } from '../types'
import { isOpen } from './cards'

export const NEXT_SYSTEM =
  'You read the last exchange between a user and an AI assistant and say where the work stands. ' +
  'Reply with only a JSON object {"moment": "start" | "question" | "other", "question": string, "done": string, "next": string, "suggestions": [...]}. ' +
  '"done": what this reply says was achieved, the outcome not the bookkeeping (never saving notes or running checks), at most 8 words ("" if nothing). ' +
  '"next": the next step the assistant names, in the assistant\'s own words, at most 6 words ("" if none). ' +
  '"start": the user is beginning a new task, plan or idea and has not yet said in their own words what they want. ' +
  '"question": the assistant\'s reply ENDS by asking the user a question or for a choice. A question listed inside the reply (an open point, a note), or a reply ending on an instruction, is not "question". ' +
  '"other": anything else. ' +
  'Only for "question", "question" holds the question the assistant asked, rephrased in at most 14 words, and "suggestions" holds up to 3 likely answers {"label": string, "prompt": string}: ' +
  '"label" at most 4 words and under 26 characters, "prompt" the exact reply in the first person, one sentence. ' +
  'Each answer names a choice, never a plain approval ("go", "ok", "yes", "done"). Leave out "Something else" and "Later": the user types their own answer, and a quiet "Later" exists already. For "start" and "other", "question" is "" and "suggestions" is [].'

const OWN = /^(something else|other|later|skip|go|ok|okay|yes|done)\.?$/i

const shortLabel = (s: string) => {
  const w = s.replace(/\s+/g, ' ').trim()

  return w.length <= 26 ? w : `${w.slice(0, 25).replace(/\s+\S*$/, '')}…`
}

export function parseSuggestions(text: string): Suggestion[] {
  const m = text.match(/\[[\s\S]*\]/)

  if (!m) return []

  try {
    const list = JSON.parse(m[0]) as unknown

    if (!Array.isArray(list)) return []

    return list
      .filter((x): x is { label: string; prompt?: unknown } => typeof x?.label === 'string' && x.label.trim() !== '')
      // Typing is the person's own answer, the band has its own quiet "Later", and no one-press approvals.
      .filter(x => !OWN.test(x.label.trim()))
      .map(x => ({ label: shortLabel(x.label), prompt: typeof x.prompt === 'string' && x.prompt.trim() ? x.prompt.trim() : x.label.trim() }))
      .slice(0, 3)
  } catch {
    return []
  }
}

export const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}…` : s)

// The model's reply: the moment and, for a question, its likely answers; an old-style array counts as a question.
export function parseNext(text: string): { moment: Moment; question: string; done: string; next: string; suggestions: Suggestion[] } {
  const m = text.match(/\{[\s\S]*\}/)

  if (m) {
    try {
      const raw = JSON.parse(m[0]) as { moment?: unknown; question?: unknown; done?: unknown; next?: unknown; suggestions?: unknown }
      const moment: Moment = raw.moment === 'start' || raw.moment === 'question' ? raw.moment : 'other'

      const question = moment === 'question' && typeof raw.question === 'string' ? raw.question.trim().slice(0, 200) : ''

      const next = typeof raw.next === 'string' ? raw.next.trim().slice(0, 60) : ''
      const done = typeof raw.done === 'string' ? raw.done.trim().slice(0, 70) : ''

      return { moment, question, done, next, suggestions: moment === 'question' ? parseSuggestions(JSON.stringify(raw.suggestions ?? [])) : [] }
    } catch {
      // fall through to the array form
    }
  }

  const suggestions = parseSuggestions(text)

  return { moment: suggestions.length > 0 ? 'question' : 'other', question: '', done: '', next: '', suggestions }
}

// A question the model found in the reply's prose: always marked inferred (v3), never a tool fact.
// Nothing to ask (another moment, or an empty question) gives null.
export function toAsked(got: { moment: Moment; question: string; suggestions: Suggestion[] }): Asked | null {
  return got.moment === 'question' && got.question !== '' ? { text: got.question, options: got.suggestions, from: 'inferred' } : null
}

// What the band asks: a structured question always wins. The oldest open card of this session
// comes first; the inferred question shows only when no card is open.
export function questionToShow(cards: Card[], sessionId: string, asked: Asked | null): { card: Card } | { asked: Asked } | null {
  const card = cards.find(one => one.sessionId === sessionId && isOpen(one))
  if (card !== undefined) return { card }

  return asked === null ? null : { asked }
}
