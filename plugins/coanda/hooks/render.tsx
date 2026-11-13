import type { ElementTable } from 'claude-code'

import type { BandAction, BandButton, BandModel, BandRow } from '../types'
import { RULE_HEIGHT, ruleSvg } from './line'

type Node = JSX.Element | null | undefined

export type Draw = {
  // The surface's elements, resolved by register.tsx; Svg only where the surface has one (desktop).
  ui: ElementTable
  Svg?: ElementTable<'desktop'>['Svg']
  columns: number
  // Other mods share this slot: theirs draws below ours.
  below: Node
  dispatch: (action: BandAction) => Promise<void>
}

// The label column's width, so every row's text starts at the same place.
const LABEL_WIDTH = 11

// Draws a BandModel and nothing else: it reads no state and no settings, and decides nothing.
// Rebuilt 13 Nov 2026 for the v3 'rows' model; the Setup drawing and the host lessons come from
// the first repository's render: other mods' bands stack below ours after a divider, never inside
// a Box with a width; a long line clips with minWidth={0}; the first text field takes focus.
export function renderBand(model: BandModel, draw: Draw): JSX.Element {
  const { Box, Button, Text } = draw.ui
  const { Svg, columns, below, dispatch } = draw

  const rule = Svg ? (
    <Svg source={ruleSvg()} alt="divider" height={RULE_HEIGHT} />
  ) : (
    <Text dimColor wrap="truncate-end">
      {'─'.repeat(columns)}
    </Text>
  )

  // The host has no link style: the one quiet exit (v3 rule 4) is a plain Button drawn dim.
  const button = (b: BandButton) =>
    b.variant === 'link' ? (
      <Button key={b.key} plain dimColor label={b.label} onPress={() => dispatch(b.action)} />
    ) : b.variant === 'plain' ? (
      <Button key={b.key} plain label={b.label} onPress={() => dispatch(b.action)} />
    ) : (
      <Button key={b.key} {...(b.variant ? { variant: b.variant } : {})} label={b.label} onPress={() => dispatch(b.action)} />
    )

  // An answer with its consequence: the button, and what follows from it on a dim line under it.
  const answer = (b: BandButton) =>
    b.detail === undefined ? (
      button(b)
    ) : (
      <Box key={b.key} flexDirection="column" flexShrink={1}>
        {button(b)}
        <Text size="caption" dimColor wrap="wrap">
          {b.detail}
        </Text>
      </Box>
    )

  const label = (text: string | undefined) => (
    <Box width={LABEL_WIDTH} flexShrink={0}>
      <Text size="caption" weight="bold">
        {(text ?? '').toUpperCase()}
      </Text>
    </Box>
  )

  // One row: its label, its first line with the exceptions (a risk chip, a source stamp), any more
  // lines, then its buttons. A question wraps; a status line clips at the box's edge.
  const row = (r: BandRow, i: number) => {
    const isQuestion = r.part === 'question'
    const [first = '', ...more] = r.text

    return (
      <Box key={`row-${i}`} flexDirection="row" gap={1}>
        {label(r.label)}
        <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
          <Box flexDirection="row" alignItems="center" gap={1}>
            <Box flexShrink={1} minWidth={0} overflow="hidden">
              {isQuestion ? (
                <Text weight="bold" wrap="wrap">
                  {first}
                </Text>
              ) : (
                <Text wrap="truncate-end">{first}</Text>
              )}
            </Box>
            {/* State in words and a mark, never colour alone. */}
            {r.chip !== undefined && (
              <Box flexShrink={0}>
                <Text color="warning" weight="bold">
                  ⚠ {r.chip}
                </Text>
              </Box>
            )}
            {r.source !== undefined && (
              <>
                <Box flexGrow={1} />
                <Box flexShrink={0}>
                  <Text size="caption" dimColor>
                    {r.source}
                  </Text>
                </Box>
              </>
            )}
          </Box>
          {more.map((line, at) => (
            <Text key={`line-${at}`} wrap="wrap">
              {line}
            </Text>
          ))}
          {r.buttons.length > 0 && (
            <Box flexDirection="row" alignItems="flex-start" gap={1} flexWrap="wrap" marginTop={1}>
              {r.buttons.map(answer)}
            </Box>
          )}
        </Box>
      </Box>
    )
  }

  // The goal alone, and "Details" to open the Lane under it (v3 rule 6).
  const primaryRow = (p: BandRow) => {
    const [goal = '', ...more] = p.text

    return (
      <Box flexDirection="column" paddingX={1}>
        <Box flexDirection="row" alignItems="center" gap={1}>
          <Box flexShrink={1} minWidth={0} overflow="hidden">
            <Text color="suggestion" weight="semibold" wrap="truncate-end">
              {goal}
            </Text>
          </Box>
          <Box flexShrink={0}>{p.buttons.map(button)}</Box>
        </Box>
        {more.map((line, at) => (
          <Text key={`more-${at}`} dimColor wrap="wrap">
            {line}
          </Text>
        ))}
      </Box>
    )
  }

  const rows = (m: Extract<BandModel, { kind: 'rows' }>) => (
    <Box flexDirection="column" gap={1} width={columns}>
      {m.rows.length > 0 && (
        <Box flexDirection="column" gap={1} borderStyle="round" paddingX={1}>
          {m.rows.map(row)}
        </Box>
      )}
      {m.primary !== undefined && primaryRow(m.primary)}
    </Box>
  )

  // The Setup moment: only its own rows. Typed text comes from the model's `value`, so a redraw
  // keeps it. Where the surface has no text field (mobile) the person can only press Skip.
  const setup = (m: Extract<BandModel, { kind: 'setup' }>) => {
    const Input = 'Input' in draw.ui ? draw.ui.Input : undefined

    // The focus ring starts on the first field, so typing lands there when the band takes the keyboard.
    const first = m.rows.findIndex(r => (r.inputs?.length ?? 0) > 0)

    return (
      <Box flexDirection="column" borderStyle="round" paddingX={1} width={columns}>
        {m.rows.map((r, i) => (
          <Box key={`row-${i}`} flexDirection="row" gap={1}>
            {label(r.label)}
            <Box flexDirection="column" flexShrink={1} flexGrow={1} minWidth={0}>
              {r.text.map((line, at) => (
                <Text key={`line-${at}`} wrap="wrap">
                  {line}
                </Text>
              ))}
              {Input !== undefined && r.inputs !== undefined && (
                <Box flexDirection="row" gap={1}>
                  {r.inputs.map((one, at) => (
                    <Input
                      key={one.key}
                      autoFocus={i === first && at === 0 ? true : undefined}
                      placeholder={one.placeholder ?? ''}
                      value={one.value}
                      submitLabel="add"
                      onInput={value => void dispatch({ ...one.action, value } as BandAction)}
                      onSubmit={value => void dispatch({ ...one.action, value, submit: true } as BandAction)}
                    />
                  ))}
                </Box>
              )}
              {r.buttons.length > 0 && (
                <Box flexDirection="row" gap={1} flexWrap="wrap">
                  {r.buttons.map(button)}
                </Box>
              )}
            </Box>
          </Box>
        ))}
      </Box>
    )
  }

  // 'hidden' draws nothing of ours; 'gate' (the first-thought step, stage 3) is not produced yet.
  const mine = model.kind === 'rows' ? rows(model) : model.kind === 'setup' ? setup(model) : null

  if (mine === null) return below ?? <Box flexDirection="column" />

  // The engine's node (other mods' bands) may not sit under a Box with a width: it stacks beside ours.
  return below ? (
    <Box flexDirection="column">
      {mine}
      {/* Other mods' bands start after a line, so the two never read as one block. */}
      <Box marginY={1}>{rule}</Box>
      {below}
    </Box>
  ) : (
    mine
  )
}
