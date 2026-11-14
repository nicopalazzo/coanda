import type { ClientModule } from 'claude-code'

// The surface module of /coanda-lab (L3 to L5): it runs on the drawing thread, with no `$`.
// It measures itself and shows the figures in its own region, so a screenshot is enough.
//   tick  : how often `every(ms)` really fires.
//   drag  : which pointer events arrive over the region, and whether the sub-cell `fine` position exists.
//   boxes : the same tick measure while a grid of painted Boxes is redrawn each tick.

export type LabProps = { test: 'tick' | 'drag' | 'boxes' | 'press'; ms: number; cols: number; rows: number }

type LabState = {
  ticks: number
  startedAt: number
  lastAt: number
  worstGap: number
  events: number
  eventsAt: number
  hasFine: boolean
  x: number
  y: number
  down: boolean
  maxY: number
  lastType: string
  clicks: number
}

const PALETTE = ['#5663A8', '#414C8C', '#8892C9', '#2F3766']

function now(): number {
  return typeof Date !== 'undefined' ? Date.now() : 0
}

function fresh(): LabState {
  const t = now()

  return { ticks: 0, startedAt: t, lastAt: t, worstGap: 0, events: 0, eventsAt: t, hasFine: false, x: 0, y: 0, down: false, maxY: 0, lastType: 'none', clicks: 0 }
}

const Lab: ClientModule<LabProps, LabState> = (props, s) => {
  const { Box, Text } = s.elements
  const st = s.state ?? fresh()

  if (s.state === undefined) {
    s.setState(st)

    // Started once, while the state is still undefined (the host's rule).
    s.every(props.ms, () => {
      const cur = s.state ?? st
      const t = now()
      const gap = t - cur.lastAt

      s.setState({ ...cur, ticks: cur.ticks + 1, lastAt: t, worstGap: Math.max(cur.worstGap, gap) })
    })

    if (props.test === 'press') {
      s.onPointer(e => {
        if (e.type !== 'up') return
        const cur = s.state ?? st

        s.setState({ ...cur, clicks: cur.clicks + 1 })
        s.post({ kind: 'press', n: cur.clicks + 1 })
      })
    }

    if (props.test === 'drag') {
      s.onPointer(e => {
        const cur = s.state ?? st

        s.setState({
          ...cur,
          events: cur.events + 1,
          hasFine: cur.hasFine || e.fine !== undefined,
          x: e.fine?.x ?? e.x,
          y: e.fine?.y ?? e.y,
          down: e.type === 'down' || (e.type === 'move' && e.button !== undefined) ? true : e.type === 'up' || e.type === 'leave' ? false : cur.down,
          maxY: Math.max(cur.maxY, e.y),
          lastType: e.type,
        })
      })
    }
  }

  const seconds = Math.max(0.001, (st.lastAt - st.startedAt) / 1000)
  const avg = st.ticks > 0 ? Math.round((st.lastAt - st.startedAt) / st.ticks) : 0
  const tickLine = `target ${props.ms} ms · ticks ${st.ticks} · average ${avg} ms · worst gap ${st.worstGap} ms · ${(st.ticks / seconds).toFixed(1)} per s`

  if (props.test === 'tick') {
    const at = st.ticks % Math.max(1, props.cols)

    return Box({
      flexDirection: 'column',
      children: [Text({ size: 'caption', mono: true, children: tickLine }), Text({ mono: true, children: '·'.repeat(at) + '█' })],
    })
  }

  if (props.test === 'press') {
    return Box({
      flexDirection: 'column',
      children: [Text({ size: 'caption', mono: true, children: `clicks inside the region: ${st.clicks} (each posted to the plugin)` }), Text({ mono: true, children: '  ┌────────────────┐' }), Text({ mono: true, children: '  │  click here    │' }), Text({ mono: true, children: '  └────────────────┘' })],
    })
  }

  if (props.test === 'boxes') {
    const rows: ReturnType<typeof Box>[] = []

    for (let r = 0; r < props.rows; r++) {
      const cells: ReturnType<typeof Box>[] = []

      for (let c = 0; c < props.cols; c++) cells.push(Box({ width: 1, height: 1, backgroundColor: PALETTE[(st.ticks + c + r) % PALETTE.length] }))

      rows.push(Box({ flexDirection: 'row', children: cells }))
    }

    return Box({
      flexDirection: 'column',
      children: [Text({ size: 'caption', mono: true, children: `${props.cols * props.rows} painted boxes · ${tickLine}` }), Box({ flexDirection: 'column', children: rows })],
    })
  }

  // drag: a cord that follows the pointer down the region (column 4), its end a bead.
  const lines: string[] = []
  const endRow = Math.max(0, Math.min(props.rows - 1, Math.round(st.y)))

  for (let r = 0; r < props.rows; r++) lines.push(r < endRow ? '    │' : r === endRow ? '    ●' : '')

  const facts = `events ${st.events} · last ${st.lastType} · x ${st.x.toFixed(2)} y ${st.y.toFixed(2)} · sub-cell (fine) position: ${st.hasFine ? 'yes' : 'no'} · down ${st.down ? 'yes' : 'no'} · deepest row ${st.maxY}`

  return Box({
    flexDirection: 'column',
    children: [Text({ size: 'caption', mono: true, children: facts }), ...lines.map(l => Text({ mono: true, children: l === '' ? ' ' : l }))],
  })
}

export default Lab
