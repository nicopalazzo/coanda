import type { GoalsProposal } from '../types'

// What Setup sends Claude when the person presses a button that asks for help with the goals file
// (band-rebuild-plan.md section 3, D2, D3). Pure: the path and the scope come in as arguments.
// Claude writes the file in the format `parseFocusMd` reads, so the band can show it back.
export type GoalsAsk = 'setup' | 'find' | 'change' | 'fix'

export const GOALS_FORMAT = ['## Today', '- **Primary (N): <the goal> (Lane 1).**', '- **Lane 1 — <name>:** <the outcome> by <day month>.', '- **Lane 2 — <name>:** <the outcome> by <day month>.'].join('\n')

// `onlyIn`: a folder to look in and nowhere else (the demo's); absent, Claude looks through the person's own files.
export function goalsMessage(ask: GoalsAsk, path: string, onlyIn?: string): string {
  const format = `Write it to ${path} in this format, and nothing else in that file:\n${GOALS_FORMAT}`

  switch (ask) {
    case 'setup':
      return `Set up my goals and Lanes for Coanda. Check whether ${path} already has them. If it does, tell me what you found. If not, explain in one line each what a Goal (the one thing that counts today) and a Lane (a longer outcome with a date) are, ask me for mine, and let me skip. ${format}`
    case 'find':
      return `Look through ${onlyIn === undefined ? 'my files' : `the folder ${onlyIn} and nowhere else`} for things that look like my Goal or my Lanes, then show what you found with the propose_goals tool. Do not write ${path} yourself: if I press "Save these" in the band, you get a message to write it.`
    case 'change':
      return `I want to change my goals or Lanes in ${path}. Show me what is in it, ask what to change, and rewrite it once I confirm. ${format}`
    case 'fix':
      return `Coanda cannot read my goals file ${path}. Look at it, tell me what is wrong, and fix it once I agree. ${format}`
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
export const proposalLane = (lane: GoalsProposal['lanes'][number], i: number): string => `Lane ${i + 1}  ${lane.name}: ${lane.outcome}${lane.by === '' ? '' : ` · by ${lane.by}`}`

// The proposal as the goals file would hold it, in the format `parseFocusMd` reads.
export function proposalText(p: GoalsProposal): string {
  return [
    '## Today',
    `- **Primary (N): ${p.goal}${p.lanes.length > 0 ? ' (Lane 1)' : ''}.**`,
    ...p.lanes.map((lane, i) => `- **Lane ${i + 1} — ${lane.name}:** ${lane.outcome}${lane.by === '' ? '' : ` by ${lane.by}`}.`),
  ].join('\n')
}

// Pressing Save these / Change on a proposal: Claude writes the file (D3: Coanda only reads it).
export function proposalMessage(what: 'save' | 'revise', path: string, p: GoalsProposal): string {
  return what === 'save'
    ? `Save these goals to ${path}, exactly as written, and nothing else in that file:\n${proposalText(p)}`
    : `I want to change the goals you proposed:\n${proposalText(p)}\nAsk me what to change, then show the new version with propose_goals.`
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
