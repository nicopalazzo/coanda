# Changelog

One line per release. Newest first.

## 0.1.60: French, Spanish and Simplified Chinese

- The band speaks English, French, Spanish and Simplified Chinese. `/coanda-language fr|es|zh|en|auto` chooses it and wins over the rest (the desktop app has no language setting Coanda can read). Without a choice, the language comes from the Claude Code `language` setting, then the language of your goals file, then the system language (`LANG`); English when none says.
- Your goals file can be written in any of the four languages (`## Aujourd'hui`, `**Prioridad`, `**主线 1 —` …, dates like "d'ici le 14 déc.", "para el 14 de diciembre", "12月14日前"). English words always work too. Claude is asked to write the file in your language.

## 0.1.59: onboarding confirmation and KPI counting

- Setup: the empty state leads with "Your goals, always in view. Claude stays on them."; after "Looks right" or "Save these" a confirmation says what was saved and where, then "Done".
- KPIs for a two-week test: `/coanda-baseline` hides the band but keeps counting, `/coanda-kpi` compares band-off and band-on days per session (corrections, interrupted turns, rework, time to decide; counts only).
- Also in this release: breathe while it builds, the stand-up nudge, the shutdown question and the day record (`/coanda-today`, `/coanda-shutdown`).

## 0.1.54: first installable release

- New Setup: Coanda reads `~/.claude/goals.md`; if there is none, Claude finds or proposes your Goal and Lanes (`propose_goals`), and writes the file only after you press "Save these". `/coanda-demo` walks every screen with sample data and restores your own data on exit.
