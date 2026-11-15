import type { GoalsProposal } from '../types'
import { t } from './i18n'

// What Setup sends Claude when the person presses a button that asks for help with the goals file
// (band-rebuild-plan.md section 3, D2, D3). Pure: the path and the scope come in as arguments.
// Claude writes the file in the format `parseFocusMd` reads, so the band can show it back.
export type GoalsAsk = 'setup' | 'find' | 'change' | 'fix'

// The format of the goals file in the person's language: Claude is asked to write it with these words, and the parser
// reads them (lexicon.ts). `<…>` marks what Claude fills in.
export function goalsFormat(): string {
  const colon = t('file.colon')
  const bold = colon.trimEnd()
  const lane = t('word.lane')
  const by = t('file.laneBy', { date: `<${t('fmt.date')}>` })

  return [
    `## ${t('file.today')}`,
    `- **${t('file.primary')}${t('file.note', { text: 'N' })}${colon}<${t('fmt.goal')}>${t('file.note', { text: `${lane} 1` })}${t('file.dot')}**`,
    `- **${lane} 1 — <${t('fmt.name')}>${bold}** <${t('fmt.outcome')}>${by}${t('file.dot')}`,
    `- **${lane} 2 — <${t('fmt.name')}>${bold}** <${t('fmt.outcome')}>${by}${t('file.dot')}`,
  ].join('\n')
}

// `onlyIn`: a folder to look in and nowhere else (the demo's); absent, Claude looks through the person's own files.
export function goalsMessage(ask: GoalsAsk, path: string, onlyIn?: string): string {
  const format = t('ask.format', { path, format: goalsFormat() })

  switch (ask) {
    case 'setup':
      return t('ask.setup', { path, format })
    case 'find':
      return t('ask.find', { where: onlyIn === undefined ? t('ask.where.mine') : t('ask.where.folder', { folder: onlyIn }), path, save: t('setup.save') })
    case 'change':
      return t('ask.change', { path, format })
    case 'fix':
      return t('ask.fix', { path, format })
  }
}

const clip = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '')

// The tool's input, held to a proposal: a Goal and 0 to 3 Lanes, each an outcome (a name and what it should
// achieve) with an optional date as text ("14 Dec"). A refusal is a plain sentence for Claude, never an exception.
export function toProposal(input: unknown): GoalsProposal | string {
  const raw = (input ?? {}) as Record<string, unknown>
  const goal = clip(raw.goal, 120)
  if (goal === '') return 'No proposal shown: the goal is empty. Give the one thing that counts today.'

  const lanes = (Array.isArray(raw.lanes) ? raw.lanes : [])
    .map(one => {
      const lane = (one ?? {}) as Record<string, unknown>

      return { name: clip(lane.name, 30), outcome: clip(lane.outcome, 80), by: clip(lane.by, 20) }
    })
    .filter(one => one.name !== '' || one.outcome !== '')
    .slice(0, 3)
  const label = lanes.find(one => one.name === '' || one.outcome === '')
  if (label !== undefined) return `No proposal shown: a Lane needs a name and an outcome ("${label.name || label.outcome}" has only one).`

  return { goal, lanes }
}

// A Lane as one line of the band: "Lane 1  Visible: be visible with a product use case · by 14 Dec".
export const proposalLane = (lane: GoalsProposal['lanes'][number], i: number): string =>
  `${t('word.lane')} ${i + 1}  ${lane.name}: ${lane.outcome}${lane.by === '' ? '' : ` · ${t('lane.by', { date: lane.by })}`}`

// The proposal as the goals file would hold it, in the format `parseFocusMd` reads.
export function proposalText(p: GoalsProposal): string {
  const colon = t('file.colon')
  const lane = t('word.lane')

  return [
    `## ${t('file.today')}`,
    `- **${t('file.primary')}${t('file.note', { text: 'N' })}${colon}${p.goal}${p.lanes.length > 0 ? t('file.note', { text: `${lane} 1` }) : ''}${t('file.dot')}**`,
    ...p.lanes.map((one, i) => `- **${lane} ${i + 1} — ${one.name}${colon.trimEnd()}** ${one.outcome}${one.by === '' ? '' : t('file.laneBy', { date: one.by })}${t('file.dot')}`),
  ].join('\n')
}

// Pressing Save these / Change on a proposal: Claude writes the file (D3: Coanda only reads it).
export function proposalMessage(what: 'save' | 'revise', path: string, p: GoalsProposal): string {
  return what === 'save' ? t('ask.save', { path, text: proposalText(p) }) : t('ask.revise', { text: proposalText(p) })
}

// The tool Claude calls to show proposed goals in the band, to be saved only when the person agrees.
export const PROPOSE_GOALS = {
  name: 'propose_goals',
  description:
    "Show the user's proposed Goal and Lanes in the band above their prompt, for them to save or change; use it after " +
    'you looked through their files (or talked with them) and have goals to propose, instead of writing the goals file yourself. ' +
    'The goal is the one thing that counts today; a Lane is a longer outcome with a date (at most 3). Nothing is written until ' +
    'the user presses "Save these", which sends you a message to write the file; end your turn after calling it.',
  inputSchema: {
    type: 'object',
    properties: {
      goal: { type: 'string', description: 'The one thing that counts today, a short sentence' },
      lanes: {
        type: 'array',
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'A short name, e.g. "Visible"' },
            outcome: { type: 'string', description: 'What it should achieve, e.g. "portfolio live"' },
            by: { type: 'string', description: 'The date as text, e.g. "14 Dec"; leave out when unknown' },
          },
          required: ['name', 'outcome'],
        },
      },
    },
    required: ['goal'],
  },
  isDeferred: false,
}
