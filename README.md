# Coanda

Coanda adds one calm band above the prompt in the Claude desktop app (the Code tab). It shows three things, and nothing else:

- **Your goal**: the one thing that counts today, and the longer outcomes (called Lanes) it serves.
- **What Claude is doing now**: one short line, so you can tell whether it is still on your goal.
- **One question at a time**: when Claude needs a decision from you, it shows up as a question with answers as buttons. You answer it, and the next one waits.

Coanda is a *mod*: a small add-on that changes how Claude's own window looks. It does not send your data anywhere. It reads one file on your computer (your goals file) and keeps its small settings in Claude's own plugin folder.

> **Status: early test, version 0.1.61.** Licence: [PolyForm Noncommercial 1.0.0](LICENSE). It is free for personal, educational and other noncommercial use; commercial use needs the author's permission.

## Install (3 steps)

You need the Claude desktop app (a recent version) and the `claude` command in your terminal. Open a terminal and run:

```bash
claude plugin marketplace add nicopalazzo/coanda
claude plugin install coanda@coanda
```

Then **quit and reopen the Claude desktop app** (restart is required for a mod to load). Open the Code tab and start a session: Coanda's Setup appears above the prompt.

You can also add the marketplace from the app: the plugin settings, then "Add marketplace", and paste `nicopalazzo/coanda` (a GitHub address).

## First run: Setup

Setup runs once, the first time you open Coanda. It starts with a short light animation (press "Pull the cord"), then looks for your goals.

Your goals live in a plain text file: `~/.claude/goals.md` (`~` means your home folder). Coanda only **reads** that file. You never have to write it yourself:

- **If the file already exists**, Setup shows your Goal and Lanes. Press **Looks right** to keep them, or **Change** to talk it over with Claude.
- **If there is no file**, Setup shows two buttons:
  - **Set up with Claude**: Claude asks you a few questions in the chat and writes the file for you.
  - **Find them for me**: Claude looks through your files for things that look like goals, shows what it found as a proposal, and writes nothing until you press **Save these**.
- **Skip for now** leaves it for later.

To open Setup again at any time, type `/coanda-setup` in the prompt. To see every screen of the band with sample data (your own goals are put aside and restored when you leave), type `/coanda-demo`.

## Language

Coanda speaks English, French, Spanish and Simplified Chinese. Type `/coanda-language fr` (or `es`, `zh`, `en`) in the prompt to choose; your choice is kept and wins over everything else. `/coanda-language auto` hands it back: Coanda then follows the Claude Code `language` setting (terminal), then the language of your goals file, then the system language (`LANG`), and English when none says. Your goals file can be written in any of the four languages; English words always work too.

## Uninstall

```bash
claude plugin uninstall coanda@coanda
claude plugin marketplace remove coanda
```

Restart the Claude desktop app. Your goals file (`~/.claude/goals.md`) is left alone. Coanda's own small settings are in `~/.claude/plugins/data/coanda/`; delete that folder if you want no trace.

## Report a problem

Open an issue on this repository (github.com/nicopalazzo/coanda/issues), or message Nicolas. Please include:

1. The Coanda version (the `version` line in `plugins/coanda/.claude-plugin/plugin.json`, or `claude plugin list`).
2. What you did, what you expected, and what you saw. A screenshot of the band helps a lot.

## For people working on Coanda

- `plugins/coanda/`: the mod itself.
- `docs/`: design notes and the history of the project. `STATUS.md`: where work stopped.
- Checks, run from the repository root:

```bash
claude plugin validate plugins/coanda
claude plugin test plugins/coanda
npx -p typescript@5.9 tsc -p plugins/coanda/tsconfig.json --noEmit
node plugins/coanda/hooks/imports.check.mjs
```

The type check needs the host's generated types in `plugins/coanda/.claude-plugin/types/`. Claude writes that folder when it loads the plugin from a folder; it is not committed.
