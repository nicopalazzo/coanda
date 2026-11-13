import type { TurnStepChunk, TurnStepResult } from 'claude-code'
import type { TestBody } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'

import type { BandModel, BandRow, Card, Setup, Snapshot, Step } from '../types'
import { bandModel, overBudget } from './band'
import { close, supersede, toCard } from './cards'
import { checkFocusPath, checkLane, endLabel, focusSourceOf, laneText, parseFocus, parseFocusMd, parsePlain, primaryText, shortPrimary } from './focus'
import { claudeConfigDir } from './io'
import { parseNext, parseSuggestions, questionToShow, toAsked } from './next'
import { applyPlan, lastOutcomeStep, noteCall } from './plan'
import { blankOf } from './question'
import { clockTime, dayKey } from './time'

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
  setupStep: 0,
  setupDraft: { file: '', lane: '', end: '', fileNote: '', laneNote: '' },
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
  expect(JSON.stringify(setup)).toContain('Coanda asks once')
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
  expect(only(bandModel(snap({ cards: [cardOf('c1', { isHardToUndo: true })] }))).chip).toBe('hard to undo')
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
    rows: [{ part: 'now', text: ['x'], chip: 'hard to undo', buttons: [{ key: 'a', label: 'a', action: { kind: 'details' } }, { key: 'b', label: 'b', action: { kind: 'details' } }] }],
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
  // Another mod's band in the same slot.
  below?: true
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
  on('tool.call', () => ({ result: {} }))
  on('fs.read', (_, e) => {
    reads.push(e.path)
    const text = own.files[e.path]
    if (text === undefined) throw new Error('no such file')

    return { value: text }
  })
  on('fs.write', () => ({ value: undefined }))
  on('session.id', () => ({ value: 's1' }))
  on('store.get', (_, e) => ({ value: saved[e.key] ?? null }))
  on('store.set', (_, e) => (sets.push({ key: e.key, value: e.value }), (saved[e.key] = e.value), { value: undefined }))
  on('prompt.submit', (_, e) => (sent.push(e.text), { text: e.text }))
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
  if (own.below) {
    on('ui.render', ($, e) => {
      const { Text } = $.ui.resolve(e)

      return <Text>below</Text>
    })
  }
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

  return { ui, clock, reads, saved, sets, sent, toasts, model, restart: start }
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

const SETUP_FILE = (path: string) => ({ v: 1, doneAt: 1, focus: { kind: 'file', path } })

// ---- Adapted: the Focus source and the home directory ------------------------------------

test('FR-2 c3: a named file is read and its Primary shown', async ($, on) => {
  const { ui } = await bandOver($, on, { setup: SETUP_FILE('/data/goals.md'), files: { '/data/goals.md': 'Ship the intake form\nthen test it\n' }, env: { HOME: '/home/n' } })

  expect(await primaryOf(ui)).toBe('◎ Ship the intake form')
  await ui.unmount()
})

test('FR-2 c3: a file that cannot be read says so in plain words', async ($, on) => {
  const { ui } = await bandOver($, on, { setup: SETUP_FILE('/data/gone.md'), files: {}, env: { HOME: '/home/n' } })

  expect(await primaryOf(ui)).toBe('◎ Focus file not readable')
  await ui.unmount()
})

test('FR-2 c4: with no Focus source saved, the row reads "no Primary set" and no file is read', async ($, on) => {
  const { ui, reads } = await bandOver($, on, { setup: { v: 1, doneAt: 1, focus: null }, files: {}, env: { HOME: '/home/n' } })

  expect(await primaryOf(ui)).toBe('◎ no Primary set')
  expect(reads).toEqual([])
  await ui.unmount()
})

test('FR-2 c4: with no home directory the band still draws and reads no file', async ($, on) => {
  const { ui, reads } = await bandOver($, on, { setup: { v: 1, doneAt: 1, focus: null }, files: {}, env: {} })

  expect(await primaryOf(ui)).toBe('◎ no Primary set')
  expect(reads).toEqual([])
  await ui.unmount()
})

// ---- Adapted: the Setup moment -------------------------------------------------------------

test('FR-1 c1: with no saved setup the Setup moment shows and none of the usual rows', async ($, on) => {
  const { ui } = await bandOver($, on, { setup: undefined, files: {}, env: { HOME: '/home/n' } })

  expect(await texts(ui)).toContain('Coanda asks once')
  expect(await primaryOf(ui)).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^NOW$/ })).toBeUndefined()
  await ui.unmount()
})

test('FR-1 c2: finished or skipped, the usual rows show and the Setup moment does not come back', async ($, on) => {
  const { ui, restart, saved } = await bandOver($, on, { setup: undefined, files: {}, env: { HOME: '/home/n' } })

  await ui.press({ key: 'setup-next' }) // Skip: the only step
  expect(await primaryOf(ui)).toBe('◎ no Primary set')
  expect(await ui.find({ type: 'Text', text: /Coanda asks once/ })).toBeUndefined()
  expect(saved.setup).toMatchObject({ v: 1, lanes: [], focus: null })
  expect(typeof (saved.setup as { doneAt: unknown }).doneAt).toBe('number')
  // A reload (a new session start) reads the saved setup: still the usual rows.
  await restart()
  expect(await ui.find({ type: 'Text', text: /Coanda asks once/ })).toBeUndefined()
  expect(await primaryOf(ui)).toBeDefined()
  await ui.unmount()
})

test('FR-2 c1: a path starting with ~/ is stored absolute; its Primary shows after setup', async ($, on) => {
  const { ui, saved } = await bandOver($, on, { setup: undefined, files: { '/home/n/goals.md': 'Ship the intake form\n' }, env: { HOME: '/home/n' } })

  await ui.input({ key: 'setup-file', text: '~/goals.md', kind: 'change' })
  await ui.press({ key: 'setup-file-use' })
  expect(saved.setup).toMatchObject({ focus: { kind: 'file', path: '/home/n/goals.md' } })
  expect(await texts(ui)).toContain('Ship the intake form')
  await ui.press({ key: 'setup-next' })
  expect(await primaryOf(ui)).toBe('◎ Ship the intake form')
  await ui.unmount()
})

test('FR-2 c1: any other relative path is refused in plain words and nothing is saved', async ($, on) => {
  const { ui, saved, reads } = await bandOver($, on, { setup: undefined, files: {}, env: { HOME: '/home/n' } })

  await ui.input({ key: 'setup-file', text: 'goals.md', kind: 'change' })
  await ui.press({ key: 'setup-file-use' })
  expect(await texts(ui)).toContain('relative path')
  expect(saved.setup).toBeUndefined()
  expect(reads).not.toContain('goals.md')
  expect(checkFocusPath('../x.md', '/home/n')).toMatchObject({ ok: false })
  expect(checkFocusPath('~/x.md', null)).toMatchObject({ ok: false })
  await ui.unmount()
})

test('FR-2 c1: a file that cannot be read at setup says so in plain words', async ($, on) => {
  const { ui, saved } = await bandOver($, on, { setup: undefined, files: {}, env: { HOME: '/home/n' } })

  await ui.input({ key: 'setup-file', text: '/data/gone.md', kind: 'change' })
  await ui.press({ key: 'setup-file-use' })
  expect(await texts(ui)).toContain('That file cannot be read: /data/gone.md')
  expect(saved.setup).toBeUndefined()
  await ui.unmount()
})

test('FR-2 c2: 1 to 3 Lanes are kept, each with an outcome, an optional end date and its own id', async ($, on) => {
  const { ui, saved } = await bandOver($, on, { setup: undefined, files: {}, env: { HOME: '/home/n' } })
  const add = async (lane: string, end = '') => {
    await ui.input({ key: 'setup-lane', text: lane, kind: 'change' })
    await ui.input({ key: 'setup-end', text: end, kind: 'change' })
    await ui.press({ key: 'setup-lane-add' })
  }

  await add('portfolio live', '2026-12-14')
  await add('get hired', 'before spring')
  await add('write weekly')
  await add('a fourth one')
  const lanes = (saved.setup as { lanes: { id: string; outcome: string; endDay?: string; endText?: string }[] }).lanes
  expect(lanes.map(l => l.outcome)).toEqual(['portfolio live', 'get hired', 'write weekly'])
  expect(lanes[0]).toMatchObject({ endDay: '2026-12-14' })
  // The Setup list writes the end the way the Primary row does (this test's clock is in 1970, so the year shows).
  expect(await texts(ui)).toContain('1. portfolio live · by 14 Dec 2026')
  expect(await texts(ui)).toContain('2. get hired · by before spring')
  expect(lanes[1]).toMatchObject({ endText: 'before spring' })
  expect(new Set(lanes.map(l => l.id)).size).toBe(3)
  expect(await texts(ui)).toContain('3 Lanes is the most')
  // An id is never reused: remove the first, add another, no id repeats.
  const gone = lanes[0]!.id
  await ui.press({ key: 'setup-lane-remove-0' })
  await add('learn to draw')
  const after = (saved.setup as { lanes: { id: string }[] }).lanes
  expect(after).toHaveLength(3)
  expect(after.map(l => l.id)).not.toContain(gone)
  await ui.unmount()
})

test('FR-2 c2: a bare label such as "Lane 2" is refused with a hint to write its outcome', async ($, on) => {
  const { ui, saved } = await bandOver($, on, { setup: undefined, files: {}, env: { HOME: '/home/n' } })

  await ui.input({ key: 'setup-lane', text: 'Lane 2', kind: 'change' })
  await ui.press({ key: 'setup-lane-add' })
  expect(await texts(ui)).toContain('a label, not an outcome')
  // The hint's example carries no date, so a typed end date is not shown twice.
  expect(await texts(ui)).not.toContain('portfolio live by 14 Dec')
  expect(saved.setup).toBeUndefined()
  expect(checkLane('Proof', '', 'x', [])).toMatchObject({ ok: false })
  expect(checkLane('Lane 2: Proof', '', 'x', [])).toMatchObject({ ok: false })
  expect(checkLane('Lane 2: portfolio live', '', 'x', [])).toMatchObject({ ok: true })
  await ui.unmount()
})

test('FR-2 c3: the Lanes are kept across sessions', async ($, on) => {
  const { ui, restart } = await bandOver($, on, { setup: undefined, files: {}, env: { HOME: '/home/n' } })

  await ui.input({ key: 'setup-lane', text: 'portfolio live', kind: 'change' })
  await ui.press({ key: 'setup-lane-add' })
  // A new session before the setup was finished: the Setup moment is back with its Lane kept.
  await restart()
  expect(await texts(ui)).toContain('1. portfolio live')
  await ui.unmount()
})

test('FR-1: typed text survives a redraw while the ticks run', async ($, on) => {
  const { ui, restart } = await bandOver($, on, { setup: undefined, files: {}, env: { HOME: '/home/n' } })

  await ui.input({ key: 'setup-lane', text: 'half a Lane', kind: 'change' })
  await restart() // the session start redraws the band and re-reads the store
  expect(JSON.stringify(await ui.drawn())).toContain('half a Lane')
  await ui.unmount()
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
async function bandOnFile($: Parameters<TestBody>[0], on: Parameters<TestBody>[1], first: string) {
  const files: Record<string, string> = { '/data/focus.md': first }
  const made = await bandOver($, on, { setup: SETUP_FILE('/data/focus.md'), files, env: { HOME: '/home/n' }, now: THEN })
  // The Lane is behind "Details" (v3 rule 6): open it once; it stays open across redraws.
  expect(await rowOf(made.ui)).toMatchObject({ lane: '' })
  await made.ui.press({ key: 'primary-details' })
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
  const { ui } = await bandOnFile($, on, todayWith('**Primary (12 Nov, N): Coanda, Lane 2. CLOSED 12 Nov 14:05 (N): done.**'))

  expect(await rowOf(ui)).toEqual({ primary: '◎ Closed 14:05 · no Primary set', lane: '' })
  await ui.unmount()
})

// ---- Split from the old card test: decisions, guesses, NOW, reload --------------------------

const READY = { setup: { v: 1, doneAt: 1, focus: null }, files: {}, env: { HOME: '/home/n' } }
const ask = ($: Parameters<TestBody>[0], question: string, labels: string[], extra: object = {}) =>
  $.tool.call({ tool: 'mcp__coanda__ask_decision', question, options: labels.map(label => ({ label, consequence: `then ${label}` })), ...extra } as never)
const done = ($: Parameters<TestBody>[0], turnId: string, answer = '') => $.turn.complete({ answer, durationMs: 1, isAborted: false, turnId, reason: 'answer' })
const cardsIn = (saved: Record<string, unknown>) => (saved.cards as { items: Card[] } | undefined)?.items ?? []

test('a decision card: its options and consequences show, one press sends one message, "Later" brings the next', async ($, on) => {
  const { ui, sent, toasts, saved } = await bandOver($, on, { ...READY, below: true })

  expect(JSON.stringify(await ask($, 'Band or panel?', ['Band', 'Panel'], { hard_to_undo: true }))).toContain('Question added')
  expect(toasts).toEqual(['New decision: Band or panel?'])
  // A bare "go" is refused in plain words and adds nothing.
  expect(JSON.stringify(await ask($, 'Ship?', ['Go', 'Wait']))).toContain('names no choice')
  expect(toasts).toHaveLength(1)

  expect((await ui.find({ type: 'Text', text: /^QUESTION$/ }))?.text).toBe('QUESTION')
  expect((await ui.find({ type: 'Text', text: /Band or panel/ }))?.text).toBe('Band or panel?')
  expect((await ui.find({ type: 'Text', text: /hard to undo/ }))?.text).toBe('⚠ hard to undo')
  expect((await ui.find({ type: 'Text', text: /^then Band$/ }))?.text).toBe('then Band')
  // The options, the quiet exit, the Primary row's Details: no "Something else", no generic "go".
  expect(await buttonsOf(ui)).toEqual(['Band', 'Panel', 'Later', 'Details'])
  // Another mod's band draws below ours.
  expect((await ui.find({ type: 'Text', text: /^below$/ }))?.text).toBe('below')

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
  const { ui } = await bandOver($, on, READY)

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
