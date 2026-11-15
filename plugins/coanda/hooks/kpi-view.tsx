import type { KpiDoc } from '../types'
import { t } from './i18n'
import { kpiLines } from './kpi'
import type { Draw } from './render'

// /coanda-kpi: the KPI page, drawn in place of the band while on. Each KPI per session, the days with the
// band off (the baseline) next to the days with it on.
const MUTED = 'subtle'
const NAME = 30
const COL = 26

// Chinese characters take two cells; the columns line up by cells, not by characters.
const cells = (text: string): number => [...text].reduce((n, ch) => n + (/[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]/u.test(ch) ? 2 : 1), 0)

const pad = (text: string, n: number) => {
  if (cells(text) < n) return text + ' '.repeat(n - cells(text))

  let kept = ''
  for (const ch of text) {
    if (cells(kept + ch) > n - 1) break
    kept += ch
  }

  return `${kept} `
}

export function renderKpi(draw: Draw, doc: KpiDoc, onClose: () => Promise<void>): JSX.Element {
  const { Box, Text, Button } = draw.ui
  const page = kpiLines(doc)

  return (
    <Box flexDirection="column">
      <Text bold>{t('kpi.title', { mode: doc.mode === 'off' ? t('kpi.modeOff') : t('kpi.modeOn') })}</Text>
      <Text mono color={MUTED}>{`${pad('', NAME)}${pad(`${t('kpi.off')} · ${page.off}`, COL)}${t('kpi.on')} · ${page.on}`}</Text>
      {page.lines.map(line => (
        <Text key={line.name} mono>{`${pad(line.name, NAME)}${pad(line.off, COL)}${line.on}`}</Text>
      ))}
      <Text color={MUTED}>{t('kpi.note')}</Text>
      <Box flexDirection="row">
        <Button key="kpi-close" variant="secondary" label={t('kpi.close')} onPress={onClose} />
      </Box>
    </Box>
  )
}
