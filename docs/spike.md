# Spike, Task 1 (2026-11-26)

OpenCode 2.3.2 (`@opencode/cli`), Windows 11. Everything ran in a throwaway home (HOME, USERPROFILE,
XDG_*, OPENCODE_CONFIG_DIR, GENESEED_HOME all temp); Geneseed emitted with
`build-driver.mjs --emit opencode-global`; scripted model `tests/helpers/fake_model.mjs` asked for a
write to `.ssh/id_rsa`; `opencode run --standalone`. The key file was not written.

## Refusal shape (measured)
Source: `opencode session export <sessionID> --standalone` (JSON with `info` and `messages`; the
messages are the OpenCode 2 `SessionMessageInfo` shape). The assistant message holds
`content: [{ type: "tool", id, name: "write", executed: false, state: { status: "error", input, error: { type: "tool.execution", message } } }]`.
Saved as `test/fixtures/refusal.json` (only the temp path replaced by `<TMP>`; the guard itself
truncates the path in its own text, `C:/Users/.../AppDa...p/gs-spike-X/project`, replaced as well).

- `state.input` does NOT arrive empty. It holds the original arguments: `{ path, content }`
  (the fake model's write tool uses `path`; real OpenCode `write` uses `filePath`). The renamed
  call that the guard produces is not visible here: the item keeps `name: "write"`.
  Caveat: this is the stored/exported shape; the live TUI store was not observed.
- The message carries the Sealed Secrets line. First 300 chars:
  `No tool named "BLOCKED, not a missing tool: [geneseed-guard] blocked: Tell the user this, word for word: This edit writes to "<TMP>/project/.ssh/id_rsa", a file that holds a secret or key.\nIt was refused because a secret or key file is never for the agent to write. (Sealed Secrets)\nYou can make this`
- Exact prefix: `No tool named "BLOCKED, not a missing tool: [geneseed-guard] blocked: ` ; the STOP check
  (`No tool named "BLOCKED`) PASSES. The text ends with `" is currently available. Please use a tool from the available tool list.`
- Because `input` is present, the refused path can be read from `state.input` (`path` / `filePath`)
  as well as parsed out of the message text (`writes to "..."`).

## Render check: NOT DONE (replaced by `scripts/try.mjs`; `spike/` was deleted)
`opencode run` has no TUI, and there is no pty tool on this machine (no winpty, no node-pty; none
installed). `spike/tui.tsx` is written but unrun. To check live: list it in a throwaway
`cli.json` (`plugins`), open the TUI under a real terminal, confirm the line `spike tick N` in the
sidebar counts up each second and that `geneseed-spike-dump.json` in the temp dir holds the
`session.message.list` result. The spike imports `Plugin` from `@opencode/plugin/tui` and its call shapes (`ui.slot({ append: "sidebar.content", render })`, `data.session.message.list`) were checked against the 2.3.2 `.d.ts`; it has not been run.
Open: does a local `.tsx` follow its signals (not answered).
