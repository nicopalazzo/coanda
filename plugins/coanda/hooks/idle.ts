export const PRIMARY_ONLY_AFTER = 2 * 60_000
export const HIDE_AFTER = 10 * 60_000

export type Stage = 'full' | 'primary' | 'hidden'

// The band calms down when nothing happens: the Primary row alone after 2 minutes, nothing after 10.
// Anything that needs the person (a question, a running turn) keeps the full band.
export function idleStage(isBusy: boolean, quietMs: number): Stage {
  if (isBusy) return 'full'
  if (quietMs >= HIDE_AFTER) return 'hidden'

  return quietMs >= PRIMARY_ONLY_AFTER ? 'primary' : 'full'
}
