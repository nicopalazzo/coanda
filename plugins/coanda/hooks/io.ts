import type { EngineInterface } from 'claude-code'

// Every path and every file read or write of the mod. A path is built from three
// sources only: the Focus source the person named in setup (stored absolute), the Claude config
// directory with the home directory, and the plugin's own folder. HOME and CLAUDE_CONFIG_DIR are
// the only environment names read; they are spelled out because the host lists them.
type Files = Pick<EngineInterface, 'fs'>
type Places = Pick<EngineInterface, 'env'>

const slashless = (dir: string): string => dir.replace(/\/+$/, '')

// The person's home directory; throws when the host has none.
async function home($: Places): Promise<string> {
  const dir = await $.env.get('HOME')
  if (dir === undefined || dir === '') throw new Error('no home directory')

  return slashless(dir)
}

// The person's home directory, or null when the host has none (then `~/` cannot be expanded).
export async function homeDirectory($: Places): Promise<string | null> {
  try {
    return await home($)
  } catch {
    return null
  }
}

// Where Claude Code keeps its settings: CLAUDE_CONFIG_DIR when set, else HOME/.claude.
export async function claudeConfigDir($: Places): Promise<string> {
  const set = await $.env.get('CLAUDE_CONFIG_DIR')

  return set === undefined || set === '' ? `${await home($)}/.claude` : slashless(set)
}

// The Focus source as text; throws when it cannot be read.
export async function readFocusFile($: Files, path: string): Promise<string> {
  return String(await $.fs.read(path))
}

// Where the person's goals live (band-rebuild-plan.md, D3): one file, found in every project.
export async function goalsFile($: Places): Promise<string> {
  return `${await claudeConfigDir($)}/goals.md`
}
