import type { EngineInterface } from 'claude-code'

// Every path and every file read or write of the mod. A path is built from three
// sources only: the Focus source the person named in setup (stored absolute), the Claude config
// directory with the home directory, and the plugin's own folder. HOME and CLAUDE_CONFIG_DIR are
// the only environment names read (with LC_ALL, LC_MESSAGES and LANG, for the language: i18n.ts); they are spelled out
// because the host lists them.
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

// The `language` setting of Claude Code (settings.json in the config directory); undefined when there is none or it
// cannot be read.
export async function languageSetting($: Files & Places): Promise<unknown> {
  try {
    return (JSON.parse(String(await $.fs.read(`${await claudeConfigDir($)}/settings.json`))) as { language?: unknown }).language
  } catch {
    return undefined
  }
}

// The system locale variables, in the order they win.
export async function localeVars($: Places): Promise<(string | undefined)[]> {
  return [await $.env.get('LC_ALL'), await $.env.get('LC_MESSAGES'), await $.env.get('LANG')]
}

// The Focus source as text; throws when it cannot be read.
export async function readFocusFile($: Files, path: string): Promise<string> {
  return String(await $.fs.read(path))
}

// Where the person's goals live (band-rebuild-plan.md, D3): one file, found in every project.
export async function goalsFile($: Places): Promise<string> {
  return `${await claudeConfigDir($)}/goals.md`
}

// The day record's journal file sits in a `journal` folder next to the goals file the person named in
// setup: <folder of the goals file>/journal/wins-YYYY-MM.md. No folder is written but that one.
export function journalPath(focusPath: string, file: string): string {
  const at = focusPath.lastIndexOf('/')

  return `${at <= 0 ? '' : focusPath.slice(0, at)}/journal/${file}`
}

// Writes one journal file: the file as it stands (none yet is fine; one that exists and cannot be
// read stops the write, so nothing is overwritten blind) goes through `change`, and back.
// $.fs.write replaces the whole file, so this is a read, then a write.
export async function writeJournal($: Files, path: string, change: (existing: string) => string): Promise<void> {
  const existing = (await $.fs.exists(path)) ? String(await $.fs.read(path)) : ''
  await $.fs.write(path, change(existing))
}

// Mirror's home folder (BAND-CONTRACT-v1): MIRROR_HOME when set, else HOME/.mirror. Its two files for the band
// are nudge-now.json (Mirror writes) and band.json (the band writes).
export async function mirrorHome($: Places): Promise<string> {
  const set = await $.env.get('MIRROR_HOME')

  return set === undefined || set === '' ? `${await home($)}/.mirror` : slashless(set)
}

// A file's text, or null when it is not there or cannot be read.
export async function readOptional($: Files, path: string): Promise<string | null> {
  try {
    return (await $.fs.exists(path)) ? String(await $.fs.read(path)) : null
  } catch {
    return null
  }
}

// One atomic write: the text goes to a file of its own in the same folder, then is renamed over the target, so a reader
// never sees half a file. The host's own write has no rename, so `mv` does it (no shell); where that fails, the text is
// written straight to the target (a reader that meets half of it reads the file as empty, which Mirror takes as "no band").
export async function writeAtomic($: Files & Pick<EngineInterface, 'process'>, path: string, text: string, tag: string): Promise<void> {
  const temp = `${path}.${tag}.tmp`
  await $.fs.write(temp, text)
  try {
    if ((await $.process.run(['mv', '-f', temp, path])).exitCode === 0) return
  } catch {
    // fall through to the plain write
  }
  await $.fs.write(path, text)
}
