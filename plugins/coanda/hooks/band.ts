import type { BandButton, BandModel, BandRow, Card, Lane, Snapshot } from '../types'
import { MAX_LANES, endLabel, goalsState, laneText, primaryText } from './focus'
import { idleStage } from './idle'
import { questionToShow } from './next'
import { proposalLane } from './goals-ask'
import type { GoalsAsk } from './goals-ask'
import { nudgeShows, nudgeText } from './standup'
import { currentStep, lastOutcomeStep } from './plan'

// The one function that decides what the band shows. Rebuilt 13 Nov 2026 from the v3 display rules
// (docs/handover-coanda.md): weight follows the job, exceptions only, typing is the person's own
// answer, one quiet exit, a budget. Every button is data: a key, a label and the action dispatch()
// in register.tsx carries out. Order: Setup, idle stage, Sent, a question, Working, Resting.
export function bandModel(s: Snapshot): BandModel {
  if (s.setup.doneAt === null || s.setupOpen) return { kind: 'setup', heading: SETUP_HEADING, rows: setupRows(s) }

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

  if (shown !== null && 'card' in shown) return { kind: 'rows', moment: 'pick', heading: waitingCount(s) > 1 ? `Question · ${waitingCount(s)} waiting` : 'Question', rows: [cardRow(shown.card, waitingCount(s))], primary }

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

    return { kind: 'rows', moment: 'guessed', heading: 'Question', rows: [row], primary }
  }

  // Working and Resting ask nothing, so with no Primary the band offers to set one: the step "Set your
  // Primary" (heading, field, "Set"), built from Nicolas's canvas of Sat 14 Nov. It is a step that needs
  // the person, so it replaces the status row (band-rebuild-plan.md, D4).
  const now = withNudge(s.isWorking ? workingRow(s) : restingRow(s), s)
  const moment = s.isWorking ? 'working' : 'resting'
  if (goalOf(s) === '') return { kind: 'rows', moment, heading: 'Set your Primary', rows: [primarySetRow(s)] }

  return { kind: 'rows', moment, rows: [now], primary }
}

// The stand-up nudge: a muted line and the quiet "Not now" on the NOW row itself (no new row), so the
// budget holds. Shown once per streak: "Not now" resets the count.
function withNudge(row: BandRow, s: Snapshot): BandRow {
  if (!nudgeShows(s.standup, s.now, s.isWorking)) return row

  return { ...row, note: nudgeText(s.standup), buttons: [...row.buttons, { key: 'standup-dismiss', label: 'Not now', variant: 'link', action: { kind: 'standupDismiss' } }] }
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

// A run longer than this shows the breathing circle beside the Working line.
export const BREATHE_AFTER_MS = 30_000

// Working: one NOW line from the task list, a tool fact, so no stamp.
function workingRow(s: Snapshot): BandRow {
  const steps = s.plan.steps
  const at = currentStep(steps)
  const text = at < 0 ? 'Working' : `${steps[at]!.content} · step ${at + 1} of ${steps.length}`

  const isLong = s.workingSince !== null && s.now - s.workingSince >= BREATHE_AFTER_MS

  return { part: 'now', label: 'Now', text: [text], ...(isLong ? { breathe: true as const } : {}), buttons: [] }
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
  // A Setup step: one strong button, at most 2 secondary (the ways to ask Claude), 1 quiet exit, nothing to type.
  if (model.kind === 'setup') {
    const buttons = model.rows.flatMap(row => row.buttons)
    const limit = { primary: 1, secondary: 2, links: 1, inputs: 0 }
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

export const SETUP_HEADING = 'Set up your goals'

// The words on one Lane line: "Lane 1  portfolio live · by 14 Dec" (the date as the Primary row says it).
const laneLine = (lane: Lane, i: number, now: number): string => {
  const end = endLabel(lane, now)

  return `Lane ${i + 1}  ${lane.outcome}${end === '' ? '' : ` · ${end}`}`
}

const SKIP: BandButton = { key: 'setup-skip', label: 'Skip for now', variant: 'link', action: { kind: 'setupSkip' } }
const ask = (key: string, label: string, variant: 'primary' | 'secondary', kind: GoalsAsk): BandButton => ({ key, label, variant, action: { kind: 'goalsAsk', ask: kind } })

// The Setup moment (band-rebuild-plan.md section 3, D2, D3): it asks the person nothing; it reads the goals
// file and shows what it found, and its buttons ask Claude. State 1: Claude was asked, wait. Goals found:
// confirm or change. Nothing found: set up with Claude or let it look. A file that cannot be read: say so.
function setupRows(s: Snapshot): BandRow[] {
  const state = goalsState(s.focus)

  if (s.goalsAsking) return [{ part: 'setup', text: ['Asking Claude about your goals and Lanes…'], buttons: [SKIP] }]

  // State 4: Claude proposes. Stamped inferred; saving is Claude's job (the message it gets writes the file).
  if (s.goalsProposal !== null) {
    const what = (key: string, label: string, variant: 'primary' | 'secondary' | 'link', kind: 'save' | 'revise' | 'drop'): BandButton => ({ key, label, variant, action: { kind: 'goalsProposal', what: kind } })

    return [
      {
        part: 'setup',
        text: [`Goal    ${s.goalsProposal.goal}`, ...s.goalsProposal.lanes.map(proposalLane)],
        source: 'inferred',
        buttons: [what('proposal-save', 'Save these', 'primary', 'save'), what('proposal-revise', 'Change', 'secondary', 'revise'), what('proposal-drop', 'Not these', 'link', 'drop')],
      },
    ]
  }

  if (state === 'found') {
    const goal = s.focus.status === 'ok' ? [`Goal    ${primaryText(s.focus)}`] : []
    const lanes = s.focus.lanes.slice(0, MAX_LANES).map((lane, i) => laneLine(lane, i, s.now))

    return [
      {
        part: 'setup',
        text: [...goal, ...lanes],
        buttons: [{ key: 'setup-keep', label: 'Looks right', variant: 'primary', action: { kind: 'goalsKeep' } }, ask('setup-change', 'Change', 'secondary', 'change'), SKIP],
      },
    ]
  }

  if (state === 'unreadable') return [{ part: 'setup', text: [`I couldn't read ${s.goalsPath}.`], buttons: [ask('setup-fix', 'Ask Claude to fix it', 'primary', 'fix'), SKIP] }]

  // The demo can also write a goals file of its own in its folder; the person's own files are never written.
  const demo: BandButton[] = s.demoGoals === undefined ? [] : [{ key: 'demo-file', label: 'Create a demo goals file', variant: 'primary', action: { kind: 'demoFile' } }]

  return [
    {
      part: 'setup',
      text: ['A Goal is the one thing that counts today.', 'A Lane is a longer outcome with a date, like portfolio live by 14 Dec.'],
      buttons: [...demo, ask('setup-ask', 'Set up with Claude', demo.length > 0 ? 'secondary' : 'primary', 'setup'), ask('setup-find', 'Find them for me', 'secondary', 'find'), SKIP],
    },
  ]
}
