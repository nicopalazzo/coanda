import type { EngineInterface } from 'claude-code'

import { claudeConfigDir } from './io'
import type { Card } from '../types'
import { addCard, loadSetup, loadTypedPrimary, restore } from './store'
import { NO_DRAFT, updateAsked, updateCards, updateDemoMode, updateFocus, updateGoalsSaved, updateLamp, updateSetupDraft, updateSetupOpen, updateSetupSeen, updateTypedPrimary } from './state'
import { NO_FOCUS } from './focus'

// /coanda-demo runs the real flow from zero without touching what Nicolas keeps. The three things the band
// persists in $.store (`setup`, `cards`, `primary`) are copied to a backup first (a store key and a JSON
// file in the demo folder), then cleared; leaving puts them back exactly. His own goals file is never
// written here: the backup holds only the path stored in `setup`.
type Demoer = Pick<EngineInterface, 'state' | 'store' | 'fs' | 'env' | 'clock' | 'ui' | 'session'>

export const BACKUP_KEY = 'demoBackup'
const KEYS = ['setup', 'cards', 'primary'] as const

type Backup = { v: 1; savedAt: number; setup: unknown; cards: unknown; primary: unknown }

// Where the demo keeps its files: the Claude config folder, plugins/data/coanda/demo.
export async function demoFolder($: Pick<EngineInterface, 'env'>): Promise<string> {
  return `${await claudeConfigDir($)}/plugins/data/coanda/demo`
}

// The sample goals the demo reads: a Primary and two Lanes, in the format the band reads.
export const DEMO_GOALS_TEXT = [
  '# Focus (demo)',
  '',
  '- **Lane 1 — Ship the sample:** a small project finished and shown to one person.',
  '- **Lane 2 — Be found:** two posts about it, 5 conversations started.',
  '',
  '## Today',
  '- **Primary (N): write the first draft of the sample report (Lane 1).**',
  '',
].join('\n')

export async function demoGoalsPath($: Pick<EngineInterface, 'env'>): Promise<string> {
  return `${await demoFolder($)}/goals.md`
}

// The demo starts with no goals: an empty file (there is no delete), so Setup finds nothing until "Create a demo goals file".
export async function clearDemoGoals($: Pick<EngineInterface, 'env' | 'fs'>) {
  try {
    await $.fs.write(await demoGoalsPath($), '')
  } catch {
    // The demo folder cannot be written: the demo goes on; Setup then reads whatever file is there.
  }
}

// Creates (or rewrites) the demo goals file; the person's own files are never written.
export async function writeDemoGoals($: Pick<EngineInterface, 'env' | 'fs'>): Promise<string> {
  const path = await demoGoalsPath($)
  await $.fs.write(path, DEMO_GOALS_TEXT)

  return path
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

// A backup left in the store, if any (a crash or a closed Claude leaves it there).
export async function backupFound($: Pick<EngineInterface, 'store'>): Promise<boolean> {
  const found = (await $.store.get(BACKUP_KEY)) as Backup | null | undefined

  return found?.v === 1
}

// Forget what this session read from the store, so the band reads from zero or from the restored data.
async function forget($: Demoer) {
  await updateCards($, () => [])
  await updateSetupSeen($, () => null)
  await updateTypedPrimary($, () => null)
  await updateFocus($, () => NO_FOCUS)
  await updateSetupDraft($, () => NO_DRAFT)
  await updateGoalsSaved($, () => 'no')
}

// Start: back up, check the backup reads back the same, clear, open Setup with the lamp. Returns false when
// a backup is already there (it is never overwritten: the person is asked to restore it first).
export async function startDemo($: Demoer): Promise<boolean> {
  if (await backupFound($)) return false

  const backup: Backup = { v: 1, savedAt: await $.clock.now(), setup: null, cards: null, primary: null }
  for (const key of KEYS) backup[key] = (await $.store.get(key)) ?? null
  await $.store.set(BACKUP_KEY, backup)
  if (!same(await $.store.get(BACKUP_KEY), backup)) throw new Error('the backup did not read back the same: nothing was cleared')
  // The file is a second copy for the person; a failed write does not stop the demo, the store copy stands.
  try {
    await $.fs.write(`${await demoFolder($)}/backup.json`, JSON.stringify(backup, null, 2))
  } catch {
    $.ui.toast('Demo: the backup file could not be written; the copy in the store stands.')
  }
  for (const key of KEYS) await $.store.delete(key)
  await forget($)
  await clearDemoGoals($)
  await updateSetupOpen($, () => true)
  await updateLamp($, () => 'dark')
  await updateDemoMode($, () => 'on')

  return true
}

// Leave: the three items go back exactly as they were (absent stays absent), checked by reading them back;
// the backup goes only after that. Returns the keys that did not come back the same (empty when all did).
export async function restoreMine($: Demoer): Promise<string[]> {
  const backup = (await $.store.get(BACKUP_KEY)) as Backup | null | undefined
  if (backup?.v !== 1) {
    await updateDemoMode($, () => 'off')

    return []
  }

  const wrong: string[] = []
  for (const key of KEYS) {
    const was = backup[key] ?? null
    if (was === null) await $.store.delete(key)
    else await $.store.set(key, was)
    if (!same(await $.store.get(key), was)) wrong.push(key)
  }
  if (wrong.length > 0) return wrong

  await $.store.delete(BACKUP_KEY)
  await forget($)
  await updateSetupOpen($, () => false)
  await updateLamp($, () => 'off')
  await updateDemoMode($, () => 'off')
  await restore($)
  await loadSetup($)
  await loadTypedPrimary($)

  return []
}

// Reset to zero: the demo's own stored items are cleared, the demo file is emptied, Setup opens again with
// the lamp. The backup is not touched, so the person's data is still restorable.
export async function resetDemo($: Demoer) {
  for (const key of KEYS) await $.store.delete(key)
  await clearDemoGoals($)
  await forget($)
  await updateSetupOpen($, () => true)
  await updateLamp($, () => 'dark')
}

export type Sample = 'small' | 'big' | 'guessed'

const CARD = (kind: 'small' | 'big', id: string, sessionId: string, now: number): Card =>
  kind === 'small'
    ? {
        id,
        sessionId,
        question: 'Rename fill2 to fillSafely?',
        facts: [],
        options: [
          { label: 'Rename to fillSafely', consequence: 'Changes 1 file' },
          { label: 'Keep fill2', consequence: 'Changes no file' },
        ],
        isHardToUndo: false,
        couldBeWrongIf: '',
        askedBy: 'demo',
        from: 'tool',
        status: 'open',
        askedAt: now,
      }
    : {
        id,
        sessionId,
        question: 'Where should Lanes live?',
        facts: ['The file works for you today', 'Testers have no FOCUS.md'],
        options: [
          { label: 'Plugin store', consequence: 'Works at install; moving back needs a migration' },
          { label: 'Keep the file', consequence: 'Testers must create a FOCUS.md' },
        ],
        isHardToUndo: true,
        couldBeWrongIf: 'Testers never keep goals in a file',
        askedBy: 'demo',
        from: 'tool',
        status: 'open',
        askedAt: now,
      }

// A sample question, live: a small or big choice is a card added through addCard (stored like a real one,
// so leaving the demo drops it with the rest); the guessed question is the inferred one the band shows.
export async function addSample($: Demoer, kind: Sample) {
  if (kind === 'guessed') {
    await updateAsked($, () => ({
      text: 'Is the layout right now?',
      options: [
        { label: 'Yes', prompt: 'Yes, the layout is right.' },
        { label: 'No, here is why', prompt: 'No, the layout is not right: ' },
      ],
      from: 'inferred',
    }))

    return
  }

  const now = await $.clock.now()
  await addCard($, CARD(kind, `demo-${kind}-${now.toString(36)}`, await $.session.id(), now))
}
