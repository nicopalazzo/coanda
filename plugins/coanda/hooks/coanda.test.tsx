import type { TurnStepChunk, TurnStepResult } from 'claude-code'
import type { TestBody } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'

import type { BandModel, BandRow, Card, Setup, Snapshot, Step } from '../types'
import { BREATHE_AFTER_MS, bandModel, overBudget } from './band'
import { BREATHE_CAPTION, BREATHE_SECONDS, BREATHE_SVG, LABEL_WIDTH } from './render'
import { close, supersede, toCard } from './cards'
import { goalsMessage, proposalLane, proposalMessage, proposalText, toProposal } from './goals-ask'
import { endLabel, goalsState, focusSourceOf, laneText, parseFocus, parseFocusMd, parsePlain, primaryText, shortPrimary } from './focus'
import { claudeConfigDir } from './io'
import { parseNext, parseSuggestions, questionToShow, toAsked } from './next'
import { applyPlan, lastOutcomeStep, noteCall } from './plan'
import { blankOf } from './question'
import { SHUTDOWN_FALLBACK, carriedStep, checkShutdown, nextDay, shutdownDue } from './shutdown'
import { clockTime, dayKey } from './time'
import { BREAK_MS, FAST_CHECK, LONG_MS, NO_STANDUP, RUNS, noteRun, nudgeShows } from './standup'

// Adapted 13 Nov 2026 from the first repository's tests. Part 1: the tests that take no host (kept
// as they were), then new pure tests for the v3 band, the decision cards and the question picked.

const FOCUS =
  '# Focus\n- **Lane 3 — Be found (revised 18 Oct):** meetups and posts. Measure = conversations.\n' +
  '## Today\n- **Primary (24 Oct, Nico in): open office hours (Lane 3, be found).** More.\n' +
  '## Parked\n- Café test (24 Oct): later.\n- Old (18 Oct): x.\n'

// ---- Kept: Focus parsing, clock, plan, suggestions, config directory ---------------------------

test('FR-7 c5: a Primary line in Nicolas\'s FOCUS.md format shows its Primary and its Lane outcome', () => {
  const found = parseFocus(FOCUS)

  expect(found).toMatchObject({ status: 'ok', primary: 'open office hours', laneId: 'lane-3' })
  expect(found.lanes).toEqual([{ id: 'lane-3', outcome: 'Be found: meetups and posts' }])
  expect(primaryText(found)).toBe('open office hours')
  expect(laneText(found)).toBe('Be found: meetups and posts')

  // The form "Lane 2 (Proof)" in the line's body, after the title, finds the Lane too.
  const body = parseFocus(
    '- **Lane 2 — Proof:** portfolio MVP live by Sun 18 Oct. More.\n## Today\n- **Primary (12 Nov, N): Coanda, Lane 2 (Proof). Name chosen; next step: review.**\n',
  )
  expect(body).toMatchObject({ status: 'ok', laneId: 'lane-2' })
  expect(primaryText(body)).toBe('Coanda')
  // The end date is taken out of the outcome (the row says it once); with no clock it stays text.
  expect(laneText(body)).toBe('Proof: portfolio MVP live · by 18 Oct')
  expect(body.lanes[0]).toEqual({ id: 'lane-2', outcome: 'Proof: portfolio MVP live', endText: '18 Oct' })

  // A label with a time keeps the Primary; a Lane id that matches no Lane draws the Primary alone.
  const switched = parseFocus('## Today\n- **Primary (24 Oct, switch 17:08, N): design v0 of the band — modules (Lane 2).** x\n')
  expect(primaryText(switched)).toBe('design v0 of the band')
  expect(switched.laneId).toBe('lane-2')
  expect(laneText(switched)).toBe('')
  expect(shortPrimary('create the resources to start office hours, including idea #2 (café)')).toBe('create the resources to start office hours')
})

test('FR-7 c2: with no Primary the row reads "no Primary set"', () => {
  expect(primaryText(parseFocus('## Today\nnothing\n'))).toBe('no Primary set')
  expect(primaryText(parseFocus(''))).toBe('no Primary set')
  expect(parseFocus('## Today\nnothing\n').status).toBe('none')
})

test('a CLOSED Primary shows as closed, with no lane', () => {
  const closed =
    '## Today\n- **Primary (28 Oct, Nico in, N): change the offer (Lane 3, be found). CLOSED 28 Oct 12:44 (N): done.**\n'

  expect(parseFocusMd(closed)).toMatchObject({ status: 'closed', primary: '', laneId: '', closedAt: '12:44' })
  expect(primaryText(parseFocusMd(closed))).toBe('Closed 12:44 · no Primary set')
  expect(primaryText(parseFocus('## Today\n- **Primary (28 Oct): x. CLOSED by N.**\n'))).toBe('Closed · no Primary set')
})

test('AD-5: the plain parser takes the first non-empty line and no Lanes', () => {
  expect(parsePlain('\n\n  Ship the intake form  \nmore\n')).toEqual({ status: 'ok', primary: 'Ship the intake form', laneId: '', lanes: [] })
  expect(parsePlain('  \n\n').status).toBe('none')
  // A file with no `## Today` heading goes to the plain parser.
  expect(parseFocus('Write the brief\n- **Lane 1 — A:** b\n')).toMatchObject({ primary: 'Write the brief', lanes: [] })
})

test('FR-2 c3 (core): the Focus source is the absolute path saved in setup, or none', () => {
  expect(focusSourceOf({ v: 1, focus: { kind: 'file', path: '/home/n/focus.md' } })).toBe('/home/n/focus.md')
  expect(focusSourceOf({ v: 1, focus: { kind: 'file', path: 'focus.md' } })).toBeNull()
  expect(focusSourceOf({ v: 1, focus: { kind: 'file', path: '~/focus.md' } })).toBeNull()
  expect(focusSourceOf({ v: 1, focus: { kind: 'typed' } })).toBeNull()
  expect(focusSourceOf({ v: 1, focus: null })).toBeNull()
  expect(focusSourceOf(null)).toBeNull()
  expect(focusSourceOf([])).toBeNull()
})

test('FR-2 c4: clock text and day keys come from the machine\'s own time zone', () => {
  const at = new Date(2026, 10, 12, 7, 5, 9).getTime()

  expect(clockTime(at)).toBe('07:05')
  expect(dayKey(at)).toBe('2026-11-12')
  expect(dayKey(new Date(2026, 0, 3, 23, 59).getTime())).toBe('2026-01-03')
})

test('plan steps follow the task list calls', () => {
  let steps = applyPlan([], { items: [{ content: 'A', status: 'in_progress' }, { content: 'B', status: 'pending' }, { content: 'C', status: 'pending' }] }, 0)
  steps = noteCall(steps, '/f/a.ts')
  steps = noteCall(steps, '/f/a.ts')
  steps = applyPlan(steps, { advance: true }, 60000)
  expect(steps.map(s => s.status)).toEqual(['completed', 'in_progress', 'pending'])
  expect(steps[0]).toMatchObject({ files: ['/f/a.ts'], calls: 2, startedAt: 0, endedAt: 60000 })
  steps = applyPlan(steps, { done: [2], start: 3 }, 120000)
  expect(steps.map(s => s.status)).toEqual(['completed', 'completed', 'in_progress'])
  // A new list keeps the notes of an unchanged step.
  steps = applyPlan(steps, { items: [{ content: 'A', status: 'completed' }, { content: 'D', status: 'pending' }] }, 0)
  expect(steps[0]!.calls).toBe(2)
  // The outcome skips bookkeeping steps.
  const done = applyPlan([], { items: [{ content: 'Build the band', status: 'completed' }, { content: 'Save progress in STATUS.md', status: 'completed' }] }, 0)
  expect(lastOutcomeStep(done)).toBe('Build the band')
})

test('suggestions and blanks are read safely', () => {
  expect(parseSuggestions('x [{"label":"Ship it","prompt":"Ship."},{"label":""}] y')).toEqual([{ label: 'Ship it', prompt: 'Ship.' }])
  expect(parseSuggestions('nothing')).toEqual([])
  expect(parseNext('{"moment":"start","next":"Write the tests","suggestions":[{"label":"x","prompt":"y"}]}')).toEqual({
    moment: 'start',
    question: '',
    done: '',
    next: 'Write the tests',
    suggestions: [],
  })
  expect(parseNext('{"moment":"question","suggestions":[{"label":"Yes, ship","prompt":"Ship it."}]}').suggestions).toHaveLength(1)
  expect(parseNext('garbage').moment).toBe('other')
  expect(blankOf('Park: [what]')).toEqual({ start: 6, end: 12 })
})

// The two environment names io.ts reads, answered from a table.
const envOf = (vars: Record<string, string>) => ({ env: { get: async (name: string) => vars[name] } }) as never

test('FR-2 c4: the Claude config directory is CLAUDE_CONFIG_DIR when set, else HOME/.claude', async () => {
  expect(await claudeConfigDir(envOf({ HOME: '/home/n/', CLAUDE_CONFIG_DIR: '/cfg/claude/' }))).toBe('/cfg/claude')
  expect(await claudeConfigDir(envOf({ HOME: '/home/n/' }))).toBe('/home/n/.claude')
  expect(await claudeConfigDir(envOf({ HOME: '/home/n', CLAUDE_CONFIG_DIR: '' }))).toBe('/home/n/.claude')
})

// ---- Kept: Lane dates ------------------------------------------------------------------------

const THEN = new Date(2026, 10, 12, 12, 0).getTime() // Thu 12 Nov 2026, 12:00 local

test('FR-7 date reading: only a real month word is a month ("5 decisions" and "3 markets" are not dates)', () => {
  const lane = (line: string) => parseFocus(`- **Lane 2 — Proof:** ${line}. More.\n## Today\n- **Primary (N): x, Lane 2.**\n`, THEN).lanes[0]!

  expect(lane('ship by 5 decisions made')).toEqual({ id: 'lane-2', outcome: 'Proof: ship by 5 decisions made' })
  expect(lane('reach 3 markets by 2 March')).toMatchObject({ outcome: 'Proof: reach 3 markets', endDay: '2027-03-02' })
  expect(lane('ship by 18 Sept 2026')).toMatchObject({ endDay: '2026-09-18' })
})

test('FR-7 date reading: a later "by <date>" is found when an earlier "by …" is not a date', () => {
  const lane = parseFocus('- **Lane 2 — Proof:** reach 3 users by 3 weeks, by 18 Oct. More.\n## Today\n- **Primary (N): x, Lane 2.**\n', THEN).lanes[0]!

  expect(lane).toEqual({ id: 'lane-2', outcome: 'Proof: reach 3 users by 3 weeks', endDay: '2026-10-18' })
})

test('FR-7 date reading: a "by …" tail that is not date-like stays in the outcome', () => {
  const lane = (line: string) => parseFocus(`- **Lane 3 — Be found:** ${line}. More.\n## Today\n- **Primary (N): x, Lane 3.**\n`, THEN).lanes[0]!

  expect(lane('reviewed by 2 colleagues')).toEqual({ id: 'lane-3', outcome: 'Be found: reviewed by 2 colleagues' })
  expect(lane('ship v2 by team 3')).toEqual({ id: 'lane-3', outcome: 'Be found: ship v2 by team 3' })
  expect(lane('posts by end of Q1')).toEqual({ id: 'lane-3', outcome: 'Be found: posts', endText: 'end of Q1' })
  expect(lane('posts by 2027')).toEqual({ id: 'lane-3', outcome: 'Be found: posts', endText: '2027' })
})

test('FR-7 date reading: the start of a range must be a date too ("10 people → 14 Dec" keeps "10 people")', () => {
  const lane = (line: string) => parseFocus(`- **Lane 1 — Team:** ${line}. More.\n## Today\n- **Primary (N): x, Lane 1.**\n`, THEN).lanes[0]!

  expect(lane('grow from 10 people → 14 Dec').outcome).toBe('Team: grow from 10 people → 14 Dec')
  expect(lane('grow from 10 people → 14 Dec')).not.toHaveProperty('endDay')
  expect(lane('Jedha, 21 Sep → 14 Dec')).toEqual({ id: 'lane-1', outcome: 'Team: Jedha', endDay: '2026-12-14' })
})

test('FR-7 date reading: a saved Lane with a bad end date never shows "NaN" or "undefined"', () => {
  const label = (endDay: unknown, endText?: unknown) => endLabel({ id: 'a', outcome: 'x', endDay, endText } as never, THEN)

  expect(label('14/12/2026')).toBe('')
  expect(label('soon', 'next spring')).toBe('by next spring')
  expect(label('2026-02-31')).toBe('')
  expect(label(20261214)).toBe('')
  expect(label('2026-12-14')).toBe('by 14 Dec')
})

test('FR-7 year boundary: a date with no year takes the year nearest to now, across New Year and on 29 Feb', () => {
  const endDay = (when: string, at: Date) =>
    parseFocus(`- **Lane 2 — Proof:** ship it by ${when}. More.\n## Today\n- **Primary (N): x, Lane 2.**\n`, at.getTime()).lanes[0]!.endDay

  // December read in early January is last month; January read in late December is next month.
  expect(endDay('20 Dec', new Date(2027, 0, 5, 12))).toBe('2026-12-20')
  expect(endDay('1 Jan', new Date(2026, 11, 28, 12))).toBe('2027-01-01')
  expect(endDay('20 Dec', new Date(2026, 11, 28, 12))).toBe('2026-12-20')
  expect(endDay('5 Jan', new Date(2027, 0, 2, 12))).toBe('2027-01-05')
  // 29 Feb exists only in a leap year: the nearest leap year is used, never a made-up 29 Feb 2027.
  expect(endDay('29 Feb', new Date(2027, 0, 10, 12))).toBe('2028-02-29')
  expect(endDay('29 Feb', new Date(2028, 0, 10, 12))).toBe('2028-02-29')
  // A year written in the file is kept as written; a day that does not exist is text, not a day.
  expect(endDay('14 Dec 2025', new Date(2026, 10, 12, 12))).toBe('2025-12-14')
  expect(endDay('31 Apr', new Date(2026, 10, 12, 12))).toBeUndefined()
})

test('FR-7 year boundary: a Lane is not past on its last day and is past from midnight', () => {
  const lane = { id: 'a', outcome: 'x', endDay: '2026-12-31' }

  expect(endLabel(lane, new Date(2026, 11, 31, 23, 59).getTime())).toBe('by 31 Dec')
  // From midnight it is past, and the year is shown because it is no longer this year.
  expect(endLabel(lane, new Date(2027, 0, 1, 0, 0).getTime())).toBe('by 31 Dec 2026 · past')
  expect(endLabel({ id: 'b', outcome: 'x', endDay: '2027-01-01' }, new Date(2026, 11, 31, 23, 59).getTime())).toBe('by 1 Jan 2027')
})

// ---- New (v3): the band's moments, its budget and its exceptions -------------------------------

const NOW = 1_000_000
const SETUP_DONE: Setup = { v: 1, doneAt: 1, focus: null, lanes: [{ id: 'own-1', outcome: 'Proof: MVP live' }], partsOff: [], rules: 'none', counting: false }

const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  now: NOW,
  sessionId: 's1',
  isWorking: false,
  setup: SETUP_DONE,
  setupOpen: false,
  setupDraft: { primary: '' },
  goalsPath: '/home/n/.claude/goals.md',
  goalsAsking: false,
  goalsProposal: null,
  focus: { status: 'ok', primary: 'Ship the v0.1 install', laneId: 'own-1', lanes: [] },
  sessionPrimary: null,
  cards: [],
  asked: null,
  sent: null,
  reply: { moment: 'other', isJudgment: false, question: '', done: '', next: '', suggestions: [] },
  plan: { steps: [], planTurn: 0 },
  turn: 0,
  gate: null,
  lastActivity: 0,
  shelfInstalled: false,
  detailsOpen: false,
  workingSince: null,
  standup: { streak: 0, lastEndAt: 0 },
  shutdown: { doc: null, draft: '', note: '', forced: false },
  ...over,
})

const cardOf = (id: string, over: Partial<Card> = {}): Card => ({
  id,
  sessionId: 's1',
  question: 'Rename fill2 to fillSafely?',
  facts: [],
  options: [
    { label: 'Rename to fillSafely', consequence: '1 file' },
    { label: 'Keep fill2', consequence: 'no change' },
  ],
  isHardToUndo: false,
  couldBeWrongIf: '',
  askedBy: 'test',
  from: 'tool',
  status: 'open',
  askedAt: 1,
  ...over,
})

const stepOf = (content: string, status: Step['status']): Step => ({ content, status, files: [], calls: 0 })

const GUESS = { text: 'Rules check: every reload, or only at setup?', from: 'inferred' as const, options: [{ label: 'Only at setup', prompt: 'Only at setup.' }, { label: 'Every reload', prompt: 'Every reload.' }] }

type Rows = Extract<BandModel, { kind: 'rows' }>
const rowsOf = (model: BandModel): Rows => {
  if (model.kind !== 'rows') throw new Error(`expected a rows model, got ${model.kind}`)

  return model
}
const only = (model: BandModel): BandRow => {
  const rows = rowsOf(model).rows
  expect(rows).toHaveLength(1)

  return rows[0]!
}
const labels = (row: BandRow) => row.buttons.map(b => (b.variant === 'link' ? `~${b.label}` : b.label))

test('v3: Setup comes first, until finished or reopened', () => {
  expect(bandModel(snap({ setup: { ...SETUP_DONE, doneAt: null } })).kind).toBe('setup')
  expect(bandModel(snap({ setupOpen: true, cards: [cardOf('c1')] })).kind).toBe('setup')
  const setup = bandModel(snap({ setup: { ...SETUP_DONE, doneAt: null } }))
  expect(JSON.stringify(setup)).toContain('Set up your goals')
})

test('v3 Setup budget: a second strong button is over budget', () => {
  const model = bandModel(snap({ setup: { ...SETUP_DONE, doneAt: null }, focus: { status: 'ok', primary: 'x', laneId: '', lanes: [] } }))
  if (model.kind !== 'setup') throw new Error('expected setup')
  const doubled: BandModel = { ...model, rows: [{ ...model.rows[0]!, buttons: [...model.rows[0]!.buttons, { key: 'x', label: 'Another', variant: 'primary', action: { kind: 'goalsKeep' } }] }] }
  expect(overBudget(doubled)).toEqual(['primary: 2 of at most 1'])
})

test('v3 Resting: one NOW line; a finished plan is a tool fact, the model\'s "done" is stamped inferred', () => {
  expect(only(bandModel(snap()))).toMatchObject({ label: 'Now', text: ['Idle'], buttons: [] })
  expect(only(bandModel(snap())).source).toBeUndefined()

  const guessed = only(bandModel(snap({ reply: { moment: 'other', isJudgment: false, question: '', done: 'merged into main', next: '', suggestions: [] } })))
  expect(guessed).toMatchObject({ text: ['Idle · merged into main'], source: 'inferred' })

  // A finished task list wins over the model's guess, and needs no stamp.
  const planned = bandModel(
    snap({
      plan: { steps: [stepOf('Write band.ts', 'completed'), stepOf('Save progress in STATUS.md', 'completed')], planTurn: 0 },
      reply: { moment: 'other', isJudgment: false, question: '', done: 'something else', next: '', suggestions: [] },
    }),
  )
  expect(rowsOf(planned).moment).toBe('resting')
  expect(only(planned)).toMatchObject({ text: ['Idle · Write band.ts'] })
  expect(only(planned).source).toBeUndefined()
})

test('v3 Working: "<step> · step N of M" from the task list, else "Working"', () => {
  const steps = [stepOf('Scan', 'completed'), stepOf('Split tests', 'in_progress'), stepOf('Check', 'pending')]
  const working = bandModel(snap({ isWorking: true, plan: { steps, planTurn: 0 } }))

  expect(rowsOf(working).moment).toBe('working')
  expect(only(working)).toMatchObject({ label: 'Now', text: ['Split tests · step 2 of 3'], buttons: [] })
  expect(only(bandModel(snap({ isWorking: true }))).text).toEqual(['Working'])
})

test('v3 Sent: one line at once, "· Claude is working" while the turn runs, and it wins over a question', () => {
  expect(only(bandModel(snap({ sent: 'Keep fill2' })))).toMatchObject({ part: 'sent', text: ['✓ Keep fill2'], buttons: [] })
  const sent = bandModel(snap({ sent: 'Keep fill2', isWorking: true, cards: [cardOf('c1')] }))
  expect(rowsOf(sent).moment).toBe('sent')
  expect(only(sent).text).toEqual(['✓ Keep fill2 · Claude is working'])
})

test('v3 Small choice: the question, one button per option with its consequence, and the quiet "Later"', () => {
  const card = cardOf('c1')
  const model = bandModel(snap({ cards: [card] }))
  const row = only(model)

  expect(rowsOf(model).moment).toBe('pick')
  expect(row).toMatchObject({ part: 'question', label: 'Question', text: ['Rename fill2 to fillSafely?'] })
  expect(labels(row)).toEqual(['Rename to fillSafely', 'Keep fill2', '~Later'])
  expect(row.buttons.map(b => b.detail)).toEqual(['1 file', 'no change', undefined])
  expect(row.buttons[0]!.action).toEqual({ kind: 'pick', card, option: 'Rename to fillSafely' })
  expect(row.buttons[2]!.action).toEqual({ kind: 'later', cardId: 'c1' })
  // A tool fact: no stamp. Reversible: no chip. One card: no count. No "Something else" (typing is the answer).
  expect(row.source).toBeUndefined()
  expect(row.chip).toBeUndefined()
  expect(JSON.stringify(row)).not.toContain('Something else')
})

test('v3 exceptions only: the chip when hard to undo, the count above 1, only this session\'s cards', () => {
  expect(only(bandModel(snap({ cards: [cardOf('c1', { isHardToUndo: true })] }))).chip).toBe('Hard to undo')
  expect(only(bandModel(snap({ cards: [cardOf('c1'), cardOf('c2', { question: 'Second?' })] }))).label).toBe('Question · 2 waiting')
  // A closed or deferred card does not count; another session's card does not show here.
  expect(only(bandModel(snap({ cards: [cardOf('c1'), cardOf('c2', { status: 'deferred' })] }))).label).toBe('Question')
  expect(rowsOf(bandModel(snap({ cards: [cardOf('c9', { sessionId: 's2' })] }))).moment).toBe('resting')
  // The oldest open card of this session comes first.
  expect(only(bandModel(snap({ cards: [cardOf('c2', { status: 'answered' }), cardOf('c3', { question: 'Third?' })] }))).text).toEqual(['Third?'])
})

test('v3 Guessed question: stamped inferred, its suggestions send, "Not for me" dismisses; never while working', () => {
  const model = bandModel(snap({ asked: GUESS }))
  const row = only(model)

  expect(rowsOf(model).moment).toBe('guessed')
  expect(row).toMatchObject({ label: 'Question', text: [GUESS.text], source: 'inferred' })
  expect(labels(row)).toEqual(['Only at setup', 'Every reload', '~Not for me'])
  expect(row.buttons[0]!.action).toEqual({ kind: 'send', text: 'Only at setup.', label: 'Only at setup' })
  expect(row.buttons[2]!.action).toEqual({ kind: 'dismiss' })
  // While Claude works, the guess waits; a decision card always wins over it.
  expect(rowsOf(bandModel(snap({ asked: GUESS, isWorking: true }))).moment).toBe('working')
  expect(rowsOf(bandModel(snap({ asked: GUESS, cards: [cardOf('c1')] }))).moment).toBe('pick')
})

test('v3 idle stages: Primary alone after 2 minutes, hidden after 10, unless something needs the person', () => {
  expect(rowsOf(bandModel(snap({ lastActivity: NOW - 60_000 }))).moment).toBe('resting')
  const quiet = rowsOf(bandModel(snap({ lastActivity: NOW - 3 * 60_000 })))
  expect(quiet).toMatchObject({ moment: 'quiet', rows: [] })
  expect(quiet.primary?.text).toEqual(['◎ Ship the v0.1 install'])
  expect(bandModel(snap({ lastActivity: NOW - 11 * 60_000 })).kind).toBe('hidden')
  // An open card or a running turn keeps the full band.
  expect(rowsOf(bandModel(snap({ lastActivity: NOW - 11 * 60_000, cards: [cardOf('c1')] }))).moment).toBe('pick')
  expect(rowsOf(bandModel(snap({ lastActivity: NOW - 11 * 60_000, isWorking: true }))).moment).toBe('working')
  // No activity recorded yet (0) is unknown, not quiet: the full band.
  expect(rowsOf(bandModel(snap({ lastActivity: 0 }))).moment).toBe('resting')
})

test('v3 Primary row: the goal only; "Details" opens the Lane', () => {
  const closed = rowsOf(bandModel(snap())).primary!
  expect(closed.text).toEqual(['◎ Ship the v0.1 install'])
  expect(labels(closed)).toEqual(['~Details'])
  expect(closed.buttons[0]!.action).toEqual({ kind: 'details' })

  const open = rowsOf(bandModel(snap({ detailsOpen: true }))).primary!
  expect(open.text).toEqual(['◎ Ship the v0.1 install', 'Lane: Proof: MVP live'])
  expect(labels(open)).toEqual(['~Less'])
  // No Lane: said in words. The file's Lanes win over the typed ones.
  expect(rowsOf(bandModel(snap({ detailsOpen: true, setup: { ...SETUP_DONE, lanes: [] } }))).primary!.text[1]).toBe('No Lane set')
  const fileLane = snap({ detailsOpen: true, focus: { status: 'ok', primary: 'x', laneId: 'lane-2', lanes: [{ id: 'lane-2', outcome: 'File lane' }] } })
  expect(rowsOf(bandModel(fileLane)).primary!.text[1]).toBe('Lane: File lane')
})

test('no Primary: Resting and Working offer the PRIMARY row with its field and "Set"; a question does not', () => {
  const none = { focus: { status: 'none' as const, primary: '', laneId: '', lanes: [] } }
  const resting = rowsOf(bandModel(snap(none)))

  expect(resting.moment).toBe('resting')
  expect(resting.primary).toBeUndefined()
  const set = resting.rows[0]!
  expect(set).toMatchObject({ part: 'primary', text: [] })
  expect(resting.heading).toBe('Set your Primary')
  expect(set.inputs?.map(one => [one.key, one.placeholder, one.button?.label])).toEqual([['primary-input', 'The one thing today…', 'Set']])
  expect(set.inputs?.[0]?.button?.action).toEqual({ kind: 'primarySet' })
  expect(overBudget(resting)).toEqual([])
  expect(rowsOf(bandModel(snap({ ...none, isWorking: true }))).heading).toBe('Set your Primary')
  // A closed or unreadable goals file says why, in plain words.
  expect(rowsOf(bandModel(snap({ focus: { status: 'unreadable', primary: '', laneId: '', lanes: [] } }))).rows[0]?.text).toEqual(['Focus file not readable'])
  // While something is asked, the choices only: the Primary row stays under the band.
  const pick = rowsOf(bandModel(snap({ ...none, cards: [cardOf('c1')] })))
  expect(pick.rows).toHaveLength(1)
  expect(pick.primary?.text).toEqual(['◎ no Primary set'])

  // A Primary typed in the band shows like any goal; a goals file with a Primary wins over it.
  const typed = { from: 'band' as const, entryId: '', text: 'Ship the band', laneId: '', setAt: 1 }
  expect(rowsOf(bandModel(snap({ ...none, sessionPrimary: typed }))).primary?.text).toEqual(['◎ Ship the band'])
  expect(rowsOf(bandModel(snap({ sessionPrimary: typed }))).primary?.text).toEqual(['◎ Ship the v0.1 install'])
})

test('v3 budget (rule 5): every moment is within it, and an overfilled band is caught', () => {
  const steps = [stepOf('A', 'in_progress')]
  const three = cardOf('c1', {
    isHardToUndo: true,
    options: [
      { label: 'A', consequence: 'a' },
      { label: 'B', consequence: 'b' },
      { label: 'C', consequence: 'c' },
    ],
  })
  const moments = [
    snap(),
    snap({ isWorking: true, plan: { steps, planTurn: 0 } }),
    snap({ sent: 'x', isWorking: true }),
    snap({ cards: [three, cardOf('c2')] }),
    snap({ asked: { ...GUESS, options: [...GUESS.options, { label: 'Neither', prompt: 'Neither.' }] } }),
    snap({ lastActivity: NOW - 3 * 60_000 }),
    snap({ detailsOpen: true }),
  ]
  for (const one of moments) expect(overBudget(bandModel(one))).toEqual([])

  const fat: BandModel = {
    kind: 'rows',
    moment: 'resting',
    rows: [{ part: 'now', text: ['x'], chip: 'Hard to undo', buttons: [{ key: 'a', label: 'a', action: { kind: 'details' } }, { key: 'b', label: 'b', action: { kind: 'details' } }] }],
  }
  expect(overBudget(fat)).toEqual(['buttons: 2 of at most 1', 'chips: 1 of at most 0'])
})

// ---- New: decision cards and the question the band picks -----------------------------------

const ASK = {
  question: 'Where should Lanes live?',
  options: [
    { label: 'Plugin store', consequence: 'works at install' },
    { label: 'Keep the file', consequence: 'testers must create a FOCUS.md' },
  ],
}

test('a decision card names each choice and its consequence; a bare "go" or a missing consequence is refused', () => {
  const card = toCard({ ...ASK, hard_to_undo: true, could_be_wrong_if: 'testers share a machine', asked_by: 'plan Setup', facts: ['a', 'b', 'c'] }, 5, 's1')

  expect(card).toMatchObject({ sessionId: 's1', question: ASK.question, options: ASK.options, isHardToUndo: true, couldBeWrongIf: 'testers share a machine', askedBy: 'plan Setup', from: 'tool', status: 'open', askedAt: 5, facts: ['a', 'b'] })
  expect(toCard({ ...ASK, question: '  ' }, 5, 's1')).toBe('No card added: the question is empty.')
  expect(toCard({ question: 'Q?', options: [ASK.options[0]] }, 5, 's1')).toContain('give 2 or 3 options')
  expect(toCard({ question: 'Q?', options: [{ label: 'Go', consequence: 'x' }, ASK.options[1]] }, 5, 's1')).toContain('"Go" names no choice')
  expect(toCard({ question: 'Q?', options: [{ label: 'A' }, ASK.options[1]] }, 5, 's1')).toContain('option "A" has no consequence')
  // "Later" is the band's own quiet exit: dropped from the options, never a button of its own.
  const withLater = toCard({ question: 'Q?', options: [...ASK.options, { label: 'Later', consequence: 'x' }] }, 5, 's1') as Card
  expect(withLater.options.map(o => o.label)).toEqual(['Plugin store', 'Keep the file'])
})

test('a card leaves "open" once; a new card on the same question supersedes the open one', () => {
  const first = toCard(ASK, 5, 's1') as Card
  const answered = close(first, 'answered', 9, 'Plugin store')
  expect(answered).toMatchObject({ status: 'answered', closedAt: 9, answer: 'Plugin store' })
  // Already closed: left as it is.
  expect(close(answered, 'cancelled', 12)).toBe(answered)

  const again = toCard(ASK, 20, 's1') as Card
  const other = toCard(ASK, 21, 's2') as Card
  const cards = supersede([first, other], again)
  expect(cards.map(c => c.status)).toEqual(['superseded', 'open', 'open'])
  expect(cards[0]).toMatchObject({ supersededBy: again.id, closedAt: 20 })
})

test('a question found in prose is inferred; a structured card of this session always wins', () => {
  expect(toAsked({ moment: 'question', question: 'Ship it?', suggestions: [] })).toEqual({ text: 'Ship it?', options: [], from: 'inferred' })
  expect(toAsked({ moment: 'question', question: '', suggestions: [{ label: 'x', prompt: 'y' }] })).toBeNull()
  expect(toAsked({ moment: 'other', question: 'Ship it?', suggestions: [] })).toBeNull()

  const asked = toAsked({ moment: 'question', question: 'Ship it?', suggestions: [] })
  const mine = cardOf('c1')
  expect(questionToShow([cardOf('c9', { sessionId: 's2' }), mine], 's1', asked)).toEqual({ card: mine })
  expect(questionToShow([cardOf('c9', { sessionId: 's2' })], 's1', asked)).toEqual({ asked })
  expect(questionToShow([], 's1', null)).toBeNull()
})

// =============================================================================================
// Part 2: the band mounted on a host. Adapted from the first repository's host tests: plugin
// `coanda`, tool `mcp__coanda__ask_decision`, no demo command, the Primary row reads "◎ <goal>"
// and its Lane shows after "Details". The old card test is split into five.
// =============================================================================================

const BAND = {
  plugin: 'coanda',
  component: 'AbovePrompt',
  surface: 'terminal',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 30,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

type Own = {
  setup: unknown
  files: Record<string, string>
  env: Record<string, string>
  docs?: Record<string, unknown>
  now?: number
  // Paths that exist but cannot be read.
  unreadable?: string[]
  // The engine refuses every submitted prompt.
  submitFails?: true
}

// A band mounted over a person's own setup: what `$.store` holds, the files that exist, the
// environment. It also stands for the engine around it: the prompt, the model, toasts, turns.
async function bandOver($: Parameters<TestBody>[0], on: Parameters<TestBody>[1], own: Own) {
  const reads: string[] = []
  const saved: Record<string, unknown> = { ...(own.docs ?? {}), ...(own.setup === undefined ? {} : { setup: own.setup }) }
  const sets: { key: string; value: unknown }[] = []
  const sent: string[] = []
  const toasts: string[] = []
  // What the model step writes, and what the one Haiku call answers about it.
  const model = { answer: '', text: '{"moment":"other","suggestions":[]}' }
  mock.env(on, own.env)
  on('tool.register', () => ({ value: { tool: 'mcp__coanda__ask_decision' } }))
  const commands: string[] = []
  on('command.register', (_, e) => (commands.push(e.name), { value: { command: e.name } }))
  on('tool.call', () => ({ result: {} }))
  on('fs.exists', (_, e) => ({ value: own.files[e.path] !== undefined || (own.unreadable ?? []).includes(e.path) }))
  on('fs.read', (_, e) => {
    reads.push(e.path)
    const text = own.files[e.path]
    if (text === undefined) throw new Error('no such file')

    return { value: text }
  })
  const writes: { path: string; text: string }[] = []
  on('fs.write', (_, e) => (writes.push({ path: e.path, text: e.text }), (own.files[e.path] = e.text), { value: undefined }))
  on('session.id', () => ({ value: 's1' }))
  on('store.get', (_, e) => ({ value: saved[e.key] ?? null }))
  on('store.set', (_, e) => (sets.push({ key: e.key, value: e.value }), (saved[e.key] = e.value), { value: undefined }))
  on('store.delete', (_, e) => (delete saved[e.key], { value: undefined }))
  on('prompt.submit', (_, e) => {
    sent.push(e.text)
    if (own.submitFails === true) throw new Error('refused')

    return { text: e.text }
  })
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('prompt.fill', () => ({ isFilled: true }))
  on('ui.toast', (_, e) => (toasts.push(e.text), { value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('turn.complete', () => ({ text: '' }))
  // Stands for the engine's model step: a final answer with no tool call.
  on('turn.step', async function* (_, e): AsyncGenerator<TurnStepChunk, TurnStepResult> {
    return { turnId: e.turnId, index: 0, answer: model.answer, toolUses: [], stopReason: 'end_turn', usage: { model: 'opus', input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } as unknown as TurnStepResult
  })
  on('model.complete', () => ({
    value: { isAnswered: true, text: model.text, usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
  }))
  // With `now` the clock is a held one the test moves; without it, a fixed time and no ticks.
  const clock = own.now === undefined ? null : mock.clock(on, { now: own.now })
  if (clock === null) {
    on('clock.now', () => ({ value: 1_000_000 }))
    on('clock.every', () => ({ value: undefined }))
  }
  on('ui.invalidate', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  const start = () => $.session.start({ cwd: '/p/work', surface: 'desktop', isInteractive: true })
  await start()
  const ui = await $.ui.mount(BAND)

  return { ui, clock, reads, writes, saved, sets, sent, toasts, model, commands, restart: start }
}

type Ui = Awaited<ReturnType<typeof bandOver>>['ui']

const texts = async (ui: Ui) => (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
const primaryOf = async (ui: Ui) => (await ui.find({ type: 'Text', text: /^◎ / }))?.text
const buttonsOf = async (ui: Ui) => (await ui.findAll({ type: 'Button' })).map(b => b.text)
const keyOf = async (ui: Ui, label: string) => (await ui.findAll({ type: 'Button' })).find(b => b.text === label)?.key
// The model's call runs in the background after a turn: give it a few turns of the event loop.
const settle = async (until: () => Promise<boolean>) => {
  for (let i = 0; i < 50 && !(await until()); i++) await Promise.resolve()
}

const READY_SETUP = { setup: { v: 1, doneAt: 1, focus: null }, files: {}, env: { HOME: '/home/n' } }
const SETUP_FILE = (path: string) => ({ v: 1, doneAt: 1, focus: { kind: 'file', path } })

// ---- Adapted: the Focus source and the home directory ------------------------------------

test('FR-2 c3: a named file is read and its Primary shown', async ($, on) => {
  const { ui } = await bandOver($, on, { setup: SETUP_FILE('/data/goals.md'), files: { '/data/goals.md': 'Ship the intake form\nthen test it\n' }, env: { HOME: '/home/n' } })

  expect(await primaryOf(ui)).toBe('◎ Ship the intake form')
  await ui.unmount()
})

test('FR-2 c3: a file that cannot be read says so in plain words', async ($, on) => {
  const { ui } = await bandOver($, on, { setup: SETUP_FILE('/data/gone.md'), files: {}, env: { HOME: '/home/n' } })

  // No usable Primary: the PRIMARY row says why and offers the field and "Set".
  expect(await primaryOf(ui)).toBeUndefined()
  expect(await texts(ui)).toContain('SET YOUR PRIMARY')
  expect(await texts(ui)).toContain('Focus file not readable')
  expect(await keyOf(ui, 'Set')).toBe('primary-set')
  await ui.unmount()
})

test('FR-2 c4: with no Focus source saved, the row reads "no Primary set" and no file is read', async ($, on) => {
  const { ui, reads } = await bandOver($, on, { setup: { v: 1, doneAt: 1, focus: null }, files: {}, env: { HOME: '/home/n' } })

  expect(await primaryOf(ui)).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^SET YOUR PRIMARY$/ })).toBeDefined()
  expect(await keyOf(ui, 'Set')).toBe('primary-set')
  expect(reads).toEqual([])
  await ui.unmount()
})

test('FR-2 c4: with no home directory the band still draws and reads no file', async ($, on) => {
  const { ui, reads } = await bandOver($, on, { setup: { v: 1, doneAt: 1, focus: null }, files: {}, env: {} })

  expect(await primaryOf(ui)).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^SET YOUR PRIMARY$/ })).toBeDefined()
  expect(await keyOf(ui, 'Set')).toBe('primary-set')
  expect(reads).toEqual([])
  await ui.unmount()
})

// ---- Adapted: the Setup moment -------------------------------------------------------------

// The first Setup opens with the lamp, whose one button sits over the real band.
const setupButtons = async (ui: Ui) => (await buttonsOf(ui)).filter(one => one !== 'Pull the cord')
const GOALS_PATH = '/home/n/.claude/goals.md'
const GOALS_TEXT = '## Today\n- **Primary (14 Nov, N): Ship the v0.1 install (Lane 1).**\n- **Lane 1 — Install:** portfolio live by 14 Dec.\n- **Lane 2 — Page:** the product page shipped by 5 Dec.\n'

test('goalsState: goals found, nothing found, or a file that cannot be read', () => {
  expect(goalsState(parseFocus(GOALS_TEXT, NOW))).toBe('found')
  // Lanes alone are goals; a closed Primary with no Lane is nothing.
  expect(goalsState({ status: 'none', primary: '', laneId: '', lanes: [{ id: 'lane-1', outcome: 'x' }] })).toBe('found')
  expect(goalsState({ status: 'closed', primary: '', laneId: '', lanes: [] })).toBe('nothing')
  expect(goalsState({ status: 'none', primary: '', laneId: '', lanes: [] })).toBe('nothing')
  expect(goalsState({ status: 'unreadable', primary: '', laneId: '', lanes: [] })).toBe('unreadable')
})

test('Setup model: goals found shows the Goal and up to 3 Lanes with one strong button; nothing found says what a Goal is', () => {
  const open = (over: Partial<Snapshot>) => bandModel(snap({ setup: { ...SETUP_DONE, doneAt: null, lanes: [] }, goalsPath: GOALS_PATH, ...over }))
  const rowOf = (model: BandModel) => {
    if (model.kind !== 'setup') throw new Error(`expected setup, got ${model.kind}`)
    expect(model.heading).toBe('Set up your goals')
    expect(model.rows).toHaveLength(1)

    return model.rows[0]!
  }
  const lanes = [1, 2, 3, 4].map(n => ({ id: `lane-${n}`, outcome: `Lane outcome ${n}`, ...(n === 1 ? { endDay: '2026-12-14' } : {}) }))

  const found = rowOf(open({ now: new Date(2026, 10, 14).getTime(), focus: { status: 'ok', primary: 'Ship the v0.1 install', laneId: 'lane-1', lanes } }))
  // 6 content rows at most: the Goal and 3 Lanes, never a fourth.
  expect(found.text).toEqual(['Goal    Ship the v0.1 install', 'Lane 1  Lane outcome 1 · by 14 Dec', 'Lane 2  Lane outcome 2', 'Lane 3  Lane outcome 3'])
  expect(found.buttons.map(b => [b.label, b.variant])).toEqual([['Looks right', 'primary'], ['Change', 'secondary'], ['Skip for now', 'link']])
  expect(found.inputs).toBeUndefined()

  // Lanes with a closed Primary: no Goal line.
  expect(rowOf(open({ focus: { status: 'closed', primary: '', laneId: '', lanes: lanes.slice(0, 1) } })).text[0]).toMatch(/^Lane 1 /)

  const nothing = rowOf(open({ focus: { status: 'none', primary: '', laneId: '', lanes: [] } }))
  expect(nothing.text).toEqual(['A Goal is the one thing that counts today.', 'A Lane is a longer outcome with a date, like portfolio live by 14 Dec.'])
  expect(nothing.buttons.map(b => [b.label, b.variant])).toEqual([['Set up with Claude', 'primary'], ['Find them for me', 'secondary'], ['Skip for now', 'link']])
  expect(nothing.inputs).toBeUndefined()

  const unreadable = rowOf(open({ focus: { status: 'unreadable', primary: '', laneId: '', lanes: [] } }))
  expect(unreadable.text).toEqual([`I couldn't read ${GOALS_PATH}.`])
  expect(unreadable.buttons.map(b => b.label)).toEqual(['Ask Claude to fix it', 'Skip for now'])

  // State 1: Claude was asked; nothing else to press but the exit.
  const asking = rowOf(open({ goalsAsking: true }))
  expect(asking.text).toEqual(['Asking Claude about your goals and Lanes…'])
  expect(asking.buttons.map(b => b.label)).toEqual(['Skip for now'])

  // In the demo a goals file of the demo's own can be created; the person's own files are not offered.
  const demo = rowOf(open({ demoGoals: '/demo/goals.md', focus: { status: 'none', primary: '', laneId: '', lanes: [] } }))
  expect(demo.buttons.map(b => [b.label, b.variant])).toEqual([['Create a demo goals file', 'primary'], ['Set up with Claude', 'secondary'], ['Find them for me', 'secondary'], ['Skip for now', 'link']])

  // The budget of a Setup step: one strong button, one quiet exit, nothing to type.
  for (const model of [open({}), open({ focus: { status: 'none', primary: '', laneId: '', lanes: [] } })]) expect(overBudget(model)).toEqual([])
})

test('Setup: with no saved setup and no goals file it says nothing was found, reads no other file, and has nothing to type', async ($, on) => {
  const { ui, reads } = await bandOver($, on, { setup: undefined, files: {}, env: { HOME: '/home/n' } })

  expect(await texts(ui)).toContain('SET UP YOUR GOALS')
  expect(await texts(ui)).toContain('A Goal is the one thing that counts today.')
  expect(await ui.findAll({ type: 'Input' })).toHaveLength(0)
  expect(await setupButtons(ui)).toEqual(['Set up with Claude', 'Find them for me', 'Skip for now'])
  expect(await primaryOf(ui)).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^NOW$/ })).toBeUndefined()
  expect(reads).toEqual([])
  await ui.unmount()
})

test('Setup: "Skip for now" finishes it for good: the usual band shows and does not go back', async ($, on) => {
  const { ui, restart, saved } = await bandOver($, on, { setup: undefined, files: {}, env: { HOME: '/home/n' } })

  await ui.press({ key: 'setup-skip' })
  expect(await ui.find({ type: 'Text', text: /^SET YOUR PRIMARY$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^SET UP YOUR GOALS$/ })).toBeUndefined()
  expect(saved.setup).toMatchObject({ v: 1, focus: null })
  expect(typeof (saved.setup as { doneAt: unknown }).doneAt).toBe('number')
  await restart()
  expect(await ui.find({ type: 'Text', text: /^SET UP YOUR GOALS$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^SET YOUR PRIMARY$/ })).toBeDefined()
  await ui.unmount()
})

test('Setup: a goals file at ~/.claude/goals.md is found; "Looks right" keeps it and its Primary shows', async ($, on) => {
  const { ui, saved } = await bandOver($, on, { setup: undefined, files: { [GOALS_PATH]: GOALS_TEXT }, env: { HOME: '/home/n' } })

  expect(await texts(ui)).toContain('SET UP YOUR GOALS')
  expect(await texts(ui)).toContain('Goal    Ship the v0.1 install')
  expect(await texts(ui)).toContain('Lane 1  Install: portfolio live')
  expect(await texts(ui)).toContain('Lane 2  Page: the product page shipped')
  expect(await setupButtons(ui)).toEqual(['Looks right', 'Change', 'Skip for now'])
  expect(await ui.findAll({ type: 'Input' })).toHaveLength(0)
  await ui.press({ key: 'setup-keep' })
  expect(saved.setup).toMatchObject({ focus: { kind: 'file', path: GOALS_PATH } })
  expect(typeof (saved.setup as { doneAt: unknown }).doneAt).toBe('number')
  expect(await primaryOf(ui)).toBe('◎ Ship the v0.1 install')
  expect(await ui.find({ type: 'Text', text: /^SET UP YOUR GOALS$/ })).toBeUndefined()
  await ui.unmount()
})

test('toProposal: a Goal and up to 3 Lanes; refusals are plain sentences; the file text is what the band reads back', () => {
  expect(toProposal({})).toContain('goal is empty')
  expect(toProposal({ goal: 'Finish Coanda', lanes: [{ name: 'Visible' }] })).toContain('needs a name and an outcome')
  const p = toProposal({ goal: ' Finish  Coanda ', lanes: [{ name: 'Visible', outcome: 'be visible with a product use case', by: '14 Dec' }, { name: 'Page', outcome: 'ship it' }, { name: 'c', outcome: 'x' }, { name: 'd', outcome: 'y' }] })
  if (typeof p === 'string') throw new Error(p)
  expect(p.goal).toBe('Finish Coanda')
  expect(p.lanes).toHaveLength(3)
  expect(proposalLane(p.lanes[0]!, 0)).toBe('Lane 1  Visible: be visible with a product use case · by 14 Dec')
  expect(proposalLane(p.lanes[1]!, 1)).toBe('Lane 2  Page: ship it')
  // Read back by the same parser the band uses: the same Goal and Lanes.
  const back = parseFocusMd(proposalText(p), NOW)
  expect(back).toMatchObject({ status: 'ok', primary: 'Finish Coanda', laneId: 'lane-1' })
  expect(back.lanes.map(l => l.outcome)).toEqual(['Visible: be visible with a product use case', 'Page: ship it', 'c: x'])
  expect(proposalMessage('save', GOALS_PATH, p)).toContain(`${GOALS_PATH}, exactly as written`)
  expect(proposalMessage('revise', GOALS_PATH, p)).toContain('propose_goals')
  // A Goal alone is fine, with no Lane reference.
  expect(proposalText({ goal: 'Ship', lanes: [] })).toBe('## Today\n- **Primary (N): Ship.**')
})

test('Setup state 4: Claude proposes through propose_goals; Save these sends Claude the file text (Coanda writes nothing); Not these drops it', async ($, on) => {
  const own = { setup: undefined, files: {} as Record<string, string>, env: { HOME: '/home/n' } }
  const { ui, sent, writes } = await bandOver($, on, own)

  const result = await $.tool.call({ tool: 'mcp__coanda__propose_goals', goal: 'Finish Coanda', lanes: [{ name: 'Visible', outcome: 'be visible with a product use case', by: '14 Dec' }] } as never)
  expect(JSON.stringify(result)).toContain('Proposal shown')
  expect(await texts(ui)).toContain('Goal    Finish Coanda')
  expect(await texts(ui)).toContain('Lane 1  Visible: be visible with a product use case · by 14 Dec')
  expect(await texts(ui)).toContain('inferred')
  expect(await setupButtons(ui)).toEqual(['Save these', 'Change', 'Not these'])

  // Not these: the proposal goes, nothing is sent or written.
  await ui.press({ key: 'proposal-drop' })
  expect(await texts(ui)).toContain('A Goal is the one thing that counts today.')
  expect(sent).toEqual([])

  await $.tool.call({ tool: 'mcp__coanda__propose_goals', goal: 'Finish Coanda', lanes: [] } as never)
  await ui.press({ key: 'proposal-save' })
  expect(sent).toHaveLength(1)
  expect(sent[0]).toContain(`Save these goals to ${GOALS_PATH}`)
  expect(sent[0]).toContain('- **Primary (N): Finish Coanda.**')
  expect(writes).toEqual([])
  expect(await texts(ui)).toContain('Asking Claude')
  // Claude wrote the file and its turn ends: the goals show to confirm.
  own.files[GOALS_PATH] = sent[0]!.split(':\n')[1]!
  await done($, 't1', 'Saved.')
  expect(await texts(ui)).toContain('Goal    Finish Coanda')
  expect(await texts(ui)).not.toContain('Asking Claude')
  expect(await setupButtons(ui)).toEqual(['Looks right', 'Change', 'Skip for now'])
  await ui.unmount()
})

test('Setup state 4: a proposal opens Setup if it was closed; a refused proposal changes nothing', async ($, on) => {
  const { ui } = await bandOver($, on, { ...READY_SETUP, now: THEN })

  expect(JSON.stringify(await $.tool.call({ tool: 'mcp__coanda__propose_goals', goal: '' } as never))).toContain('goal is empty')
  expect(await ui.find({ type: 'Text', text: /^SET UP YOUR GOALS$/ })).toBeUndefined()
  await $.tool.call({ tool: 'mcp__coanda__propose_goals', goal: 'Ship it' } as never)
  expect(await ui.find({ type: 'Text', text: /^SET UP YOUR GOALS$/ })).toBeDefined()
  await ui.unmount()
})

test('goalsMessage: each ask names the file and the format; "find" in the demo names its folder only', () => {
  for (const kind of ['setup', 'change', 'fix'] as const) {
    const text = goalsMessage(kind, GOALS_PATH)
    expect(text).toContain(GOALS_PATH)
    expect(text).toContain('**Lane 1 — ')
  }
  // "Find" shows its result through propose_goals and writes nothing before "Save these".
  expect(goalsMessage('find', GOALS_PATH)).toContain('propose_goals')
  expect(goalsMessage('find', GOALS_PATH)).toContain('Do not write')
  expect(goalsMessage('find', GOALS_PATH)).toContain('my files')
  const demo = goalsMessage('find', '/demo/goals.md', '/demo')
  expect(demo).toContain('the folder /demo and nowhere else')
  expect(demo).not.toContain('my files')
})

test('Setup: "Set up with Claude" sends one message, shows "Asking Claude", and the goals show when Claude has written the file', async ($, on) => {
  const own = { setup: undefined, files: {} as Record<string, string>, env: { HOME: '/home/n' } }
  const { ui, sent, model } = await bandOver($, on, own)

  await ui.press({ key: 'lamp-pull' })
  await ui.press({ key: 'setup-ask' })
  expect(sent).toHaveLength(1)
  expect(sent[0]).toContain(GOALS_PATH)
  expect(await texts(ui)).toContain('Asking Claude about your goals and Lanes…')
  expect(await setupButtons(ui)).toEqual(['Skip for now'])
  // A second press while waiting sends nothing (there is no button, and a stray press is refused).
  await ui.press({ key: 'setup-ask' }).catch(() => undefined)
  expect(sent).toHaveLength(1)

  // Claude's turn ends with a question and no file yet: still waiting.
  model.answer = 'What is the one thing that counts today?'
  await done($, 't1', 'What is the one thing that counts today?')
  expect(await texts(ui)).toContain('Asking Claude about your goals and Lanes…')

  // Claude writes the file; its turn ends: the goals are shown to confirm.
  own.files[GOALS_PATH] = GOALS_TEXT
  await done($, 't2', 'Written.')
  expect(await texts(ui)).toContain('Goal    Ship the v0.1 install')
  expect(await texts(ui)).not.toContain('Asking Claude')
  await ui.unmount()
})

test('a refused send never breaks the band: "Asking Claude" shows and Skip for now still works', async ($, on) => {
  const { ui, sent } = await bandOver($, on, { setup: undefined, files: {}, env: { HOME: '/home/n' }, submitFails: true })

  await ui.press({ key: 'setup-ask' })
  expect(sent).toHaveLength(1)
  expect(await texts(ui)).toContain('Asking Claude')
  await ui.press({ key: 'setup-skip' })
  expect(await ui.find({ type: 'Text', text: /^SET UP YOUR GOALS$/ })).toBeUndefined()
  await ui.unmount()
})

test('Setup: "Change" asks Claude about the file already there; "Skip for now" ends the wait', async ($, on) => {
  const { ui, sent } = await bandOver($, on, { setup: undefined, files: { [GOALS_PATH]: GOALS_TEXT }, env: { HOME: '/home/n' } })

  await ui.press({ key: 'setup-change' })
  expect(sent[0]).toContain('change my goals')
  expect(await texts(ui)).toContain('Asking Claude')
  await done($, 't1', 'What would you like to change?')
  expect(await texts(ui)).toContain('Goal    Ship the v0.1 install')
  await ui.press({ key: 'setup-change' })
  await ui.press({ key: 'setup-skip' })
  expect(await ui.find({ type: 'Text', text: /^SET UP YOUR GOALS$/ })).toBeUndefined()
  await ui.unmount()
})

test('/coanda-demo: "Find them for me" tells Claude to look only in the demo folder', async ($, on) => {
  const own = { setup: MINE.setup, docs: { cards: MINE.cards, primary: MINE.primary }, files: { [GOALS_PATH]: GOALS_TEXT }, env: { HOME: '/home/n' } }
  const { ui, sent } = await bandOver($, on, own)

  await $.command.run({ command: 'coanda-demo' } as never)
  await ui.press({ key: 'lamp-pull' })
  await ui.press({ key: 'setup-find' })
  expect(sent).toHaveLength(1)
  expect(sent[0]).toContain('the folder /home/n/.claude/plugins/data/coanda/demo and nowhere else')
  expect(sent[0]).toContain('/home/n/.claude/plugins/data/coanda/demo/goals.md')
  expect(sent[0]).not.toContain('my files')
  await ui.unmount()
})

test('Setup: a goals file that exists and cannot be read says so with its path', async ($, on) => {
  const { ui } = await bandOver($, on, { setup: undefined, files: {}, unreadable: [GOALS_PATH], env: { HOME: '/home/n' } })

  expect(await texts(ui)).toContain(`I couldn't read ${GOALS_PATH}.`)
  expect(await setupButtons(ui)).toEqual(['Ask Claude to fix it', 'Skip for now'])
  await ui.unmount()
})

test('Setup: CLAUDE_CONFIG_DIR moves the goals file', async ($, on) => {
  const { ui } = await bandOver($, on, { setup: undefined, files: { '/cfg/goals.md': GOALS_TEXT }, env: { HOME: '/home/n', CLAUDE_CONFIG_DIR: '/cfg' } })

  expect(await texts(ui)).toContain('Goal    Ship the v0.1 install')
  await ui.unmount()
})

test('Setup: with no home directory nothing is read and it says nothing was found', async ($, on) => {
  const { ui, reads } = await bandOver($, on, { setup: undefined, files: {}, env: {} })

  expect(await texts(ui)).toContain('A Goal is the one thing that counts today.')
  expect(reads).toEqual([])
  await ui.unmount()
})

test('/coanda-setup opens Setup again with the goals file read afresh; "Looks right" closes it', async ($, on) => {
  const { ui, commands, saved } = await bandOver($, on, { setup: SETUP_FILE('/data/goals.md'), files: { '/data/goals.md': GOALS_TEXT }, env: { HOME: '/home/n' } })

  expect(commands).toEqual(['coanda-setup', 'coanda-specimen', 'coanda-demo', 'coanda-shutdown', 'coanda-grid'])
  expect(await primaryOf(ui)).toBe('◎ Ship the v0.1 install')
  await $.command.run({ command: 'coanda-setup' } as never)
  expect(await texts(ui)).toContain('SET UP YOUR GOALS')
  expect(await texts(ui)).toContain('Goal    Ship the v0.1 install')
  expect(await primaryOf(ui)).toBeUndefined()

  await ui.press({ key: 'setup-keep' })
  expect(await ui.find({ type: 'Text', text: /^SET UP YOUR GOALS$/ })).toBeUndefined()
  expect(await primaryOf(ui)).toBe('◎ Ship the v0.1 install')
  expect(saved.setup).toMatchObject({ focus: { kind: 'file', path: '/data/goals.md' } })
  await ui.unmount()
})

test('the Primary typed in the band is kept for today; tomorrow the band asks again', async ($, on) => {
  const { ui, saved, clock } = await bandOver($, on, { setup: { v: 1, doneAt: 1, focus: null }, files: {}, env: { HOME: '/home/n' }, now: THEN })

  // An empty field sets nothing.
  await ui.press({ key: 'primary-set' })
  expect(saved.primary).toBeUndefined()
  await ui.input({ key: 'primary-input', text: '  Ship the   band ', kind: 'change' })
  await ui.press({ key: 'primary-set' })
  expect(saved.primary).toMatchObject({ v: 1, text: 'Ship the band', day: '2026-11-12' })
  expect(await primaryOf(ui)).toBe('◎ Ship the band')
  expect(await ui.find({ type: 'Text', text: /^SET YOUR PRIMARY$/ })).toBeUndefined()

  // The next day it no longer counts: the PRIMARY row is back; Enter in the field sets it too.
  await clock!.advance(24 * 3600 * 1000)
  expect(await primaryOf(ui)).toBeUndefined()
  await ui.input({ key: 'primary-input', text: 'Write the tests', kind: 'submit' })
  expect(await primaryOf(ui)).toBe('◎ Write the tests')
  await ui.unmount()
})

test('/coanda-specimen shows every drawing option, then hides it again', async ($, on) => {
  const { ui } = await bandOver($, on, READY_SETUP)

  await $.command.run({ command: 'coanda-specimen' } as never)
  expect(await texts(ui)).toContain('COANDA SPECIMEN')
  expect(await texts(ui)).toContain('B8 Dusk box + plain Button white Text')
  await $.command.run({ command: 'coanda-specimen' } as never)
  expect(await texts(ui)).not.toContain('COANDA SPECIMEN')
  await ui.unmount()
})

test('/coanda-grid shows the grid page, then hides it again', async ($, on) => {
  const { ui } = await bandOver($, on, READY_SETUP)

  await $.command.run({ command: 'coanda-grid' } as never)
  expect(await texts(ui)).toContain('COANDA GRID · run /coanda-grid again to hide')
  expect(await texts(ui)).toContain('V2 paddingY steps on a tinted box (height of the box minus one text line = 2 x step)')
  // The first measure of the rebuild plan: the heading over the frame's line, the fields beside Set.
  expect(await texts(ui)).toContain('SET YOUR PRIMARY · M1 top 0, no background')
  expect(await texts(ui)).toContain('SET YOUR PRIMARY · M4 top -1, white background')
  await $.command.run({ command: 'coanda-grid' } as never)
  expect(await texts(ui)).not.toContain('COANDA GRID · run /coanda-grid again to hide')
  await ui.unmount()
})

test('breathe while it builds: only Working, only after 30 s, asks nothing, within the budget', () => {
  const run = (over: Partial<Snapshot>) => bandModel(snap({ isWorking: true, ...over }))
  const nowRow = (m: BandModel) => rowsOf(m).rows[0]!

  expect(BREATHE_AFTER_MS).toBe(30_000)
  expect(nowRow(run({ workingSince: NOW - 29_000 })).breathe).toBeUndefined()
  expect(nowRow(run({ workingSince: NOW - 31_000 })).breathe).toBe(true)
  expect(nowRow(run({ workingSince: null })).breathe).toBeUndefined()
  // Resting never breathes, even with a start time left over.
  expect(nowRow(bandModel(snap({ isWorking: false, workingSince: NOW - 90_000 }))).breathe).toBeUndefined()
  // It adds no button and no row.
  const long = run({ workingSince: NOW - 90_000 })
  expect(nowRow(long).buttons).toEqual([])
  expect(overBudget(long)).toEqual([])
})

test('breathe drawing: a Dusk circle on a 16 s keyframe loop and a fixed muted caption', () => {
  expect(BREATHE_SECONDS).toBe(16)
  expect(BREATHE_SVG).toContain('#5663A8')
  expect(BREATHE_SVG).toContain('@keyframes')
  expect(BREATHE_SVG).toContain('16s')
  expect(BREATHE_SVG).toContain('prefers-reduced-motion')
  expect(BREATHE_CAPTION).toBe('one breath while you wait, or ignore it')
})

test('breathe in the band: appears 30 s into a run, goes when the run ends', async ($, on) => {
  // With a Primary set: without one the band asks for it ("Set your Primary") instead of showing the NOW line.
  const { clock } = await bandOver($, on, { setup: SETUP_FILE('/data/goals.md'), files: { '/data/goals.md': 'Ship the band\n' }, env: { HOME: '/home/n' }, now: 5_000_000 })
  // The test host redraws a mounted band on state changes only (it ignores ui.invalidate), so each look mounts a fresh one.
  const look = async () => {
    const one = await $.ui.mount({ ...BAND, props: { ...BAND.props, isWorking: true } })
    const text = JSON.stringify(await one.drawn())
    await one.unmount()

    return text
  }

  expect(await look()).not.toContain('one breath while you wait')
  await $.prompt.submit({ text: 'build it', wait: false, origin: { kind: 'composer' } } as never)
  await clock!.advance(29_000)
  expect(await look()).not.toContain('one breath while you wait')

  await clock!.advance(2_000)
  const long = await look()
  expect(long).toContain('one breath while you wait, or ignore it')
  // The test host draws an Svg as an empty node, so the drawing itself is checked in the test above.

  await done($, 't1', 'ok')
  expect(await look()).not.toContain('one breath while you wait')
})

test('Setup opens with the lamp: dark with one button, pulled it plays once, then the plain band stays', async ($, on) => {
  const { ui, clock } = await bandOver($, on, { setup: { v: 1, doneAt: null, focus: null }, files: {}, env: { HOME: '/home/n' }, now: THEN })
  const drawn = async () => JSON.stringify(await ui.drawn())

  // Dark: the layer and the one button are there; the real Setup is drawn under them.
  expect(await drawn()).toContain('"key":"lamp-layer"')
  expect(await drawn()).toContain('"key":"lamp-pull"')
  expect(await drawn()).toContain('"position":"absolute"')
  expect(await texts(ui)).toContain('SET UP YOUR GOALS')

  // Pulled: the button goes; the native cover and the layer are both there, so Setup never shows in between.
  await ui.press({ key: 'lamp-pull' })
  expect(await drawn()).not.toContain('"key":"lamp-pull"')
  expect(await drawn()).toContain('"key":"lamp-cover"')
  expect(await drawn()).toContain('"key":"lamp-layer"')

  // The cover goes first (the drawing is loaded by then); the layer stays while the light plays.
  await clock!.advance(700)
  expect(await drawn()).not.toContain('"key":"lamp-cover"')
  expect(await drawn()).toContain('"key":"lamp-layer"')

  // One timer later the layer is gone and Setup is the plain band (no wrapper left to block anything).
  await clock!.advance(3000)
  expect(await drawn()).not.toContain('"key":"lamp-layer"')
  expect(await drawn()).not.toContain('"key":"lamp-stage"')
  expect(await texts(ui)).toContain('SET UP YOUR GOALS')

  // Every time Setup runs: /coanda-setup plays it again.
  await $.command.run({ command: 'coanda-setup' } as never)
  expect(await drawn()).toContain('"key":"lamp-pull"')
  await ui.unmount()
})

test('/coanda-stage: boxes are 9 rows; the light layer (an absolute Box) shows while playing and is removed by one timer', async ($, on) => {
  const { ui, clock } = await bandOver($, on, { ...READY_SETUP, now: THEN })

  await $.command.run({ command: 'coanda-stage' } as never)
  expect(await texts(ui)).toContain('COANDA STAGE · run /coanda-stage again to hide')
  expect(JSON.stringify(await ui.drawn())).not.toContain('"type":"Client"')
  expect(JSON.stringify(await ui.drawn())).not.toContain('"key":"ov-a"')
  await ui.press({ key: 'stage-play' })
  expect(JSON.stringify(await ui.drawn())).toContain('"key":"ov-a"')
  expect(JSON.stringify(await ui.drawn())).toContain('"position":"absolute"')
  await clock!.advance(2700)
  expect(JSON.stringify(await ui.drawn())).not.toContain('"key":"ov-a"')
  await $.command.run({ command: 'coanda-stage' } as never)
  expect(await texts(ui)).not.toContain('COANDA STAGE · run /coanda-stage again to hide')
  await ui.unmount()
})

test('/coanda-light shows the lamp alone; the cord toggles it; hiding puts it back unlit', async ($, on) => {
  const { ui } = await bandOver($, on, READY_SETUP)

  await $.command.run({ command: 'coanda-light' } as never)
  expect(await texts(ui)).toContain('COANDA LIGHT · run /coanda-light again to hide')
  expect(JSON.stringify(await ui.drawn())).toContain('Pull the cord')
  expect(JSON.stringify(await ui.drawn())).not.toContain('"type":"Client"')
  await ui.press({ key: 'light-pull' })
  expect(JSON.stringify(await ui.drawn())).toContain('Turn it off')
  await $.command.run({ command: 'coanda-light' } as never)
  expect(await texts(ui)).not.toContain('COANDA LIGHT · run /coanda-light again to hide')
  await $.command.run({ command: 'coanda-light' } as never)
  expect(JSON.stringify(await ui.drawn())).toContain('Pull the cord')
  await ui.unmount()
})

test('/coanda-lab shows the capability tests, then hides them again', async ($, on) => {
  const { ui } = await bandOver($, on, READY_SETUP)

  await $.command.run({ command: 'coanda-lab' } as never)
  expect(await texts(ui)).toContain('COANDA LAB · run /coanda-lab again to hide')
  await $.command.run({ command: 'coanda-lab' } as never)
  expect(await texts(ui)).not.toContain('COANDA LAB · run /coanda-lab again to hide')
  await ui.unmount()
})

// ---- Must hold on screen (docs/design/band-mapping.md): the drawn band, not its words ---------
// Each point was settled on screen; this test fails before a regression reaches the screen.

type Drawn = { type: string; props?: Record<string, unknown>; children?: unknown[] }
const isNode = (one: unknown): one is Drawn => typeof one === 'object' && one !== null && typeof (one as Drawn).type === 'string'

// Every node with the chain of Boxes above it.
function nodesOf(root: unknown): { node: Drawn; above: Drawn[] }[] {
  const out: { node: Drawn; above: Drawn[] }[] = []
  const walk = (one: unknown, above: Drawn[]) => {
    if (!isNode(one)) return
    out.push({ node: one, above })
    for (const child of one.children ?? []) walk(child, [...above, one])
  }
  walk(root, [])

  return out
}

const QUIET = /-later$|^asked-dismiss$|^primary-details$|^setup-skip$/

// What every drawn moment must hold; returns the broken points, empty when all hold.
function mustHold(root: unknown): string[] {
  const all = nodesOf(root)
  const broken: string[] = []

  if (JSON.stringify(root).includes('"engine"')) broken.push('the host default drawing (engine node) is drawn')
  const frames = all.filter(({ node }) => node.type === 'Box' && node.props?.borderStyle === 'round' && node.props?.paddingX === 1)
  for (const { node } of frames) if (node.props?.width !== BAND.props.bodyColumns) broken.push(`frame width ${String(node.props?.width)}, not the full width`)

  for (const { node, above } of all) {
    const props = node.props ?? {}
    // Labels: 16 cells; their row aligned to the top.
    if (node.type === 'Box' && props.width === LABEL_WIDTH) {
      const rowBox = above[above.length - 1]
      if (rowBox?.props?.alignItems !== 'flex-start') broken.push('a row is not aligned to the top')
    }
    // Fields: two rows tall (full width, seen A8), no chip name (no chip, seen A5).
    if (node.type === 'Input') {
      if (props.rows !== 2) broken.push(`field ${String(props.key)} is not 2 rows tall`)
      if ('submitLabel' in props) broken.push(`field ${String(props.key)} names its chip`)
    }
    if (node.type === 'Button') {
      const key = String(props.key)
      const isQuiet = QUIET.test(key)
      // Quiet exits: plain and dim (B5). Everything else: a native primary or secondary (B1, B2).
      if (isQuiet && !(props.plain === true && props.dimColor === true)) broken.push(`${key} is not a plain, dim quiet exit`)
      if (!isQuiet && props.variant !== 'primary' && props.variant !== 'secondary') broken.push(`${key} is not a native button`)
      if (['primary-set', 'setup-keep'].includes(key) && props.variant !== 'primary') broken.push(`${key} is not primary`)
      // No button inside a painted contour (Nicolas, 16:57).
      // The lamp's one button is the exception: it sits on the dark layer and needs an edge to be seen (14 Nov).
      if (key !== 'lamp-pull' && above.some(box => box.props?.borderColor !== undefined)) broken.push(`${key} sits inside a painted contour`)
    }
  }

  return broken
}

test('must hold on screen: every moment keeps the settled layout, buttons and fields', async ($, on) => {
  const { ui, model } = await bandOver($, on, READY_SETUP)
  const check = async (moment: string) => expect({ moment, broken: mustHold(await ui.drawn()) }).toEqual({ moment, broken: [] })

  await check('resting, PRIMARY row')
  await ask($, 'Band or panel?', ['Band', 'Panel'], { hard_to_undo: true })
  await check('small choice')
  // First option primary, the other secondary, as in Intent.
  const variants = nodesOf(await ui.drawn()).filter(({ node }) => node.type === 'Button').map(({ node }) => [node.props?.label, node.props?.variant ?? 'plain'])
  expect(variants.slice(0, 3)).toEqual([['Band', 'primary'], ['Panel', 'secondary'], ['Later', 'plain']])
  await ui.press({ key: (await keyOf(ui, 'Later'))! })
  model.text = '{"moment":"question","question":"Ship it now?","suggestions":[{"label":"Ship it","prompt":"Ship it."},{"label":"Wait","prompt":"Wait."}]}'
  await done($, 'tg', 'Ship it?')
  await settle(async () => (await ui.find({ type: 'Text', text: /Ship it now/ })) !== undefined)
  await check('guessed question')
  await ui.press({ key: 'asked-dismiss' })
  await $.command.run({ command: 'coanda-setup' } as never)
  await check('setup, goals found')
  await ui.unmount()

  // The guard itself catches a regression.
  expect(mustHold({ type: 'Box', props: { borderColor: '#5663A8' }, children: [{ type: 'Button', props: { key: 'x-o0', plain: true, label: 'A' } }] })).toEqual([
    'x-o0 is not a native button',
    'x-o0 sits inside a painted contour',
  ])
})

// ---- Adapted (FR-7): the Primary row and its Lane, behind "Details" -------------------------

const LANES =
  '- **Lane 1 — Bootcamp:** Jedha Fullstack Product Builder, 21 Sep → 14 Dec. Ship it.\n' +
  '- **Lane 2 — Proof:** portfolio MVP live by Sun 18 Oct. More.\n' +
  '- **Lane 3 — Be found:** meetups and posts by Q1. More.\n' +
  '- **Lane 4 — Odd:** ship a thing by 31 Feb. More.\n'
const todayWith = (primary: string): string => `${LANES}## Today\n- ${primary}\n`

// The Primary row as drawn with Details open: the goal, and the Lane ('' when there is none).
async function rowOf(ui: Ui) {
  const all = (await ui.findAll({ type: 'Text' })).map(t => t.text ?? '')
  const lane = all.find(t => t.startsWith('Lane: '))

  return { primary: all.find(t => t.startsWith('◎ ')) ?? '', lane: lane === undefined ? '' : lane.slice('Lane: '.length) }
}

// One band per test (hooks register once); the file is changed and the 60-second tick shows it.
async function bandOnFile($: Parameters<TestBody>[0], on: Parameters<TestBody>[1], first: string, openDetails = true) {
  const files: Record<string, string> = { '/data/focus.md': first }
  const made = await bandOver($, on, { setup: SETUP_FILE('/data/focus.md'), files, env: { HOME: '/home/n' }, now: THEN })
  // The Lane is behind "Details" (v3 rule 6): open it once; it stays open across redraws.
  expect(await rowOf(made.ui)).toMatchObject({ lane: '' })
  if (openDetails) await made.ui.press({ key: 'primary-details' })
  const show = async (text: string, ms = 60_000) => {
    files['/data/focus.md'] = text
    await made.clock!.advance(ms)

    return rowOf(made.ui)
  }

  return { ...made, show }
}

test('FR-7 c1: with Details open the row shows the outcome of the Primary\'s Lane, never only "Lane 2"', async ($, on) => {
  const { ui } = await bandOnFile($, on, todayWith('**Primary (12 Nov, N): Coanda, Lane 2 (Proof).**'))
  const row = await rowOf(ui)

  expect(row.primary).toBe('◎ Coanda')
  expect(row.lane).toContain('Proof: portfolio MVP live')
  expect(row.lane).not.toMatch(/^Lane 2$/)
  // "Less" closes it again: the goal alone.
  await ui.press({ key: 'primary-details' })
  expect(await rowOf(ui)).toEqual({ primary: '◎ Coanda', lane: '' })
  await ui.unmount()
})

test('FR-7 c2: a Lane\'s end date shows ("by 14 Dec"), a past one is marked, an unreadable one stays text', async ($, on) => {
  const { ui, show } = await bandOnFile($, on, todayWith('**Primary (12 Nov, N): Coanda, Lane 1.**'))
  const at = async (lane: number) => (await show(todayWith(`**Primary (12 Nov, N): Coanda, Lane ${lane}.**`))).lane

  expect(await at(1)).toBe('Bootcamp: Jedha Fullstack Product Builder · by 14 Dec')
  expect(await at(2)).toBe('Proof: portfolio MVP live · by 18 Oct · past')
  // "by Q1" and "by 31 Feb" cannot be read as a day: kept as the file wrote them, never marked past.
  expect(await at(3)).toBe('Be found: meetups and posts · by Q1')
  expect(await at(4)).toBe('Odd: ship a thing · by 31 Feb')
  await ui.unmount()

  // The day itself is not past; the day after is. A year is shown only when it is not this year.
  const lane = { id: 'a', outcome: 'x', endDay: '2026-11-12' }
  expect(endLabel(lane, THEN)).toBe('by 12 Nov')
  expect(endLabel(lane, THEN + 24 * 3600 * 1000)).toBe('by 12 Nov · past')
  expect(endLabel({ id: 'b', outcome: 'x', endDay: '2027-03-01' }, THEN)).toBe('by 1 Mar 2027')
  expect(endLabel({ id: 'c', outcome: 'x', endDay: '2026-11-01' }, THEN)).toBe('by 1 Nov · past')
  expect(endLabel({ id: 'd', outcome: 'x', endText: 'next spring' }, THEN)).toBe('by next spring')
  expect(parseFocus(todayWith('**Primary (N): x, Lane 2.**'), THEN).lanes[1]).toMatchObject({ endDay: '2026-10-18' })
})

test('FR-7 c3: a change in the Focus file shows within one minute (the 60-second tick)', async ($, on) => {
  const { ui, show } = await bandOnFile($, on, todayWith('**Primary (12 Nov, N): Coanda, Lane 2.**'))

  expect((await rowOf(ui)).primary).toBe('◎ Coanda')
  const changed = todayWith('**Primary (12 Nov, N): Write the tests, Lane 1.**')
  expect((await show(changed, 59_000)).primary).toBe('◎ Coanda')
  expect(await show(changed, 1_000)).toMatchObject({ primary: '◎ Write the tests', lane: expect.stringContaining('Bootcamp') })
  await ui.unmount()
})

test('FR-7 c4: a Lane id that matches no Lane, or no Lanes at all, shows the Primary alone', async ($, on) => {
  const { ui, show } = await bandOnFile($, on, todayWith('**Primary (12 Nov, N): Coanda, Lane 9.**'))
  expect(await rowOf(ui)).toEqual({ primary: '◎ Coanda', lane: '' })
  expect(await texts(ui)).toContain('No Lane set')
  expect(await show('## Today\n- **Primary (12 Nov, N): Coanda, Lane 2.**\n')).toEqual({ primary: '◎ Coanda', lane: '' })
  await ui.unmount()

  // The typed Lanes are used only when the file has none, and only an id that matches one shows (never renumbered).
  const typed = [{ id: 'own-abc', outcome: 'portfolio live', endDay: '2026-12-14' }]
  const laneLine = (laneId: string, fileLanes: { id: string; outcome: string }[]) =>
    rowsOf(bandModel(snap({ now: THEN, detailsOpen: true, setup: { ...SETUP_DONE, lanes: typed }, focus: { status: 'ok', primary: 'Coanda', laneId, lanes: fileLanes } }))).primary!.text[1]

  expect(laneLine('own-abc', [])).toBe('Lane: portfolio live · by 14 Dec')
  expect(laneLine('own-zzz', [])).toBe('No Lane set')
  expect(laneLine('own-abc', [{ id: 'lane-1', outcome: 'File lane' }])).toBe('No Lane set')
})

test('FR-7 c5: a closed Primary in the focus-md format reads "Closed HH:MM · no Primary set", with no Lane', async ($, on) => {
  const { ui } = await bandOnFile($, on, todayWith('**Primary (12 Nov, N): Coanda, Lane 2. CLOSED 12 Nov 14:05 (N): done.**'), false)

  // Closed: no goal to show, so the PRIMARY row says so and offers to set today's.
  expect(await rowOf(ui)).toEqual({ primary: '', lane: '' })
  expect(await texts(ui)).toContain('Closed 14:05 · no Primary set')
  expect(await keyOf(ui, 'Set')).toBe('primary-set')
  await ui.unmount()
})

// ---- Split from the old card test: decisions, guesses, NOW, reload --------------------------

const READY = { setup: { v: 1, doneAt: 1, focus: null }, files: {}, env: { HOME: '/home/n' } }
const ask = ($: Parameters<TestBody>[0], question: string, labels: string[], extra: object = {}) =>
  $.tool.call({ tool: 'mcp__coanda__ask_decision', question, options: labels.map(label => ({ label, consequence: `then ${label}` })), ...extra } as never)
const done = ($: Parameters<TestBody>[0], turnId: string, answer = '') => $.turn.complete({ answer, durationMs: 1, isAborted: false, turnId, reason: 'answer' })
const cardsIn = (saved: Record<string, unknown>) => (saved.cards as { items: Card[] } | undefined)?.items ?? []

test('a decision card: its options and consequences show, one press sends one message, "Later" brings the next', async ($, on) => {
  const { ui, sent, toasts, saved } = await bandOver($, on, READY)

  expect(JSON.stringify(await ask($, 'Band or panel?', ['Band', 'Panel'], { hard_to_undo: true }))).toContain('Question added')
  expect(toasts).toEqual(['New decision: Band or panel?'])
  // A bare "go" is refused in plain words and adds nothing.
  expect(JSON.stringify(await ask($, 'Ship?', ['Go', 'Wait']))).toContain('names no choice')
  expect(toasts).toHaveLength(1)

  expect((await ui.find({ type: 'Text', text: /^QUESTION$/ }))?.text).toBe('QUESTION')
  expect((await ui.find({ type: 'Text', text: /Band or panel/ }))?.text).toBe('Band or panel?')
  // The system's badge: a mark and words, padded as a pill.
  expect((await ui.find({ type: 'Text', text: /Hard to undo/ }))?.text).toBe('⚠ Hard to undo')
  // A consequence is one line under the buttons: the option's name, then what follows from it.
  expect((await ui.find({ type: 'Text', text: /^Band: then Band$/ }))?.text).toBe('Band: then Band')
  // The options, the quiet exit, the Primary row's Details: no "Something else", no generic "go".
  expect(await buttonsOf(ui)).toEqual(['Band', 'Panel', 'Later', 'Details'])
  // Only Coanda's row: the host's default drawing of it (an engine node) is not drawn under ours.
  expect(JSON.stringify(await ui.drawn())).not.toContain('"engine"')

  await ui.press({ key: (await keyOf(ui, 'Band'))! })
  expect(sent).toEqual(['Decision: Band or panel? → Band'])
  expect(cardsIn(saved)[0]).toMatchObject({ status: 'answered', answer: 'Band' })
  // "Sent" at once; nothing to press until Claude's turn ends, even when a new card arrives.
  expect((await ui.find({ type: 'Text', text: /^✓ / }))?.text).toBe('✓ Band')
  await ask($, 'Twice?', ['Once', 'Never'])
  expect(await keyOf(ui, 'Once')).toBeUndefined()
  await done($, 't1')
  expect((await ui.find({ type: 'Text', text: /Twice\?/ }))?.text).toBe('Twice?')

  // "Later" defers a card: the next open one comes forward; the count shows only above 1.
  await ui.press({ key: (await keyOf(ui, 'Later'))! })
  expect(cardsIn(saved).find(c => c.question === 'Twice?')).toMatchObject({ status: 'deferred' })
  expect(await ui.find({ type: 'Text', text: /Twice\?/ })).toBeUndefined()
  await ask($, 'First?', ['A', 'B'])
  await ask($, 'Second?', ['C', 'D'])
  expect((await ui.find({ type: 'Text', text: /WAITING/ }))?.text).toBe('QUESTION · 2 WAITING')
  expect(await ui.find({ type: 'Text', text: /Second\?/ })).toBeUndefined()
  await ui.press({ key: (await keyOf(ui, 'Later'))! })
  expect((await ui.find({ type: 'Text', text: /Second\?/ }))?.text).toBe('Second?')
  expect(await ui.find({ type: 'Text', text: /First\?/ })).toBeUndefined()
  expect(sent).toHaveLength(1)
  await ui.unmount()
})

test('typing in the prompt answers the open card in the person\'s own words (v3 rule 3)', async ($, on) => {
  const { ui, saved, sent } = await bandOver($, on, READY)

  await ask($, 'Band or panel?', ['Band', 'Panel'])
  await $.prompt.submit({ text: 'neither,  a pane on the side', wait: false, origin: { kind: 'composer' } } as never)
  expect(cardsIn(saved)[0]).toMatchObject({ status: 'answered', answer: 'neither, a pane on the side' })
  expect(await ui.find({ type: 'Text', text: /Band or panel/ })).toBeUndefined()
  expect(sent).toEqual(['neither,  a pane on the side'])
  await ui.unmount()
})

test('a guessed question is stamped inferred; a suggestion sends its prompt, "Not for me" clears it, typing clears it', async ($, on) => {
  const { ui, sent, model } = await bandOver($, on, READY)
  const question = () => ui.find({ type: 'Text', text: /Ship the filter fix/ })
  const guess = async (turnId: string) => {
    await done($, turnId, 'Fixed. Ship it?')
    await settle(async () => (await question()) !== undefined)
  }
  model.text = '{"moment":"question","question":"Ship the filter fix now?","suggestions":[{"label":"Ship it","prompt":"Ship the fix now."},{"label":"Something else","prompt":"x"}]}'

  await guess('t1')
  expect((await question())?.text).toBe('Ship the filter fix now?')
  expect((await ui.find({ type: 'Text', text: /^inferred$/ }))?.text).toBe('inferred')
  // "Something else" from the model is dropped: typing is the person's own answer.
  expect(await buttonsOf(ui)).toEqual(['Ship it', 'Not for me', 'Details'])

  await ui.press({ key: 'asked-dismiss' })
  expect(await question()).toBeUndefined()
  expect(sent).toEqual([])

  await guess('t2')
  await ui.press({ key: 'asked-0' })
  expect(sent).toEqual(['Ship the fix now.'])
  expect(await question()).toBeUndefined()

  await guess('t3')
  await $.prompt.submit({ text: 'not yet, wait', wait: false, origin: { kind: 'composer' } } as never)
  await settle(async () => (await question()) === undefined)
  expect(await question()).toBeUndefined()
  await ui.unmount()
})

test('NOW comes from the task list: "<step> · step N of M" while working, "Idle · <outcome>" once finished', async ($, on) => {
  // A Primary is set, so the status row shows (with none, the band is the "Set your Primary" step).
  const { ui } = await bandOver($, on, { setup: SETUP_FILE('/data/goals.md'), files: { '/data/goals.md': 'Ship the band\n' }, env: { HOME: '/home/n' } })

  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: [{ content: 'Scan', status: 'in_progress' }, { content: 'Build', status: 'pending' }] } as never)
  await $.tool.call({ tool: 'Edit', file_path: '/x/register.tsx' } as never)
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', advance: true } as never)
  const working = await $.ui.mount({ ...BAND, props: { ...BAND.props, isWorking: true } })
  expect((await working.find({ type: 'Text', text: /step 2 of 2/ }))?.text).toBe('Build · step 2 of 2')
  await working.unmount()

  expect((await ui.find({ type: 'Text', text: /^Idle/ }))?.text).toBe('Idle')
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', done: [2] } as never)
  expect((await ui.find({ type: 'Text', text: /^Idle/ }))?.text).toBe('Idle · Build')
  // A tool fact carries no stamp.
  expect(await ui.find({ type: 'Text', text: /^inferred$/ })).toBeUndefined()
  await ui.unmount()
})

test('a reload that eats turn.complete: the answer kept during the turn brings its question back at the next start', async ($, on) => {
  const { ui, model, restart } = await bandOver($, on, READY)
  model.answer = 'Here it is. Keep the new layout?'
  model.text = '{"moment":"question","question":"Keep the new layout?","next":"","suggestions":[{"label":"Keep it","prompt":"Keep the new layout."}]}'
  const question = () => ui.find({ type: 'Text', text: /Keep the new layout/ })

  const stream = $.turn.step({ turnId: 't4', index: 0, model: 'opus', messageCount: 1 })
  for await (const _ of stream) void _
  await stream.result
  expect(await question()).toBeUndefined()
  await restart()
  await settle(async () => (await question()) !== undefined)
  expect((await question())?.text).toBe('Keep the new layout?')
  await ui.unmount()
})

// ---- /coanda-demo: start from zero, back up, restore (v0.1.43) -----------------------------------

const MINE_CARD = cardOf('mine-1', { sessionId: 's1', question: 'My real question?' })
const MINE = {
  setup: SETUP_FILE('/real/FOCUS.md'),
  cards: { v: 1, items: [MINE_CARD] },
  primary: { v: 1, day: '2026-11-14', text: 'My real Primary', setAt: 5 },
}

test('/coanda-demo: backs up the three stored items, starts from zero with the lamp; leaving restores them exactly', async ($, on) => {
  const own = { setup: MINE.setup, docs: { cards: MINE.cards, primary: MINE.primary }, files: { '/real/FOCUS.md': '## Today\n- **Primary (14 Nov, N): real goal.**\n' }, env: { HOME: '/home/n' } }
  const { ui, saved, writes, commands } = await bandOver($, on, own)
  expect(await primaryOf(ui)).toBe('◎ real goal.')

  await $.command.run({ command: 'coanda-demo' } as never)
  // The three items are kept in a backup (a store key and a file in the demo folder) before anything is cleared.
  expect(saved.demoBackup).toMatchObject({ v: 1, setup: MINE.setup, cards: MINE.cards, primary: MINE.primary })
  const file = writes.find(w => w.path === '/home/n/.claude/plugins/data/coanda/demo/backup.json')
  expect(JSON.parse(file!.text)).toMatchObject({ setup: MINE.setup, cards: MINE.cards, primary: MINE.primary })
  // The band starts from zero: nothing stored, Setup shows (with the lamp), his goal and cards are hidden.
  expect(saved.setup).toBeUndefined()
  expect(saved.cards).toBeUndefined()
  expect(saved.primary).toBeUndefined()
  expect(await texts(ui)).toContain('SET UP YOUR GOALS')
  expect(await ui.find({ key: 'lamp-pull' })).toBeDefined()
  expect(await texts(ui)).not.toContain('real goal')
  expect(await texts(ui)).not.toContain('My real question?')

  // Leaving restores them exactly, and drops the backup.
  await ui.press({ key: 'demo-exit' })
  expect(saved.setup).toEqual(MINE.setup)
  expect(saved.cards).toEqual(MINE.cards)
  expect(saved.primary).toEqual(MINE.primary)
  expect(saved.demoBackup).toBeUndefined()
  expect(await primaryOf(ui)).toBe('◎ real goal.')
  expect(await texts(ui)).toContain('My real question?')
  // His goals file was only ever read, never written: every write went to the demo folder.
  expect(writes.length).toBeGreaterThan(0)
  expect(writes.every(w => w.path.startsWith('/home/n/.claude/plugins/data/coanda/demo/'))).toBe(true)
  expect(commands).toContain('coanda-demo')
  await ui.unmount()
})

test('/coanda-demo: an empty store is restored as empty (keys removed, not left as nulls)', async ($, on) => {
  const { ui, saved } = await bandOver($, on, { setup: undefined, files: {}, env: { HOME: '/home/n' } })

  await $.command.run({ command: 'coanda-demo' } as never)
  expect(saved.demoBackup).toMatchObject({ v: 1, setup: null, cards: null, primary: null })
  await ui.press({ key: 'demo-exit' })
  expect('setup' in saved || 'cards' in saved || 'primary' in saved || 'demoBackup' in saved).toBe(false)
  await ui.unmount()
})

test('/coanda-demo after a crash offers "Restore my data"; it never starts over the first backup', async ($, on) => {
  // A new session after a crash: the backup is still in the store, the demo's own data stands in the real keys.
  const backup = { v: 1, savedAt: 1, ...MINE }
  const demoSetup = SETUP_FILE('/demo/goals.md')
  const { ui, saved, toasts } = await bandOver($, on, { setup: demoSetup, docs: { demoBackup: backup }, files: {}, env: { HOME: '/home/n' } })
  expect(toasts.join('\n')).toContain('/coanda-demo')

  await $.command.run({ command: 'coanda-demo' } as never)
  expect(saved.demoBackup).toEqual(backup)
  expect(await ui.find({ key: 'demo-restore' })).toBeDefined()
  expect(saved.setup).toEqual(demoSetup)
  await ui.press({ key: 'demo-restore' })
  expect(saved.setup).toEqual(MINE.setup)
  expect(saved.cards).toEqual(MINE.cards)
  expect(saved.primary).toEqual(MINE.primary)
  expect(saved.demoBackup).toBeUndefined()
  await ui.unmount()
})

// ---- /coanda-demo step 2: the demo goals file and Reset to zero (v0.1.46) --------------------------

const DEMO_GOALS = '/home/n/.claude/plugins/data/coanda/demo/goals.md'

test('/coanda-demo: Setup proposes a demo goals file (his path is never offered); Reset to zero starts over, his data stays saved', async ($, on) => {
  const own = { setup: MINE.setup, docs: { cards: MINE.cards, primary: MINE.primary }, files: { '/real/FOCUS.md': '## Today\n- **Primary (14 Nov, N): real goal.**\n' }, env: { HOME: '/home/n' } }
  const { ui, saved, writes } = await bandOver($, on, own)

  await $.command.run({ command: 'coanda-demo' } as never)
  // Step 1 of Setup: no field for a path (so no real path can be typed), one button proposes the demo file.
  expect(await ui.findAll({ type: 'Input' })).toHaveLength(0)
  expect(await buttonsOf(ui)).toContain('Create a demo goals file')
  // The demo starts with no goals: the file is emptied, so Setup found nothing; the sample is not created yet.
  expect(writes.filter(w => w.path === DEMO_GOALS).every(w => w.text === '')).toBe(true)

  await ui.press({ key: 'lamp-pull' })
  await ui.press({ key: 'demo-file' })
  const file = writes.filter(w => w.path === DEMO_GOALS).at(-1)
  expect(file?.text).toContain('Lane 1')
  expect(saved.setup).toMatchObject({ focus: { kind: 'file', path: DEMO_GOALS } })
  // The demo file is now where Setup looks: its goals are shown to confirm.
  expect(await texts(ui)).toContain('Goal    write the first draft of the sample report')

  // Go through Setup, then Reset to zero: the stored demo items are cleared, the file rewritten, Setup is back with the lamp.
  await ui.press({ key: 'setup-keep' })
  expect(await primaryOf(ui)).toBeDefined()
  const before = writes.filter(w => w.path === DEMO_GOALS).length
  await ui.press({ key: 'demo-reset' })
  expect(writes.filter(w => w.path === DEMO_GOALS).length).toBe(before + 1)
  expect(writes.filter(w => w.path === DEMO_GOALS).at(-1)?.text).toBe('') // back to zero: no goals
  expect(await texts(ui)).toContain('A Goal is the one thing that counts today.')
  expect(saved.setup).toBeUndefined()
  expect(await texts(ui)).toContain('SET UP YOUR GOALS')
  expect(await ui.find({ key: 'lamp-pull' })).toBeDefined()
  // His own data is still in the backup, and leaving brings it back exactly.
  expect(saved.demoBackup).toMatchObject({ setup: MINE.setup, cards: MINE.cards, primary: MINE.primary })
  await ui.press({ key: 'demo-exit' })
  expect(saved.setup).toEqual(MINE.setup)
  expect(saved.cards).toEqual(MINE.cards)
  expect(saved.primary).toEqual(MINE.primary)
  expect(writes.every(w => w.path.startsWith('/home/n/.claude/plugins/data/coanda/demo/'))).toBe(true)
  await ui.unmount()
})

test('/coanda-demo: Setup looks only in the demo folder, never at his own ~/.claude/goals.md', async ($, on) => {
  const own = { setup: MINE.setup, docs: { cards: MINE.cards, primary: MINE.primary }, files: { [GOALS_PATH]: GOALS_TEXT, '/real/FOCUS.md': GOALS_TEXT }, env: { HOME: '/home/n' } }
  const { ui, reads } = await bandOver($, on, own)

  await $.command.run({ command: 'coanda-demo' } as never)
  expect(await texts(ui)).toContain('A Goal is the one thing that counts today.')
  expect(await texts(ui)).not.toContain('Ship the v0.1 install')
  await $.command.run({ command: 'coanda-setup' } as never)
  // Reads after the demo started: none of them is his goals file or his saved path.
  const afterStart = reads.slice(reads.lastIndexOf('/real/FOCUS.md') + 1)
  expect(afterStart).not.toContain(GOALS_PATH)
  await ui.unmount()
})

// ---- /coanda-demo step 3: sample questions, live (v0.1.48) --------------------------------------------

test('/coanda-demo: sample question buttons add a small choice, a big choice and a guessed question; a press sends nothing; leaving drops them', async ($, on) => {
  const own = { setup: MINE.setup, docs: { cards: { v: 1, items: [] }, primary: MINE.primary }, files: {}, env: { HOME: '/home/n' }, now: THEN }
  const { ui, saved, sent, clock } = await bandOver($, on, own)
  await $.command.run({ command: 'coanda-demo' } as never)
  await ui.press({ key: 'setup-skip' }) // Setup skipped: the plain band, with the strip

  // Small choice: a card (through addCard, so it is stored), two answers with their consequences, Later.
  await ui.press({ key: 'demo-ask-small' })
  expect(await texts(ui)).toContain('Rename fill2 to fillSafely?')
  expect(await texts(ui)).not.toContain('⚠ Hard to undo')
  expect(await buttonsOf(ui)).toEqual(expect.arrayContaining(['Rename to fillSafely', 'Keep fill2', 'Later']))
  expect((saved.cards as { items: unknown[] }).items).toHaveLength(1)
  // A press in the demo sends nothing to the chat: it shows "Sent" for a moment, then the band is back.
  await ui.press({ key: (await keyOf(ui, 'Keep fill2'))! })
  expect(sent).toEqual([])
  expect(await texts(ui)).toContain('✓ Keep fill2')
  await clock!.advance(2500)
  expect(await texts(ui)).not.toContain('Rename fill2 to fillSafely?')

  // Big choice: hard to undo.
  await ui.press({ key: 'demo-ask-big' })
  expect(await texts(ui)).toContain('Where should Lanes live?')
  expect(await texts(ui)).toContain('⚠ Hard to undo')

  // Guessed question: stamped inferred, and an answer sends nothing either.
  await ui.press({ key: 'demo-ask-guessed' })
  await ui.press({ key: (await keyOf(ui, 'Later'))! }) // the big card steps aside, the guess shows
  expect(await texts(ui)).toContain('Is the layout right now?')
  expect(await texts(ui)).toContain('inferred')
  await ui.press({ key: (await keyOf(ui, 'Yes'))! })
  expect(sent).toEqual([])

  // Leaving brings his cards back and none of the samples.
  await ui.press({ key: 'demo-exit' })
  expect(saved.cards).toEqual({ v: 1, items: [] })
  expect(await texts(ui)).not.toContain('Where should Lanes live?')
  await ui.unmount()
})

// ---- Stand-up nudge: 3 long runs in a row, a quiet line and "Not now" ---------------------------

const LONG = LONG_MS + 1_000
const NUDGE = /long runs in a row\. Good moment to stand up and stretch\./

test('stand-up: thresholds are the agreed ones (2 min, 5 min, 3 runs) unless FAST_CHECK is on', () => {
  expect(FAST_CHECK).toBe(false)
  expect([RUNS, LONG_MS, BREAK_MS]).toEqual([3, 120_000, 300_000])
})

test('stand-up: counting. Long runs add up; a short run, a long break or an abort change the streak as agreed', () => {
  const T = 10_000_000
  let log = NO_STANDUP
  log = noteRun(log, T, LONG, false)
  log = noteRun(log, T + LONG + 60_000, LONG, false)
  expect(log.streak).toBe(2)
  expect(nudgeShows(log, log.lastEndAt, false)).toBe(false)
  log = noteRun(log, log.lastEndAt + 60_000 + LONG, LONG, false)
  expect(log.streak).toBe(3)
  expect(nudgeShows(log, log.lastEndAt, false)).toBe(true)

  // An aborted turn leaves the log as it was.
  expect(noteRun(log, log.lastEndAt + 5_000, LONG, true)).toBe(log)
  // A short run in the middle resets the count.
  expect(noteRun(log, log.lastEndAt + 60_000 + 30_000, 30_000, false).streak).toBe(0)
  expect(noteRun(log, log.lastEndAt + 60_000 + LONG_MS, LONG_MS, false).streak).toBe(0)
  // A break longer than 5 minutes before the run starts the count again from one.
  expect(noteRun(log, log.lastEndAt + BREAK_MS + 1 + LONG, LONG, false).streak).toBe(1)
  // A break of exactly 5 minutes still counts as in a row.
  expect(noteRun(log, log.lastEndAt + BREAK_MS + LONG, LONG, false).streak).toBe(4)
})

test('stand-up: resting, the line goes after a 5 minute break; working, it stays while the streak stands', () => {
  const log = { streak: 3, lastEndAt: NOW }

  expect(nudgeShows(log, NOW + BREAK_MS, false)).toBe(true)
  expect(nudgeShows(log, NOW + BREAK_MS + 1, false)).toBe(false)
  expect(nudgeShows(log, NOW + 10 * BREAK_MS, true)).toBe(true)
})

test('stand-up: one muted line and one quiet link on the Resting and the Working row, inside the budget', () => {
  const log = { streak: 3, lastEndAt: NOW }

  for (const isWorking of [false, true]) {
    const model = bandModel(snap({ isWorking, standup: log }))
    const row = only(model)

    expect(row.note).toBe('3 long runs in a row. Good moment to stand up and stretch.')
    expect(labels(row)).toEqual(['~Not now'])
    expect(row.chip).toBeUndefined()
    expect(row.buttons[0]!.action).toEqual({ kind: 'standupDismiss' })
    expect(overBudget(model)).toEqual([])
  }

  // Not before the third run, and not over a question.
  expect(only(bandModel(snap({ standup: { streak: 2, lastEndAt: NOW } }))).note).toBeUndefined()
  expect(rowsOf(bandModel(snap({ asked: GUESS, standup: log }))).rows.every(r => r.note === undefined)).toBe(true)
  // With no Primary set the band asks for it ("Set your Primary", a step that needs the person), and the nudge waits.
  const noGoal = bandModel(snap({ focus: { status: 'none', primary: '', laneId: '', lanes: [] }, standup: log }))
  expect(rowsOf(noGoal).heading).toBe('Set your Primary')
  expect(rowsOf(noGoal).rows[0]!.note).toBeUndefined()
  expect(overBudget(noGoal)).toEqual([])
})

test('stand-up on screen: 3 long runs show the line; "Not now" hides it and the next line needs 3 more runs', async ($, on) => {
  // With a Primary set: without one the band asks for it ("Set your Primary") and the nudge waits.
  const { ui, clock } = await bandOver($, on, { setup: SETUP_FILE('/data/goals.md'), files: { '/data/goals.md': 'Ship the band\n' }, env: { HOME: '/home/n' }, now: 5_000_000 })
  const line = () => ui.find({ type: 'Text', text: NUDGE })
  // One run: it lasts `ms`, then the person rests `rest` before the next one.
  const finish = async (ms: number, rest = 60_000) => {
    await clock!.advance(ms)
    await $.turn.complete({ answer: '', durationMs: ms, isAborted: false, turnId: `r${Math.random()}`, reason: 'answer' })
    await clock!.advance(rest)
  }

  await finish(LONG)
  await finish(LONG)
  expect(await line()).toBeUndefined()
  await finish(LONG)
  expect((await line())?.text).toBe('3 long runs in a row. Good moment to stand up and stretch.')
  expect(await buttonsOf(ui)).toContain('Not now')

  await ui.press({ key: 'standup-dismiss' })
  expect(await line()).toBeUndefined()
  expect(await buttonsOf(ui)).not.toContain('Not now')

  await finish(LONG)
  await finish(LONG)
  expect(await line()).toBeUndefined()
  await finish(LONG)
  expect(await line()).toBeDefined()

  // A short run in the middle cuts the streak.
  await ui.press({ key: 'standup-dismiss' })
  await finish(LONG)
  await finish(5_000)
  await finish(LONG)
  await finish(LONG)
  expect(await line()).toBeUndefined()

  // The line leaves by itself once the person has rested longer than the break.
  await finish(LONG)
  expect(await line()).toBeDefined()
  await clock!.advance(BREAK_MS + 1)
  expect(await line()).toBeUndefined()
  await ui.unmount()
})

// ---- The shutdown question: after 18:30, once a day, tomorrow's first step ----------------------

const EVENING = new Date(2026, 10, 14, 18, 30).getTime() // Sat 14 Nov 2026, 18:30 local
const BEFORE = new Date(2026, 10, 14, 18, 29).getTime()
const MORNING = new Date(2026, 10, 15, 8, 30).getTime()
const ASKED = { v: 1 as const, day: '2026-11-14', text: 'Answer R4 of the CEO review', setAt: EVENING }

test('shutdown: shows from 18:30 on, not before, and only once a day (a skip counts too)', () => {
  expect(shutdownDue(BEFORE, null, false)).toBe(false)
  expect(shutdownDue(EVENING, null, false)).toBe(true)
  expect(shutdownDue(EVENING, { ...ASKED, text: '' }, false)).toBe(false)
  expect(shutdownDue(EVENING, ASKED, false)).toBe(false)
  // Yesterday's answer does not count for today; /coanda-shutdown forces it at any hour.
  expect(shutdownDue(EVENING, { ...ASKED, day: '2026-11-13' }, false)).toBe(true)
  expect(shutdownDue(BEFORE, ASKED, true)).toBe(true)

  expect(rowsOf(bandModel(snap({ now: BEFORE }))).moment).toBe('resting')
  const row = only(bandModel(snap({ now: EVENING })))
  expect(rowsOf(bandModel(snap({ now: EVENING }))).moment).toBe('shutdown')
  expect(row).toMatchObject({ part: 'shutdown', label: 'Shutdown', text: ["What's tomorrow's first step?"] })
  expect(row.inputs?.map(one => [one.key, one.placeholder, one.button?.label])).toEqual([['shutdown-input', 'Ship the v0.1 install', 'Save']])
  expect(labels(row)).toEqual(['~Skip'])
  expect(rowsOf(bandModel(snap({ now: EVENING }))).primary?.text).toEqual(['◎ Ship the v0.1 install'])
  // The same hour with the answer stored: the usual band.
  expect(rowsOf(bandModel(snap({ now: EVENING, shutdown: { doc: ASKED, draft: '', note: '', forced: false } }))).moment).toBe('resting')
})

test('shutdown: waits for a quiet turn; placeholder falls back; every state is within the budget', () => {
  const none = { focus: { status: 'none' as const, primary: '', laneId: '', lanes: [] } }
  expect(rowsOf(bandModel(snap({ now: EVENING, isWorking: true }))).moment).toBe('working')
  expect(rowsOf(bandModel(snap({ now: EVENING, cards: [cardOf('c1')] }))).moment).toBe('pick')
  expect(only(bandModel(snap({ now: EVENING, ...none }))).inputs?.[0]?.placeholder).toBe(SHUTDOWN_FALLBACK)
  for (const one of [snap({ now: EVENING }), snap({ now: EVENING, ...none }), snap({ now: EVENING, shutdown: { doc: null, draft: 'x', note: 'Write one step first, or skip.', forced: false } })])
    expect(overBudget(bandModel(one))).toEqual([])
  expect(only(bandModel(snap({ now: EVENING, shutdown: { doc: null, draft: '', note: 'Write one step first, or skip.', forced: false } }))).fieldNote).toBe('Write one step first, or skip.')
})

test('shutdown: an empty answer is refused, the rest is one short line', () => {
  expect(checkShutdown('   ')).toEqual({ ok: false, message: 'Write one step first, or skip.' })
  expect(checkShutdown('  Answer   R4\n of the review ')).toEqual({ ok: true, value: 'Answer R4 of the review' })
  expect(checkShutdown('x'.repeat(300))).toMatchObject({ ok: true })
})

test('shutdown: shows the next calendar day only, in the Primary area, until a Primary is set', () => {
  expect(nextDay('2026-11-30')).toBe('2026-12-01')
  expect(nextDay('2026-12-31')).toBe('2027-01-01')
  expect(carriedStep(MORNING, ASKED)).toBe('Answer R4 of the CEO review')
  expect(carriedStep(MORNING, { ...ASKED, text: '' })).toBe('')
  expect(carriedStep(EVENING, ASKED)).toBe('')
  expect(carriedStep(new Date(2026, 10, 16, 8, 30).getTime(), ASKED)).toBe('')

  const none = { focus: { status: 'none' as const, primary: '', laneId: '', lanes: [] } }
  const carried = '◎ Answer R4 of the CEO review · first step, from last night'
  const shutdown = { doc: ASKED, draft: '', note: '', forced: false }
  // No Primary yet: the line sits in the "Set your Primary" step (Resting) and replaces "no Primary set" (Primary row alone).
  expect(rowsOf(bandModel(snap({ now: MORNING, shutdown, ...none }))).rows[0]?.text).toEqual([carried])
  expect(rowsOf(bandModel(snap({ now: MORNING, shutdown, ...none, cards: [cardOf('c1')] }))).primary?.text).toEqual([carried])
  // A Primary for the day (file or typed) wins.
  expect(rowsOf(bandModel(snap({ now: MORNING, shutdown }))).primary?.text).toEqual(['◎ Ship the v0.1 install'])
})

test('shutdown: the question appears at 18:30, an empty Save is refused, Save keeps it, tomorrow it shows', async ($, on) => {
  const { ui, saved, clock } = await bandOver($, on, { ...READY_SETUP, now: BEFORE })

  expect(await texts(ui)).not.toContain('SHUTDOWN')
  await clock!.advance(60_000)
  expect(await texts(ui)).toContain('SHUTDOWN')
  expect(await texts(ui)).toContain("What's tomorrow's first step?")

  await ui.press({ key: 'shutdown-save' })
  expect(saved.shutdown).toBeUndefined()
  expect(await texts(ui)).toContain('Write one step first, or skip.')

  await ui.input({ key: 'shutdown-input', text: '  Answer R4  ', kind: 'submit' })
  expect(saved.shutdown).toMatchObject({ v: 1, day: '2026-11-14', text: 'Answer R4' })
  expect(await texts(ui)).not.toContain('SHUTDOWN')

  // Once per day: still no question later that evening.
  await clock!.advance(3600_000)
  expect(await texts(ui)).not.toContain('SHUTDOWN')

  // Next morning: the first step shows where the Primary goes, until one is set.
  await clock!.advance(13 * 3600_000)
  expect(await primaryOf(ui)).toBe('◎ Answer R4 · first step, from last night')
  await ui.input({ key: 'primary-input', text: 'Write the tests', kind: 'submit' })
  expect(await primaryOf(ui)).toBe('◎ Write the tests')
  await ui.unmount()
})

test('shutdown: Skip writes nothing down and the question stays away for the day; /coanda-shutdown shows it now', async ($, on) => {
  const { ui, saved } = await bandOver($, on, { ...READY_SETUP, now: EVENING })

  expect(await texts(ui)).toContain('SHUTDOWN')
  await ui.press({ key: 'shutdown-skip' })
  expect(saved.shutdown).toMatchObject({ day: '2026-11-14', text: '' })
  expect(await texts(ui)).not.toContain('SHUTDOWN')
  // Skipped, so nothing shows tomorrow.
  expect(carriedStep(MORNING, saved.shutdown as typeof ASKED)).toBe('')

  await $.command.run({ command: 'coanda-shutdown' } as never)
  expect(await texts(ui)).toContain('SHUTDOWN')
  await ui.press({ key: 'shutdown-skip' })
  expect(await texts(ui)).not.toContain('SHUTDOWN')
  await ui.unmount()
})
