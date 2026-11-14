import { LAMP_OFF, LAMP_ON } from './light'
import type { Draw } from './render'

// /coanda-lab: what the desktop band can do beyond Box, Text and Button, tried one thing at a time.
// Read from the host's types, not yet tried (14 Nov 2026): Svg (isInteractive: SMIL, CSS animation and
// :hover run, no script), Client (a timer, pointer drag, local state, drawn in cells).
// Each test names what to look for; the Client tests print their own measured figures.
//   L1 SVG animation: does SMIL run, image vs interactive; does CSS :hover work; a light reveal.
//   L2 what can take a press: an SVG beside a Button; a Client that posts the press to the plugin.
//   L3 a Client timer: the real tick rate at 16, 50 and 250 ms.
//   L4 a Client drag: which pointer events arrive, whether a sub-cell position exists.
//   L5 how many painted Boxes a Client can redraw each tick before it lags or unmounts.

const INK = 'text'
const MUTED = 'subtle'

export type LabControls = {
  presses: number
  posts: number
  lit: boolean
  onPull: () => void | Promise<void>
  onPress: () => void | Promise<void>
}

const svg = (w: number, h: number, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`

// A dot crossing a dark strip, by SMIL (animate).
const SMIL_DOT = svg(
  320,
  48,
  `<rect width="320" height="48" rx="8" fill="#14172B"/><circle cy="24" r="9" fill="#FFD166"><animate attributeName="cx" from="20" to="300" dur="2s" repeatCount="indefinite"/></circle>`,
)

// The same strip: a pulsing glow by CSS keyframes, and a rect that changes colour on :hover (with a tooltip).
const CSS_PULSE = svg(
  320,
  48,
  `<style>@keyframes p{0%{opacity:.25}50%{opacity:1}100%{opacity:.25}}.g{animation:p 1.6s infinite}.h{fill:#5663A8}.h:hover{fill:#FFD166}</style>
<rect width="320" height="48" rx="8" fill="#14172B"/><circle class="g" cx="40" cy="24" r="12" fill="#FFD166"/>
<rect class="h" x="120" y="10" width="180" height="28" rx="6"><title>tooltip: hover works</title></rect>
<text x="130" y="29" font-size="12" fill="#fff" font-family="monospace">hover me</text>`,
)

// A cord with a knob, for the press test.
const CORD = svg(
  80,
  72,
  `<rect width="80" height="72" rx="8" fill="#14172B"/><line x1="40" y1="0" x2="40" y2="46" stroke="#C9CCE0" stroke-width="2"/><circle cx="40" cy="52" r="8" fill="#FFD166"/>`,
)

export function renderLab(draw: Draw, controls: LabControls): JSX.Element {
  const { Box, Button, Text } = draw.ui
  const Svg = 'Svg' in draw.ui ? draw.ui.Svg : undefined
  const Client = 'Client' in draw.ui ? draw.ui.Client : undefined
  const tag = (t: string) => (
    <Text size="caption" mono color={MUTED}>
      {t}
    </Text>
  )
  const item = (t: string, body: JSX.Element) => (
    <Box key={t} flexDirection="column" gap="xs">
      {tag(t)}
      {body}
    </Box>
  )
  const none = <Text color={MUTED}>(no such element on this surface)</Text>
  const draw1 = (key: string, source: string, alt: string, wide: number | undefined, tall: number | undefined, isInteractive: boolean) =>
    Svg === undefined ? none : <Svg key={key} source={source} alt={alt} width={wide} height={tall} isInteractive={isInteractive} />
  const client = (key: string, props: { test: 'tick' | 'drag' | 'boxes' | 'press'; ms: number; cols: number; rows: number }, height: number) =>
    Client === undefined ? none : <Client key={key} module="./lab-client.tsx" props={props} width="100%" height={height} />

  return (
    <Box flexDirection="column" gap="md" width={draw.columns} borderStyle="round" borderColor={INK} paddingX="md" paddingY="sm">
      <Text weight="semibold">COANDA LAB · run /coanda-lab again to hide</Text>
      {tag('Read from the types, not yet tried. For each test the line says what to look for.')}

      {tag('L1 · SVG ANIMATION')}
      {item('L1a image mode, SMIL: does the dot move across? (if not, SMIL needs the interactive frame)', draw1('l1a', SMIL_DOT, 'A dot crossing a strip', 320, 48, false))}
      {item('L1b interactive frame, SMIL: does the dot move?', draw1('l1b', SMIL_DOT, 'A dot crossing a strip', 320, 48, true))}
      {item('L1c interactive, CSS keyframes pulse (left) and :hover colour change + tooltip (right)', draw1('l1c', CSS_PULSE, 'A pulsing dot and a hover target', 320, 48, true))}
      {item(
        `L1d the lamp, CSS keyframes: ${controls.lit ? 'the light grows from the centre, then step 1 fades in' : 'press Pull the cord'}`,
        <Box flexDirection="column" gap="xs">
          {draw1(controls.lit ? 'l1d-on' : 'l1d-off', controls.lit ? LAMP_ON : LAMP_OFF, controls.lit ? 'The lamp is on' : 'A lamp with a cord', undefined, undefined, true)}
          <Box flexDirection="row" gap="md">
            <Button key="l1d-pull" variant="primary" label={controls.lit ? 'Turn it off' : 'Pull the cord'} onPress={controls.onPull} />
          </Box>
        </Box>,
      )}

      {tag('L2 · PULLING A CORD: what can take the press (the host: a Button holds only text; an SVG cannot sit inside one)')}
      {item(
        `L2a an SVG beside a native Button: press it, the counter should go up (presses ${controls.presses})`,
        <Box flexDirection="row" gap="md" alignItems="center">
          {draw1('l2a-svg', CORD, 'Pull cord', 80, 72, false)}
          <Button key="l2a" plain onPress={controls.onPress}>
            ● Pull the cord
          </Button>
        </Box>,
      )}
      {item(
        `L2b a Client: click inside it, it posts to the plugin and the plugin counts (posts received by the plugin: ${controls.posts})`,
        client('l2b', { test: 'press', ms: 1000, cols: 20, rows: 3 }, 4),
      )}

      {tag('L3 · CLIENT TIMER (measured by the Client itself)')}
      {item('L3a every 16 ms (a 60 per s frame)', client('l3a', { test: 'tick', ms: 16, cols: 60, rows: 1 }, 2))}
      {item('L3b every 50 ms', client('l3b', { test: 'tick', ms: 50, cols: 60, rows: 1 }, 2))}
      {item('L3c every 250 ms', client('l3c', { test: 'tick', ms: 250, cols: 60, rows: 1 }, 2))}

      {tag('L4 · CLIENT DRAG (press inside the region and drag down)')}
      {item('L4 the bead follows the pointer; the figures say what arrived', client('l4', { test: 'drag', ms: 1000, cols: 20, rows: 7 }, 8))}

      {tag('L5 · HOW MANY PAINTED BOXES (each redrawn every 100 ms; compare "per s" with the target)')}
      {item('L5a 400 boxes (40 x 10)', client('l5a', { test: 'boxes', ms: 100, cols: 40, rows: 10 }, 11))}
      {item('L5b 1,000 boxes (50 x 20); 1,600 was refused by the host in the test run (over 100,000 serialized characters)', client('l5b', { test: 'boxes', ms: 100, cols: 50, rows: 20 }, 21))}
    </Box>
  )
}
