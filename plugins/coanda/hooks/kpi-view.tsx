import type { KpiDoc } from '../types'
import { kpiLines } from './kpi'
import type { Draw } from './render'

// /coanda-kpi: the KPI page, drawn in place of the band while on. Each KPI per session, the days with the
// band off (the baseline) next to the days with it on.
const MUTED = 'subtle'
const NAME = 30
const COL = 26

const pad = (t: string, n: number) => (t.length >= n ? `${t.slice(0, n - 1)} ` : t + ' '.repeat(n - t.length))

export function renderKpi(draw: Draw, doc: KpiDoc, onClose: () => Promise<void>): JSX.Element {
  const { Box, Text, Button } = draw.ui
  const page = kpiLines(doc)

  return (
    <Box flexDirection="column">
      <Text bold>{`KPIs · per session · now ${doc.mode === 'off' ? 'baseline (band off)' : 'band on'}`}</Text>
      <Text mono color={MUTED}>{`${pad('', NAME)}${pad(`Off · ${page.off}`, COL)}On · ${page.on}`}</Text>
      {page.lines.map(line => (
        <Text key={line.name} mono>{`${pad(line.name, NAME)}${pad(line.off, COL)}${line.on}`}</Text>
      ))}
      <Text color={MUTED}>Corrections are counted from the first word of a message: some are missed, some are false.</Text>
      <Box flexDirection="row">
        <Button key="kpi-close" variant="secondary" label="Close" onPress={onClose} />
      </Box>
    </Box>
  )
}
