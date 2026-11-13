# Coanda: status

> Updated by Claude, Fri 13 Nov 2026, 15:05 (Paris).

## Where it stopped

- Repository created (`main` holds one empty commit; work is on `feat/seed`, nothing committed there yet).
- **Keep files copied** from `mod-area/plugins/intent/` with new ids: plugin `coanda`, version 0.1.0, tool `mcp__coanda__ask_decision` (in `desktop.test.tsx`). `question.ts` lost `SOMETHING_ELSE` (v3 rule 3).
- **`types/index.d.ts` adapted** (13 Nov, 15:10): Legacy, View, Decided and Mirror types dropped. Added `DecisionStatus` (open, answered, deferred, superseded, cancelled), `DecisionOption` (label + consequence), `isHardToUndo`, `couldBeWrongIf`, `LineSource` (tool, agent, inferred) on cards and band rows, a `details` action and a `link` button for the quiet exit. Card's old `source` is now `askedBy`; `options` are objects, so `cards.ts` must follow.
- **`hooks/imports.check.mjs` adapted** (13 Nov, 15:20): `rules`, `parts`, `mirror` removed from the lists. While `register.tsx` is missing, files not copied yet are listed, not failed. The old-name check now also catches the old plugin id where it is used as an id (quoted, tool prefix, state key). A planted old id in a scratch copy was caught.
- **`hooks/cards.ts` adapted** (13 Nov, 15:30): the `ask_decision` tool asks for 2 or 3 options, each with a label and its consequence, plus `hard_to_undo`, `could_be_wrong_if`, `asked_by`. It refuses a bare "go / ok / proceed" option and an option with no consequence. New `close()` (a card leaves `open` once) and `supersede()` (same session, same question). `remember` (Decided list) dropped. A smoke run of 7 cases (scratchpad, `node --experimental-strip-types`) gave the expected results.
- **`hooks/next.ts` + `hooks/model.ts` adapted** (13 Nov, 15:40): the one Haiku call per reply and its parser stay. Prompt no longer mentions a "Something else" button. New `toAsked()` marks a question found in prose `inferred` (an empty question gives none, also for the old array-only reply). New `questionToShow()`: an open card of this session always wins over the inferred question. Smoke run (scratch copy) gave the expected results.
- **`hooks/state.ts` adapted** (13 Nov, 15:50), before store (store imports it): atoms under `coanda`; `view`, `openStep`, `decided`, `mirror` dropped; `detailsOpen` added. 16 atoms, one getter and one updater each.
- **`hooks/store.ts` adapted** (13 Nov, 15:55): keeps setup and cards (`{ v: 1, items }`); Decided list and the 0.1.x bare-array rewrite dropped. Cards are no longer deleted: `closeCard` (answered / superseded / cancelled), `deferCard` (Later: deferred, to the back), `addCard` supersedes an open card on the same question. `trim` keeps every open and deferred card plus the 30 newest closed ones. Open question for the band rebuild: when a deferred card comes back.
- **`hooks/register.tsx` adapted** (13 Nov, 16:05; before `io` at Nicolas's ask): kept `turn.step` recovery, `claim` + `send`, `fillSafely`, the 60 s Focus tick, the `update_plan` listener, the `ask_decision` call (now `mcp__coanda__ask_decision`), the `ui.render` toast. Dropped Mirror tick, `/intent-demo`, Steps and Decided views. New: a press closes its card as answered; "Later" defers it; typing in the prompt answers the open card the band shows (v3 rule 3); `details` toggles the Primary row's Details; the snapshot now carries the real session id.
- **`hooks/io.ts` adapted** (13 Nov, 16:10): `homeDirectory`, `claudeConfigDir`, `readFocusFile` kept as they were; `readMirrorFile` and its Mirror imports dropped. 39 lines.
- Copied into `docs/`: the handover and the three Band prototypes.
- `.claude-plugin/types/` (host types) is copied locally and ignored by git.

## Checks

- `tsc -p plugins/coanda/tsconfig.json` with TypeScript 5.9.3: **fails, as expected, until `band` and `render` exist**: 2 "cannot find module" errors plus 1 that follows from `render` missing (`action` has no type). No other error.
- `claude plugin validate`: fails, as expected: `hooks.json` names `register.tsx`, which comes with the Adapt step. Also warns: no icon (logo not drawn yet).
- `node hooks/imports.check.mjs`: seed mode ended (register exists): fails only on the 2 missing files `band`, `render`.
- `claude plugin test`: not run yet (needs `register.tsx`).

## Next action

Adapt one file at a time, in this order: rebuild `band` and `render` from the v3 rules, then the tests. All checks should pass once those two exist.

## Plan for `band.ts` (worked out 13 Nov, 15:20, not written yet)

Read for it: the old `band.ts` in `mod-area` (209 lines, in full) and the text of `docs/design/prototypes/band-v3.html` (tags stripped). Everything below is Claude's proposal (inferred), not yet checked by Nicolas.

**`bandModel(snapshot)` stays the one function that decides.** Order:

1. Setup not finished or reopened → `{ kind: 'setup' }`. Bring the old Setup rows over almost as they are (old file, lines 53 to 108); change "Intent asks once" to "Coanda asks once".
2. Idle stage (`idle.ts`): after 2 min quiet, the Primary row alone; after 10 min, `hidden`. **Catch:** `snapshot()` in `register.tsx` sets `lastActivity: 0`, so every moment would count as quiet. Treat 0 as "unknown, show the full band" until `register` fills it in.
3. **Sent** (`s.sent` set): one row, "Sent ✓ <label>", plus "· Claude is working" while working.
4. **Small choice** (an open card for this session, via `questionToShow` in `next.ts`): label "Question", the question as its one text line, one button per option with its consequence as a second line, quiet link "Later" (`later`). Chip "hard to undo" only when `isHardToUndo`. Waiting count in the label only above 1. Facts and `couldBeWrongIf` are not shown here (rule 1: a pick shows the choices only); they belong to the Big choice moment.
5. **Guessed question** (`s.asked`, only when not working and no card open): label "Question", source `inferred`, suggestions as buttons (`send`), quiet link "Not for me".
6. **Working**: one NOW row, "<step> · step 2 of 5", from `update_plan` (a tool fact, no stamp). No plan: "Working".
7. **Resting**: one NOW row. A finished plan gives "Idle · <last outcome step>" (tool fact). Else `reply.done` from Haiku with source `inferred`. Else "Idle". No NEXT row.

**Primary row** (`primary`): "◎ <primaryText>" and a quiet link "Details" / "Less" (`details`). When open, a second line with `laneText`. There is no "done when" field in `FocusResult` yet: say so; don't invent one.

**Budget** (rule 5), checked by one exported function the tests can call: no question → at most 2 rows and 1 button; a question → at most 3 buttons, 1 link, 1 chip. The Primary row is counted on its own.

**Moments not built yet** (no data for them in stage 2): Big choice (criterion first), Review a result, Held at checkpoint, Coming back, First thought, Session end, another session waiting, menu bar.

**Small changes to the data types this needs** (`types/index.d.ts`):
- `BandButton.detail?: string` (the consequence line under an option).
- `BandAction { kind: 'dismiss' }` for "Not for me", and its `case` in `dispatch()` in `register.tsx`: clear `asked` and `suggestions`.
- Optional: a `moment` field on the `rows` model ('sent' | 'pick' | 'guessed' | 'working' | 'resting') so tests and `render` can tell which one it is.

**Then `render.tsx`**: it draws a model and decides nothing. Host lessons from the old file: other mods' bands stack below ours after a divider, never inside a Box with a width; a long line clips with `minWidth={0}`; the first text field takes focus. `line.ts` draws the divider as an SVG.

**Done when**: `tsc -p` (TypeScript 5.9), `node hooks/imports.check.mjs`, `claude plugin validate` and `claude plugin test` all pass, and the tests are adapted from `mod-area/plugins/intent/hooks/intent.test.tsx` (keep the pure tests and the Setup tests; drop the Mirror and the 0.1.x store tests; rewrite the band tests for v3). Claude cannot see the band: the first look on screen is Nicolas's.
