import type { BandButton, BandModel, BandRow, Card, Lane, Snapshot } from '../types'
import { MAX_LANES, endLabel, goalsState, laneText, primaryText } from './focus'
import { joinAnd, t, tn } from './i18n'
import { idleStage } from './idle'
import { questionToShow } from './next'
import { proposalLane } from './goals-ask'
import type { GoalsAsk } from './goals-ask'
import { nudgeShows, nudgeText } from './standup'
import { currentStep, lastOutcomeStep } from './plan'
import { carriedStep, shutdownDue, shutdownFallback } from './shutdown'
import { chipsOf, headline, isDue, winsOf } from './wins'

// The one function that decides what the band shows. Rebuilt 13 Nov 2026 from the v3 display rules
// (docs/handover-coanda.md): weight follows the job, exceptions only, typing is the person's own
// answer, one quiet exit, a budget. Every button is data: a key, a label and the action dispatch()
// in register.tsx carries out. Order: Setup, idle stage, Sent, a question, Working, Resting.
export function bandModel(s: Snapshot): BandModel {
  if (s.setup.doneAt === null || s.setupOpen) return { kind: 'setup', heading: t('setup.heading'), rows: setupRows(s) }

  // A guessed question waits for the turn to end; a decision card shows at once.
  const shown = questionToShow(s.cards, s.sessionId, s.isWorking ? null : s.asked)
  const isBusy = s.isWorking || s.sent !== null || shown !== null
  // lastActivity 0 means no one has filled it in yet: unknown, so the full band.
  const quietMs = s.lastActivity === 0 ? 0 : s.now - s.lastActivity
  const stage = idleStage(isBusy, quietMs)
  const primary = primaryRow(s)

  // The day record: offered from 17:30 or when asked for; only while the band rests. Asked for, it
  // shows past the idle stages too.
  const record = !isBusy && !s.isWorking && isDue(s.wins, s.now)
  const wanted = record && winsOf(s.wins, s.now).open

  if (stage === 'hidden' && !wanted) return { kind: 'hidden' }
  if (stage === 'primary' && !wanted) return { kind: 'rows', moment: 'quiet', rows: [], primary }

  if (s.sent !== null) {
    const row: BandRow = { part: 'sent', label: t('sent.label'), text: [`✓ ${s.sent}${s.isWorking ? t('sent.working') : ''}`], buttons: [] }

    return { kind: 'rows', moment: 'sent', rows: [row], primary }
  }

  if (shown !== null && 'card' in shown) return { kind: 'rows', moment: 'pick', heading: waitingCount(s) > 1 ? t('question.waiting', { n: waitingCount(s) }) : t('question.label'), rows: [cardRow(shown.card, waitingCount(s))], primary }

  if (shown !== null) {
    const { asked } = shown
    const row: BandRow = {
      part: 'question',
      label: t('question.label'),
      text: [asked.text],
      source: 'inferred',
      buttons: [
        ...asked.options.slice(0, 3).map(
          // As in Intent: the first answer primary, the others secondary.
          (one, i): BandButton => ({ key: `asked-${i}`, label: one.label, variant: i === 0 ? 'primary' : 'secondary', action: { kind: 'send', text: one.prompt, label: one.label } }),
        ),
        { key: 'asked-dismiss', label: t('question.dismiss'), variant: 'link', action: { kind: 'dismiss' } },
      ],
    }

    return { kind: 'rows', moment: 'guessed', heading: t('question.label'), rows: [row], primary }
  }

  if (record) return { kind: 'rows', moment: 'today', heading: t('today.label'), rows: [todayRow(s)], primary }

  // Past the shutdown hour, once a day, a quiet turn shows the shutdown question in place of NOW.
  if (!s.isWorking && shutdownDue(s.now, s.shutdown.doc, s.shutdown.forced)) return { kind: 'rows', moment: 'shutdown', heading: t('shutdown.label'), rows: [shutdownRow(s)], primary }

  // Working and Resting ask nothing, so with no Primary the band offers to set one: the step "Set your
  // Primary" (heading, field, "Set"), built from Nicolas's canvas of Sat 14 Nov. It is a step that needs
  // the person, so it replaces the status row (band-rebuild-plan.md, D4).
  const now = withNudge(s.isWorking ? workingRow(s) : restingRow(s), s)
  const moment = s.isWorking ? 'working' : 'resting'
  if (goalOf(s) === '') return { kind: 'rows', moment, heading: t('primary.heading'), rows: [primarySetRow(s)] }

  return { kind: 'rows', moment, rows: [now], primary }
}

// The stand-up nudge: a muted line and the quiet "Not now" on the NOW row itself (no new row), so the
// budget holds. Shown once per streak: "Not now" resets the count.
function withNudge(row: BandRow, s: Snapshot): BandRow {
  if (!nudgeShows(s.standup, s.now, s.isWorking)) return row

  return { ...row, note: nudgeText(s.standup), buttons: [...row.buttons, { key: 'standup-dismiss', label: t('nudge.dismiss'), variant: 'link', action: { kind: 'standupDismiss' } }] }
}

// The day record: how many things moved, the wins as chips, one primary button, one quiet exit.
function todayRow(s: Snapshot): BandRow {
  const items = winsOf(s.wins, s.now).items

  return {
    part: 'today',
    label: t('today.label'),
    text: [headline(items.length)],
    chips: chipsOf(items),
    buttons: [
      { key: 'today-save', label: t('today.save'), variant: 'primary', action: { kind: 'todaySave' } },
      { key: 'today-skip', label: t('today.skip'), variant: 'link', action: { kind: 'todaySkip' } },
    ],
  }
}

// Open cards of this session: the count shows in the label only above 1 (v3 rule 2).
const waitingCount = (s: Snapshot): number => s.cards.filter(one => one.sessionId === s.sessionId && one.status === 'open').length

// Small choice: the question, one button per option with its consequence under it, the quiet "Later".
// Facts and "could be wrong if" belong to the Big choice moment, not built yet (rule 1: a pick shows the choices).
function cardRow(card: Card, waiting: number): BandRow {
  return {
    part: 'question',
    label: waiting > 1 ? t('question.waiting', { n: waiting }) : t('question.label'),
    text: [card.question],
    ...(card.isHardToUndo ? { chip: t('question.hard') } : {}),
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
      { key: `${card.id}-later`, label: t('question.later'), variant: 'link', action: { kind: 'later', cardId: card.id } },
    ],
  }
}

// A run longer than this shows the breathing circle beside the Working line.
export const BREATHE_AFTER_MS = 30_000

// SHUTDOWN: one question, one field with "Save" after it (Enter does the same), the quiet "Skip".
// The placeholder is today's Primary; an empty answer is refused with a short muted note.
function shutdownRow(s: Snapshot): BandRow {
  const goal = goalOf(s)

  return {
    part: 'shutdown',
    label: t('shutdown.label'),
    text: [t('shutdown.ask')],
    inputs: [
      {
        key: 'shutdown-input',
        kind: 'text',
        value: s.shutdown.draft,
        placeholder: goal === '' ? shutdownFallback() : goal,
        button: { key: 'shutdown-save', label: t('shutdown.save'), action: { kind: 'shutdownSave' } },
        action: { kind: 'shutdownType', value: '' },
      },
    ],
    ...(s.shutdown.note === '' ? {} : { fieldNote: s.shutdown.note }),
    buttons: [{ key: 'shutdown-skip', label: t('shutdown.skip'), variant: 'link', action: { kind: 'shutdownSkip' } }],
  }
}

// Working: one NOW line from the task list, a tool fact, so no stamp.
function workingRow(s: Snapshot): BandRow {
  const steps = s.plan.steps
  const at = currentStep(steps)
  const text = at < 0 ? t('now.working') : t('now.step', { text: steps[at]!.content, n: at + 1, m: steps.length })

  const isLong = s.workingSince !== null && s.now - s.workingSince >= BREATHE_AFTER_MS

  return { part: 'now', label: t('now.label'), text: [text], ...(isLong ? { breathe: true as const } : {}), buttons: [] }
}

// Resting: one NOW line. A finished task list is a tool fact; the model's "done" is a guess, stamped.
function restingRow(s: Snapshot): BandRow {
  const steps = s.plan.steps
  const isDone = steps.length > 0 && steps.every(one => one.status === 'completed')
  const fromPlan = isDone ? lastOutcomeStep(steps) : ''
  if (fromPlan !== '') return { part: 'now', label: t('now.label'), text: [t('now.idleWith', { text: fromPlan })], buttons: [] }

  const done = s.reply?.done ?? ''
  if (done !== '') return { part: 'now', label: t('now.label'), text: [t('now.idleWith', { text: done })], source: 'inferred', buttons: [] }

  return { part: 'now', label: t('now.label'), text: [t('now.idle')], buttons: [] }
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
    text: [...(s.focus.status === 'closed' || s.focus.status === 'unreadable' ? [primaryText(s.focus)] : []), ...fromLastNight(s)],
    inputs: [
      {
        key: 'primary-input',
        kind: 'text',
        value: s.setupDraft.primary,
        placeholder: t('primary.placeholder'),
        button: { key: 'primary-set', label: t('primary.set'), action: { kind: 'primarySet' } },
        action: { kind: 'setupType', field: 'primary', value: '' },
      },
    ],
    buttons: [],
  }
}

// Last night's answer to the shutdown question, on the next calendar day only, until a Primary is set.
const fromLastNight = (s: Snapshot): string[] => {
  const step = carriedStep(s.now, s.shutdown.doc)

  return step === '' ? [] : [`◎ ${t('primary.fromNight', { step })}`]
}

// The Primary row shows the goal only; "Details" opens the Lane (rule 6). FocusResult has no
// "done when" line yet, so Details shows the Lane alone.
function primaryRow(s: Snapshot): BandRow {
  // The file's Lanes when it has any, else the typed ones, never both.
  const lane = laneText(s.focus.lanes.length > 0 ? s.focus : { ...s.focus, lanes: s.setup.lanes }, s.now)
  const goal = goalOf(s)
  const [carried = `◎ ${goal === '' ? primaryText(s.focus) : goal}`] = goal === '' ? fromLastNight(s) : []

  return {
    part: 'primary',
    text: [carried, ...(s.detailsOpen ? [lane === '' ? t('primary.noLane') : t('primary.lane', { lane })] : [])],
    buttons: [{ key: 'primary-details', label: s.detailsOpen ? t('primary.less') : t('primary.details'), variant: 'link', action: { kind: 'details' } }],
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

// The words on one Lane line: "Lane 1  portfolio live · by 14 Dec" (the date as the Primary row says it).
const laneLine = (lane: Lane, i: number, now: number): string => {
  const end = endLabel(lane, now)

  return `${t('word.lane')} ${i + 1}  ${lane.outcome}${end === '' ? '' : ` · ${end}`}`
}

// The empty state leads with what the person gets (Nicolas, 14 Nov: the benefit line from onboarding-v1.html).
const skip = (): BandButton => ({ key: 'setup-skip', label: t('setup.skip'), variant: 'link', action: { kind: 'setupSkip' } })
const ask = (key: string, label: string, variant: 'primary' | 'secondary', kind: GoalsAsk): BandButton => ({ key, label, variant, action: { kind: 'goalsAsk', ask: kind } })

// "✓ Saved · Goal and 3 Lanes in ~/.claude/goals.md": what the goals file holds, with the home folder as ~.
export function savedLines(s: Pick<Snapshot, 'focus' | 'goalsPath'>): string[] {
  const hasGoal = s.focus.status === 'ok' && primaryText(s.focus) !== ''
  const lanes = Math.min(s.focus.lanes.length, MAX_LANES)
  const laneWords = lanes === 0 ? '' : tn('saved.lanes', lanes)
  const what = joinAnd([hasGoal ? t('saved.goal') : '', laneWords].filter(w => w !== '')) || t('saved.goals')
  const where = s.goalsPath.replace(/^\/(?:Users|home)\/[^/]+/, '~')

  return [t('saved.line', { what, where }), t('saved.hint')]
}

// The Setup moment (band-rebuild-plan.md section 3, D2, D3): it asks the person nothing; it reads the goals
// file and shows what it found, and its buttons ask Claude. State 1: Claude was asked, wait. Goals found:
// confirm or change. Nothing found: set up with Claude or let it look. A file that cannot be read: say so.
function setupRows(s: Snapshot): BandRow[] {
  const state = goalsState(s.focus)

  // The confirmation (onboarding-v1.html, success state): what was saved, where, and what Coanda does now.
  if (s.goalsSaved === 'saved') return [{ part: 'setup', text: savedLines(s), buttons: [{ key: 'setup-done', label: t('setup.done'), variant: 'primary', action: { kind: 'setupDone' } }] }]

  // Changing goals that exist: say so, and no button acts on the old content; "Cancel" gives it back.
  if (s.goalsAsking && s.goalsChanging === true) return [{ part: 'setup', text: [t('setup.changing')], buttons: [{ key: 'setup-cancel', label: t('setup.cancel'), variant: 'link', action: { kind: 'goalsCancel' } }] }]

  if (s.goalsAsking) return [{ part: 'setup', text: [t('setup.asking')], buttons: [skip()] }]

  // State 4: Claude proposes. Stamped inferred; saving is Claude's job (the message it gets writes the file).
  if (s.goalsProposal !== null) {
    const what = (key: string, label: string, variant: 'primary' | 'secondary' | 'link', kind: 'save' | 'revise' | 'drop'): BandButton => ({ key, label, variant, action: { kind: 'goalsProposal', what: kind } })

    return [
      {
        part: 'setup',
        text: [`${t('word.goal')}    ${s.goalsProposal.goal}`, ...s.goalsProposal.lanes.map(proposalLane)],
        source: 'inferred',
        buttons: [what('proposal-save', t('setup.save'), 'primary', 'save'), what('proposal-revise', t('setup.change'), 'secondary', 'revise'), what('proposal-drop', t('setup.drop'), 'link', 'drop')],
      },
    ]
  }

  if (state === 'found') {
    const goal = s.focus.status === 'ok' ? [`${t('word.goal')}    ${primaryText(s.focus)}`] : []
    const lanes = s.focus.lanes.slice(0, MAX_LANES).map((lane, i) => laneLine(lane, i, s.now))

    return [
      {
        part: 'setup',
        text: [...goal, ...lanes],
        buttons: [{ key: 'setup-keep', label: t('setup.keep'), variant: 'primary', action: { kind: 'goalsKeep' } }, ask('setup-change', t('setup.change'), 'secondary', 'change'), skip()],
      },
    ]
  }

  if (state === 'unreadable') return [{ part: 'setup', text: [t('setup.unreadable', { path: s.goalsPath })], buttons: [ask('setup-fix', t('setup.fix'), 'primary', 'fix'), skip()] }]

  // The demo can also write a goals file of its own in its folder; the person's own files are never written.
  const demo: BandButton[] = s.demoGoals === undefined ? [] : [{ key: 'demo-file', label: t('setup.demoFile'), variant: 'primary', action: { kind: 'demoFile' } }]

  return [
    {
      part: 'setup',
      text: [t('setup.nothing'), t('setup.nothing2')],
      buttons: [...demo, ask('setup-ask', t('setup.ask'), demo.length > 0 ? 'secondary' : 'primary', 'setup'), ask('setup-find', t('setup.find'), 'secondary', 'find'), skip()],
    },
  ]
}
