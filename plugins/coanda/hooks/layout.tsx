import type { Draw } from './render'

// Placed layout (14 Nov 2026). A screen is a list of items, each at a row (y) and a cell (x), the same
// numbers Nicolas exports from his canvas. Read in Ponytail's band: exact layout is placed at fixed
// positions, never stacked with gaps that need converting (0.1.18 to 0.1.20 missed vertically each time;
// 0.1.22, placed, matched). An absolute Box takes `top` in whole rows and `left` in cells (seen in
// /coanda-grid and the lamp), so a canvas export goes in as it is.
//
// A line is an image: text glyphs make broken lines in the desktop's proportional font (line.ts). It is
// one row tall; `at` is where the line sits in that row, in px from the row's top.

// Measured 14 Nov: a cell is about 8.4 px, a row 20 px. The image is a little wider than the band and
// the stage clips it, so a metric error shows nothing.
export const COL_PX = 8.6
export const ROW_PX = 20
// The inset of every item from the band's edges, in cells (Nicolas's canvas: the field starts at x 4).
export const INSET = 4

// The line under a heading sits close under the title; the line above the Primary row has a row of its own, drawn in the middle.
export const AFTER_HEADING = 2.5
// 10.5, not 10: a 1 px line centred on a whole pixel line is crisp; on the boundary between two pixels it blurs to a thick, pale line (seen 14 Nov 13:19).
export const ABOVE_PRIMARY = ROW_PX / 2 + 0.5

// A line drawn 1:1. 0.1.28 stretched markup 4000 wide to the slot (line.ts's way) and the line came out one
// pixel thick under the heading but two thick over the Primary (measured in Nicolas's screenshot, 14 Nov
// 13:22): a stretched image is resampled, so the thickness depends on where the line falls. Here the image is
// 4000 x 20 px at its own size (explicit width and height, a real alt), the line is crisp, and the item's box
// and the stage clip it to the band's width.
export const RULE_WIDTH = 4000
export const ruleSvg = (at: number): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${RULE_WIDTH}" height="${ROW_PX}" viewBox="0 0 ${RULE_WIDTH} ${ROW_PX}" shape-rendering="crispEdges">` +
  '<style>.d{stroke:#1f1e1d;stroke-opacity:.28}@media (prefers-color-scheme:dark){.d{stroke:#fff;stroke-opacity:.3}}</style>' +
  `<line class="d" x1="0" y1="${at}" x2="${RULE_WIDTH}" y2="${at}"/></svg>`

// One item of a screen: a node at (x, y). `rows` is how many rows it takes, so the next item can start below it.
export type Placed = { key: string; y: number; x: number; node: JSX.Element; width?: number }

// A line across the band's width, in the row `y`.
export function ruleItem(draw: Draw, key: string, y: number, at: number): Placed {
  const { Text } = draw.ui
  const Svg = 'Svg' in draw.ui ? draw.ui.Svg : undefined
  return {
    key,
    y,
    x: 0,
    width: draw.columns,
    node:
      Svg === undefined ? (
        <Text dimColor wrap="truncate-end">
          {'─'.repeat(draw.columns)}
        </Text>
      ) : (
        <Svg source={ruleSvg(at)} alt="divider" width={RULE_WIDTH} height={ROW_PX} />
      ),
  }
}

// The stage: one box of the band's width and `rows` rows, every item absolute inside it.
export function placeScreen(draw: Draw, rows: number, items: Placed[]): JSX.Element {
  const { Box } = draw.ui

  return (
    <Box key="placed-stage" position="relative" overflow="hidden" flexDirection="column" width={draw.columns} height={rows}>
      {items.map(one => (
        <Box key={one.key} position="absolute" top={one.y} left={one.x} {...(one.width === undefined ? {} : { width: one.width })} flexDirection="column">
          {one.node}
        </Box>
      ))}
    </Box>
  )
}
