// Where the first [blank] sits in a fill text, for the prompt box to mark it.
// (No "something else" answer: typing in the prompt is the person's own answer, v3 rule 3.)
export function blankOf(text: string): { start: number; end: number } | undefined {
  const at = text.indexOf('[')
  const end = text.indexOf(']', at)

  return at >= 0 && end > at ? { start: at, end: end + 1 } : undefined
}
