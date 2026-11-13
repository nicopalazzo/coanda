import type { EngineInterface } from 'claude-code'

import type { Card, DecisionStatus, Lane, Setup } from '../types'
import { close, supersede, toBottom } from './cards'
import { focusSourceOf, toSetup } from './focus'
import { getCards, updateCards, updateSetupSeen } from './state'

// What the person keeps across sessions lives in $.store: the setup and the decision cards.
// Each document carries `v: 1`. The store starts empty: nothing from an older plugin is read.
type Keeper = Pick<EngineInterface, 'state' | 'store'>

// The setup of a person who has not been asked yet: no finish time, so the Setup moment shows.
export const NO_SETUP: Setup = { v: 1, doneAt: null, focus: null, lanes: [], partsOff: [], rules: 'none', counting: false }

// Closed cards (answered, superseded, cancelled) are kept a while, newest last, so a later stage
// can measure decisions; open and deferred cards are always kept.
export const KEEP_CLOSED = 30

const isWaiting = (card: Card): boolean => card.status === 'open' || card.status === 'deferred'

export function trim(cards: Card[]): Card[] {
  const closed = cards.filter(one => !isWaiting(one))
  const dropped = new Set(closed.slice(0, Math.max(0, closed.length - KEEP_CLOSED)).map(one => one.id))

  return cards.filter(one => !dropped.has(one.id))
}

// The Focus source the person saved in setup (an absolute path); null when none is saved, and then
// nothing is read from disk.
export async function readFocusSource($: Pick<EngineInterface, 'store'>): Promise<string | null> {
  return focusSourceOf(await $.store.get('setup'))
}

// Every change goes to $.store too, so the cards come back in a new session: `{ v: 1, items }`.
async function saveCards($: Keeper, list: Card[]) {
  await $.store.set('cards', { v: 1, items: list })
}

const isCard = (one: unknown): boolean => {
  const card = one as Card | null
  return typeof card?.id === 'string' && typeof card.sessionId === 'string' && card.sessionId !== '' && typeof card.status === 'string' && Array.isArray(card.options)
}

// $.state outlives a reload; $.store brings the cards back in a new session.
export async function restore($: Keeper) {
  const raw = (await $.store.get('cards')) as { v?: unknown; items?: unknown } | null | undefined
  const items = raw?.v === 1 && Array.isArray(raw.items) ? (raw.items.filter(isCard) as Card[]) : []

  if ((await getCards($)).length === 0 && items.length > 0) await updateCards($, () => items)
}

// The saved setup, read again and copied into this session's atom; null when none is saved.
export async function loadSetup($: Keeper): Promise<Setup | null> {
  const found = toSetup(await $.store.get('setup'))
  await updateSetupSeen($, () => found)

  return found
}

// Each change reads the document again, changes its own field and writes.
async function changeSetup($: Keeper, change: (now: Setup) => Setup) {
  const next = change(toSetup(await $.store.get('setup')) ?? NO_SETUP)
  await $.store.set('setup', next)
  await updateSetupSeen($, () => next)
}

export async function setLanes($: Keeper, lanes: Lane[]) {
  await changeSetup($, now => ({ ...now, lanes }))
}

export async function setFocus($: Keeper, focus: Setup['focus']) {
  await changeSetup($, now => ({ ...now, focus }))
}

// The Setup moment is done, or every step was skipped: it does not come back on its own.
export async function finishSetup($: Keeper, doneAt: number) {
  await changeSetup($, now => ({ ...now, doneAt }))
}

// Past an import the host follows $ only into a function declaration, so these are not arrows.

// A new card replaces an open one on the same question from the same session.
export async function addCard($: Keeper, card: Card) {
  await saveCards($, await updateCards($, all => trim(supersede(all, card))))
}

// A card leaves 'open': answered (with what was chosen or typed), superseded or cancelled.
export async function closeCard($: Keeper, id: string, status: Exclude<DecisionStatus, 'open' | 'deferred'>, now: number, detail?: string) {
  await saveCards($, await updateCards($, all => trim(all.map(one => (one.id === id ? close(one, status, now, detail) : one)))))
}

// "Later": the card is deferred and goes to the back of the list.
export async function deferCard($: Keeper, id: string, now: number) {
  await saveCards($, await updateCards($, all => toBottom(all.map(one => (one.id === id ? close(one, 'deferred', now) : one)), id)))
}
