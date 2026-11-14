# Band mapping: prototype → what the band draws

> Written by Claude, Fri 13 Nov 2026, 16:31 (Paris). For Nicolas to check **before any code changes**.
> Each element: what the prototype shows, what the band will draw in the host, and where the host cannot follow.

## Sources (read)

- **Layout and behaviour:** [band-v3.html](prototypes/band-v3.html), its styles (95 lines) and its script, read in full on 13 Nov.
- **Colours and buttons:** the Dusk design system, [coanda.css](../../../coanda-brand/wip/prototypes/assets/coanda.css) (65 lines, `data-world="B"`), and [07-a-or-b.html](../../../coanda-brand/wip/07-a-or-b.html) (its `.btn` lines).
- **Primary not set:** [02-playable-band.html](../../../coanda-brand/wip/prototypes/02-playable-band.html) (v3 has no such state).
- **Host limits:** the host's type file (`.claude-plugin/types/claude-code/index.d.ts`): `BoxProps`, `TextProps`, `ButtonProps`, `InputProps`, `Space`, `Color`.

**Rule used below:** v3 gives the layout, sizes and which colour means what. Dusk gives the colours themselves: v3's blue accent becomes Dusk, its ink and muted become the system's. Status colours (risk, warn, ok) keep v3's meaning.

## Seen on screen (specimen, 0.1.5, Fri 13 Nov 16:51, Nicolas's screenshots, light mode)

What the desktop really draws, from `/coanda-specimen`. These override anything below marked "inferred".

- **Field width.** A1 to A7 (alone, in a growing box, stretched, with a label, any chip name): the field is about 180px whatever the layout. **A8, `rows={2}`: the field spans the full width** (about 40px tall).
- **The host's chip.** A5, `submitLabel` absent: **no chip**. A6, `""`: an empty grey dot. A7, `"Set"`: a grey "Set" chip. A4, `label`: "Primary" drawn before the field.
- **Buttons.** B1 `variant="primary"`: black fill, white label. B2 secondary and B3 none: grey pill, ink label. B4 plain: ink text. B5 plain + `dimColor`: muted text. **B6, B7: a Text child's colour and underline are ignored** (ink text). **B8: a Dusk box around a plain Button draws Dusk with an ink label**, the box stretched to the full item width. **B9: a Dusk box with a white Text (no Button) draws white on Dusk**, but nothing to press. B10: the hover override shows nothing at rest.
- **Text colours (C1):** ink, muted, Dusk #5663A8, error, warning, success all draw as asked.
- **Label width (C2):** 11 cells wraps "SETUP · 2 OF 2"; 16 fits on one line.
- **Spacing steps (C3), by eye:** `xs` ≈ 4px, `sm` ≈ 8px, `md` ≈ 12px, `lg` ≈ 16px.
- **Not seen yet:** dark mode; whether a click on a painted box's padding presses its Button.

### Decided from what was seen (Nicolas, 16:53)

- **Strong button (Set, Use, Add Lane, Next, Done): the host's native primary (B1), black fill, white label.** For simplicity. This goes against the brand's "black is not a button colour" for the band only.
- **Answer button:** a Dusk-edged Box around a plain Button (ink label), the consequence under it in muted.
- **Quiet exit:** plain + `dimColor` (B5), muted text. Dusk and underline cannot be drawn on a Button label.
- **Field:** `rows={2}` (full width, seen A8), no `submitLabel` (no chip, seen A5); its button on the line under it.
- **Label column:** 16 cells (seen C2).

These replace elements 9, 10, 11 and 12 below where they differ.

### Changed again (Nicolas, 16:57): Intent's buttons and rows

The Dusk-edged answer box drew the native button's own highlight inside its contour. Back to Intent's render (mod-area): native buttons only, the first option primary and the others secondary, quiet exits plain and dim; Intent's rows (label column, content column, `gap={1}`, round frame of the full width), now aligned to the top.

## Grid (added Sat 14 Nov 2026; `/coanda-grid`, version 0.1.8)

A measuring page drawn in place of the band ([grid.tsx](../../plugins/coanda/hooks/grid.tsx)). First seen on screen Sat 14 Nov (measurements below).

**What it draws.** H1 a cell ruler across the full width. H2 label columns of 8, 11, 16, 20 cells. H3 and H4 the column gap in steps (`xs` to `xl`) and in numbers (0 to 3). H5 flex splits. V1 gaps between stacked bars. V2 `paddingY` steps. V3 the line box of each text size. T1 and T2 every size × weight in ink and muted. T3 mono and status colours. T4 contrast samples on their own backgrounds.

**Contrast, computed (read from the Dusk system hexes, WCAG 2.2 formula; AA needs 4.5:1 for normal text, 3:1 for large text and interface parts):**

| Pair | Ratio | Verdict |
| --- | --- | --- |
| ink #0B0B0A on white | 19.69 | pass |
| muted #5E5C55 on white / tint #F0F3FE | 6.69 / 6.04 | pass |
| Dusk #5663A8 on white / tint | 5.61 / 5.06 | pass |
| white on Dusk | 5.61 | pass |
| **ink on Dusk** | **3.51** | **fails 4.5 for normal text** (passes 3:1 for large text) |
| muted on Dusk | 1.19 | fails |

Consequence for the rebuild: B8 (a Dusk box around a native Button, ink label) is the failing pair, one more reason it was dropped. Theme keys (`text`, `subtle`, `error`, `warning`, `success`) follow the host, so their ratios in light and dark are **not computed**; T4 and T3 are there to be judged on screen.

### Seen on screen (Nicolas's 10 screenshots, Sat 14 Nov ~10:00, light mode)

Distances are **read by Claude from pixel positions in the screenshots (±2 px, screenshot pixels, not CSS pixels)**; the scale of the screenshots is not known. Dark mode not seen.

- **Band width:** the host reports 89 cells. The H1 ruler of 89 cells wrapped: **86 cells fit** inside the frame, so inner width ≈ columns − 3. The line under the ruler (89 cells) ran to the frame edge.
- **One cell across ≈ 16.8 px** (ruler 0 → 80 = 1344 px; the 8-, 11-, 16-, 20-cell bars measure 135, 185, 270, 337 px).
- **Column gap, numeric:** 0 / 1 / 2 / 3 → 0 / 17 / 33 / 50 px: **a number is exactly that many cells**.
- **Column gap, steps:** `xs` 16, `sm` 24, `md` 32, `lg` 56, `xl` 80 px, i.e. about 1, 1.5, 2, 3.3, 4.8 cells. Not 4 / 8 / 12 / 16 as guessed "by eye" on 13 Nov.
- **Vertical gap between stacked boxes (V1):** the same: `xs` 16, `sm` 24, `md` 32, `lg` 56, `xl` 80 px.
- **`paddingY` (V2), box height minus a 34 px text line, per side:** `xs` 12, `sm` 16, `md` 24, `lg` 32 px; numbers 0 / 1 / 2 → 0 / 20 / 40 px. So padding steps are **not** the gap steps (`lg`: 32 vs 56).
- **Line box (V3), spacing between lines:** caption ≈ 33, footnote ≈ 33, body ≈ 37, heading ≈ 41, title ≈ 47 px (rough, from baseline spacing).
- **Weights (T1, T2):** regular, medium, semibold, bold all draw distinctly at every size; at `caption` regular vs medium is the smallest difference. Muted `caption` stays readable on the host's light grey.
- **Contrast (T4):** matches the computed table. White on Dusk and Dusk on white read well; ink on Dusk is readable but dull (3.51); muted on Dusk is nearly invisible.
- **Status colours (T3):** error, warning, success, Dusk all readable at body and caption.

**Still to measure:** dark mode (host theme keys); the grid at a narrower window (wrap points); what the 3 missing cells in the frame are (border and padding, or the host).

## Lab (`/coanda-lab`, 0.1.9, Sat 14 Nov 2026)

Tests of what the desktop band can do beyond Box, Text, Button. **Read from the host's types:** no scripts, canvas, web view or picture element on desktop; `Svg` (interactive frame: SMIL, CSS animation, `:hover`) and `Client` (timer, pointer, local state, `post`, drawn in cells). **Met while building (engine errors):** a Button holds only strings and Text (no Svg, no Box); a Client tree is capped at 100,000 serialized characters (1,600 painted boxes unmounted; 1,000 and 400 drew in the test run).

**Seen on screen (Nicolas's words, 10:18; the screen recording could not be read: macOS blocked the temporary file).** His five answers were read as: 1 the SVG dot moves (L1a, L1b); 2 hover works (L1c) *[Claude's reading, to confirm]*; 3 the light reveal (L1d) did not work; 4 the counters go up (L2a, L2b); 5 L3, L4, L5 not read.

**Known from before:** the companion spike (Intent, `mod-area-lamp-spike-backup-2026-11-13/companion.ts`) draws a moving character as one SVG with CSS keyframes inside the markup, including a `lamp`. Nicolas saw it move fluidly. So CSS keyframes in an interactive SVG are the proven way to animate; L1d used SMIL on `rx`/`ry` of an ellipse filled with an object-bounding-box gradient, which is the likeliest reason it failed (not tested).

**Lamp reveal, CSS keyframes (0.1.10), Sat 14 Nov ~10:25.** The same two SVG states, shown as a CSS-only page in the browser pane (checkbox, no script): **Nicolas pressed the button and the panel lit** (light from the centre to the sides, then step 1 fades in). So the animation design works in a browser. **Not yet seen inside the host's band** (`/coanda-lab`, L1d "Pull the cord"); that is the check that matters.

**Stage spike (`/coanda-stage`, 0.1.12), Sat 14 Nov ~10:40, read from Nicolas's 38-second recording (contact sheets, 1 frame per second).**
- **Layering works.** A dark SVG inside an absolute Box paints over native text, and a native Button placed after it stays visible and **can be pressed** (counter "over" went 0 → 1). Whether a Button *under* the SVG is blocked: not pressed, not known (its label shows dimly through the 85 % dark layer).
- **The SVG did not fill the box.** With no size props, inside an absolute Box that has top, left, right and bottom set, it drew about 41 % of the band's width (looks like a default frame of about 300 px) and the full height of the 9-row box. So the light only opened inside that left rectangle. Fix to try: an explicit `width` and `height` in px.
- **Px per row and column (from the ruler and the band width):** 9 rows ≈ 180 CSS px, so one row ≈ 20 px; a column ≈ 8.3 px (89 columns ≈ 740 px). Inferred from scaled frames, ±5 %.
- **Scrolling worked throughout** (no trap with no Client regions). Test B's overlay was not seen playing.

## Must hold on screen

Read before every change. Each point is checked on the drawn band by the test "must hold on screen" in `hooks/coanda.test.tsx`.

1. The band frame spans the full width (round border, `paddingX={1}`, `width` = the band's columns).
2. Every row aligns to the top; the label column is 16 cells; next to a field the label moves down to the field's text.
3. Every field is 2 rows tall (full width) and names no chip (no grey dot).
4. Buttons are the host's own: primary (black) or secondary (grey pill); the first option of a question is primary; Set, Use and Add Lane are primary.
5. Quiet exits (Later, Skip, Not for me, Details, Remove) are plain and dim.
6. No button sits inside a painted contour.
7. The host's default drawing of the row (`engine` node) is never drawn.

## Tokens

- **Ink** (v3 `--fg`, system `--ink` #0B0B0A) → host theme key `text`. Follows light / dark.
- **Muted** (v3 `--muted`, system #5E5C55) → `subtle`. Follows light / dark.
- **Dusk** (v3 `--accent` replaced, system `--act` #5663A8; hover #414C8C; tint #F0F3FE) → fixed hex. Used for actions and links only.
- **Risk** (v3 `--risk` red) → `error`. **Warn** (v3 `--warn` amber) → `warning`. **Ok** (v3 `--ok` green) → `success`. All follow light / dark.
- **Fonts:** v3 Fira Sans / Fira Code → the host's own font; the host's mono face where v3 uses Fira Code. *Host limit: no custom font.*

## Spacing

The host takes numbers (character cells) or steps (`xs` to `xl`) that the desktop sizes its own way. v3's pixels map to steps:

- Row padding 10px × 12px → `paddingY="sm"`, `paddingX="md"`.
- Label to content 10px → `gap="md"`.
- Lines inside the content, and between buttons, 8px → `gap="sm"`.
- Line between rows (1px) → *host limit: a Box has only a whole border.* Rows get `gap="md"` instead (the band has 1 or 2 rows).

*The exact pixel sizes of the steps on desktop are not documented; to compare on screen.*

## Elements

### 1. The band frame
- **Prototype:** 1.5px border, radius 10px, surface background, 12px from the edges.
- **Band:** a Box with a round border in ink, the content inside with the row spacing above.
- *Host limit:* border width, radius and the grey area around the band are the host's.

### 2. A row
- **Prototype:** a grid, label column 84px, content column after it; `align-items: start`.
- **Band:** a row Box: label Box at a fixed width (11 cells, about 84px; to check), content Box that grows and can shrink (`minWidth={0}`).

### 3. The label (NOW, QUESTION, SENT, SETUP · 1 OF 2, PRIMARY)
- **Prototype:** mono, 11px, uppercase, letter-spaced, muted, 3px down.
- **Band:** Text `size="caption"`, `mono`, muted, uppercase. *Letter-spacing: no prop; not drawn.*

### 4. The content column
- **Prototype:** a column, 8px between its parts.
- **Band:** Box column, `gap="sm"`.

### 5. The question line
- **Prototype:** the question in weight 600, then on the same line the chip and the stamp, wrapping (gap 4px × 10px).
- **Band:** Text `weight="semibold"` in ink, the chip and the stamp after it in the same row Box, wrapping.

### 6. A status line (NOW: "Idle · …", "Build · step 2 of 5")
- **Prototype:** plain text in ink.
- **Band:** Text in ink, cut at the edge when too long.

### 7. The source stamp ("inferred")
- **Prototype:** mono, 11px, warn colour; in Guessed question it is a link to the sentence it came from ("inferred · see where").
- **Band:** Text `mono`, caption, `warning` colour, the word "inferred". *Not built: "see where" (no data for the sentence yet).*

### 8. The risk chip ("hard to undo")
- **Prototype:** a pill, 12px, 1px border in its own colour, risk red on risk-soft, "⚠ Hard to undo".
- **Band:** Text "⚠ Hard to undo" in `error` colour inside a Box with a round border in `error`. *Soft red background: a fixed hex would break in dark mode, so none.*

### 9. An answer button (a question's options)
- **Prototype:** at least 44px tall, padding 6px × 14px, radius 8px, 1px border, left-aligned, 14px; the consequence **inside the button**, under the label, 12.5px muted ("Rename to fillSafely" / "1 file"). In Small choice both options look the same (no recommended one).
- **Band:** a Box with a round border in Dusk, padding `xs` × `md`, holding a chromeless Button whose content is the label (ink) and the consequence (muted, caption) under it. All options look the same.
- *Host limit:* on desktop a Button is always the native one; chromeless it draws its text only, so the Dusk border is the Box's. Whether a click on the Box's padding presses it: not documented, to test. Height 44px: not set (no px unit).

### 10. The strong button (Next, Done, Set, "I checked it on screen")
- **Prototype v3:** 2px ink border, weight 600. **Dusk system:** Dusk fill, white text, 2px Dusk edge, hover #414C8C.
- **Band:** Dusk system: a Box filled Dusk with a chromeless Button, white label, semibold.

### 11. The quiet exit (Later, Skip, Not for me, Details / Less)
- **Prototype:** no border, 14px, accent colour, underlined.
- **Band:** a chromeless Button with Text in Dusk, underlined.

### 12. A text field
- **Prototype:** full width, at least 44px, padding 10px × 12px, 1px border, radius 8px; its buttons on the next line (Big choice), or a "Set" button right after it (02, Primary).
- **Band:** the host's Input, followed by its submit as a **button element** (the strong button, 10): "Use" for the goals file, "Add Lane" for a Lane, "Set" for the Primary. Enter in the field does the same. Then the row's other buttons.
- *Host limit:* **the field's width cannot be set** (no width prop; a full-width Box around it did nothing in 0.1.3, seen on screen). The host draws its own submit chip beside the field; it can be renamed, not restyled. The rebuild tries an empty name (`submitLabel=""`) to hide it; if the host still draws it, it stays, and you'll see both on screen.

### 13. Sent
- **Prototype:** the whole band is one row: label SENT, "✓ Sent: <answer>" in ok green, weight 500.
- **Band:** label SENT, Text "✓ <answer>" in `success`, weight medium; "· Claude is working" after it in muted.

### 14. The Primary row (Primary set)
- **Prototype:** under the band, 8px × 12px from it; "◎", the goal in weight 600, the "Details" link; open: the "done when · Lane" line under it, muted.
- **Band:** under the band: "◎" and the goal in ink, semibold; "Details" / "Less" as the quiet link (11); open: the Lane line, muted. *No "done when" yet (no data).*
- **Changed from 0.1.3:** the ◎ in ink, not Dusk (v3 keeps it plain; Dusk is for actions).

### 15. The Primary row (no Primary) — new
- **Prototype (02):** a row in the band: label PRIMARY, a field "The one thing today…", a "Set" button after it, suggestion chips under it.
- **Band:** label PRIMARY, the host's field with the placeholder "The one thing today…", then a **"Set" button** right after it: the strong button (10), Dusk fill. Enter in the field does the same. Kept for **today** only; a goals file with a Primary still wins. *Suggestion chips: not built (no data).*
- **Decided (Nicolas, 16:32):** a button element, not the host's chip.

### 16. Setup
- **Prototype:** none in v3. Built on the row pattern (2, 3, 4): label "SETUP · 1 OF 2", the question in semibold, the field with its button after it (12: "Use", "Add Lane"), then the strong button (Next / Done) or the quiet exit (Skip).
- *Two strong buttons in one step* ("Add Lane" and "Done"): "Done" shows only once something is kept; to look at on screen.
- **Changed from 0.1.3:** the label moves to the label column (it was on top).

## Moments not built yet (no data in stage 2)

Big choice (criterion first), Review a result, Held at checkpoint, Coming back, First thought, Session end, another session waiting, menu bar. They will follow the same elements.

## To check on screen after the rebuild

1. The band next to [band-v3.html](prototypes/band-v3.html), moment by moment (Resting, Working, Small choice, Guessed question, Sent).
2. Light and dark mode (Dusk is a fixed hex).
3. Whether a click on a painted button's padding presses it.
