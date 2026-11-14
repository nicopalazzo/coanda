import type { Draw } from './render'

// /coanda-stage: the overlay spike (14 Nov 2026). The band as one stage of a fixed height (9 rows); the
// lamp's light is a dark layer drawn OVER the normal band, with a hole that opens from the centre and
// reveals the real band underneath (Nicolas: the light is an effect, the band stays grey). No Client,
// no repeating timer: the dark layer is removed by one timer when the light has finished.
// To find out on screen:
//   A  does a dark SVG sit over native content inside one fixed box, and open from the centre?
//   B  the same with explicit px width and height: how tall is 190 px against 9 rows?
//   C  pointer: can a Button above a still SVG be pressed, and one below it?
// Reveal verified in headless Chrome over a grey backdrop before it was wired (the hole grows from
// the centre, a warm edge travels outward; CSS keyframes, origin in view-box coordinates).

const INK = 'text'
const MUTED = 'subtle'

export const STAGE_ROWS = 9
export const REVEAL_MS = 2600
const W = 1380
const H = 190

const body = (extra: string) => `<defs><radialGradient id="hg"><stop offset=".78" stop-color="#000"/><stop offset="1" stop-color="#fff"/></radialGradient><radialGradient id="wg"><stop offset=".7" stop-color="#FFE9A8" stop-opacity="0"/><stop offset=".88" stop-color="#FFE9A8" stop-opacity=".55"/><stop offset="1" stop-color="#FFE9A8" stop-opacity="0"/></radialGradient><mask id="m"><rect width="${W}" height="${H}" fill="#fff"/><circle class="hole" cx="${W / 2}" cy="${H / 2}" r="900" fill="url(#hg)"/></mask></defs><style>.hole,.glow{transform-box:view-box;transform-origin:${W / 2}px ${H / 2}px;transform:scale(0);animation:grow 1.8s cubic-bezier(.2,.7,.2,1) .25s forwards}@keyframes grow{to{transform:scale(1)}}@media (prefers-reduced-motion:reduce){.hole,.glow{animation-duration:.01s;animation-delay:0s}}</style><circle class="glow" cx="${W / 2}" cy="${H / 2}" r="900" fill="url(#wg)"/><rect width="${W}" height="${H}" fill="#0E1020" mask="url(#m)"/>${extra}`

// The dark layer with its opening hole, as a whole SVG, optionally with an explicit px size.
export const reveal = (w = W, h = H): string => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${body('')}</svg>`

// A still dark layer (no hole opening): for the pointer test C.
const STILL = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><rect width="${W}" height="${H}" fill="#0E1020" fill-opacity=".85"/><text x="40" y="60" font-family="monospace" font-size="14" fill="#C9CCE0">a still SVG layer over the box</text></svg>`

export type StageControls = {
  plays: number
  isPlaying: boolean
  over: number
  under: number
  onPlay: () => void | Promise<void>
  onOver: () => void | Promise<void>
  onUnder: () => void | Promise<void>
}

export function renderStage(draw: Draw, controls: StageControls): JSX.Element {
  const { Box, Button, Text } = draw.ui
  const Svg = 'Svg' in draw.ui ? draw.ui.Svg : undefined
  const tag = (t: string) => (
    <Text size="caption" mono color={MUTED}>
      {t}
    </Text>
  )

  // The resting band stand-in: native content in the box, drawn first, under any overlay.
  const resting = (k: string) => (
    <Box key={`rest-${k}`} flexDirection="column" gap="sm" padding="sm">
      <Box flexDirection="row" gap="md">
        <Box width={16} flexShrink={0}>
          {tag('NOW')}
        </Box>
        <Text>Idle · Finish the grid test</Text>
      </Box>
      <Box flexDirection="row" gap="md">
        <Box width={16} flexShrink={0}>
          {tag('PRIMARY')}
        </Box>
        <Text weight="semibold">◎ Ship the intake form</Text>
      </Box>
    </Box>
  )

  const overlay = (k: string, source: string, alt: string, wide?: number, tall?: number) =>
    Svg === undefined ? null : (
      <Box key={`ov-${k}`} position="absolute" top={0} left={0} right={0} bottom={0}>
        <Svg key={`svg-${k}-${controls.plays}`} source={source} alt={alt} width={wide} height={tall} isInteractive />
      </Box>
    )

  return (
    <Box flexDirection="column" gap="md" width={draw.columns} borderStyle="round" borderColor={INK} paddingX="md" paddingY="sm">
      <Text weight="semibold">COANDA STAGE · run /coanda-stage again to hide</Text>
      {tag(`Every box below is ${STAGE_ROWS} rows tall (height=${STAGE_ROWS}). Nothing moves on a timer except one removal after ${REVEAL_MS} ms.`)}

      <Box flexDirection="row" gap="md" alignItems="center">
        <Button key="stage-play" variant="primary" label={controls.isPlaying ? 'Playing…' : 'Turn the light on'} onPress={controls.onPlay} />
        {tag(`plays so far: ${controls.plays}`)}
      </Box>

      {tag('A · a dark SVG over the resting band; the light opens from the centre (no size props)')}
      <Box key="stage-a" position="relative" height={STAGE_ROWS} flexDirection="column" backgroundColor="#00000010">
        {resting('a')}
        {controls.isPlaying ? overlay('a', reveal(), 'The light opening over the band') : null}
      </Box>

      {tag('B · the same with width 640 and height 190 (px): compare 190 px with the 9 rows around it')}
      <Box key="stage-b" position="relative" height={STAGE_ROWS} flexDirection="row">
        <Box flexDirection="column" width={4}>
          {Array.from({ length: STAGE_ROWS }, (_, i) => (
            <Box key={`r${i}`} height={1} backgroundColor={i % 2 === 0 ? '#5663A8' : '#414C8C'}>
              <Text color="#FFFFFF" mono size="caption">{` ${i + 1}`}</Text>
            </Box>
          ))}
        </Box>
        <Box key="stage-b-body" position="relative" flexGrow={1} flexDirection="column">
          {resting('b')}
          {controls.isPlaying ? overlay('b', reveal(640, 190), 'The light, 640 by 190', 640, 190) : null}
        </Box>
      </Box>

      {tag(`C · pointer: a still SVG covers the box. "under" is a Button below the SVG (blocked?), "over" is a Button after it (pressable?). under ${controls.under} · over ${controls.over}`)}
      <Box key="stage-c" position="relative" height={STAGE_ROWS} flexDirection="column">
        <Box padding="sm">
          <Button key="stage-under" label="under the SVG" onPress={controls.onUnder} />
        </Box>
        {overlay('c', STILL, 'A still dark layer')}
        <Box position="absolute" bottom={1} left={2}>
          <Button key="stage-over" variant="primary" label="over the SVG" onPress={controls.onOver} />
        </Box>
      </Box>
    </Box>
  )
}
