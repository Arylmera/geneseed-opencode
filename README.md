# opencode-geneseed

An OpenCode 2 TUI plugin that shows what [Geneseed](https://github.com/Arylmera/Geneseed) is doing,
in the session sidebar. It is read-only: it reads files and the session's messages, and writes,
spawns and sends nothing.

## What it shows

```
Geneseed
 Gates
  on   secrets, external
  off  deletion, ownership
  n/a  done (OpenCode 2)
 Refused  2
  Sealed Secrets  .ssh/id_rsa
  Deletion Is Deliberate
    git push -f
 Memory
  searched  "host parity"  4
  read      host-parity-rule
  learned   repo-facts  14:02
 Loop  refactor-auth
   check · #3
 Factory  issue-to-pr
   pr-open · waits for you
```

- **Gates**: the switchable gates in place, read from the Geneseed carrier (`AGENT.md`), in the
  order Geneseed's guard looks for it. `GENESEED_GUARD=off` or `warn` shows "guard off" or "warn only".
- **Refused**: tool calls the guard refused in this session, with the rule and the path or command.
- **Memory**: `memory_search` calls and fact files read in this session, and facts created or
  changed in the store since the panel first showed the session.
- **Loop** and **Factory**: runs registered for this repository that are not done.

The panel appears only when a Geneseed carrier is found. A section with nothing to show is left
out. Lists show the newest 3, then `+N`. A row of gate names wraps at ", ". A loop or factory takes
two lines (title, then step and note); a refusal too when it does not fit on one. Other lines are
cut at 30 characters. Files are checked every 3 seconds and read again only when they change.

## Install

Add the absolute path of this checkout to `plugins` in `~/.config/opencode/cli.json`
(or `$OPENCODE_CONFIG_DIR/cli.json`):

```json
{
  "plugins": ["C:/path/to/opencode-geneseed"]
}
```

The package exports `./tui` (`src/tui.tsx`). There is no build step. This install form has not been
checked against a live OpenCode yet; see Try it.

## Try it

`scripts/try.mjs` builds a throwaway home under your temp dir and checks the plugin there, without
touching your real `~/.config/opencode`, `~/.config/geneseed` or `~/.claude`:

```
node scripts/try.mjs [--geneseed <dir>] [--opencode <opencode.exe>]
```

It emits Geneseed into the throwaway home, lists this checkout in that home's `cli.json`, starts a
scripted model on 127.0.0.1 (no real model, no credentials) that tries to write `.ssh/id_rsa`,
registers a real loop in a temp git repo, and prints `ok` or `FAIL` for each headless check. It then
prints one PowerShell command that opens OpenCode's screen in that home, what to look for (the
Geneseed section, the gates, the refusal after any prompt, the loop), and the command that stops the
scripted model (it also stops itself after 30 minutes). It never opens the screen itself.

Remove a home with `node scripts/try.mjs --clean <dir>`; it refuses any folder not named `gs-try-*`
directly under the temp dir.

## Limits

- OpenCode 2 only (from 2.3.2). OpenCode 1 and the desktop app are not supported.
- The done gate is always shown as n/a: OpenCode 2 turns are not judged.
- Refusals and memory come from the messages the TUI has loaded. Older messages may be missing, so
  counts are what is in view.
- The guard setting and the file paths are read from the TUI's own environment and disk. When the
  TUI is attached to a remote server, the server's environment may differ.
- "learned" is not tied to a session: Geneseed records none for a fact, so the label never says
  "learned here".

## Tests

```
npm test
```

Set `GENESEED_SRC` to a Geneseed checkout to also run the contract checks against its formats.

## Licence

MIT, see [LICENSE](LICENSE).
