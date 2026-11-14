import type { EngineInterface } from 'claude-code'

import type { Card, DayWins, DecisionStatus, Setup, ShutdownDoc, TypedPrimary, Win } from '../types'
import { close, supersede, toBottom } from './cards'
import { focusSourceOf, toSetup } from './focus'
import { getCards, updateCards, updateSetupSeen, updateShutdown, updateTypedPrimary, updateWins } from './state'
import { addWins, winsOf } from './wins'

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

// Today's Primary typed in the band: one document `{ v: 1, day, text, setAt }`, read at session
// start and replaced by each "Set". The band shows it only on the day it was set.
const isTypedPrimary = (one: unknown): one is TypedPrimary => {
  const doc = one as TypedPrimary | null
  return doc?.v === 1 && typeof doc.day === 'string' && typeof doc.text === 'string' && doc.text !== '' && typeof doc.setAt === 'number'
}

export async function loadTypedPrimary($: Keeper): Promise<TypedPrimary | null> {
  const raw = await $.store.get('primary')
  const found = isTypedPrimary(raw) ? raw : null
  await updateTypedPrimary($, () => found)

  return found
}

export async function setTypedPrimary($: Keeper, text: string, day: string, setAt: number) {
  const doc: TypedPrimary = { v: 1, day, text, setAt }
  await $.store.set('primary', doc)
  await updateTypedPrimary($, () => doc)
}

// The shutdown answer: one document `{ v: 1, day, text, setAt }`, replaced each evening; `text: ''`
// means skipped. Read at session start.
const isShutdown = (one: unknown): one is ShutdownDoc => {
  const doc = one as ShutdownDoc | null
  return doc?.v === 1 && typeof doc.day === 'string' && typeof doc.text === 'string' && typeof doc.setAt === 'number'
}

export async function loadShutdown($: Keeper): Promise<ShutdownDoc | null> {
  const raw = await $.store.get('shutdown')
  const found = isShutdown(raw) ? raw : null
  await updateShutdown($, () => found)

  return found
}

// The day record: one document `{ v: 1, day, items, answered, open }`. A document of another day
// reads as today's empty one. Wins from several sessions add up: each change reads the store again.
const isWins = (one: unknown): one is DayWins => {
  const doc = one as DayWins | null
  return doc?.v === 1 && typeof doc.day === 'string' && Array.isArray(doc.items) && typeof doc.answered === 'boolean'
}

async function changeWins($: Keeper, now: number, change: (today: DayWins) => DayWins) {
  const raw = await $.store.get('wins')
  const next = change(winsOf(isWins(raw) ? raw : null, now))
  await $.store.set('wins', next)
  await updateWins($, () => next)
}

export async function loadWins($: Keeper): Promise<DayWins | null> {
  const raw = await $.store.get('wins')
  const found = isWins(raw) ? raw : null
  await updateWins($, () => found)

  return found
}

export async function setShutdown($: Keeper, text: string, day: string, setAt: number) {
  const doc: ShutdownDoc = { v: 1, day, text, setAt }
  await $.store.set('shutdown', doc)
  await updateShutdown($, () => doc)
}

export async function noteWins($: Keeper, now: number, found: Omit<Win, 'at'>[]) {
  if (found.length === 0) return
  await changeWins($, now, today => addWins(today, now, found))
}

export async function answerWins($: Keeper, now: number) {
  await changeWins($, now, today => ({ ...today, answered: true, open: false }))
}

// /coanda-today: asked for before the usual hour (or again after an answer).
export async function openWins($: Keeper, now: number) {
  await changeWins($, now, today => ({ ...today, answered: false, open: true }))
}
