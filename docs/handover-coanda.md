# Handover: Intent becomes Coanda

> Written by Claude, Fri 13 Nov 2026, 14:50 (Paris), from the session of 13 Nov. Nicolas to correct.
> This is the brief for the session that starts the new repository. Read it first.

## In one line

The product is renamed **Coanda** (for now) and restarts in a new repository with plugin id `coanda`, seeded with the code that still holds. This repo (`mod-area`, plugin `intent`) stays as history.

## Why a fresh start

- **Name collision (read, Codex report):** Augment ships an agent-coordination product called **Intent** (intentapp.dev, Feb 2026). Intend (intend.do, formerly Complice) sits next to it. A Claude Code plugin `kyptov/claude-plugin-intent` also uses the word.
- **Old plan too heavy for the goal:** 36 stories in 6 epics (BMAD) for a solo mod whose month-one goal is 10 pieces of feedback. Codex's staged path replaces it (below).
- **A second rename in place** would carry the old plugin id, store keys and branches along.

## Name

- **Coanda**, from the Coandă effect: a flow stays attached to a curved surface and follows it. The Band is the curve attention follows.
- Checked (13 Nov, one web search): no AI or developer product called Coanda; only an old free engineering utility for water-screen flow calculations.
- **Not checked:** domain, GitHub organisation, npm, plugin id availability, trademark (EU, US). Henri Coandă is a real person (Romanian inventor; Bucharest airport bears his name): check whether that limits use.
- Logo: new one needed (the Intent files in `Exploring Ideas/intent-brand/` no longer apply). Three starting ideas from the session: a line bending around an arc that reads as a "C"; a curved band with one dot riding it; a slot with flow wrapping a half-circle. Nicolas draws it.
- Names rejected on 13 Nov, with the reason: IntentZone (search collapses to "Intent"), Intenzione (fine, but in the "intent" family), Einzel (strong, kept as runner-up), Lintel, Fermata, Mooring, Cairn, Plumb (same-name tools in the agent space), Laminar, Collimator, Ballast, Sayso, Decido, Firstcall, Steerage (taken or crowded).

## What Coanda is now (the positioning the research points to)

- Not a focus app and not an agent orchestrator. **A decision aid inside Claude Code: catch consequential wrong turns while protecting the person's chosen goal.** (Codex's wording, close to Perplexity's "make agent work legible and steerable".)
- First host: Claude Code desktop, through the official mods surface (Anthropic launch, 1 Oct 2026; the API can change between releases).

## The display rules (prototype v3, approved 13 Nov)

1. **Weight follows the job.** Nothing asked: one line, no buttons. Pick: the choices only. Judge: one input. Check: one link to the evidence.
2. **Show exceptions only.** A source stamp only when a line is not a tool fact (inferred, agent claim, stale). A risk chip only when hard to undo. A queue count only above 1.
3. **Typing in the prompt is the person's own answer.** No "Write my own answer" button.
4. **One quiet exit**, as a text link ("Later", "Skip", "Not for me").
5. **Budget:** at most 2 rows when nothing is asked; at most 3 buttons and 1 chip when something is.
6. **Primary row shows the goal only**; "Details" opens the "done when" line and the Lane. Lane settings live in Setup.

Moments and their job (v3): Resting (nothing) · Working (nothing, unless another session waits) · Small choice (pick 1 of 2) · Big choice (criterion first, then pick) · Guessed question (pick, or "not for me") · Review a result (check the one unchecked thing) · Held at checkpoint (choose a direction) · Coming back (reorient) · First thought (one line, or "I need evidence first") · Session end (optional look back; Mirror off) · Menu bar (later, only if testers miss decisions).

Prototypes, saved in this repo: `docs/design/prototypes/band-v1.html` (both researches, everything visible), `band-v2.html` (Codex added), `band-v3.html` (rules applied). Published (private): [v1](https://claude.ai/artifact/PFXo6qjHTHEWYjizonJcjp) · [v2](https://claude.ai/artifact/4AS9D9AMSvxhZrtPnBtDri) · [v3](https://claude.ai/artifact/S5j3j2kARBDmxamMnAK5DZ). Not seen on a real screen at phone width or in dark mode.

## Decisions carried over (see `docs/decisions.md`, 13 Nov rows)

- No generic "go / Proceed as proposed" button; answers name the choice and its consequence; tool permissions stay in the host.
- Mirror off in the first pilot.
- A question lifted from prose is labelled "inferred"; structured questions (`AskUserQuestion`, decision cards) come first.
- Still valid from before: one press, one message, "Sent" at once (FR-16); fill never wipes the prompt (FR-17); state by words or marks, never colour alone; no motion.

## Research behind it

| Source | Where | Status |
|---|---|---|
| Codex, "Intent: product, interaction, and platform research", 13 Nov | `Exploring Ideas/intent-brand/Codex - RESEARCH-Intent-2026-11-13.md` | Read in full by Claude. Most careful: sources checked 13 Nov |
| Perplexity, "Intent: research brief", 13 Nov | `Exploring Ideas/intent-brand/Intent: research brief.md` | Read in full. Thinner competitor table; wrongly unsure mods exist |
| Claude, in the 13 Nov session | Summarised below | Search summaries only, no full pages opened |

Key findings to keep (labelled):
- **Fact (Codex):** comparable products already show agent status and questions: Antigravity (Inbox, Artifacts), Conductor (continues; earlier shutdown notice struck out), Claude Squad, Vibe Kanban (company shut down Apr 2026, community-maintained), Omnara, Happy, Agent Signal Bar, Cursor, Copilot Agent HQ, Codex app, Warp. LangChain Agent Inbox was archived 20 Sep 2026.
- **Fact (Claude's name search):** closest new competitors: **Steer – Agent Inbox** (iPhone/Mac: turns an agent's pending decision into a focused card), **Lintel** (Windows: answers agent permission requests), **Mooring** (Mac: "see who needs you").
- **Fact (Codex):** the host already ships structured questions, plan mode, task lists, hooks; Codex's App Server has structured user-input requests.
- **Inference (all three):** the opening is decision quality and timing, not another status surface.
- **Metrics (Codex, adopted):** escaped wrong-direction rate, appropriate reliance (accept when right, change when wrong), signal precision, interruption burden, resumption time, voluntary use. "Bare approvals" is a diagnostic only, never the target.
- **Research to lean on (Codex's sources):** breakpoints and bounded deferral (Iqbal & Bailey 2010; Horvitz 2005); cognitive forcing helps but is liked least (Buçinca 2021); explanations can raise acceptance without accuracy (Bansal 2021); warning habituation (Anderson 2016); interruption raises stress more than it lowers output (Mark 2008).

## Plan for Coanda (Codex's stages, dates are a proposal)

1. **13 to 20 Nov: check the problem and the host.** Score real decision moments from Nicolas's own sessions (which mattered, which got lost). Test in the installed Claude build: above-prompt rendering, catching structured questions, cancel and defer, reload, two sessions at once.
2. **23 Nov to 4 Dec: the smallest Band.** Primary + a trustworthy NOW + one structured question, following the v3 rules. Lane optional. No Mirror, no generic approvals, no daemon.
3. **7 to 18 Dec: the first-thought step as an experiment**, opt-in, compared with no step on similar tasks.
4. **By 31 Dec: decide** whether to add a second agent, simplify, or stop. A menu-bar or shared local service only if testers miss decisions because Claude wasn't visible.

## Seed list: what carries over from this repo

Read by Claude on 13 Nov, 14:55, on `main` (79fe236): every file under `plugins/intent/` read in full except `hooks/intent.test.tsx` (779 lines), of which only the 37 test names were read. **Not read:** story 2.5's code on `feat/session-primary` (set, finish or switch the session's Primary), which may hold reusable logic. Line counts measured with `wc -l`; 2,970 lines in all.

Every id changes: plugin `intent` → `coanda`, tool `mcp__intent__ask_decision` → `mcp__coanda__ask_decision`, atom and store keys under `coanda`. The new plugin starts with an empty store: no saved data is migrated.

### Keep (copy, rename ids only)

| File | Lines | Why |
|---|---|---|
| `hooks/time.ts` | 18 | Clock text and day keys in the machine's own time zone; pure |
| `hooks/line.ts` | 9 | The full-width divider as an SVG: text glyphs break in the desktop's font (host lesson) |
| `hooks/question.ts` | 9 | `blankOf` marks the `[blank]` in a filled prompt. Drop `SOMETHING_ELSE` (v3 rule 3) |
| `hooks/plan.ts` | 68 | Reads the app's `update_plan` calls into steps: NOW from a tool event, the provenance v3 wants. `lastOutcomeStep` skips bookkeeping |
| `hooks/focus.ts` | 277 | Both Focus parsers, Lane end dates (year boundary tested), `checkFocusPath`, `checkLane` (a label is not an outcome), `toSetup` |
| `hooks/idle.ts` | 13 | Idle stages (Primary only after 2 min, hidden after 10); fits the v3 resting state |
| `.claude-plugin/marketplace.json`, `plugins/*/.claude-plugin/plugin.json`, `hooks/hooks.json`, `tsconfig.json` | 18 | Install route that works; new name, version 0.1.0, new descriptions |
| `hooks/desktop.test.tsx` | 21 | The band draws on desktop (host mount, `isCollapsed` included) |

### Adapt (copy, then change)

| File | Lines | Change |
|---|---|---|
| `types/index.d.ts` | 176 | Keep `Card`, `Step`, `Lane`, `FocusResult`, `Setup`, `SessionPrimary`, `Snapshot`, buttons as data. Drop the `Legacy*`, `View`, `Decided`, `MirrorState` types. Add a decision lifecycle (open, answered, deferred, superseded, cancelled), a per-option consequence, a hard-to-undo flag, and a source for each line (tool event, agent claim, inferred) |
| `hooks/cards.ts` | 61 | Keep `toCard`, `without`, `toBottom`, `answer`. Rewrite the `ask_decision` tool description to the v3 card: a question, each option with its consequence, hard to undo or not, one "could be wrong if". Drop `remember` (Decided list) |
| `hooks/next.ts` + `hooks/model.ts` | 91 | The one Haiku call per reply and its parser stay; the question it finds is marked "inferred" (v3); a structured question always wins |
| `hooks/store.ts` | 97 | Keep setup and cards (`{ v: 1, items }`). Drop the Decided list and the 0.1.x bare-array rewrite (nothing old to migrate) |
| `hooks/state.ts` | 192 | Keep the pattern (each atom declared here, one getter and one updater: a host rule). Drop the `view`, `openStep`, `decided`, `mirror` atoms |
| `hooks/io.ts` | 54 | Keep `homeDirectory`, `claudeConfigDir`, `readFocusFile`. Drop `readMirrorFile` (Mirror off) |
| `hooks/register.tsx` | 428 | Keep the wiring that took the longest to get right: `turn.step` keeps the final answer so a reload that eats `turn.complete` is recovered; `claim` + `send` (one press, one message); `fillSafely` (never wipes a draft); the 60-second Focus tick; the `update_plan` listener; the `ask_decision` tool call; the `ui.render` catch that shows a toast. Drop the Mirror tick, `/intent-demo`, the Steps and Decided views |
| `hooks/imports.check.mjs` | 123 | Keep the rules (pure core, one door to the model, only `register` submits, no home path or time zone). New file lists; the old-name check becomes a check for "mod-area" and the `intent` plugin id |
| `hooks/intent.test.tsx` | 779 | Keep the pure tests (Focus parsing, Lane dates, clock, plan, suggestions; 16 of 37 take no host, counted with `grep`) and the Setup moment tests (FR-1, FR-2). Drop the Mirror test and the 0.1.x store test. Rewrite the Band tests for v3 |

### Rebuild from the v3 rules

| File | Lines | Note |
|---|---|---|
| `hooks/band.ts` | 209 | `bandModel(snapshot)` stays the one function that decides; its body follows the v3 moments and budget. The Setup rows (about 60 lines) can be adapted |
| `hooks/render.tsx` | 240 | Draws a model and decides nothing. Keep these host lessons: other mods' bands stack below ours after a divider, never inside a Box with a width; a long line clips with `minWidth={0}`; the first text field takes focus |

### Leave behind (stays here as history)

| File | Lines | Why |
|---|---|---|
| `hooks/mirror.ts` | 74 | Mirror off in the pilot; the takeover and heartbeat code can come back from here |
| `hooks/parts.ts` | 7 | Part switches are not in the first stages |
| `hooks/rules.ts` | 6 | Empty; Base rules come back only if structured questions are not enough |
| `_bmad-output/`, the epics, Steps / Tools / Decided modes | | Replaced by the short plan |

### Host lessons to keep (from STATUS and the code)

- A turn that edits the mod's files reloads it as the turn ends, and that reload can swallow `turn.complete`.
- The installed plugin is a snapshot in the plugin cache: a change reaches the Band only after a version bump, a marketplace update, a plugin update and `/reload-plugins`.
- The desktop draws its own wrap-up box outside any mod; a mod cannot hide it.
- TypeScript 5.9 is needed for the type-check (5.6 fails on the host's large tool union).
- Claude cannot see the Band: every UI change needs a look on screen by Nicolas.

## Open, for Nicolas

- Name checks (domain, GitHub org, plugin id, trademark, the personal name).
- Logo.
- Today's launch (v0.1.0, 13 Nov) under the name Intent: dropped or moved; nothing public goes out under "Intent".
- GitHub repository for Coanda, and swapping the installed `intent@intent` for `coanda`: his to do, or Claude's on his yes in the new session.
- Branches left in this repo: `feat/session-primary` (story 2.5, last commit 9c9bfe8 "wip") is not merged; keep as history.

## Next action

Start a new session in `Exploring Ideas/coanda` from this file: create the repo, copy the "Keep" files with new ids, then adapt one file at a time with its tests.
