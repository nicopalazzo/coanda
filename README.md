# Coanda

A decision aid inside Claude Code: a calm band above the prompt that shows the session's goal, what the agent is doing now, and one question at a time with answers as buttons. It is meant to catch consequential wrong turns while protecting the goal the person chose.

Working name, 13 Nov 2026, from the Coandă effect (a flow stays attached to a curved surface and follows it). Name checks (domain, trademark) are not done yet.

## Where things are

- `plugins/coanda/`: the Claude Code desktop mod (plugin id `coanda`, version 0.1.0).
- `docs/handover-coanda.md`: why the project restarted from `mod-area` (plugin `intent`), the v3 display rules, the research and the staged plan.
- `docs/design/prototypes/`: the three clickable Band prototypes (v1, v2, v3).
- `STATUS.md`: where the work stopped and the next action.

## Checks

Run from `plugins/coanda/`:

```bash
npx -p typescript@5.9 tsc -p tsconfig.json
node hooks/imports.check.mjs
claude plugin validate .
claude plugin test .
```

TypeScript 5.9 is needed (5.6 fails on the host's large tool union). The host types in `.claude-plugin/types/` are not committed.

Not installed, not published: there is no GitHub repository yet.
