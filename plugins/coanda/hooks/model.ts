import type { EngineInterface } from 'claude-code'

import type { Moment, Pending, Reply } from '../types'
import { clip, nextSystem, parseNext } from './next'

// The one door to the model: no other file calls $.model.complete, once per reply.
// Reads where the work stands after an answer: the moment, the question and its likely answers,
// and the next step. What it finds is a guess: toAsked (next.ts) marks the question inferred, and
// an open decision card always wins over it. An unanswered call gives the quiet default.
export async function askReply($: Pick<EngineInterface, 'model'>, p: Pending): Promise<Reply> {
  const reply = await $.model.complete({
    model: 'haiku',
    system: nextSystem(),
    prompt: `User asked:\n${clip(p.prompt, 3000)}\n\nAssistant replied:\n${clip(p.answer, 6000)}\n\nJSON:`,
    maxTokens: 300,
    effort: 'low',
    timeoutMs: 15000,
  })
  const got = reply.isAnswered ? parseNext(reply.text) : { moment: 'other' as Moment, question: '', done: '', next: '', suggestions: [] }

  // isJudgment (the first-thought step's signal) is not asked of the model before stage 3.
  return { ...got, isJudgment: false }
}
