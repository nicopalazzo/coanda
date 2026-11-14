import type { EngineInterface, Register } from 'claude-code'

import type { BandAction, Pending, Snapshot } from '../types'
import { BREATHE_AFTER_MS, bandModel } from './band'
import { ASK_DECISION, answer, toCard } from './cards'
import { NO_FOCUS, UNREADABLE_FOCUS, goalsState, parseFocus } from './focus'
import { PROPOSE_GOALS, goalsMessage, proposalMessage, toProposal } from './goals-ask'
import { goalsFile, readFocusFile } from './io'
import { askReply } from './model'
import { questionToShow, toAsked } from './next'
import type { PlanInput } from './plan'
import { applyPlan, noteCall } from './plan'
import { blankOf } from './question'
import { dayKey } from './time'
import { renderDemo, renderDemoOffer, renderDemoStrip } from './demo'
import { addSample, backupFound, demoFolder, demoGoalsPath, resetDemo, restoreMine, startDemo, writeDemoGoals } from './demo-run'
import { renderBand, renderSpecimen } from './render'
import { renderGrid } from './grid'
import { renderLab } from './lab'
import { COVER_MS, LAMP_MIN_ROWS, LAMP_MS, LAMP_ROWS, renderLamp } from './lamp'
import { renderLight } from './light'
import { REVEAL_MS, renderStage } from './stage'
import {
  getGrid,
  updateGrid,
  getLab,
  updateLab,
  getLabPresses,
  updateLabPresses,
  getLabPosts,
  updateLabPosts,
  getLabLit,
  getLamp,
  updateLamp,
  getStage,
  updateStage,
  getStagePlaying,
  updateStagePlaying,
  getStagePlays,
  updateStagePlays,
  getStageOver,
  updateStageOver,
  getStageUnder,
  updateStageUnder,
  getLight,
  updateLight,
  getLightLit,
  updateLightLit,
  updateLabLit,
  getAsked,
  getCards,
  getDetailsOpen,
  getGoalsAsking,
  updateGoalsAsking,
  getGoalsProposal,
  updateGoalsProposal,
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
  getSteps,
  getDemo,
  getDemoMode,
  getSpecimen,
  getSuggestions,
  getTypedPrimary,
  getWorkStart,
  updateWorkStart,
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
  updateSteps,
  updateDemo,
  updateDemoMode,
  updateSpecimen,
  updateSuggestions,
  NO_DRAFT,
} from './state'
import { NO_SETUP, addCard, closeCard, deferCard, finishSetup, loadSetup, loadTypedPrimary, readFocusSource, restore, setFocus, setTypedPrimary } from './store'

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

// Where the goals are read from: the path saved in an earlier setup, else the one goals file
// (~/.claude/goals.md); while the demo runs, only the demo folder's file, never the person's own.
// `isSaved` is false for the default, which may simply not exist yet.
async function goalsSource($: State & Pick<EngineInterface, 'store' | 'env'>): Promise<{ path: string | null; isSaved: boolean }> {
  if ((await getDemoMode($)) === 'on') return { path: await demoGoalsPath($), isSaved: false }

  const saved = await readFocusSource($)
  if (saved !== null) return { path: saved, isSaved: true }

  try {
    return { path: await goalsFile($), isSaved: false }
  } catch {
    return { path: null, isSaved: false }
  }
}

// What the goals file says, read again; then the band redraws. A saved path that cannot be read, or
// a goals file that exists and cannot be read, becomes plain words; a goals file that is not there
// yet is "nothing found", not an error.
async function refreshFocus($: State & Pick<EngineInterface, 'fs' | 'store' | 'ui' | 'clock' | 'env'>) {
  let found = NO_FOCUS
  try {
    const { path, isSaved } = await goalsSource($)
    if (path !== null && (isSaved || (await $.fs.exists(path)))) found = parseFocus(await readFocusFile($, path), await $.clock.now())
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
async function snapshot($: State & Pick<EngineInterface, 'clock' | 'session' | 'env' | 'store'>, isWorking: boolean): Promise<Snapshot> {
  const asked = await getAsked($)
  const now = await $.clock.now()
  // The Primary typed in the band counts only on the day it was set.
  const typed = await getTypedPrimary($)
  const sessionPrimary: Snapshot['sessionPrimary'] =
    typed !== null && typed.day === dayKey(now) ? { from: 'band', entryId: '', text: typed.text, laneId: '', setAt: typed.setAt } : null

  return {
    now,
    sessionId: await $.session.id(),
    isWorking,
    ...((await getDemoMode($)) === 'on' ? { demoGoals: await demoGoalsPath($) } : {}),
    setup: (await getSetupSeen($)) ?? NO_SETUP,
    setupOpen: await getSetupOpen($),
    setupDraft: await getSetupDraft($),
    focus: await getFocus($),
    goalsPath: (await goalsSource($)).path ?? '',
    goalsAsking: await getGoalsAsking($),
    goalsProposal: await getGoalsProposal($),
    sessionPrimary,
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
    workingSince: await getWorkStart($),
  }
}

type Presser = Pick<EngineInterface, 'state' | 'store' | 'clock' | 'prompt' | 'ui' | 'fs' | 'env'>

// Sends the person's message and does not wait for it: the docs call submit as `void`, and a turn of its own
// starts "once the session is idle", so waiting would hold the band's handler for the whole turn (seen 14 Nov:
// presses made meanwhile showed only after the next message). A refusal is dropped; the band was already updated.
function submitAndGo($: Pick<EngineInterface, 'prompt'>, text: string) {
  void $.prompt.submit({ text, asUser: true }).catch(() => undefined)
}

// A suggested answer to the inferred question: one press, one message.
async function send($: Presser, text: string, label = text) {
  if (!(await claim($, label))) return
  await updateSuggestions($, () => [])
  await updateMoment($, () => 'other')
  await updateAsked($, () => null)
  if ((await getDemoMode($)) === 'on') return demoSent($)
  submitAndGo($, text)
}

// In the demo a press sends nothing to the chat: "Sent" shows for a moment, then the band is back.
async function demoSent($: Presser) {
  $.clock.after(2000, async () => {
    await updateSent($, () => null)
    $.ui.invalidate('ui.render')
  })
}

// The demo's "Create a demo goals file": written in the demo folder, then kept as the goals file.
async function demoCreateFile($: Presser) {
  const path = await writeDemoGoals($)
  await setFocus($, { kind: 'file', path })
  await refreshFocus($)
}

// "Set": today's Primary, typed in the band; kept for today, the field emptied.
async function setPrimary($: Presser) {
  const text = (await getSetupDraft($)).primary.replace(/\s+/g, ' ').trim().slice(0, 120)
  if (text === '') return

  const now = await $.clock.now()
  await setTypedPrimary($, text, dayKey(now), now)
  await updateSetupDraft($, d => ({ ...d, primary: '' }))
}

// Setup is over: it stays closed. Used by "Looks right" and "Skip for now".
async function finishSetupMoment($: Presser) {
  await finishSetup($, await $.clock.now())
  await updateGoalsAsking($, () => false)
  await updateGoalsProposal($, () => null)
  await updateLamp($, () => 'off')
  await updateSetupOpen($, () => false)
}

// A button that asks Claude about the goals file: the message goes out as the person's own, and the band
// shows "Asking Claude" until the goals file has goals again (turn.complete reads it).
async function goalsAsk($: Presser, ask: 'setup' | 'find' | 'change' | 'fix') {
  if (await getGoalsAsking($)) return

  const { path } = await goalsSource($)
  if (path === null) return

  await updateGoalsAsking($, () => true)
  $.ui.invalidate('ui.render')
  // In the demo, Claude looks only in the demo folder.
  const onlyIn = (await getDemoMode($)) === 'on' ? await demoFolder($) : undefined
  submitAndGo($, goalsMessage(ask, path, onlyIn))
}

// Save these / Change / Not these on Claude's proposal. Saving and changing go to Claude (D3: Coanda only reads
// the file); the band waits ("Asking Claude") until the file holds the goals.
async function goalsProposal($: Presser, what: 'save' | 'revise' | 'drop') {
  const proposal = await getGoalsProposal($)
  if (proposal === null) return

  await updateGoalsProposal($, () => null)
  if (what === 'drop') return

  const { path } = await goalsSource($)
  if (path === null) return

  await updateGoalsAsking($, () => true)
  $.ui.invalidate('ui.render')
  submitAndGo($, proposalMessage(what, path, proposal))
}

// "Looks right": the goals file found is kept as the goals file, then Setup is finished.
async function goalsKeep($: Presser) {
  const { path } = await goalsSource($)
  if (path === null) return

  await setFocus($, { kind: 'file', path })
  await refreshFocus($)
  await finishSetupMoment($)
}

// The only place a press is carried out: one case per BandAction.
async function dispatch($: Presser, action: BandAction): Promise<void> {
  switch (action.kind) {
    case 'fill':
      return fillSafely($, action.text)
    case 'pick':
      if (!(await claim($, action.option))) return
      await closeCard($, action.card.id, 'answered', await $.clock.now(), action.option)
      if ((await getDemoMode($)) === 'on') return demoSent($)
      submitAndGo($, answer(action.card, action.option))
      return
    case 'later':
      return deferCard($, action.cardId, await $.clock.now())
    case 'send':
      return send($, action.text, action.label)
    case 'dismiss':
      await updateSuggestions($, () => [])
      await updateMoment($, () => 'other')
      await updateAsked($, () => null)
      return
    case 'details':
      await updateDetailsOpen($, open => !open)
      return
    case 'setupType':
      await updateSetupDraft($, d => ({ ...d, [action.field]: action.value }))
      if (action.submit) await setPrimary($)
      return
    case 'primarySet':
      return setPrimary($)
    case 'demoFile':
      return demoCreateFile($)
    case 'goalsAsk':
      return goalsAsk($, action.ask)
    case 'goalsProposal':
      return goalsProposal($, action.what)
    case 'goalsKeep':
      return goalsKeep($)
    case 'setupSkip':
      return finishSetupMoment($)
  }
}

export const register: Register = on => {
  // A fresh task list (nothing done yet) during this turn means the work is starting.
  let isFreshPlan = false

  on('session.start', async ($, e, next) => {
    const ran = await next(e)

    await $.tool.register(ASK_DECISION)
    await $.tool.register(PROPOSE_GOALS)
    await restore($)
    await loadSetup($)
    await updateGoalsAsking($, () => false)
    // Setup is about to show for the first time: it opens with the lamp.
    if (((await getSetupSeen($)) ?? NO_SETUP).doneAt === null) await updateLamp($, () => 'dark')
    await loadTypedPrimary($)
    // Claude closed in the middle of a demo: the person's data is in the backup until it is restored.
    if ((await getDemoMode($)) === 'off' && (await backupFound($))) $.ui.toast('Your Coanda data is saved from a demo. Run /coanda-demo to restore it.')
    await refreshFocus($)
    $.clock.every(60000, () => void refreshFocus($))
    await $.command.register({ name: 'coanda-setup', description: "Open Coanda's Setup at step 1: your goals file and your Lanes" })
    await $.command.register({ name: 'coanda-specimen', description: 'Show or hide every drawing option of the band (for design checks)' })
    await $.command.register({ name: 'coanda-demo', description: 'Walk through every screen of the band with example data, to correct each one live' })
    await $.command.register({ name: 'coanda-grid', description: 'Show or hide the grid page: rulers in cells, spacing steps, text sizes, contrast (for design checks)' })

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

  // Claude's proposal for the goals: shown in Setup (which opens if it was closed), saved only when the person agrees.
  on('tool.call', { tool: `${OWN_TOOLS}propose_goals` }, async ($, e) => {
    const proposal = toProposal(e)
    if (typeof proposal === 'string') return { result: proposal }

    await updateGoalsProposal($, () => proposal)
    await updateGoalsAsking($, () => false)
    await updateSetupOpen($, () => true)
    $.ui.invalidate('ui.render')

    return { result: 'Proposal shown in the band. End your turn; if the user presses "Save these" you get a message to write the file.' }
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
      // A new run: the band breathes once it has lasted BREATHE_AFTER_MS. One redraw is asked for at that
      // moment; the render rechecks the clock and isWorking, so a timer left over from a finished run draws nothing.
      const started = await $.clock.now()
      void updateWorkStart($, () => started)
      $.clock.after(BREATHE_AFTER_MS, () => $.ui.invalidate('ui.render'))
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
    if (e.agentId === undefined) {
      await updateSent($, () => null)
      await updateWorkStart($, () => null)
    }
    // Claude's turn ended after Setup asked it: read the goals file; "Asking Claude" goes once it holds goals or is unreadable.
    if (e.agentId === undefined && (await getGoalsAsking($))) {
      await refreshFocus($)
      if (goalsState(await getFocus($)) !== 'nothing') await updateGoalsAsking($, () => false)
      $.ui.invalidate('ui.render')
    }

    if (e.agentId === undefined && e.reason === 'answer' && e.answer.trim()) {
      const kept = await getPending($)
      const prompt = kept?.prompt ?? (await getLastPrompt($))
      const isFresh = kept?.isFresh ?? (isFreshPlan && (await getSteps($)).every(s => s.status !== 'completed'))
      void classify($, { answer: e.answer, prompt, isFresh }).catch(() => undefined)
    }

    return ran
  })

  // /coanda-setup: Setup shows again, over whatever the band showed, until "Looks right" or "Skip for now".
  // What was kept stays; the goals file is read again so Setup shows what is there now.
  on('command.run', { command: 'coanda-setup' }, async $ => {
    await updateSetupDraft($, () => NO_DRAFT)
    await updateSetupOpen($, () => true)
    await updateGoalsAsking($, () => false)
    await updateLamp($, () => 'dark')
    await refreshFocus($)
    $.ui.invalidate('ui.render')

    return { text: 'Setup is open above the prompt.' }
  })

  // /coanda-demo: the real flow from zero. The person's data is backed up and cleared, then restored when the demo
  // ends. Run again to leave. If a backup is found with the demo not running (Claude closed), it offers to restore.
  on('command.run', { command: 'coanda-demo' }, async $ => {
    if ((await getDemoMode($)) === 'on') {
      const wrong = await restoreMine($)
      if (wrong.length > 0) return { text: `Your data did not come back the same for: ${wrong.join(', ')}. The backup is kept; nothing was removed.` }
      await updateDemo($, () => null)
      await refreshFocus($)

      return { text: 'Demo off. Your data is back.' }
    }

    if (await backupFound($)) {
      await updateDemoMode($, () => 'offer')
      $.ui.invalidate('ui.render')

      return { text: 'Your data is saved from an earlier demo. Press "Restore my data" above the prompt.' }
    }

    await startDemo($)
    $.ui.invalidate('ui.render')

    return { text: 'Demo on: Setup starts from zero. Your own data is saved and comes back when you exit the demo.' }
  })

  // /coanda-specimen: a design check, on or off. While on, the band draws the specimen only.
  on('command.run', { command: 'coanda-specimen' }, async $ => {
    const isOn = await updateSpecimen($, was => !was)
    $.ui.invalidate('ui.render')

    return { text: isOn ? 'Specimen on: the band shows every drawing option. Run /coanda-specimen again to hide it.' : 'Specimen off.' }
  })

  // /coanda-stage: the overlay spike, on or off. Switching it off ends any playing light.
  on('command.run', { command: 'coanda-stage' }, async $ => {
    const isOn = await updateStage($, was => !was)
    if (!isOn) await updateStagePlaying($, () => false)
    $.ui.invalidate('ui.render')

    return { text: isOn ? 'Stage on: the band shows the stage spike. Run /coanda-stage again to hide it.' : 'Stage off.' }
  })

  // /coanda-light: the lamp alone, on or off. Switching it off puts the lamp back to unlit.
  on('command.run', { command: 'coanda-light' }, async $ => {
    const isOn = await updateLight($, was => !was)
    if (!isOn) await updateLightLit($, () => false)
    $.ui.invalidate('ui.render')

    return { text: isOn ? 'Light on: the band shows the lamp. Run /coanda-light again to hide it.' : 'Light off.' }
  })

  // L2b: a Client's click, posted as plain data. It is input, not a fact: only the exact shape counts.
  on('ui.message', { element: 'l2b' }, async ($, e) => {
    const d = e.data as { kind?: unknown } | null

    if (typeof d === 'object' && d !== null && d.kind === 'press') {
      await updateLabPosts($, n => n + 1)
      $.ui.invalidate('ui.render')
    }

    return {}
  })

  // /coanda-lab: host-capability tests, on or off. While on, the band draws them only.
  on('command.run', { command: 'coanda-lab' }, async $ => {
    const isOn = await updateLab($, was => !was)
    $.ui.invalidate('ui.render')

    return { text: isOn ? 'Lab on: the band shows the capability tests. Run /coanda-lab again to hide it.' : 'Lab off.' }
  })

  // /coanda-grid: the measuring page, on or off. While on, the band draws it only.
  on('command.run', { command: 'coanda-grid' }, async $ => {
    const isOn = await updateGrid($, was => !was)
    $.ui.invalidate('ui.render')

    return { text: isOn ? 'Grid on: the band shows the grid page. Run /coanda-grid again to hide it.' : 'Grid off.' }
  })

  // This hook hears Coanda's own row of the band only (the host asks each plugin for its row and
  // stacks them), so the host's default drawing of the row (`next(e)`) is not drawn under ours.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    if (await getStage($)) {
      return renderStage(
        { ui: $.ui.resolve(e), columns: e.props.bodyColumns, dispatch: async () => undefined },
        {
          plays: await getStagePlays($),
          isPlaying: await getStagePlaying($),
          over: await getStageOver($),
          under: await getStageUnder($),
          onPlay: async () => {
            await updateStagePlays($, n => n + 1)
            await updateStagePlaying($, () => true)
            $.ui.invalidate('ui.render')
            // One timer, once: the dark layer is removed when the light has finished, so it cannot block the band.
            $.clock.after(REVEAL_MS, async () => {
              await updateStagePlaying($, () => false)
              $.ui.invalidate('ui.render')
            })
          },
          onOver: async () => {
            await updateStageOver($, n => n + 1)
            $.ui.invalidate('ui.render')
          },
          onUnder: async () => {
            await updateStageUnder($, n => n + 1)
            $.ui.invalidate('ui.render')
          },
        },
      )
    }

    if (await getLight($)) {
      return renderLight(
        { ui: $.ui.resolve(e), columns: e.props.bodyColumns, dispatch: async () => undefined },
        {
          lit: await getLightLit($),
          onPull: async () => {
            await updateLightLit($, was => !was)
            $.ui.invalidate('ui.render')
          },
        },
      )
    }

    if (await getLab($)) {
      return renderLab(
        { ui: $.ui.resolve(e), columns: e.props.bodyColumns, dispatch: async () => undefined },
        {
          presses: await getLabPresses($),
          posts: await getLabPosts($),
          lit: await getLabLit($),
          onPull: async () => {
            await updateLabLit($, was => !was)
            $.ui.invalidate('ui.render')
          },
          onPress: async () => {
            await updateLabPresses($, n => n + 1)
            $.ui.invalidate('ui.render')
          },
        },
      )
    }

    const demoMode = await getDemoMode($)
    const leave = async () => {
      const wrong = await restoreMine($)
      if (wrong.length > 0) {
        $.ui.toast(`Your data did not come back the same for: ${wrong.join(', ')}. The backup is kept.`)
      } else {
        await updateDemo($, () => null)
        await refreshFocus($)
      }
      $.ui.invalidate('ui.render')
    }

    if (demoMode === 'offer') {
      return renderDemoOffer(
        { ui: $.ui.resolve(e), columns: e.props.bodyColumns, dispatch: async () => undefined },
        {
          note: '',
          onRestore: leave,
          onResume: async () => {
            await updateDemoMode($, () => 'on')
            $.ui.invalidate('ui.render')
          },
        },
      )
    }

    const shownDemo = await getDemo($)
    if (shownDemo !== null) {
      return renderDemo(
        { ui: $.ui.resolve(e), columns: e.props.bodyColumns, dispatch: async () => undefined },
        {
          index: shownDemo,
          ...(demoMode === 'on' ? { backLabel: 'Back to the demo' } : {}),
          onMove: async to => {
            await updateDemo($, () => to)
            $.ui.invalidate('ui.render')
          },
          onExit: async () => {
            await updateDemo($, () => null)
            $.ui.invalidate('ui.render')
          },
        },
      )
    }

    if (await getGrid($)) return renderGrid({ ui: $.ui.resolve(e), columns: e.props.bodyColumns, dispatch: async () => undefined })

    if (await getSpecimen($)) return renderSpecimen({ ui: $.ui.resolve(e), columns: e.props.bodyColumns, dispatch: async () => undefined })

    const model = bandModel(await snapshot($, e.props.isWorking))
    const draw = { ui: $.ui.resolve(e), columns: e.props.bodyColumns, dispatch: (action: BandAction) => dispatch($, action) }

    // Setup's opening: the lamp, only on step 1 and only when the window leaves the rows for it (else no scrolling).
    const lamp = await getLamp($)
    const rows = Math.min(LAMP_ROWS, e.props.maxRows - (demoMode === 'on' ? 1 : 0))

    let body: JSX.Element
    if (model.kind === 'setup' && lamp !== 'off' && rows >= LAMP_MIN_ROWS) {
      body = renderLamp(renderBand(model, draw, rows), draw, {
        phase: lamp,
        rows,
        onPull: async () => {
          await updateLamp($, () => 'playing')
          $.ui.invalidate('ui.render')
          // Two timers, once each: the native cover goes when the drawing is surely loaded, the layer when the light is done.
          $.clock.after(COVER_MS, async () => {
            await updateLamp($, now => (now === 'playing' ? 'revealing' : now))
            $.ui.invalidate('ui.render')
          })
          $.clock.after(LAMP_MS, async () => {
            await updateLamp($, () => 'off')
            $.ui.invalidate('ui.render')
          })
        },
      })
    } else {
      body = renderBand(model, draw)
    }

    if (demoMode !== 'on') return body

    const { Box } = draw.ui

    return (
      <Box flexDirection="column">
        {renderDemoStrip(draw, {
          onAsk: async kind => {
            await addSample($, kind)
            $.ui.invalidate('ui.render')
          },
          onReset: async () => {
            await resetDemo($)
            await refreshFocus($)
            $.ui.invalidate('ui.render')
          },
          onScreens: async () => {
            await updateDemo($, () => 0)
            $.ui.invalidate('ui.render')
          },
          onExit: leave,
        })}
        {body}
      </Box>
    )
  }).catch(($, e, next) => {
    // Say why the band is missing instead of failing silently.
    $.ui.toast(`coanda band failed: ${JSON.stringify(next.error).slice(0, 300)}`)

    return next(e)
  })
}
