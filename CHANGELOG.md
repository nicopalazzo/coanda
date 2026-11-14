# Changelog

One line per release. Newest first.

## 0.1.59: onboarding confirmation and KPI counting

- Setup: the empty state leads with "Your goals, always in view. Claude stays on them."; after "Looks right" or "Save these" a confirmation says what was saved and where, then "Done".
- KPIs for a two-week test: `/coanda-baseline` hides the band but keeps counting, `/coanda-kpi` compares band-off and band-on days per session (corrections, interrupted turns, rework, time to decide; counts only).
- Also in this release: breathe while it builds, the stand-up nudge, the shutdown question and the day record (`/coanda-today`, `/coanda-shutdown`).

## 0.1.54: first installable release

- New Setup: Coanda reads `~/.claude/goals.md`; if there is none, Claude finds or proposes your Goal and Lanes (`propose_goals`), and writes the file only after you press "Save these". `/coanda-demo` walks every screen with sample data and restores your own data on exit.
