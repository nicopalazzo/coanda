import { t } from './i18n'
import type { Draw } from './render'

// The lamp: Setup's opening (14 Nov 2026). Every time Setup runs, the band is first dark with one button,
// "Pull the cord"; pressed, a dark layer drawn over the real Setup band opens from the centre like a
// light turning on, and shows the normal grey band with step 1 already in place. 2.6 s later one timer
// removes the layer, so it can never block a click or the wheel.
//   - the layer is an SVG in an absolute Box over the band (CSS keyframes, a mask whose hole grows);
//   - it has an explicit px size from the band's columns and rows (a drawing does not stretch by itself:
//     seen 14 Nov, an SVG with no size drew about 41 % of the band's width);
//   - the SVG exists only while dark or playing, the Setup content under it is the real one.
// The finished state is the base style (scale 1) and the animation runs from closed: an animation that
// ends with a held fill inside a mask was dropped by Chrome at the end (seen 14 Nov: the band went dark again).
// The markup was checked in headless Chrome over a grey backdrop at four moments (light visible, soft
// warm edge, band revealed) before it was wired.

// Timeline after the press (ms). Seen 14 Nov: when the dark drawing was swapped for the light drawing, Setup showed
// for a moment, then black again, then the reveal. Now a native dark box (drawn by the host, instant) covers the
// band the whole time the dark and the light drawings swap. It goes at COVER_MS, by which time the light drawing
// has loaded; the light itself starts 800 ms after that drawing loads, so the cover is always gone first.
// The layer goes at LAMP_MS, when the light has finished.
export const COVER_MS = 600
export const LAMP_MS = 3400
// Measured 14 Nov from the grid and stage recordings: a column is about 8.3 px, a row about 20 px.
// The drawing is a little larger and the wrapper clips it, so a metric error shows nothing.
export const COL_PX = 8.6
export const ROW_PX = 21
export const LAMP_ROWS = 9
// Under this many rows the band is too short to play the lamp without scrolling: Setup shows plain.
export const LAMP_MIN_ROWS = 7

// dark: waiting for the pull. playing: pulled, native dark cover + the drawing loading. revealing: the cover is gone, the light plays.
export type LampPhase = 'off' | 'dark' | 'playing' | 'revealing'

const DARK = '#0E1020'
const CORD = '#C9CCE0'
const WARM = '#FFD98A'

const cordAt = (cx: number, extra = '') => `<g${extra}><line x1="${cx}" y1="0" x2="${cx}" y2="52" stroke="${CORD}" stroke-width="2"/><circle cx="${cx}" cy="58" r="6" fill="${CORD}"/></g>`

// The dark layer, drawn in real px (viewBox = size) so the opening is a true circle.
// Waiting: opaque dark with the cord. Playing: no mask (a mask lost its animated state in Chrome, seen
// 14 Nov). The dark is a very thick ring (stroke 2000) whose radius grows, so its hole opens from the
// centre; a thinner warm ring runs along the hole's edge, a faint wide one makes the glow; the cord dips
// and fades. Every animated value starts at the opening state and ends at the base style, so the
// finished state is "revealed" even if an animation is dropped.
export function lampSvg(phase: 'dark' | 'light', wide: number, tall: number): string {
  const cx = wide / 2
  const cy = tall / 2
  const head = `<svg xmlns="http://www.w3.org/2000/svg" width="${wide}" height="${tall}" viewBox="0 0 ${wide} ${tall}">`

  if (phase === 'dark') return `${head}<rect width="${wide}" height="${tall}" fill="${DARK}"/>${cordAt(cx)}</svg>`

  const reach = Math.ceil(Math.hypot(cx, cy)) + 80 // the hole's final radius: past every corner
  const style =
    `<style>.dk{animation:dk 1.8s cubic-bezier(.25,.6,.25,1) .8s backwards}.rg{animation:rg 1.8s cubic-bezier(.25,.6,.25,1) .8s backwards}.hl{animation:rg 1.8s cubic-bezier(.25,.6,.25,1) .8s backwards}` +
    `.cd{opacity:0;animation:cd .9s ease-in .0s backwards}` +
    `@keyframes dk{from{r:1000px}}@keyframes rg{from{r:0px}}@keyframes cd{0%{opacity:1;transform:translateY(0)}30%{opacity:1;transform:translateY(16px)}100%{opacity:0;transform:translateY(16px)}}` +
    `@media (prefers-reduced-motion:reduce){.dk,.rg,.hl,.cd{animation-duration:.01s;animation-delay:0s}}</style>`

  return (
    `${head}${style}` +
    `<circle class="hl" cx="${cx}" cy="${cy}" r="${reach}" fill="none" stroke="${WARM}" stroke-opacity=".28" stroke-width="150"/>` +
    `<circle class="dk" cx="${cx}" cy="${cy}" r="${1000 + reach}" fill="none" stroke="${DARK}" stroke-width="2000"/>` +
    `<circle class="rg" cx="${cx}" cy="${cy}" r="${reach}" fill="none" stroke="${WARM}" stroke-opacity=".9" stroke-width="40"/>` +
    cordAt(cx, ' class="cd"') +
    `</svg>`
  )
}

export type LampControls = {
  phase: 'dark' | 'playing' | 'revealing'
  rows: number
  onPull: () => void | Promise<void>
}

// Wraps the real Setup band (`inner`) with the dark layer. The wrapper clips, so the drawing may be larger.
export function renderLamp(inner: JSX.Element, draw: Draw, controls: LampControls): JSX.Element {
  const { Box, Button } = draw.ui
  const Svg = 'Svg' in draw.ui ? draw.ui.Svg : undefined
  const wide = Math.round(draw.columns * COL_PX)
  const tall = Math.round(controls.rows * ROW_PX)

  return (
    <Box key="lamp-stage" position="relative" overflow="hidden" width={draw.columns} flexDirection="column">
      {inner}
      {controls.phase === 'revealing' ? null : (
        <Box key="lamp-cover" position="absolute" top={0} left={0} right={0} bottom={0} backgroundColor="#0E1020" />
      )}
      {Svg === undefined ? null : (
        <Box key="lamp-layer" position="absolute" top={0} left={0}>
          <Svg
            key={controls.phase === 'dark' ? 'lamp-dark' : 'lamp-light'}
            source={lampSvg(controls.phase === 'dark' ? 'dark' : 'light', wide, tall)}
            alt={controls.phase === 'dark' ? t('lamp.altDark') : t('lamp.altOn')}
            width={wide}
            height={tall}
            isInteractive
          />
        </Box>
      )}
      {controls.phase === 'dark' ? (
        // Seen 14 Nov: a secondary button is translucent, so on the dark layer its ink label vanished. The
        // primary button keeps its own fill and label in light and dark mode; the light round edge (fixed
        // hex, so it shows in both modes) tells where the button is on the dark.
        <Box
          key="lamp-pull-box"
          position="absolute"
          top={Math.max(3, Math.floor(controls.rows / 2))}
          left={Math.max(0, Math.floor(draw.columns / 2) - 8)}
          borderStyle="round"
          borderColor="#C9CCE0"
          paddingX="sm"
        >
          <Button key="lamp-pull" variant="primary" label={t('lamp.pull')} onPress={controls.onPull} />
        </Box>
      ) : null}
    </Box>
  )
}
