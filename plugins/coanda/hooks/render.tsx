import type { ElementTable } from 'claude-code'

import type { BandAction, BandButton, BandInput, BandModel, BandRow } from '../types'
import { ABOVE_PRIMARY, AFTER_HEADING, INSET, ruleItem, placeScreen } from './layout'
import type { Placed } from './layout'

export type Draw = {
  // The surface's elements, resolved by register.tsx.
  ui: ElementTable
  columns: number
  dispatch: (action: BandAction) => Promise<void>
}

// Draws a BandModel and nothing else: it reads no state and no settings, and decides nothing.
// Rebuilt 13 Nov 2026 from Intent's render (the first repository, read in full): its native buttons, its row
// structure (a label column, a content column, `gap={1}`, a round frame of the full width) and its
// spacing in cells. Added only what was settled and seen on screen (docs/design/band-mapping.md,
// "Seen on screen" and "Must hold on screen"): fields two rows tall with no chip name, the label
// column at 16 cells, rows aligned to the top, the text colours, the PRIMARY row, Setup.
//
// Host lessons: this hook draws Coanda's own row only (the host's default drawing of it, `next(e)`,
// is not drawn); a long line clips with minWidth={0}; the first text field takes focus; a Button's
// label is always the native ink (a Text child's colour is ignored, seen B6), so buttons are the
// host's own: primary, secondary, plain.

// Text colours (seen C1). Theme keys follow light and dark mode; Dusk is a fixed hex.
const INK = 'text'
const MUTED = 'subtle'
const DUSK = '#5663A8'
const ON_DUSK = '#FFFFFF' // the specimen only (B9)
const RISK = 'error'
const WARN = 'warning'
const OK = 'success'

// The label column, in cells: 16 keeps "SETUP · 2 OF 2" on one line (seen C2).
export const LABEL_WIDTH = 16
// The field of a headed step, in cells (Nicolas's canvas, 14 Nov: 65).
const STEP_FIELD = 65

export function renderBand(model: BandModel, draw: Draw, setupRows?: number): JSX.Element {
  const { Box, Button, Text } = draw.ui
  const { columns, dispatch } = draw
  const Input = 'Input' in draw.ui ? draw.ui.Input : undefined

  const press = (action: BandAction) => () => void dispatch(action)

  // Intent's buttons: native primary or secondary; the quiet exit plain and dim (seen B1, B2, B5).
  const button = (b: BandButton) =>
    b.variant === 'link' || b.variant === 'plain' ? (
      <Button key={b.key} plain dimColor label={b.label} onPress={press(b.action)} />
    ) : (
      <Button key={b.key} variant={b.variant === 'primary' ? 'primary' : 'secondary'} label={b.label} onPress={press(b.action)} />
    )

  // An option and its consequence: the native button, the consequence under it in muted.
  const answer = (b: BandButton) =>
    b.detail === undefined ? (
      button(b)
    ) : (
      <Box key={b.key} flexDirection="column" flexShrink={1} gap={1}>
        {button(b)}
        <Text color={MUTED} wrap="wrap">
          {b.detail}
        </Text>
      </Box>
    )

  // The label column: mono, small, uppercase, muted. Next to a field it moves down by the field's
  // inner padding, so it lines up with the field's text.
  const label = (text: string | undefined, nextToField: boolean) => (
    <Box width={LABEL_WIDTH} flexShrink={0} {...(nextToField ? { paddingTop: 'sm' as const } : {})}>
      <Text size="caption" mono color={MUTED}>
        {(text ?? '').toUpperCase()}
      </Text>
    </Box>
  )

  // A field two rows tall, so it spans the full width (seen A8; Enter submits), no chip name (no
  // chip, seen A5); its submit as a native primary button on the line under it.
  const field = (one: BandInput, isFirst: boolean) =>
    Input === undefined ? null : (
      <Box key={one.key} flexDirection="column" gap={1} minWidth={0}>
        <Input
          key={one.key}
          rows={2}
          autoFocus={isFirst ? true : undefined}
          placeholder={one.placeholder ?? ''}
          value={one.value}
          {...(one.submitLabel === undefined ? {} : { submitLabel: one.submitLabel })}
          onInput={value => void dispatch({ ...one.action, value } as BandAction)}
          onSubmit={value => void dispatch({ ...one.action, value, submit: true } as BandAction)}
        />
        {one.button !== undefined && (
          <Box flexDirection="row">
            <Button key={one.button.key} variant="primary" label={one.button.label} onPress={press(one.button.action)} />
          </Box>
        )}
      </Box>
    )

  // The first line: a question in semibold, a status line in ink, Sent in green; then the risk chip
  // and the source stamp on the same line.
  const firstLine = (r: BandRow, text: string) => {
    if (r.part === 'sent') {
      const [what = '', ...rest] = text.split(' · Claude is working')

      return (
        <Text weight="medium" color={OK} wrap="wrap">
          {what}
          {rest.length > 0 ? <Text color={MUTED}> · Claude is working</Text> : ''}
        </Text>
      )
    }

    const isQuestion = r.part === 'question' || r.part === 'setup' || r.part === 'primary'

    return isQuestion ? (
      <Text weight="semibold" color={INK} wrap="wrap">
        {text}
      </Text>
    ) : (
      // The status line (Idle, Working): bold, in ink. Dusk is for the Primary only (Nicolas, 14 Nov 13:49).
      <Text weight="bold" color={INK} wrap="truncate-end">
        {text}
      </Text>
    )
  }

  // Intent's row: the label column, then the content column; aligned to the top.
  const row = (r: BandRow, i: number, firstField: { key: string } | undefined) => {
    const [first, ...more] = r.text
    const hasLine = first !== undefined || r.chip !== undefined || r.source !== undefined

    return (
      <Box key={`row-${i}`} flexDirection="row" alignItems="flex-start" gap={1}>
        {label(r.label, !hasLine && (r.inputs ?? []).length > 0)}
        <Box flexDirection="column" gap={1} flexGrow={1} flexShrink={1} minWidth={0}>
          {hasLine && (
            <Box flexDirection="row" flexWrap="wrap" alignItems="flex-start" gap={1}>
              {first !== undefined && <Box flexShrink={1} minWidth={0}>{firstLine(r, first)}</Box>}
              {r.chip !== undefined && (
                <Box flexShrink={0}>
                  <Text size="caption" color={RISK}>
                    {`⚠ ${r.chip}`}
                  </Text>
                </Box>
              )}
              {r.source !== undefined && (
                <Box flexShrink={0}>
                  <Text size="caption" mono color={WARN}>
                    {r.source}
                  </Text>
                </Box>
              )}
            </Box>
          )}
          {more.map((line, at) => (
            <Text key={`line-${at}`} color={INK} wrap="wrap">
              {line}
            </Text>
          ))}
          {(r.inputs ?? []).map(one => field(one, one.key === firstField?.key))}
          {r.buttons.length > 0 && (
            <Box flexDirection="row" flexWrap="wrap" alignItems="flex-start" gap={1}>
              {r.buttons.map(answer)}
            </Box>
          )}
        </Box>
      </Box>
    )
  }

  // Intent's frame: round, the full width, rows one line apart.
  const frame = (rows: BandRow[], minRows?: number) => {
    // The focus ring starts on the first field, so typing lands there when the band takes the keyboard.
    const firstField = rows.flatMap(r => r.inputs ?? [])[0]

    return (
      <Box flexDirection="column" gap={1} borderStyle="round" paddingX={1} width={columns} minHeight={minRows}>
        {rows.map((r, i) => row(r, i, firstField))}
      </Box>
    )
  }

  // The always-there area and the steps that need the person, placed (layout.tsx; Nicolas's sketches of
  // Sat 14 Nov): a bold heading when the person has something to do, one line right under it, the
  // content from the row after the line, and a line above the Primary row so it always stands apart.
  // Every item is at a row and a cell, so a screen is a list, not nested flow.
  const rowsScreen = (m: Extract<BandModel, { kind: 'rows' }>, minRows = 0) => {
    const items: Placed[] = []
    const field = Math.min(STEP_FIELD, columns - 20)
    const inner = columns - 2 * INSET
    let y = 0

    if (m.heading !== undefined) {
      // The severity belongs next to the heading, not on the question line (Nicolas, 14 Nov 13:57).
      const severity = m.rows.find(r => r.chip !== undefined)?.chip
      items.push({
        key: 'heading',
        y,
        x: INSET,
        width: columns - 2 * INSET,
        node: (
          <Box flexDirection="row" alignItems="flex-end" gap={1}>
            <Text weight="bold" size="heading" color={INK}>{m.heading.toUpperCase()}</Text>
            {/* The same middle dot the band uses between parts ("Idle · merged into main"). */}
            {severity !== undefined && <Text color={MUTED}>·</Text>}
            {severity !== undefined && <Text color={RISK}>{`⚠ ${severity}`}</Text>}
          </Box>
        ),
      })
      items.push(ruleItem(draw, 'heading-rule', y + 1, AFTER_HEADING))
      y += 2
    }

    m.rows.forEach((r, i) => {
      const [first, ...more] = r.text
      // With a heading the severity is drawn next to it; without one it stays on the line.
      const chip = m.heading === undefined ? r.chip : undefined
      const hasLine = first !== undefined || chip !== undefined || r.source !== undefined
      const inputs = Input === undefined ? [] : (r.inputs ?? [])

      if (hasLine) {
        items.push({
          key: `row-${i}-first`,
          y,
          x: INSET,
          width: inner,
          node: (
            <Box flexDirection="row" alignItems="flex-start" gap={1}>
              {first !== undefined && <Box flexShrink={1} minWidth={0}>{firstLine(r, first)}</Box>}
              {chip !== undefined && <Box flexShrink={0}><Text color={RISK}>{`⚠ ${chip}`}</Text></Box>}
              {r.source !== undefined && <Box flexShrink={0}><Text mono color={WARN}>{r.source}</Text></Box>}
            </Box>
          ),
        })
        y += 1
      }
      more.forEach((line, at) => {
        items.push({ key: `row-${i}-line-${at}`, y, x: INSET, width: inner, node: <Text color={INK} wrap="truncate-end">{line}</Text> })
        y += 1
      })

      inputs.forEach(one => {
        if (Input === undefined) return
        items.push({
          key: `input-${one.key}`,
          y,
          x: INSET,
          width: field,
          node: (
            <Input
              key={one.key}
              rows={2}
              autoFocus
              placeholder={one.placeholder ?? ''}
              value={one.value}
              onInput={value => void dispatch({ ...one.action, value } as BandAction)}
              onSubmit={value => void dispatch({ ...one.action, value, submit: true } as BandAction)}
            />
          ),
        })
        if (one.button !== undefined) {
          items.push({ key: `button-${one.key}`, y: y + 1, x: INSET + field + 3, node: <Button key={one.button.key} variant="primary" label={one.button.label} onPress={press(one.button.action)} /> })
        }
        // The field takes 2 rows; a button beside it starts on the second and is 1.4 rows tall, so it needs a third (seen 14 Nov 16:58: Set was cut off by the stage's edge).
        y += one.button === undefined ? 2 : 3
      })

      if (r.buttons.length > 0) {
        // Plan rule R8: one blank row between blocks (the question and its buttons are two blocks). I dropped it in 0.1.25 and the buttons touched the text (seen 14 Nov 13:18).
        if (hasLine || more.length > 0) y += 1
        items.push({
          key: `row-${i}-buttons`,
          y,
          x: INSET,
          width: inner,
          node: (
            // All buttons sit together like every other button row; a consequence is no longer a column under its button (a long one pushed the next button away, seen 14 Nov 13:56).
            <Box flexDirection="row" flexWrap="wrap" alignItems="flex-start" gap={1}>
              {r.buttons.map(button)}
            </Box>
          ),
        })
        // A native button is about 1.4 rows tall (seen 14 Nov: 28 px), so it takes 2 rows.
        y += 2
        // One line per consequence under the buttons: the option's name, then what follows from it.
        r.buttons.forEach(b => {
          if (b.detail === undefined) return
          items.push({
            key: `row-${i}-detail-${b.key}`,
            y,
            x: INSET,
            width: inner,
            node: (
              <Text color={MUTED} wrap="truncate-end">
                {`${b.label}: ${b.detail}`}
              </Text>
            ),
          })
          y += 1
        })
      }
    })

    if (m.primary !== undefined) {
      const [goal = '', ...more] = m.primary.text
      // The line has a row of its own, drawn in the middle, so the row above and the Primary row both have air (seen 14 Nov 13:17: a line at the row's top touched both).
      if (m.rows.length > 0) {
        items.push(ruleItem(draw, 'primary-rule', y, ABOVE_PRIMARY))
        y += 1
      }
      items.push({
        key: 'primary',
        y,
        x: INSET,
        width: inner,
        node: (
          <Box flexDirection="row" alignItems="center" gap={1}>
            <Box flexShrink={1} minWidth={0} overflow="hidden">
              <Text color={DUSK} weight="semibold" wrap="truncate-end">{goal}</Text>
            </Box>
            {/* The spacer pushes Details to the right edge: no cell counting (Ponytail). */}
            <Box flexGrow={1} />
            <Box flexShrink={0}>{m.primary.buttons.map(button)}</Box>
          </Box>
        ),
      })
      y += 1
      more.forEach((line, at) => {
        items.push({ key: `primary-more-${at}`, y, x: INSET, width: inner, node: <Text color={MUTED} wrap="truncate-end">{line}</Text> })
        y += 1
      })
    }

    // The lamp's stage is taller than the content: the screen fills it, so nothing moves when the light opens.
    return placeScreen(draw, Math.max(y, minRows), items)
  }

  if (model.kind === 'rows') return rowsScreen(model)

  // Setup is a step that needs the person: a heading, one line, the goals found, buttons; no Primary line.
  if (model.kind === 'setup') return rowsScreen({ kind: 'rows', moment: 'resting', heading: model.heading, rows: model.rows }, setupRows)

  // 'hidden' draws nothing; 'gate' (the first-thought step, stage 3) is not produced yet.
  return <Box flexDirection="column" />
}

// /coanda-specimen: every drawing option once, each tagged (A1, B3…), to see on screen how the
// desktop really draws a field, a button and a label before choosing (band-mapping.md). Draws
// fixed examples and decides nothing; its presses do nothing.
export function renderSpecimen(draw: Draw): JSX.Element {
  const { Box, Button, Text } = draw.ui
  const Input = 'Input' in draw.ui ? draw.ui.Input : undefined
  const noop = () => undefined
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
  const field = (key: string, extra: object = {}) =>
    Input === undefined ? <Text>no Input on this surface</Text> : <Input key={key} placeholder="The one thing today… (placeholder long enough to see the cut)" onSubmit={noop} {...extra} />

  return (
    <Box flexDirection="column" gap="md" width={draw.columns} borderStyle="round" borderColor={INK} paddingX="md" paddingY="sm">
      <Text weight="semibold">COANDA SPECIMEN · run /coanda-specimen again to hide</Text>
      {tag('A · FIELDS')}
      {item('A1 field alone in a column', <Box flexDirection="column">{field('a1')}</Box>)}
      {item('A2 field in a row with flexGrow box', <Box flexDirection="row"><Box flexGrow={1}>{field('a2')}</Box></Box>)}
      {item('A3 field in a column, alignItems stretch, width 100%', <Box flexDirection="column" alignItems="stretch" width="100%">{field('a3')}</Box>)}
      {item('A4 field with label prop', <Box flexDirection="column">{field('a4', { label: 'Primary' })}</Box>)}
      {item('A5 field, submitLabel absent (default)', <Box flexDirection="column">{field('a5')}</Box>)}
      {item('A6 field, submitLabel "" (empty)', <Box flexDirection="column">{field('a6', { submitLabel: '' })}</Box>)}
      {item('A7 field, submitLabel "Set"', <Box flexDirection="column">{field('a7', { submitLabel: 'Set' })}</Box>)}
      {item('A8 field, rows 2', <Box flexDirection="column">{field('a8', { rows: 2 })}</Box>)}
      {tag('B · BUTTONS')}
      <Box flexDirection="row" flexWrap="wrap" gap="md" alignItems="flex-start">
        {item('B1 variant primary', <Button key="b1" variant="primary" label="Set" onPress={noop} />)}
        {item('B2 variant secondary', <Button key="b2" variant="secondary" label="Keep fill2" onPress={noop} />)}
        {item('B3 no variant', <Button key="b3" label="Keep fill2" onPress={noop} />)}
        {item('B4 plain', <Button key="b4" plain label="Later" onPress={noop} />)}
        {item('B5 plain dimColor', <Button key="b5" plain dimColor label="Later" onPress={noop} />)}
        {item(
          'B6 plain, Text child Dusk underline',
          <Button key="b6" plain label="Later" onPress={noop}>
            <Text color={DUSK} underline>
              Later
            </Text>
          </Button>,
        )}
        {item(
          'B7 plain, no label, Text child Dusk',
          <Button key="b7" plain onPress={noop}>
            <Text color={DUSK} underline>
              Later
            </Text>
          </Button>,
        )}
        {item(
          'B8 Dusk box + plain Button white Text',
          <Box borderStyle="round" borderColor={DUSK} backgroundColor={DUSK} paddingX="md">
            <Button key="b8" plain onPress={noop}>
              <Text color={ON_DUSK} weight="semibold">
                Set
              </Text>
            </Button>
          </Box>,
        )}
        {item(
          'B9 Dusk box + Text only (no Button)',
          <Box borderStyle="round" borderColor={DUSK} backgroundColor={DUSK} paddingX="md">
            <Text color={ON_DUSK} weight="semibold">
              Set
            </Text>
          </Box>,
        )}
        {item(
          'B10 primary, hover override',
          <Box key="b10box">
            <Button key="b10" variant="primary" label="Set" onPress={noop} hover={{ color: DUSK }} />
          </Box>,
        )}
      </Box>
      {tag('C · TEXT AND LABELS')}
      {item(
        'C1 Text colours: ink, muted, Dusk, error, warning, success',
        <Box flexDirection="row" gap="md" flexWrap="wrap">
          <Text color={INK}>ink</Text>
          <Text color={MUTED}>muted</Text>
          <Text color={DUSK}>Dusk</Text>
          <Text color={RISK}>error</Text>
          <Text color={WARN}>warning</Text>
          <Text color={OK}>success</Text>
        </Box>,
      )}
      {item(
        'C2 label width 11 vs 16, top-aligned',
        <Box flexDirection="column" gap="sm">
          <Box flexDirection="row" gap="md" alignItems="flex-start">
            <Box width={11} flexShrink={0}>
              {tag('SETUP · 2 OF 2')}
            </Box>
            <Text>width 11</Text>
          </Box>
          <Box flexDirection="row" gap="md" alignItems="flex-start">
            <Box width={16} flexShrink={0}>
              {tag('SETUP · 2 OF 2')}
            </Box>
            <Text>width 16</Text>
          </Box>
        </Box>,
      )}
      {item('C3 spacing steps xs sm md lg (gaps between bars)', <Box flexDirection="row" gap="xs">{['xs', 'sm', 'md', 'lg'].map(g => <Box key={g} flexDirection="row" gap={g as 'xs'}><Text backgroundColor={DUSK} color={ON_DUSK}>{` ${g} `}</Text><Text backgroundColor={DUSK} color={ON_DUSK}> | </Text></Box>)}</Box>)}
    </Box>
  )
}
