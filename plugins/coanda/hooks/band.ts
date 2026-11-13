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
          (one, i): BandButton => ({ key: `asked-${i}`, label: one.label, variant: 'secondary', action: { kind: 'send', text: one.prompt, label: one.label } }),
        ),
        { key: 'asked-dismiss', label: 'Not for me', variant: 'link', action: { kind: 'dismiss' } },
      ],
    }

    return { kind: 'rows', moment: 'guessed', rows: [row], primary }
  }

  if (s.isWorking) return { kind: 'rows', moment: 'working', rows: [workingRow(s)], primary }

  return { kind: 'rows', moment: 'resting', rows: [restingRow(s)], primary }
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
    ...(card.isHardToUndo ? { chip: 'hard to undo' as const } : {}),
    ...(card.from === 'tool' ? {} : { source: card.from }),
    buttons: [
      ...card.options.slice(0, 3).map(
        (option, i): BandButton => ({
          key: `${card.id}-o${i}`,
          label: option.label,
          variant: 'secondary',
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

// The Primary row shows the goal only; "Details" opens the Lane (rule 6). FocusResult has no
// "done when" line yet, so Details shows the Lane alone.
function primaryRow(s: Snapshot): BandRow {
  // The file's Lanes when it has any, else the typed ones, never both.
  const lane = laneText(s.focus.lanes.length > 0 ? s.focus : { ...s.focus, lanes: s.setup.lanes }, s.now)

  return {
    part: 'primary',
    text: [`◎ ${primaryText(s.focus)}`, ...(s.detailsOpen ? [lane === '' ? 'No Lane set' : `Lane: ${lane}`] : [])],
    buttons: [{ key: 'primary-details', label: s.detailsOpen ? 'Less' : 'Details', variant: 'link', action: { kind: 'details' } }],
  }
}

// Rule 5, as one check the tests can call: what a 'rows' model shows against the budget. Nothing
// asked: at most 2 rows, 1 button, 1 link, no chip. Something asked: at most 2 rows, 3 buttons,
// 1 link, 1 chip. The Primary row is counted apart. An empty list means within budget.
export function overBudget(model: BandModel): string[] {
  if (model.kind !== 'rows') return []

  const asks = model.moment === 'pick' || model.moment === 'guessed'
  const limit = asks ? { rows: 2, buttons: 3, links: 1, chips: 1 } : { rows: 2, buttons: 1, links: 1, chips: 0 }
  const buttons = model.rows.flatMap(row => row.buttons)
  const count = {
    rows: model.rows.length,
    buttons: buttons.filter(one => one.variant !== 'link').length,
    links: buttons.filter(one => one.variant === 'link').length,
    chips: model.rows.filter(row => row.chip !== undefined).length,
  }

  return (Object.keys(limit) as (keyof typeof limit)[]).filter(k => count[k] > limit[k]).map(k => `${k}: ${count[k]} of at most ${limit[k]}`)
}

// How many steps the Setup moment has. Step 0 is the Focus source and the Lanes.
export const SETUP_STEPS = 1

const plain = (key: string, label: string, action: BandAction): BandButton => ({ key, label, variant: 'plain', action })

// The same words as the Primary row: "by 14 Dec", a past day marked.
const laneLine = (lane: Lane, i: number, now: number): string => {
  const end = endLabel(lane, now)

  return `${i + 1}. ${lane.outcome}${end === '' ? '' : ` · ${end}`}`
}

// The Setup moment: step 0 asks for the Focus source and the Lanes; every step has Skip.
// Brought over from the first repository's band almost as it was.
function setupRows(s: Snapshot): BandRow[] {
  const { setup, setupDraft: draft } = s
  const typed = (field: 'file' | 'lane' | 'end'): BandAction => ({ kind: 'setupType', field, value: '' })
  const hasSomething = setup.focus !== null || setup.lanes.length > 0

  return [
    { part: 'setup', label: 'SETUP', text: [`Step ${s.setupStep + 1} of ${SETUP_STEPS}. Coanda asks once. Skip any step.`], buttons: [] },
    {
      part: 'setup',
      label: 'GOALS FILE',
      text: [
        'Where are your goals written? Name the file: a full path, or one starting with ~/.',
        ...(setup.focus?.kind === 'file' ? [`Reading: ${setup.focus.path}`] : []),
        ...(draft.fileNote === '' ? [] : [draft.fileNote]),
      ],
      inputs: [{ key: 'setup-file', kind: 'text', value: draft.file, placeholder: '~/goals.md', action: typed('file') }],
      buttons: [{ key: 'setup-file-use', label: 'Use this file', variant: 'secondary', action: { kind: 'setupFile' } }],
    },
    {
      part: 'setup',
      label: 'LANES',
      text: [
        `Or write 1 to ${MAX_LANES} Lanes: what you are working toward. An end date is optional (YYYY-MM-DD).`,
        ...setup.lanes.map((lane, i) => laneLine(lane, i, s.now)),
        ...(draft.laneNote === '' ? [] : [draft.laneNote]),
      ],
      inputs: [
        { key: 'setup-lane', kind: 'text', value: draft.lane, placeholder: 'Lane outcome', action: typed('lane') },
        { key: 'setup-end', kind: 'text', value: draft.end, placeholder: 'End date', action: typed('end') },
      ],
      buttons: [
        { key: 'setup-lane-add', label: 'Add Lane', variant: 'secondary', action: { kind: 'setupAddLane' } },
        ...setup.lanes.map(
          (lane, i): BandButton => plain(`setup-lane-remove-${i}`, `Remove ${i + 1}`, { kind: 'setupRemoveLane', laneId: lane.id }),
        ),
      ],
    },
    {
      part: 'setup',
      text: [],
      buttons: [{ key: 'setup-next', label: hasSomething ? 'Done' : 'Skip', variant: 'primary', action: { kind: 'setupNext' } }],
    },
  ]
}
