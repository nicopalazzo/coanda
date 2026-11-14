import type { BandAction, BandButton, BandModel, BandMoment, BandRow } from '../types'
import { renderBand } from './render'
import type { Draw } from './render'

// /coanda-demo (14 Nov 2026): every screen of the rebuild with example data, one at a time, so Nicolas can
// walk through them with Previous and Next and correct each one live. It draws through the same
// renderBand as the real band, so what he sees is what the band will draw. Nothing is sent or stored:
// every press does nothing. The wording of the new moments is from band-rebuild-plan.md and band-v3.html.

const noop: BandAction = { kind: 'details' }
const btn = (label: string, variant: BandButton['variant'], detail?: string): BandButton => ({
  key: `demo-${label}`,
  label,
  variant,
  ...(detail === undefined ? {} : { detail }),
  action: noop,
})

const PRIMARY: BandRow = { part: 'primary', text: ['◎ Ship the v0.1 install'], buttons: [btn('Details', 'plain')] }
const rows = (moment: BandMoment, list: BandRow[], heading?: string, primary: BandRow | undefined = PRIMARY): BandModel => ({
  kind: 'rows',
  moment,
  rows: list,
  ...(heading === undefined ? {} : { heading }),
  ...(primary === undefined ? {} : { primary }),
})
const now = (text: string, buttons: BandButton[] = []): BandRow => ({ part: 'now', text: [text], buttons })
const field = (key: string, placeholder: string, button?: BandButton) => ({
  key,
  kind: 'text' as const,
  value: '',
  placeholder,
  ...(button === undefined ? {} : { button: { key: button.key, label: button.label, action: noop } }),
  action: { kind: 'setupType' as const, field: 'primary' as const, value: '' },
})

export type DemoScreen = { name: string; model: BandModel }

export const DEMO_SCREENS: DemoScreen[] = [
  { name: 'Resting', model: rows('resting', [now('Idle · merged into main')]) },
  { name: 'Working', model: rows('working', [now('Splitting band.ts tests · step 2 of 5')]) },
  { name: 'Working, another session waits', model: rows('working', [now('Splitting band.ts tests · step 2 of 5'), now('1 other session waits on you', [btn('Open it', 'secondary')])]) },
  { name: 'Sent', model: rows('sent', [{ part: 'sent', text: ['✓ Sent: Go'], buttons: [] }]) },
  { name: 'Quiet (after 2 minutes)', model: rows('quiet', []) },
  { name: 'Set your Primary', model: rows('resting', [{ part: 'primary', text: [], inputs: [field('demo-primary', 'The one thing today…', btn('Set', 'primary'))], buttons: [] }], 'Set your Primary', undefined) },
  {
    name: '5a Small choice',
    model: rows('pick', [{ part: 'question', text: ['Rename fill2 to fillSafely?'], buttons: [btn('Rename to fillSafely', 'primary', 'Changes 1 file'), btn('Keep fill2', 'secondary', 'Changes no file'), btn('Later', 'link')] }], 'Question'),
  },
  {
    name: '5b Guessed question',
    model: rows('guessed', [{ part: 'question', text: ['Is the layout right now?'], source: 'inferred', buttons: [btn('Yes', 'primary'), btn('No, here is why', 'secondary'), btn('Not for me', 'link')] }], 'Question'),
  },
  {
    name: '5c Big choice, criterion',
    model: rows('pick', [{ part: 'question', text: ['Where should Lanes live?'], chip: 'Hard to undo', inputs: [field('demo-criterion', 'What matters most to you here?')], buttons: [btn('Show the options', 'primary'), btn('I need evidence first', 'secondary')] }], 'Decide'),
  },
  {
    name: '5d Big choice, options',
    model: rows('pick', [{ part: 'question', text: ['Where should Lanes live? You said: works at install'], chip: 'Hard to undo', buttons: [btn('Plugin store', 'primary', 'works at install · moving back needs a migration'), btn('Keep the file', 'secondary', 'testers must create a FOCUS.md'), btn('Later', 'link')] }], 'Decide'),
  },
  {
    name: '5e Review a result',
    model: rows('pick', [{ part: 'question', text: ['Tests and type-check pass. Not checked: how it looks on screen.'], buttons: [btn('I checked it on screen', 'primary'), btn('Open the diff', 'link')] }], 'Check the result'),
  },
  {
    name: '5f Held at a checkpoint',
    model: rows('pick', [{ part: 'question', text: ['Claude paused before the next step. Pick a direction.'], buttons: [btn('Keep going', 'primary'), btn('Change the plan', 'secondary'), btn('Stop here', 'secondary')] }], 'Choose a direction'),
  },
  {
    name: '5g Coming back',
    model: rows('pick', [{ part: 'question', text: ['While you were away Claude finished the tests and asked you one question.'], buttons: [btn('Show the question', 'primary')] }], 'Welcome back'),
  },
  {
    name: '5h Write the first draft',
    model: rows('pick', [{ part: 'question', text: ["What's your intent?"], inputs: [field('demo-first', 'What I want, why, and what done looks like')], buttons: [btn('Send', 'primary'), btn('Skip', 'link')] }], 'Write the first draft'),
  },
  {
    name: '5i Look back',
    model: rows('pick', [{ part: 'question', text: ['The session is ending. Look at what changed today?'], buttons: [btn('Look at it', 'primary'), btn('Not today', 'link')] }], 'Look back'),
  },
]

export type RunControls = { onAsk: (kind: 'small' | 'big' | 'guessed') => void | Promise<void>; onReset: () => void | Promise<void>; onScreens: () => void | Promise<void>; onExit: () => void | Promise<void> }

// Under the real band while the demo runs from zero: what is happening, the way to the 15 screens, the way out.
export function renderDemoStrip(draw: Draw, controls: RunControls): JSX.Element {
  const { Box, Button, Text } = draw.ui

  return (
    <Box key="demo-strip" flexDirection="row" alignItems="center" gap={1} paddingX={4} paddingY="sm">
      <Text size="caption" mono color="subtle">DEMO</Text>
      <Button key="demo-ask-small" plain label="Small choice" onPress={() => controls.onAsk('small')} />
      <Button key="demo-ask-big" plain label="Big choice" onPress={() => controls.onAsk('big')} />
      <Button key="demo-ask-guessed" plain label="Guessed question" onPress={() => controls.onAsk('guessed')} />
      <Button key="demo-reset" plain label="Reset to zero" onPress={controls.onReset} />
      <Button key="demo-screens" plain label="Screens" onPress={controls.onScreens} />
      <Box flexGrow={1} />
      <Button key="demo-exit" plain dimColor label="Exit demo" onPress={controls.onExit} />
    </Box>
  )
}

export type OfferControls = { onRestore: () => void | Promise<void>; onResume: () => void | Promise<void>; note: string }

// A backup was found (Claude closed in the middle of a demo): the person's data is in it, so restoring comes first.
export function renderDemoOffer(draw: Draw, controls: OfferControls): JSX.Element {
  const { Box, Button, Text } = draw.ui

  return (
    <Box key="demo-offer" flexDirection="column" paddingX={4}>
      <Text size="caption" mono color="subtle">DEMO · SAVED DATA FOUND</Text>
      <Text>Your Coanda data was saved when a demo started and has not been put back.</Text>
      {controls.note === '' ? null : <Text>{controls.note}</Text>}
      <Box flexDirection="row" gap={2}>
        <Button key="demo-restore" variant="primary" label="Restore my data" onPress={controls.onRestore} />
        <Button key="demo-resume" plain dimColor label="Keep the demo going" onPress={controls.onResume} />
      </Box>
    </Box>
  )
}

export type DemoControls = { index: number; onMove: (to: number) => void | Promise<void>; onExit: () => void | Promise<void>; backLabel?: string }

// The screen as the band draws it, then one row of controls under it (Previous, the name, Next, Exit).
export function renderDemo(draw: Draw, controls: DemoControls): JSX.Element {
  const { Box, Button, Text } = draw.ui
  const last = DEMO_SCREENS.length - 1
  const at = Math.min(Math.max(controls.index, 0), last)
  const screen = DEMO_SCREENS[at]!

  return (
    <Box flexDirection="column">
      {renderBand(screen.model, draw)}
      <Box flexDirection="row" alignItems="center" gap={2} paddingX={4}>
        <Button key="demo-prev" plain label="Previous" onPress={() => controls.onMove(at === 0 ? last : at - 1)} />
        <Text size="caption" mono color="subtle">{`${at + 1} of ${DEMO_SCREENS.length} · ${screen.name}`}</Text>
        <Button key="demo-next" plain label="Next" onPress={() => controls.onMove(at === last ? 0 : at + 1)} />
        <Box flexGrow={1} />
        <Button key="demo-exit" plain dimColor label={controls.backLabel ?? 'Exit demo'} onPress={controls.onExit} />
      </Box>
    </Box>
  )
}
