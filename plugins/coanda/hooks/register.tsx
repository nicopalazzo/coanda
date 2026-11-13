import type { EngineInterface, Register } from 'claude-code'

import type { BandAction, Pending, Snapshot } from '../types'
import { SETUP_STEPS, bandModel } from './band'
import { ASK_DECISION, answer, toCard } from './cards'
import { NO_FOCUS, UNREADABLE_FOCUS, checkFocusPath, checkLane, newLaneId, parseFocus, primaryText } from './focus'
import { homeDirectory, readFocusFile } from './io'
import { askReply } from './model'
import { questionToShow, toAsked } from './next'
import type { PlanInput } from './plan'
import { applyPlan, noteCall } from './plan'
import { blankOf } from './question'
import { renderBand } from './render'
import {
  getAsked,
  getCards,
  getDetailsOpen,
  getDoneLast,
  getFocus,
  getLastPrompt,
  getMoment,
  getNextUp,
  getPending,
  getSent,
  getSetupDraft,
  getSetupOpen,
  getSetupSeen,
  getSetupStep,
  getSteps,
  getSuggestions,
  updateAsked,
  updateDetailsOpen,
  updateDoneLast,
  updateFocus,
  updateLastPrompt,
  updateMoment,
  updateNextUp,
  updatePending,
  updateSent,
  updateSetupDraft,
  updateSetupOpen,
  updateSetupStep,
  updateSteps,
  updateSuggestions,
} from './state'
import { NO_SETUP, addCard, closeCard, deferCard, finishSetup, loadSetup, readFocusSource, restore, setFocus, setLanes } from './store'

// The shell's wiring: one handler per host event, each a short run of named calls; snapshot()
// gathers what the band reads; dispatch() is the only place a press is carried out.

const OWN_TOOLS = 'mcp__coanda__'

type State = Pick<EngineInterface, 'state'>

// Where the work stands after an answer: the moment, the question (inferred) and its likely answers,
// and the next step. A start comes from a fresh task list instead.
async function classify($: State & Pick<EngineInterface, 'model'>, p: Pending) {
  const got = await askReply($, p)
  await updateNextUp($, () => got.next)
  await updateDoneLast($, () => got.done)
  // A question Claude asks wins over a fresh task list: the start moment only fills the silence.
  const asked = toAsked(got)
  const now = asked !== null ? 'question' : p.isFresh ? 'start' : got.moment
  await updateMoment($, () => now)
  await updateSuggestions($, () => (now === 'start' ? [] : got.suggestions))
  await updateAsked($, () => asked)
  await updatePending($, () => null)
}

// Never wipe a draft: an empty box takes the text, a box with words gets it on a new line after them.
async function fillSafely($: Pick<EngineInterface, 'prompt'>, text: string) {
  const blank = blankOf(text)
  const hasDraft = (await $.prompt.read()).text.trim() !== ''
  const added = hasDraft ? `\n${text}` : text
  const shift = hasDraft ? 1 : 0
  const decorations = blank ? [{ start: blank.start + shift, end: blank.end + shift, bold: true, underline: true }] : undefined

  await $.prompt.fill({ text: added, mode: hasDraft ? 'append' : 'replace', ...(decorations ? { decorations } : {}) })
}

// What the Focus source says, read again; then the band redraws. With no source saved in setup,
// nothing is read from disk. A file that cannot be read becomes plain words in its row.
async function refreshFocus($: State & Pick<EngineInterface, 'fs' | 'store' | 'ui' | 'clock'>) {
  let found = NO_FOCUS
  try {
    const path = await readFocusSource($)
    if (path !== null) found = parseFocus(await readFocusFile($, path), await $.clock.now())
  } catch {
    found = UNREADABLE_FOCUS
  }
  await updateFocus($, () => found)
  $.ui.invalidate('ui.render')
}

// Acknowledge at once and refuse a second press while the first is on its way (one press, one message).
async function claim($: State, label: string) {
  if ((await getSent($)) !== null) return false
  await updateSent($, () => label)

  return true
}

// Everything the band reads, gathered once per draw. The fields no stage has filled yet carry their
// empty value.
async function snapshot($: State & Pick<EngineInterface, 'clock' | 'session'>, isWorking: boolean): Promise<Snapshot> {
  const asked = await getAsked($)

  return {
    now: await $.clock.now(),
    sessionId: await $.session.id(),
    isWorking,
    setup: (await getSetupSeen($)) ?? NO_SETUP,
    setupOpen: await getSetupOpen($),
    setupStep: await getSetupStep($),
    setupDraft: await getSetupDraft($),
    focus: await getFocus($),
    sessionPrimary: null,
    cards: await getCards($),
    asked,
    sent: await getSent($),
    reply: {
      moment: await getMoment($),
      isJudgment: false,
      question: asked?.text ?? '',
      done: await getDoneLast($),
      next: await getNextUp($),
      suggestions: await getSuggestions($),
    },
    plan: { steps: await getSteps($), planTurn: 0 },
    turn: 0,
    gate: null,
    lastActivity: 0,
    shelfInstalled: false,
    detailsOpen: await getDetailsOpen($),
  }
}

type Presser = Pick<EngineInterface, 'state' | 'store' | 'clock' | 'prompt' | 'ui' | 'fs' | 'env'>

// A suggested answer to the inferred question: one press, one message.
async function send($: Presser, text: string, label = text) {
  if (!(await claim($, label))) return
  await updateSuggestions($, () => [])
  await updateMoment($, () => 'other')
  await updateAsked($, () => null)
  await $.prompt.submit({ text, asUser: true })
}

// What the Setup moment says back under a field.
async function noteFile($: Presser, fileNote: string) {
  await updateSetupDraft($, d => ({ ...d, fileNote }))
}

async function noteLane($: Presser, laneNote: string) {
  await updateSetupDraft($, d => ({ ...d, laneNote }))
}

// "Use this file": the typed path is checked, the file read once to be sure, then kept in the setup.
async function setupUseFile($: Presser) {
  const checked = checkFocusPath((await getSetupDraft($)).file, await homeDirectory($))
  if (!checked.ok) return noteFile($, checked.message)

  let text: string
  try {
    text = await readFocusFile($, checked.value)
  } catch {
    return noteFile($, `That file cannot be read: ${checked.value}. Check the path, or skip.`)
  }

  await setFocus($, { kind: 'file', path: checked.value })
  await refreshFocus($)
  await noteFile($, `Kept. Your Primary there: ${primaryText(parseFocus(text))}.`)
}

// "Add Lane": 1 to 3 Lanes are kept, each with an id made once.
async function setupAddLane($: Presser) {
  const draft = await getSetupDraft($)
  const kept = (await getSetupSeen($))?.lanes ?? []
  const made = checkLane(draft.lane, draft.end, newLaneId(await $.clock.now(), Math.random()), kept)
  if (!made.ok) return noteLane($, made.message)

  await setLanes($, [...kept, made.value])
  await updateSetupDraft($, d => ({ ...d, lane: '', end: '', laneNote: '' }))
}

async function setupRemoveLane($: Presser, laneId: string) {
  await setLanes($, ((await getSetupSeen($))?.lanes ?? []).filter(one => one.id !== laneId))
}

// "Skip" or "Done": the next step shows; after the last one the setup is finished and stays so.
async function setupNext($: Presser) {
  const step = await getSetupStep($)
  if (step + 1 < SETUP_STEPS) return void (await updateSetupStep($, () => step + 1))

  await finishSetup($, await $.clock.now())
  await updateSetupOpen($, () => false)
  await updateSetupStep($, () => 0)
}

// The only place a press is carried out: one case per BandAction.
async function dispatch($: Presser, action: BandAction): Promise<void> {
  switch (action.kind) {
    case 'fill':
      return fillSafely($, action.text)
    case 'pick':
      if (!(await claim($, action.option))) return
      await closeCard($, action.card.id, 'answered', await $.clock.now(), action.option)
      await $.prompt.submit({ text: answer(action.card, action.option), asUser: true })
      return
    case 'later':
      return deferCard($, action.cardId, await $.clock.now())
    case 'send':
      return send($, action.text, action.label)
    case 'details':
      await updateDetailsOpen($, open => !open)
      return
    case 'setupType':
      await updateSetupDraft($, d => ({ ...d, [action.field]: action.value }))
      if (action.submit) await (action.field === 'file' ? setupUseFile($) : setupAddLane($))
      return
    case 'setupFile':
      return setupUseFile($)
    case 'setupAddLane':
      return setupAddLane($)
    case 'setupRemoveLane':
      return setupRemoveLane($, action.laneId)
    case 'setupNext':
      return setupNext($)
  }
}

export const register: Register = on => {
  // A fresh task list (nothing done yet) during this turn means the work is starting.
  let isFreshPlan = false

  on('session.start', async ($, e, next) => {
    const ran = await next(e)

    await $.tool.register(ASK_DECISION)
    await restore($)
    await loadSetup($)
    await refreshFocus($)
    $.clock.every(60000, () => void refreshFocus($))

    // A reload at the end of a turn loses its turn.complete: read the answer kept while it was written.
    const kept = await getPending($)
    if (kept !== null) void classify($, kept).catch(() => undefined)

    return ran
  })

  on('tool.call', { tool: `${OWN_TOOLS}ask_decision` }, async ($, e) => {
    const card = toCard(e, await $.clock.now(), await $.session.id())

    if (typeof card === 'string') return { result: card }

    await addCard($, card)
    $.ui.toast(`New decision: ${card.question}`)

    return { result: 'Question added to the band. End your turn; the answer comes as a user message.' }
  })

  // The app's own task list feeds NOW (a tool fact); every other call counts toward the running step.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const now = await $.clock.now()

    if (e.tool === 'mcp__ccd_turn__update_plan') {
      const input = e as unknown as PlanInput
      const after = await updateSteps($, all => applyPlan(all, input, now))
      if (Array.isArray(input.items) && after.every(s => s.status !== 'completed')) isFreshPlan = true
    } else if (!e.tool.startsWith(OWN_TOOLS)) {
      const file = (e as { file_path?: unknown }).file_path
      await updateSteps($, all => noteCall(all, typeof file === 'string' ? file : undefined))
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('prompt.submit', async ($, e, next) => {
    if (!e.turnId) {
      isFreshPlan = false
      void updateLastPrompt($, () => e.text)
      void updateSuggestions($, () => [])
      void updateMoment($, () => 'other')
      // Typing in the prompt is the person's own answer (v3 rule 3): it answers the open card the band
      // shows, if any, and always clears the inferred question. A press already closed its card.
      const sessionId = await $.session.id()
      const shown = questionToShow(await getCards($), sessionId, await getAsked($))
      if ((await getSent($)) === null && shown !== null && 'card' in shown) {
        await closeCard($, shown.card.id, 'answered', await $.clock.now(), e.text.replace(/\s+/g, ' ').trim())
      }
      void updateAsked($, () => null)
      void updateSent($, () => null)
    }

    return next(e)
  })

  // Claude's final text, kept as it is written (a step with no tool call ends the turn).
  on('turn.step', async function* ($, e, next) {
    if (e.agentId) return yield* next(e)
    const stream = next(e)
    stream.result.catch(() => undefined)
    for await (const chunk of stream) yield chunk
    const result = await stream.result

    if (result.answer.trim() && result.toolUses.length === 0) {
      const prompt = await getLastPrompt($)
      const isFresh = isFreshPlan && (await getSteps($)).every(s => s.status !== 'completed')
      await updatePending($, () => ({ answer: result.answer, prompt, isFresh }))
    }

    return result
  })

  // After each answer, the moment and its question are read; a reload that ate this event is caught at the next start.
  on('turn.complete', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId === undefined) await updateSent($, () => null)

    if (e.agentId === undefined && e.reason === 'answer' && e.answer.trim()) {
      const kept = await getPending($)
      const prompt = kept?.prompt ?? (await getLastPrompt($))
      const isFresh = kept?.isFresh ?? (isFreshPlan && (await getSteps($)).every(s => s.status !== 'completed'))
      void classify($, { answer: e.answer, prompt, isFresh }).catch(() => undefined)
    }

    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    // Other mods share this slot: theirs draws below ours, after a divider.
    const below = await next(e).catch(() => undefined)
    const model = bandModel(await snapshot($, e.props.isWorking))

    return renderBand(model, {
      ui: $.ui.resolve(e),
      ...(e.surface === 'desktop' ? { Svg: $.ui.resolve(e).Svg } : {}),
      columns: e.props.bodyColumns,
      below,
      dispatch: action => dispatch($, action),
    })
  }).catch(($, e, next) => {
    // Say why the band is missing instead of failing silently.
    $.ui.toast(`coanda band failed: ${JSON.stringify(next.error).slice(0, 300)}`)

    return next(e)
  })
}
