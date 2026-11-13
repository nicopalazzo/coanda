import { expect, test } from 'claude-code/testing'

test('the band draws on desktop', async ($, on) => {
  on('tool.register', () => ({ value: { tool: 'mcp__coanda__ask_decision' } }))
  on('store.get', () => ({ value: null }))
  on('store.set', () => ({ value: undefined }))
  on('session.id', () => ({ value: 's1' }))
  on('clock.now', () => ({ value: 1_000_000 }))
  on('clock.every', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/Org', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({
    plugin: 'coanda',
    component: 'AbovePrompt',
    surface: 'desktop',
    props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 30, bodyColumns: 80, scroll: { offset: 0, bodyRows: 30 }, view: {} },
  })
  expect(await ui.drawn()).toMatchObject({ type: 'Box' })
  await ui.unmount()
})
