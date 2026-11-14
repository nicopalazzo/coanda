import type { Draw } from './render'

// /coanda-grid: a measuring page, drawn in place of the band while on. Nothing here is the product;
// it exists so Nicolas's screenshots can be read against rulers (cells across, steps down) and so the
// text sizes, weights and colours can be judged against accessibility ratios (WCAG 2.2 AA:
// 4.5:1 for normal text, 3:1 for large text and for interface parts).
//
// Ratios in the contrast block are computed (13-14 Nov 2026) from the Dusk system hexes in
// coanda-brand's coanda.css; theme keys (text, subtle, error...) follow the host and are not computed.

const INK = 'text'
const MUTED = 'subtle'
const DUSK = '#5663A8'
const ON_DUSK = '#FFFFFF'
const TINT = '#F0F3FE'
const RISK = 'error'
const WARN = 'warning'
const OK = 'success'

const STEPS = ['xs', 'sm', 'md', 'lg', 'xl'] as const
const SIZES = ['caption', 'footnote', 'body', 'heading', 'title'] as const
const WEIGHTS = ['regular', 'medium', 'semibold', 'bold'] as const

// A ruler of `n` cells: a tick every 5, the tens counted, so a screenshot can be read cell by cell.
export function ruler(n: number): string {
  let out = ''

  for (let i = 0; i < n; i++) out += i % 10 === 0 ? String((i / 10) % 10) : i % 5 === 0 ? '+' : '·'

  return out
}

// [foreground, background, name, ratio] for the hexes we control. Computed with the WCAG 2.2
// relative-luminance formula; 4.5 is the floor for normal text.
export const CONTRASTS: ReadonlyArray<readonly [string, string, string, string]> = [
  ['#0B0B0A', '#FFFFFF', 'ink on white', '19.69'],
  ['#5E5C55', '#FFFFFF', 'muted on white', '6.69'],
  ['#5E5C55', TINT, 'muted on tint', '6.04'],
  [DUSK, '#FFFFFF', 'Dusk on white', '5.61'],
  [DUSK, TINT, 'Dusk on tint', '5.06'],
  [ON_DUSK, DUSK, 'white on Dusk', '5.61'],
  ['#0B0B0A', DUSK, 'ink on Dusk (fails 4.5)', '3.51'],
  ['#5E5C55', DUSK, 'muted on Dusk (fails)', '1.19'],
]

export function renderGrid(draw: Draw): JSX.Element {
  const { Box, Text } = draw.ui
  const cols = draw.columns
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
  const bar = (key: string, width: number | undefined, label: string, color = DUSK) => (
    <Box key={key} width={width} flexShrink={0} backgroundColor={color}>
      <Text color={ON_DUSK} mono size="caption">
        {label}
      </Text>
    </Box>
  )

  return (
    <Box flexDirection="column" gap="md" width={cols} borderStyle="round" borderColor={INK} paddingX="md" paddingY="sm">
      <Text weight="semibold">COANDA GRID · run /coanda-grid again to hide</Text>
      {tag(`Band width reported by the host: ${cols} cells. Frame: round border + paddingX md.`)}

      {tag('H · HORIZONTAL (cells)')}
      {item(
        `H1 ruler, ${cols} cells wide, from the frame's inner left edge (0, +5, 1 = 10...)`,
        <Box flexDirection="column">
          <Text mono>{ruler(cols)}</Text>
          <Box width={cols} minWidth={0}>
            <Text mono color={MUTED}>{'▏'.padEnd(cols - 1, '─') + '▕'}</Text>
          </Box>
        </Box>,
      )}
      {item(
        'H2 columns: label widths 8 / 11 / 16 / 20, then a content column (gap md)',
        <Box flexDirection="column" gap="sm">
          {[8, 11, 16, 20].map(w => (
            <Box key={String(w)} flexDirection="row" gap="md" alignItems="flex-start">
              {bar(`l${w}`, w, `${w} cells`)}
              <Box flexGrow={1} minWidth={0}>
                <Text>content starts here (label {w})</Text>
              </Box>
            </Box>
          ))}
        </Box>,
      )}
      {item(
        'H3 the column gap, label 16 + gap step + marker (marker x = 16 + gap)',
        <Box flexDirection="column" gap="sm">
          {STEPS.map(g => (
            <Box key={String(g)} flexDirection="row" gap={g} alignItems="flex-start">
              {bar(`g${g}`, 16, `label 16`)}
              {bar(`m${g}`, undefined, `| ${g}`, '#414C8C')}
            </Box>
          ))}
        </Box>,
      )}
      {item(
        'H4 numeric gaps 0, 1, 2, 3 (cells): compare with the steps in H3',
        <Box flexDirection="column" gap="sm">
          {[0, 1, 2, 3].map(g => (
            <Box key={String(g)} flexDirection="row" gap={g} alignItems="flex-start">
              {bar(`n${g}`, 16, 'label 16')}
              {bar(`nm${g}`, undefined, `| ${g}`, '#414C8C')}
            </Box>
          ))}
        </Box>,
      )}
      {item(
        'H5 split widths: 50 / 50 and 1 : 2 (flexGrow) in the content column',
        <Box flexDirection="column" gap="sm">
          <Box flexDirection="row" gap="sm">
            <Box flexGrow={1} backgroundColor={DUSK}><Text color={ON_DUSK} mono size="caption">1</Text></Box>
            <Box flexGrow={1} backgroundColor="#414C8C"><Text color={ON_DUSK} mono size="caption">1</Text></Box>
          </Box>
          <Box flexDirection="row" gap="sm">
            <Box flexGrow={1} backgroundColor={DUSK}><Text color={ON_DUSK} mono size="caption">1</Text></Box>
            <Box flexGrow={2} backgroundColor="#414C8C"><Text color={ON_DUSK} mono size="caption">2</Text></Box>
          </Box>
        </Box>,
      )}

      {tag('V · VERTICAL (lines, steps)')}
      {item(
        'V1 gap between stacked bars: xs sm md lg xl (distance between bars = the step)',
        <Box flexDirection="column">
          {STEPS.map(g => (
            <Box key={g} flexDirection="column" gap={g}>
              <Box backgroundColor={DUSK}><Text color={ON_DUSK} mono size="caption">{`gap ${g} · above`}</Text></Box>
              <Box backgroundColor={DUSK}><Text color={ON_DUSK} mono size="caption">{`gap ${g} · below`}</Text></Box>
            </Box>
          ))}
        </Box>,
      )}
      {item(
        'V2 paddingY steps on a tinted box (height of the box minus one text line = 2 x step)',
        <Box flexDirection="row" gap="md" flexWrap="wrap" alignItems="flex-start">
          {[0, 1, 2, 'xs', 'sm', 'md', 'lg'].map(p => (
            <Box key={String(p)} paddingY={p as 'xs'} paddingX="sm" backgroundColor={DUSK}>
              <Text color={ON_DUSK} mono size="caption">{`pY ${p}`}</Text>
            </Box>
          ))}
        </Box>,
      )}
      {item(
        'V3 line heights: each size on its own row, same bar behind (bar height = line box)',
        <Box flexDirection="column">
          {SIZES.map(s => (
            <Box key={s} backgroundColor={TINT}>
              <Text size={s} color={INK}>{`${s}: Hxg Primary 0123`}</Text>
            </Box>
          ))}
        </Box>,
      )}

      {tag('T · TEXT (size x weight, ink then muted)')}
      {item(
        'T1 sizes x weights in ink',
        <Box flexDirection="column">
          {SIZES.map(s => (
            <Box key={s} flexDirection="row" gap="md" flexWrap="wrap">
              {WEIGHTS.map(w => (
                <Text key={w} size={s} weight={w} color={INK}>{`${s}/${w}`}</Text>
              ))}
            </Box>
          ))}
        </Box>,
      )}
      {item(
        'T2 sizes x weights in muted (needs 4.5:1 below "heading")',
        <Box flexDirection="column">
          {SIZES.map(s => (
            <Box key={s} flexDirection="row" gap="md" flexWrap="wrap">
              {WEIGHTS.map(w => (
                <Text key={w} size={s} weight={w} color={MUTED}>{`${s}/${w}`}</Text>
              ))}
            </Box>
          ))}
        </Box>,
      )}
      {item(
        'T3 mono and status colours at body and caption',
        <Box flexDirection="column" gap="xs">
          {(['body', 'caption'] as const).map(s => (
            <Box key={s} flexDirection="row" gap="md" flexWrap="wrap">
              <Text size={s} mono>{`${s} mono`}</Text>
              <Text size={s} color={DUSK}>Dusk</Text>
              <Text size={s} color={RISK}>error</Text>
              <Text size={s} color={WARN}>warning</Text>
              <Text size={s} color={OK}>success</Text>
            </Box>
          ))}
        </Box>,
      )}
      {item(
        'T4 contrast (WCAG 2.2, computed): the sample drawn on its own background',
        <Box flexDirection="column" gap="xs">
          {CONTRASTS.map(([fg, bg, name, ratio]) => (
            <Box key={name} flexDirection="row" gap="md" alignItems="flex-start">
              <Box width={28} flexShrink={0}>{tag(`${ratio}:1 ${name}`)}</Box>
              <Box backgroundColor={bg} paddingX="sm">
                <Text color={fg}>The one thing today</Text>
              </Box>
            </Box>
          ))}
        </Box>,
      )}
    </Box>
  )
}
