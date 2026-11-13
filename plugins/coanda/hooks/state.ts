import { atom, read, update } from 'claude-code'
import type { StateDollar } from 'claude-code'

import type { Asked, Card, FocusResult, Moment, Pending, Setup, SetupDraft, Step, Suggestion } from '../types'

// Every atom of the mod lives here: this session's values, kept in $.state.
//
// The host reads each file on its own to list the state it touches: an atom can only be read or
// written in the file that declares it, and past an import it follows $ only into a function
// declaration. So every atom gets one getter and one updater here, and no other file calls
// read() or update().

// What is typed in the Setup moment and not yet kept, so a redraw keeps the text.
export const NO_DRAFT: SetupDraft = { file: '', lane: '', end: '', fileNote: '', laneNote: '' }

const cards = atom({ plugin: 'coanda', key: 'cards' } as const, [] as Card[])
// What the Focus source says, as the parser returned it; only the tick writes it.
const focus = atom({ plugin: 'coanda', key: 'focus' } as const, { status: 'none', primary: '', laneId: '', lanes: [] } as FocusResult)
// The app's task list (update_plan), read into steps: NOW comes from here, a tool fact.
const steps = atom({ plugin: 'coanda', key: 'steps' } as const, [] as Step[])
const suggestions = atom({ plugin: 'coanda', key: 'suggestions' } as const, [] as Suggestion[])
const lastPrompt = atom({ plugin: 'coanda', key: 'lastPrompt' } as const, '')
const moment = atom({ plugin: 'coanda', key: 'moment' } as const, 'other' as Moment)
// The question found in Claude's prose: always inferred; an open card wins over it.
const asked = atom({ plugin: 'coanda', key: 'asked' } as const, null as Asked | null)
// What comes next, as Claude's last answer put it.
const nextUp = atom({ plugin: 'coanda', key: 'nextUp' } as const, '')
// What the last answer says was achieved.
const doneLast = atom({ plugin: 'coanda', key: 'doneLast' } as const, '')
const pending = atom({ plugin: 'coanda', key: 'pending' } as const, null as Pending | null)
// The answer just pressed, shown as "Sent" until Claude's turn ends; while set, no other press goes out.
const sent = atom({ plugin: 'coanda', key: 'sent' } as const, null as string | null)
// The saved setup as this session last read or wrote it (store.ts is the only writer); null until read.
const setupSeen = atom({ plugin: 'coanda', key: 'setupSeen' } as const, null as Setup | null)
// Whether the Setup moment was reopened, and the step it shows (dispatch writes both).
const setupOpen = atom({ plugin: 'coanda', key: 'setupOpen' } as const, false)
const setupStep = atom({ plugin: 'coanda', key: 'setupStep' } as const, 0)
const setupDraft = atom({ plugin: 'coanda', key: 'setupDraft' } as const, NO_DRAFT)
// Whether the Primary row's Details (the "done when" line and the Lane) is open.
const detailsOpen = atom({ plugin: 'coanda', key: 'detailsOpen' } as const, false)

export async function getCards($: StateDollar): Promise<Card[]> {
  return read($, cards)
}

export async function updateCards($: StateDollar, change: (now: Card[]) => Card[]): Promise<Card[]> {
  return update($, cards, change)
}

export async function getFocus($: StateDollar): Promise<FocusResult> {
  return read($, focus)
}

export async function updateFocus($: StateDollar, change: (now: FocusResult) => FocusResult): Promise<FocusResult> {
  return update($, focus, change)
}

export async function getSteps($: StateDollar): Promise<Step[]> {
  return read($, steps)
}

export async function updateSteps($: StateDollar, change: (now: Step[]) => Step[]): Promise<Step[]> {
  return update($, steps, change)
}

export async function getSuggestions($: StateDollar): Promise<Suggestion[]> {
  return read($, suggestions)
}

export async function updateSuggestions($: StateDollar, change: (now: Suggestion[]) => Suggestion[]): Promise<Suggestion[]> {
  return update($, suggestions, change)
}

export async function getLastPrompt($: StateDollar): Promise<string> {
  return read($, lastPrompt)
}

export async function updateLastPrompt($: StateDollar, change: (now: string) => string): Promise<string> {
  return update($, lastPrompt, change)
}

export async function getMoment($: StateDollar): Promise<Moment> {
  return read($, moment)
}

export async function updateMoment($: StateDollar, change: (now: Moment) => Moment): Promise<Moment> {
  return update($, moment, change)
}

export async function getAsked($: StateDollar): Promise<Asked | null> {
  return read($, asked)
}

export async function updateAsked($: StateDollar, change: (now: Asked | null) => Asked | null): Promise<Asked | null> {
  return update($, asked, change)
}

export async function getNextUp($: StateDollar): Promise<string> {
  return read($, nextUp)
}

export async function updateNextUp($: StateDollar, change: (now: string) => string): Promise<string> {
  return update($, nextUp, change)
}

export async function getDoneLast($: StateDollar): Promise<string> {
  return read($, doneLast)
}

export async function updateDoneLast($: StateDollar, change: (now: string) => string): Promise<string> {
  return update($, doneLast, change)
}

export async function getPending($: StateDollar): Promise<Pending | null> {
  return read($, pending)
}

export async function updatePending($: StateDollar, change: (now: Pending | null) => Pending | null): Promise<Pending | null> {
  return update($, pending, change)
}

export async function getSent($: StateDollar): Promise<string | null> {
  return read($, sent)
}

export async function updateSent($: StateDollar, change: (now: string | null) => string | null): Promise<string | null> {
  return update($, sent, change)
}

export async function getSetupSeen($: StateDollar): Promise<Setup | null> {
  return read($, setupSeen)
}

export async function updateSetupSeen($: StateDollar, change: (now: Setup | null) => Setup | null): Promise<Setup | null> {
  return update($, setupSeen, change)
}

export async function getSetupOpen($: StateDollar): Promise<boolean> {
  return read($, setupOpen)
}

export async function updateSetupOpen($: StateDollar, change: (now: boolean) => boolean): Promise<boolean> {
  return update($, setupOpen, change)
}

export async function getSetupStep($: StateDollar): Promise<number> {
  return read($, setupStep)
}

export async function updateSetupStep($: StateDollar, change: (now: number) => number): Promise<number> {
  return update($, setupStep, change)
}

export async function getSetupDraft($: StateDollar): Promise<SetupDraft> {
  return read($, setupDraft)
}

export async function updateSetupDraft($: StateDollar, change: (now: SetupDraft) => SetupDraft): Promise<SetupDraft> {
  return update($, setupDraft, change)
}

export async function getDetailsOpen($: StateDollar): Promise<boolean> {
  return read($, detailsOpen)
}

export async function updateDetailsOpen($: StateDollar, change: (now: boolean) => boolean): Promise<boolean> {
  return update($, detailsOpen, change)
}
