// Coanda's data types. Adapted from the first repository's types (13 Nov 2026): the Legacy, View,
// Decided and Mirror types are gone; a decision now has a lifecycle, each option its consequence,
// and each line says where it came from (v3 display rules, docs/handover-coanda.md).

// ---------------------------------------------------------------------------------------------
// Where a line comes from. The band stamps a line only when it is not a tool fact (v3 rule 2).
//   tool      read from a tool event (update_plan, ask_decision, AskUserQuestion)
//   agent     the agent's own claim, in its prose
//   inferred  guessed from prose by the one model call (next.ts)
// ---------------------------------------------------------------------------------------------
export type LineSource = 'tool' | 'agent' | 'inferred'

// ---------------------------------------------------------------------------------------------
// A decision (the card behind a question). Structured questions come first; a question lifted
// from prose is an Asked, marked inferred.
// ---------------------------------------------------------------------------------------------
//   open        waiting for the person
//   answered    a press or a typed answer closed it
//   deferred    "Later": out of the band until the person brings it back
//   superseded  a newer question on the same thing replaced it
//   cancelled   the agent or the turn withdrew it
export type DecisionStatus = 'open' | 'answered' | 'deferred' | 'superseded' | 'cancelled'

// An answer names the choice and what follows from it; there is no generic "go" button.
export type DecisionOption = { label: string; consequence: string }

export type Card = {
  id: string
  // The session that raised the card.
  sessionId: string
  question: string
  facts: string[]
  options: DecisionOption[]
  // Hard to undo: the only case that earns a risk chip (v3 rule 2).
  isHardToUndo: boolean
  // One line on what would make the recommendation wrong; '' when the agent gave none.
  couldBeWrongIf: string
  // Who asks, in a few words (e.g. "decide mod build").
  askedBy: string
  from: LineSource
  status: DecisionStatus
  askedAt: number
  // Set when status leaves 'open'.
  closedAt?: number
  // The option label pressed, or the person's own typed words.
  answer?: string
  // For 'superseded': the card that replaced this one.
  supersededBy?: string
}

export type StepStatus = 'pending' | 'in_progress' | 'completed'
export type Step = {
  content: string
  status: StepStatus
  startedAt?: number
  endedAt?: number
  files: string[]
  calls: number
}

export type Suggestion = { label: string; prompt: string }
// Claude's final answer, kept as it is written: a reload at the turn's end loses turn.complete,
// so the next start reads its question from here.
export type Pending = { answer: string; prompt: string; isFresh: boolean }
// The question this turn ended on, guessed from Claude's text: always inferred.
export type Asked = { text: string; options: Suggestion[]; from: 'inferred' }
// Where the work stands after a reply: starting something, a question to answer, or neither.
export type Moment = 'start' | 'question' | 'other'

export type PartId = 'primary' | 'lane' | 'now' | 'next' | 'question' | 'answers' | 'draftGate' | 'shelf'
export type Lane = { id: string; outcome: string; endDay?: string; endText?: string } // endDay: 'YYYY-MM-DD'
export type FocusResult = { status: 'ok' | 'none' | 'closed' | 'unreadable'; primary: string; laneId: string; lanes: Lane[]; closedAt?: string }
export type SessionPrimary =
  | null
  | { from: 'file'; hiddenLine?: string }
  | { from: 'band'; entryId: string; text: string; laneId: string; setAt: number; doneAt?: number }
export type Reply = { moment: Moment; isJudgment: boolean; question: string; done: string; next: string; suggestions: Suggestion[] }
// The first-thought step (stage 3, opt-in): opened, then written or skipped.
export type Gate = null | { id: string; openedAt: number; outcome: null | 'written' | 'skipped' }

// $.store documents
export type Setup = {
  v: 1
  doneAt: number | null
  focus: { kind: 'file'; path: string } | { kind: 'typed' } | null
  lanes: Lane[]
  partsOff: PartId[]
  rules: 'none' | 'added' | 'copied' | 'declined'
  counting: boolean
}
export type Cards = { v: 1; items: Card[] }
// What the person has typed in the Setup moment and not yet kept, and what the last press said back.
// Lives in $.state so a redraw keeps the text.
export type SetupDraft = { primary: string }
// What Claude proposes through `propose_goals`, shown in Setup stamped "inferred" until the person saves or drops it.
export type GoalsProposal = { goal: string; lanes: { name: string; outcome: string; by: string }[] }
// The Primary typed in the band, kept for the day it was set (`day`: dayKey, the machine's own time zone).
export type TypedPrimary = { v: 1; day: string; text: string; setAt: number }
export type DayEntry = { id: string; text: string; laneId: string; laneOutcome: string; sessionId: string; setAt: number; doneAt?: number; switchedAt?: number }
// The stand-up nudge's log: long runs in a row, and when the last run ended (hooks/standup.ts).
export type Standup = { streak: number; lastEndAt: number }
export type Day = { v: 1; days: Record<string, DayEntry[]> } // key: dayKey(ms)
export type Drafts = { v: 1; days: Record<string, { written: number; skipped: number }> }

// The one decision: register.tsx builds a Snapshot, bandModel(snapshot) answers a BandModel.
export type Snapshot = {
  now: number
  sessionId: string
  isWorking: boolean
  setup: Setup
  setupOpen: boolean
  setupDraft: SetupDraft
  focus: FocusResult
  // Where Setup looks for the goals (the saved path, else ~/.claude/goals.md; the demo's file in the demo).
  goalsPath: string
  // Setup has asked Claude (a message sent from the band) and waits for the goals file to fill.
  goalsAsking: boolean
  // Claude's proposal for the goals file (propose_goals), not saved yet; null when none.
  goalsProposal: GoalsProposal | null
  sessionPrimary: SessionPrimary
  cards: Card[]
  asked: Asked | null
  sent: string | null
  reply: Reply | null
  plan: { steps: Step[]; planTurn: number }
  turn: number
  gate: Gate
  lastActivity: number
  shelfInstalled: boolean
  detailsOpen: boolean
  // While /coanda-demo runs: the demo goals file Setup proposes instead of asking for a path.
  demoGoals?: string
  // When this run started (ms), or null when unknown: Working breathes after 30 s of it.
  workingSince: number | null
  standup: Standup
}

// A press is data; dispatch() in register.tsx is the only place one is carried out.
export type BandAction =
  | { kind: 'fill'; text: string } // text into the prompt box; never wipes a draft
  | { kind: 'pick'; card: Card; option: string } // an option of a decision card
  | { kind: 'later'; cardId: string } // the quiet exit on a decision card: deferred
  | { kind: 'send'; text: string; label: string } // a suggested answer
  | { kind: 'dismiss' } // "Not for me" on a guessed question: the guess is dropped, nothing is sent
  | { kind: 'standupDismiss' } // "Not now" on the stand-up line: hides it and resets the count
  | { kind: 'details' } // the Primary row's "Details": the "done when" line and the Lane
  // The Setup moment. `value` is what the field holds; `submit` is Enter in the field.
  | { kind: 'setupType'; field: 'primary'; value: string; submit?: true }
  | { kind: 'primarySet' } // "Set" after the Primary field: today's Primary, typed in the band
  | { kind: 'demoFile' } // the demo: create the demo goals file and keep it as the goals file
  // A message from the band to Claude about the goals file: set it up, find the goals in my files, change them, or fix an unreadable file.
  | { kind: 'goalsAsk'; ask: 'setup' | 'find' | 'change' | 'fix' }
  // The proposal Setup shows: save it (Claude writes the file), change it (talk it over), or drop it.
  | { kind: 'goalsProposal'; what: 'save' | 'revise' | 'drop' }
  | { kind: 'goalsKeep' } // "Looks right": the goals file found is kept as the goals file, Setup is finished
  | { kind: 'setupSkip' } // "Skip for now": Setup is finished without keeping anything
// 'link' is the one quiet exit, drawn as a text link (v3 rule 4). `detail` is the second line under
// an answer: what follows from it (an option's consequence).
export type BandButton = { key: string; label: string; variant?: 'primary' | 'secondary' | 'plain' | 'link'; detail?: string; action: BandAction }
// Which v3 moment a 'rows' model is, so tests and render can tell without reading the rows.
export type BandMoment = 'sent' | 'pick' | 'guessed' | 'working' | 'resting' | 'quiet'
export type BandModel =
  | { kind: 'hidden' }
  // Setup is one step with a heading (D4): what it finds in the goals file, drawn on the placed grid.
  | { kind: 'setup'; heading: string; rows: BandRow[] }
  | { kind: 'gate'; buttons: BandButton[] }
  // `heading`: the name of a step that needs the person, drawn bold on its own row above the frame
  // (band-rebuild-plan.md, D4); none for the always-there area.
  | { kind: 'rows'; moment: BandMoment; rows: BandRow[]; primary?: BandRow; heading?: string }
// `source` is set only when the row is not a tool fact; `chip` only when hard to undo (v3 rule 2).
export type BandRow = {
  part: PartId | 'setup' | 'sent'
  label?: string
  text: string[]
  note?: string // one quiet muted line beside the row's quiet link (the stand-up nudge)
  source?: Exclude<LineSource, 'tool'> | 'stale'
  chip?: 'Hard to undo'
  // Working only: show the breathing circle and its caption beside the line.
  breathe?: true
  inputs?: BandInput[]
  buttons: BandButton[]
}
// `submitLabel`: what Enter does, drawn by the host beside the field (one way to submit).
// `button`: the field's submit, drawn as a button element right after it (band-mapping.md, 12).
export type BandInput = { key: string; kind: 'text' | 'select'; value: string; options?: string[]; placeholder?: string; submitLabel?: string; button?: { key: string; label: string; action: BandAction }; action: BandAction }

declare module 'claude-code' {
  interface PluginState {
    coanda: {
      cards: Card[]
      focus: FocusResult
      steps: Step[]
      suggestions: Suggestion[]
      moment: Moment
      asked: Asked | null
      nextUp: string
      doneLast: string
      pending: Pending | null
      sent: string | null
      lastPrompt: string
      setupSeen: Setup | null
      setupOpen: boolean
      setupDraft: SetupDraft
      goalsAsking: boolean
      goalsProposal: GoalsProposal | null
      detailsOpen: boolean
      typedPrimary: TypedPrimary | null
      workStart: number | null
      specimen: boolean
      demo: number | null
      demoMode: 'off' | 'on' | 'offer'
      grid: boolean
      lab: boolean
      labPresses: number
      labPosts: number
      labLit: boolean
      lamp: 'off' | 'dark' | 'playing' | 'revealing'
      stage: boolean
      stagePlaying: boolean
      stagePlays: number
      stageOver: number
      stageUnder: number
      light: boolean
      lightLit: boolean
      standup: Standup
    }
  }
}
