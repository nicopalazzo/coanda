import type { BandAction, BandButton, BandModel, BandRow, Card, Lane, Snapshot } from '../types'
import { MAX_LANES, endLabel, laneText, primaryText } from './focus'
import { idleStage } from './idle'
import { questionToShow } from './next'
import { currentStep, lastOutcomeStep } from './plan'

// The one function that decides what the band shows. Rebuilt 13 Nov 2026 from the v3 display rules
// (docs/handover-coanda.md): weight follows the job, exceptions only, typing is the person's own
// answer, one quiet exit, a budget. Every button is data: a key, a label and the action dispatch()
// in register.tsx carries out. Order: Setup, idle stage, Sent, a question, Working, Resting.
export function bandModel(s: Snapshot): BandModel {
  if (s.setup.doneAt === null || s.setupOpen) return { kind: 'setup', step: s.setupStep, rows: setupRows(s) }

  // A guessed question waits for the turn to end; a decision card shows at once.
  const shown = questionToShow(s.cards, s.sessionId, s.isWorking ? null : s.asked)
  const isBusy = s.isWorking || s.sent !== null || shown !== null
  // lastActivity 0 means no one has filled it in yet: unknown, so the full band.
  const quietMs = s.lastActivity === 0 ? 0 : s.now - s.lastActivity
  const stage = idleStage(isBusy, quietMs)
  const primary = primaryRow(s)

  if (stage === 'hidden') return { kind: 'hidden' }
  if (stage === 'primary') return { kind: 'rows', moment: 'quiet', rows: [], primary }

  if (s.sent !== null) {
    const row: BandRow = { part: 'sent', label: 'Sent', text: [`✓ ${s.sent}${s.isWorking ? ' · Claude is working' : ''}`], buttons: [] }

    return { kind: 'rows', moment: 'sent', rows: [row], primary }
  }

  if (shown !== null && 'card' in shown) return { kind: 'rows', moment: 'pick', rows: [cardRow(shown.card, waitingCount(s))], primary }

  if (shown !== null) {
    const { asked } = shown
    const row: BandRow = {
      part: 'question',
      label: 'Question',
      text: [asked.text],
      source: 'inferred',
      buttons: [
        ...asked.options.slice(0, 3).map(
          // As in Intent: the first answer primary, the others secondary.
          (one, i): BandButton => ({ key: `asked-${i}`, label: one.label, variant: i === 0 ? 'primary' : 'secondary', action: { kind: 'send', text: one.prompt, label: one.label } }),
        ),
        { key: 'asked-dismiss', label: 'Not for me', variant: 'link', action: { kind: 'dismiss' } },
      ],
    }

    return { kind: 'rows', moment: 'guessed', rows: [row], primary }
  }

  // Working and Resting ask nothing, so with no Primary the band offers to set one (band-mapping.md,
  // 15): a PRIMARY row with its field and "Set", in place of the Primary row under the band.
  const now = s.isWorking ? workingRow(s) : restingRow(s)
  const moment = s.isWorking ? 'working' : 'resting'
  if (goalOf(s) === '') return { kind: 'rows', moment, rows: [now, primarySetRow(s)] }

  return { kind: 'rows', moment, rows: [now], primary }
}

// Open cards of this session: the count shows in the label only above 1 (v3 rule 2).
const waitingCount = (s: Snapshot): number => s.cards.filter(one => one.sessionId === s.sessionId && one.status === 'open').length

// Small choice: the question, one button per option with its consequence under it, the quiet "Later".
// Facts and "could be wrong if" belong to the Big choice moment, not built yet (rule 1: a pick shows the choices).
function cardRow(card: Card, waiting: number): BandRow {
  return {
    part: 'question',
    label: waiting > 1 ? `Question · ${waiting} waiting` : 'Question',
    text: [card.question],
    ...(card.isHardToUndo ? { chip: 'Hard to undo' as const } : {}),
    ...(card.from === 'tool' ? {} : { source: card.from }),
    buttons: [
      ...card.options.slice(0, 3).map(
        (option, i): BandButton => ({
          key: `${card.id}-o${i}`,
          label: option.label,
          // As in Intent: the first option (the agent's recommendation) primary, the others secondary.
          variant: i === 0 ? 'primary' : 'secondary',
          ...(option.consequence === '' ? {} : { detail: option.consequence }),
          action: { kind: 'pick', card, option: option.label },
        }),
      ),
      { key: `${card.id}-later`, label: 'Later', variant: 'link', action: { kind: 'later', cardId: card.id } },
    ],
  }
}

// Working: one NOW line from the task list, a tool fact, so no stamp.
function workingRow(s: Snapshot): BandRow {
  const steps = s.plan.steps
  const at = currentStep(steps)
  const text = at < 0 ? 'Working' : `${steps[at]!.content} · step ${at + 1} of ${steps.length}`

  return { part: 'now', label: 'Now', text: [text], buttons: [] }
}

// Resting: one NOW line. A finished task list is a tool fact; the model's "done" is a guess, stamped.
function restingRow(s: Snapshot): BandRow {
  const steps = s.plan.steps
  const isDone = steps.length > 0 && steps.every(one => one.status === 'completed')
  const fromPlan = isDone ? lastOutcomeStep(steps) : ''
  if (fromPlan !== '') return { part: 'now', label: 'Now', text: [`Idle · ${fromPlan}`], buttons: [] }

  const done = s.reply?.done ?? ''
  if (done !== '') return { part: 'now', label: 'Now', text: [`Idle · ${done}`], source: 'inferred', buttons: [] }

  return { part: 'now', label: 'Now', text: ['Idle'], buttons: [] }
}

// Today's goal: the goals file's Primary wins; else the one typed in the band (snapshot gives it
// only on the day it was set); else ''.
function goalOf(s: Snapshot): string {
  if (s.focus.status === 'ok' && s.focus.primary !== '') return primaryText(s.focus)
  if (s.sessionPrimary !== null && s.sessionPrimary.from === 'band') return s.sessionPrimary.text

  return ''
}

// No Primary: the PRIMARY row, a field "The one thing today…" and "Set" after it (02-playable-band).
// A goals file that is closed or cannot be read says so first, in plain words.
function primarySetRow(s: Snapshot): BandRow {
  return {
    part: 'primary',
    label: 'Primary',
    text: s.focus.status === 'closed' || s.focus.status === 'unreadable' ? [primaryText(s.focus)] : [],
    inputs: [
      {
        key: 'primary-input',
        kind: 'text',
        value: s.setupDraft.primary,
        placeholder: 'The one thing today…',
        button: { key: 'primary-set', label: 'Set', action: { kind: 'primarySet' } },
        action: { kind: 'setupType', field: 'primary', value: '' },
      },
    ],
    buttons: [],
  }
}

// The Primary row shows the goal only; "Details" opens the Lane (rule 6). FocusResult has no
// "done when" line yet, so Details shows the Lane alone.
function primaryRow(s: Snapshot): BandRow {
  // The file's Lanes when it has any, else the typed ones, never both.
  const lane = laneText(s.focus.lanes.length > 0 ? s.focus : { ...s.focus, lanes: s.setup.lanes }, s.now)
  const goal = goalOf(s)

  return {
    part: 'primary',
    text: [`◎ ${goal === '' ? primaryText(s.focus) : goal}`, ...(s.detailsOpen ? [lane === '' ? 'No Lane set' : `Lane: ${lane}`] : [])],
    buttons: [{ key: 'primary-details', label: s.detailsOpen ? 'Less' : 'Details', variant: 'link', action: { kind: 'details' } }],
  }
}

// Rule 5, as one check the tests can call: what a 'rows' model shows against the budget. Nothing
// asked: at most 2 rows, 1 button, 1 link, no chip. Something asked: at most 2 rows, 3 buttons,
// 1 link, 1 chip. The Primary row is counted apart. An empty list means within budget.
export function overBudget(model: BandModel): string[] {
  // A Setup step: one answer at a time. At most 1 primary button, 1 link, 2 fields, no second way
  // to submit (no secondary button); the plain "Remove n" of a kept Lane is not counted.
  if (model.kind === 'setup') {
    const buttons = model.rows.flatMap(row => row.buttons)
    const limit = { primary: 1, secondary: 0, links: 1, inputs: 2 }
    const count = {
      primary: buttons.filter(one => one.variant === 'primary').length,
      secondary: buttons.filter(one => one.variant === 'secondary' || one.variant === undefined).length,
      links: buttons.filter(one => one.variant === 'link').length,
      inputs: model.rows.flatMap(row => row.inputs ?? []).length,
    }

    return (Object.keys(limit) as (keyof typeof limit)[]).filter(k => count[k] > limit[k]).map(k => `${k}: ${count[k]} of at most ${limit[k]}`)
  }

  if (model.kind !== 'rows') return []

  const asks = model.moment === 'pick' || model.moment === 'guessed'
  const limit = asks ? { rows: 2, buttons: 3, links: 1, chips: 1 } : { rows: 2, buttons: 1, links: 1, chips: 0 }
  // A field's own button (its submit) counts as a button too.
  const buttons = [...model.rows.flatMap(row => row.buttons), ...model.rows.flatMap(row => (row.inputs ?? []).flatMap(one => (one.button ? [{ variant: 'primary' as const }] : [])))]
  const count = {
    rows: model.rows.length,
    buttons: buttons.filter(one => one.variant !== 'link').length,
    links: buttons.filter(one => one.variant === 'link').length,
    chips: model.rows.filter(row => row.chip !== undefined).length,
  }

  return (Object.keys(limit) as (keyof typeof limit)[]).filter(k => count[k] > limit[k]).map(k => `${k}: ${count[k]} of at most ${limit[k]}`)
}

// How many steps the Setup moment has: 0 the goals file, 1 the Lanes.
export const SETUP_STEPS = 2

const plain = (key: string, label: string, action: BandAction): BandButton => ({ key, label, variant: 'plain', action })

// The same words as the Primary row: "by 14 Dec", a past day marked.
const laneLine = (lane: Lane, i: number, now: number): string => {
  const end = endLabel(lane, now)

  return `${i + 1}. ${lane.outcome}${end === '' ? '' : ` · ${end}`}`
}

// The Setup moment, rebuilt 13 Nov 2026 by the v3 rules after the first look on screen, then by
// band-mapping.md: one question per step; each field with its submit as a button element after it
// (Enter does the same); the answer stronger than the exit. Until something is kept the step offers the quiet "Skip"; once it is, one
// primary button ("Next", or "Done" on the last step). The rules live in the placeholders.
function setupRows(s: Snapshot): BandRow[] {
  const { setup, setupDraft: draft } = s
  const typed = (field: 'file' | 'lane' | 'end' | 'primary'): BandAction => ({ kind: 'setupType', field, value: '' })
  const label = `Setup · ${s.setupStep + 1} of ${SETUP_STEPS}`
  const isLast = s.setupStep + 1 >= SETUP_STEPS
  const next = (hasKept: boolean): BandButton =>
    hasKept
      ? { key: 'setup-next', label: isLast ? 'Done' : 'Next', variant: 'primary', action: { kind: 'setupNext' } }
      : { key: 'setup-next', label: 'Skip', variant: 'link', action: { kind: 'setupNext' } }

  if (s.setupStep === 0) {
    const kept = setup.focus?.kind === 'file' ? setup.focus.path : ''

    return [
      {
        part: 'setup',
        label,
        text: ['Where are your goals written?', ...(kept === '' ? [] : [`Reading: ${kept}`]), ...(draft.fileNote === '' ? [] : [draft.fileNote])],
        inputs: [
          {
            key: 'setup-file',
            kind: 'text',
            value: draft.file,
            placeholder: '~/goals.md or a full path',
            button: { key: 'setup-file-use', label: 'Use', action: { kind: 'setupFile' } },
            action: typed('file'),
          },
        ],
        buttons: [next(kept !== '')],
      },
    ]
  }

  const hasSomething = setup.focus !== null || setup.lanes.length > 0

  return [
    {
      part: 'setup',
      label,
      text: [
        `What are you working toward? 1 to ${MAX_LANES} Lanes.`,
        ...setup.lanes.map((lane, i) => laneLine(lane, i, s.now)),
        ...(draft.laneNote === '' ? [] : [draft.laneNote]),
      ],
      inputs: [
        { key: 'setup-lane', kind: 'text', value: draft.lane, placeholder: 'Outcome, e.g. portfolio live', action: typed('lane') },
        // One "Add Lane" for the pair, after the second field; Enter in either field adds it too.
        {
          key: 'setup-end',
          kind: 'text',
          value: draft.end,
          placeholder: 'End date, optional: 2026-12-14',
          button: { key: 'setup-lane-add', label: 'Add Lane', action: { kind: 'setupAddLane' } },
          action: typed('end'),
        },
      ],
      buttons: [
        ...setup.lanes.map(
          (lane, i): BandButton => plain(`setup-lane-remove-${i}`, `Remove ${i + 1}`, { kind: 'setupRemoveLane', laneId: lane.id }),
        ),
        next(hasSomething),
      ],
    },
  ]
}
