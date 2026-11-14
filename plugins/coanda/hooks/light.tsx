import type { Draw } from './render'

// /coanda-light: the lamp reveal on its own page, nothing else (14 Nov 2026). Split out of /coanda-lab
// because the lab's moving Client regions (a 16 ms timer, a held drag, painted boxes) made the band
// scroll stop answering once the cord was pulled. This page has no Client, no timer and no drag, and it
// is shorter than the window, so it cannot trap the scroll.
// The animation is CSS keyframes inside an SVG in the interactive frame (the way the companion spike
// animates). Pressing the button changes the markup, so the frame is drawn anew and plays from the start.

const INK = 'text'
const MUTED = 'subtle'

const svg = (w: number, h: number, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`

// The lamp panel (SMIL on an ellipse failed on screen; CSS keyframes work).
// screen). Two states of one panel, 1380 x 140: OFF (dark, the cord sways) and ON (the knob is pulled, a
// warm light grows from the centre to the sides, then a placeholder of Setup's first step fades in).
// The ON markup differs from OFF, so the frame is drawn anew and the animation plays once from the start.
const LAMP_W = 1380
const LAMP_H = 140
const LAMP_X = LAMP_W / 2
export const LAMP_OFF = svg(
  LAMP_W,
  LAMP_H,
  `<defs><clipPath id="c"><rect width="${LAMP_W}" height="${LAMP_H}" rx="12"/></clipPath></defs>
<style>.sway{transform-box:view-box;transform-origin:${LAMP_X}px 0;animation:sway 3.2s ease-in-out infinite}@keyframes sway{0%,100%{transform:rotate(-1.6deg)}50%{transform:rotate(1.6deg)}}</style>
<g clip-path="url(#c)"><rect width="${LAMP_W}" height="${LAMP_H}" fill="#0E1020"/></g>
<text x="${LAMP_X + 40}" y="78" font-family="monospace" font-size="13" fill="#5A5F80">pull the cord</text>
<g class="sway"><line x1="${LAMP_X}" y1="0" x2="${LAMP_X}" y2="58" stroke="#C9CCE0" stroke-width="2"/><circle cx="${LAMP_X}" cy="64" r="6" fill="#C9CCE0"/></g>`,
)
export const LAMP_ON = svg(
  LAMP_W,
  LAMP_H,
  `<defs>
<radialGradient id="l" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#FFF3CF"/><stop offset=".72" stop-color="#FFF3CF"/><stop offset="1" stop-color="#FFF3CF" stop-opacity="0"/></radialGradient>
<clipPath id="c"><rect width="${LAMP_W}" height="${LAMP_H}" rx="12"/></clipPath></defs>
<style>
.glow{transform-box:fill-box;transform-origin:50% 50%;transform:scale(0);animation:grow 1.8s cubic-bezier(.2,.7,.2,1) .25s forwards}
.room{opacity:0;animation:fade .9s ease-out 1.1s forwards}
.knob{animation:pull .5s ease-out 1}
@keyframes grow{to{transform:scale(1)}}
@keyframes fade{to{opacity:1}}
@keyframes pull{0%{transform:translateY(0)}35%{transform:translateY(14px)}100%{transform:translateY(0)}}
</style>
<g clip-path="url(#c)"><rect width="${LAMP_W}" height="${LAMP_H}" fill="#0E1020"/>
<circle class="glow" cx="${LAMP_X}" cy="${LAMP_H / 2}" r="1000" fill="url(#l)"/>
<g class="room"><text x="40" y="48" font-family="monospace" font-size="12" fill="#5E5C55">SETUP · 1 OF 2</text>
<text x="200" y="48" font-family="sans-serif" font-size="16" font-weight="600" fill="#1F1E1D">Where are your goals written?</text>
<rect x="200" y="68" width="420" height="40" rx="8" fill="none" stroke="#1F1E1D" stroke-opacity=".4"/>
<text x="214" y="93" font-family="sans-serif" font-size="14" fill="#5E5C55">a placeholder for step 1's field</text></g></g>
<g class="knob"><line x1="${LAMP_X}" y1="0" x2="${LAMP_X}" y2="58" stroke="#C9CCE0" stroke-width="2"/><circle cx="${LAMP_X}" cy="64" r="6" fill="#C9CCE0"/></g>`,
)


export type LightControls = {
  lit: boolean
  onPull: () => void | Promise<void>
}

export function renderLight(draw: Draw, controls: LightControls): JSX.Element {
  const { Box, Button, Text } = draw.ui
  const Svg = 'Svg' in draw.ui ? draw.ui.Svg : undefined

  return (
    <Box flexDirection="column" gap="md" width={draw.columns} borderStyle="round" borderColor={INK} paddingX="md" paddingY="sm">
      <Text weight="semibold">COANDA LIGHT · run /coanda-light again to hide</Text>
      <Text size="caption" mono color={MUTED}>
        {controls.lit ? 'The light grows from the centre, then step 1 fades in.' : 'Press the button to pull the cord.'}
      </Text>
      {Svg === undefined ? (
        <Text color={MUTED}>(no Svg on this surface)</Text>
      ) : (
        <Svg
          key={controls.lit ? 'light-on' : 'light-off'}
          source={controls.lit ? LAMP_ON : LAMP_OFF}
          alt={controls.lit ? 'The lamp is on' : 'A lamp with a cord'}
          isInteractive
        />
      )}
      <Box flexDirection="row">
        <Button key="light-pull" variant="primary" label={controls.lit ? 'Turn it off' : 'Pull the cord'} onPress={controls.onPull} />
      </Box>
    </Box>
  )
}
