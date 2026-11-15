import type { Step, StepStatus } from '../types'
import { BOOKKEEPING } from './lexicon'

export type PlanInput = {
  items?: { content: string; status: StepStatus }[]
  advance?: boolean
  done?: number[]
  start?: number
}

const stamp = (step: Step, status: StepStatus, now: number): Step => ({
  ...step,
  status,
  startedAt: status !== 'pending' ? (step.startedAt ?? now) : step.startedAt,
  endedAt: status === 'completed' ? (step.endedAt ?? now) : undefined,
})

// The app's task list call (update_plan), applied to the steps we keep: a new list keeps the
// notes of a step whose words did not change; advance / done / start move the statuses.
export function applyPlan(steps: Step[], input: PlanInput, now: number): Step[] {
  let next = steps

  if (Array.isArray(input.items)) {
    next = input.items.slice(0, 12).map(item => {
      const kept = steps.find(s => s.content === item.content)

      return stamp(kept ?? { content: String(item.content).slice(0, 120), status: 'pending', files: [], calls: 0 }, item.status, now)
    })
  }

  if (input.advance === true) {
    const at = next.findIndex(s => s.status === 'in_progress')
    const after = next.findIndex((s, i) => i > at && s.status === 'pending')
    next = next.map((s, i) => (i === at ? stamp(s, 'completed', now) : i === after ? stamp(s, 'in_progress', now) : s))
  }

  for (const n of input.done ?? []) {
    next = next.map((s, i) => (i === n - 1 ? stamp(s, 'completed', now) : s))
  }

  if (typeof input.start === 'number') {
    const n = input.start - 1
    next = next.map((s, i) => (i === n ? stamp(s, 'in_progress', now) : s.status === 'in_progress' ? stamp(s, 'pending', now) : s))
  }

  return next
}

// A tool call made while a step runs counts toward it; an edited file is named once.
export function noteCall(steps: Step[], file: string | undefined): Step[] {
  const at = steps.findIndex(s => s.status === 'in_progress')

  if (at < 0) return steps

  return steps.map((s, i) =>
    i !== at ? s : { ...s, calls: s.calls + 1, files: file && !s.files.includes(file) ? [...s.files, file].slice(-8) : s.files },
  )
}

export const currentStep = (steps: Step[]): number => steps.findIndex(s => s.status === 'in_progress')

export const minutes = (from?: number, to?: number): string =>
  from === undefined ? '' : `${Math.max(0, Math.round(((to ?? from) - from) / 60000))} min`

// Bookkeeping steps (saving notes, running checks) say nothing about what got done (in all four languages).
export { BOOKKEEPING }

export const lastOutcomeStep = (steps: Step[]): string =>
  [...steps].reverse().find(s => s.status === 'completed' && !BOOKKEEPING.test(s.content))?.content ?? ''
