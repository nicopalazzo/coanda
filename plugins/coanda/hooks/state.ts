import { atom, read, update } from 'claude-code'
import type { StateDollar } from 'claude-code'

import type { Asked, Card, FocusResult, Moment, Pending, Setup, SetupDraft, Step, Suggestion, TypedPrimary } from '../types'

// Every atom of the mod lives here: this session's values, kept in $.state.
//
// The host reads each file on its own to list the state it touches: an atom can only be read or
// written in the file that declares it, and past an import it follows $ only into a function
// declaration. So every atom gets one getter and one updater here, and no other file calls
// read() or update().

// What is typed in the Setup moment and not yet kept, so a redraw keeps the text.
export const NO_DRAFT: SetupDraft = { file: '', lane: '', end: '', primary: '', fileNote: '', laneNote: '' }

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
// Today's Primary typed in the band, as store.ts last read or wrote it; null when none.
// /coanda-specimen: the band shows every drawing option once, to see how the desktop draws them.
const specimen = atom({ plugin: 'coanda', key: 'specimen' } as const, false)
// /coanda-grid: the band shows the measuring page (rulers, steps, text sizes, contrast).
const grid = atom({ plugin: 'coanda', key: 'grid' } as const, false)
// /coanda-lab: the band shows the host-capability tests (SVG animation, press, Client timer, drag, boxes).
const lab = atom({ plugin: 'coanda', key: 'lab' } as const, false)
const labPresses = atom({ plugin: 'coanda', key: 'labPresses' } as const, 0)
const labPosts = atom({ plugin: 'coanda', key: 'labPosts' } as const, 0)
const light = atom({ plugin: 'coanda', key: 'light' } as const, false)
const lightLit = atom({ plugin: 'coanda', key: 'lightLit' } as const, false)
const lamp = atom({ plugin: 'coanda', key: 'lamp' } as const, 'off' as 'off' | 'dark' | 'playing' | 'revealing')
const stage = atom({ plugin: 'coanda', key: 'stage' } as const, false)
const stagePlaying = atom({ plugin: 'coanda', key: 'stagePlaying' } as const, false)
const stagePlays = atom({ plugin: 'coanda', key: 'stagePlays' } as const, 0)
const stageOver = atom({ plugin: 'coanda', key: 'stageOver' } as const, 0)
const stageUnder = atom({ plugin: 'coanda', key: 'stageUnder' } as const, 0)
const labLit = atom({ plugin: 'coanda', key: 'labLit' } as const, false)
const typedPrimary = atom({ plugin: 'coanda', key: 'typedPrimary' } as const, null as TypedPrimary | null)

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

export async function getTypedPrimary($: StateDollar): Promise<TypedPrimary | null> {
  return read($, typedPrimary)
}

export async function updateTypedPrimary($: StateDollar, change: (now: TypedPrimary | null) => TypedPrimary | null): Promise<TypedPrimary | null> {
  return update($, typedPrimary, change)
}

export async function getSpecimen($: StateDollar): Promise<boolean> {
  return read($, specimen)
}

export async function updateSpecimen($: StateDollar, change: (now: boolean) => boolean): Promise<boolean> {
  return update($, specimen, change)
}

export async function getLab($: StateDollar): Promise<boolean> {
  return read($, lab)
}

export async function updateLab($: StateDollar, change: (now: boolean) => boolean): Promise<boolean> {
  return update($, lab, change)
}

export async function getLabPresses($: StateDollar): Promise<number> {
  return read($, labPresses)
}

export async function updateLabPresses($: StateDollar, change: (now: number) => number): Promise<number> {
  return update($, labPresses, change)
}

export async function getLabPosts($: StateDollar): Promise<number> {
  return read($, labPosts)
}

export async function updateLabPosts($: StateDollar, change: (now: number) => number): Promise<number> {
  return update($, labPosts, change)
}

export async function getLabLit($: StateDollar): Promise<boolean> {
  return read($, labLit)
}

export async function updateLabLit($: StateDollar, change: (now: boolean) => boolean): Promise<boolean> {
  return update($, labLit, change)
}

export async function getLight($: StateDollar): Promise<boolean> {
  return read($, light)
}

export async function updateLight($: StateDollar, change: (now: boolean) => boolean): Promise<boolean> {
  return update($, light, change)
}

export async function getLightLit($: StateDollar): Promise<boolean> {
  return read($, lightLit)
}

export async function updateLightLit($: StateDollar, change: (now: boolean) => boolean): Promise<boolean> {
  return update($, lightLit, change)
}

export async function getLamp($: StateDollar): Promise<'off' | 'dark' | 'playing' | 'revealing'> {
  return read($, lamp)
}

export async function updateLamp($: StateDollar, change: (now: 'off' | 'dark' | 'playing' | 'revealing') => 'off' | 'dark' | 'playing' | 'revealing'): Promise<'off' | 'dark' | 'playing' | 'revealing'> {
  return update($, lamp, change)
}

export async function getStage($: StateDollar): Promise<boolean> {
  return read($, stage)
}

export async function updateStage($: StateDollar, change: (now: boolean) => boolean): Promise<boolean> {
  return update($, stage, change)
}

export async function getStagePlaying($: StateDollar): Promise<boolean> {
  return read($, stagePlaying)
}

export async function updateStagePlaying($: StateDollar, change: (now: boolean) => boolean): Promise<boolean> {
  return update($, stagePlaying, change)
}

export async function getStagePlays($: StateDollar): Promise<number> {
  return read($, stagePlays)
}

export async function updateStagePlays($: StateDollar, change: (now: number) => number): Promise<number> {
  return update($, stagePlays, change)
}

export async function getStageOver($: StateDollar): Promise<number> {
  return read($, stageOver)
}

export async function updateStageOver($: StateDollar, change: (now: number) => number): Promise<number> {
  return update($, stageOver, change)
}

export async function getStageUnder($: StateDollar): Promise<number> {
  return read($, stageUnder)
}

export async function updateStageUnder($: StateDollar, change: (now: number) => number): Promise<number> {
  return update($, stageUnder, change)
}

export async function getGrid($: StateDollar): Promise<boolean> {
  return read($, grid)
}

export async function updateGrid($: StateDollar, change: (now: boolean) => boolean): Promise<boolean> {
  return update($, grid, change)
}
