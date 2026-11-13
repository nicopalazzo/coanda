import type { Card, DecisionOption, DecisionStatus } from '../types'

const clip = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : ''

const list = (value: unknown, most: number, max: number): string[] =>
  Array.isArray(value) ? value.map(one => clip(one, max)).filter(one => one !== '').slice(0, most) : []

// The quiet exit is added by the band; an option that only says "go" names no choice (no generic
// approval button: the host keeps tool permissions).
const QUIET_EXIT = /^(later|skip|not now|not for me)$/i
const BARE_GO = /^(go|go ahead|ok|okay|yes|proceed|proceed as proposed|continue|do it|approve)$/i

function optionsOf(value: unknown): DecisionOption[] {
  if (!Array.isArray(value)) return []

  return value
    .map(one => {
      const raw = (one ?? {}) as Record<string, unknown>

      return { label: clip(raw.label, 40), consequence: clip(raw.consequence, 100) }
    })
    .filter(one => one.label !== '' && !QUIET_EXIT.test(one.label))
    .slice(0, 3)
}

// The tool's input, held to the decision card: a question, 2 or 3 options each with what follows
// from it, at most 2 facts, hard to undo or not, and one "could be wrong if". A refusal is a plain
// sentence for the agent, never an exception.
export function toCard(input: unknown, now: number, sessionId: string): Card | string {
  const raw = (input ?? {}) as Record<string, unknown>
  const question = clip(raw.question, 200)
  const options = optionsOf(raw.options)

  if (question === '') return 'No card added: the question is empty.'
  if (options.length < 2) return 'No card added: give 2 or 3 options, each with a label and its consequence.'

  const bare = options.find(one => BARE_GO.test(one.label))
  if (bare !== undefined) return `No card added: "${bare.label}" names no choice. Name what each option does.`

  const missing = options.find(one => one.consequence === '')
  if (missing !== undefined) return `No card added: option "${missing.label}" has no consequence. Say what follows from choosing it.`

  return {
    id: `${now.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    sessionId,
    question,
    facts: list(raw.facts, 2, 120),
    options,
    isHardToUndo: raw.hard_to_undo === true,
    couldBeWrongIf: clip(raw.could_be_wrong_if, 120),
    askedBy: clip(raw.asked_by, 60) || 'Claude',
    from: 'tool',
    status: 'open',
    askedAt: now,
  }
}

export const without = (cards: Card[], id: string): Card[] => cards.filter(one => one.id !== id)

export const toBottom = (cards: Card[], id: string): Card[] => {
  const card = cards.find(one => one.id === id)

  return card === undefined ? cards : [...without(cards, id), card]
}

export const isOpen = (card: Card): boolean => card.status === 'open'

// A card leaves 'open' once, with the time and (for 'answered') what was chosen or typed.
// A card already closed is left as it is.
export function close(card: Card, status: Exclude<DecisionStatus, 'open'>, now: number, detail?: string): Card {
  if (!isOpen(card)) return card

  return {
    ...card,
    status,
    closedAt: now,
    ...(status === 'answered' && detail !== undefined ? { answer: detail.slice(0, 120) } : {}),
    ...(status === 'superseded' && detail !== undefined ? { supersededBy: detail } : {}),
  }
}

// A new card from the same session on the same question replaces the open one.
export function supersede(cards: Card[], next: Card): Card[] {
  return [
    ...cards.map(one => (one.sessionId === next.sessionId && one.question === next.question ? close(one, 'superseded', next.askedAt, next.id) : one)),
    next,
  ]
}

export const answer = (card: Card, option: string): string => `Decision: ${card.question} → ${option}`

// The tool Claude calls to put a decision card in the band.
export const ASK_DECISION = {
  name: 'ask_decision',
  description:
    "Put a decision in the band above the user's prompt, instead of asking it in the chat. Use it only when you need " +
    'the user to choose before you can go on. Give one short question; 2 or 3 options, each with a short label that names ' +
    'the choice and its consequence (what happens next if they pick it); never a bare "go", "ok" or "proceed". Add at most ' +
    '2 short facts that matter, set hard_to_undo when a choice cannot easily be reversed, and one line on what would make ' +
    'your recommendation wrong. A quiet "Later" is added for you; the user may also type their own answer. The answer ' +
    'arrives as a user message "Decision: <question> → <label>"; end your turn after calling it.',
  inputSchema: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'The decision, one short question' },
      options: {
        type: 'array',
        minItems: 2,
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'A few words naming the choice' },
            consequence: { type: 'string', description: 'What happens next if the user picks it, one short line' },
          },
          required: ['label', 'consequence'],
        },
        description: '2 or 3 options, your recommendation first',
      },
      facts: { type: 'array', items: { type: 'string' }, description: 'At most 2 short facts that matter for the choice' },
      hard_to_undo: { type: 'boolean', description: 'True when a choice cannot easily be reversed' },
      could_be_wrong_if: { type: 'string', description: 'One line: what would make your recommendation wrong' },
      asked_by: { type: 'string', description: 'What asks, e.g. "decide mod build"' },
    },
    required: ['question', 'options'],
  },
  isDeferred: false,
}
