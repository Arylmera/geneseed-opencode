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
  order Geneseed's guard looks for it. `GENESEED_GUARD` set to `off`, `0`, `false` or `no` shows
  "guard off", and `warn` shows "warn only", parsed as the guard does (any case, no trimming).
  The carrier is read once a session, as the guard reads it: when it changes later, the gates stay
  as they were and "restart OpenCode to apply" is added.
- **Refused**: tool calls the guard refused in this session, with the rule and the path or command.
- **Memory**: two lists, each the newest 3, then `+N`. First what the session used:
  `memory_search` calls and fact files read in this session. Then what was learned: facts created
  or changed in the store since the panel first showed the session. The store is the first one
  that exists in Geneseed's order (or the one a search result names), read two folders deep.
- **Loop** and **Factory**: runs registered for this repository that are not done.

The panel appears only when a Geneseed carrier is found. A section with nothing to show is left
out. Lists show the newest 3, then `+N`. A row of gate names wraps at ", ". A loop or factory takes
two lines (title, then step and note); a refusal too when it does not fit on one. Other lines are
cut at 30 characters. Files are checked every 3 seconds and read again only when they change.

## Install

Run this once in the checkout, so that `solid-js` and `@opentui/solid`, which `src/tui.tsx` imports,
resolve from it:

```
npm install --ignore-scripts
```

Then add the absolute path of this checkout to `plugins` in `~/.config/opencode/cli.json`
(or `$OPENCODE_CONFIG_DIR/cli.json`):

```json
{
  "plugins": ["C:/path/to/opencode-geneseed"]
}
```

The package exports `./tui` (`src/tui.tsx`). There is no build step. This install form has not been
checked against a live OpenCode yet; see Try it.

## Try it

`scripts/try.mjs` builds a throwaway home under your temp dir and checks the plugin there. Its
children (and the screen command) get only an allowlist of environment variables (PATH, the Windows
system ones, the terminal ones) plus the throwaway locations, so no ambient OpenCode, Geneseed,
Claude, proxy or credential variable reaches the run. It then compares the top-level entries and
modification times of your real OpenCode config dir and Geneseed machine dir (found from your own
environment) before and after, and reports a change as FAIL.

```
node scripts/try.mjs --geneseed <Geneseed checkout> [--opencode <opencode.exe>]
```

`--geneseed` may be left out when `GENESEED_SRC` is set.
Run `npm install --ignore-scripts` in the checkout first (see Install): one check FAILs when
`solid-js` or `@opentui/solid` does not resolve from it.

It emits Geneseed into the throwaway home, lists this checkout in that home's `cli.json`, starts a
scripted model on 127.0.0.1 (`scripts/fake-model.mjs`: no real model, no credentials) that, after
one prompt, tries to write `.ssh/id_rsa`, calls `memory_search` for "geneseed", then writes
`allowed.txt`. It registers a real loop in a temp git repo and prints `ok` or `FAIL` for each
headless check. It then prints one PowerShell command that opens OpenCode's screen in that home,
the checklist below, and the command that stops the scripted model (it also stops itself after 30 minutes). It never opens the screen itself.

Checklist for the live run, in the screen it opens:

1. The Geneseed section is in the sidebar, with the gates.
2. After you type any prompt, a Refused row appears (Sealed Secrets, `.ssh/id_rsa`).
3. A Loop row `try-sidebar` is shown.
4. Memory: a searched row appears after the second turn.
5. In another PowerShell, `Rename-Item` the throwaway `.config\geneseed\loops.json` (in the home
   the script printed): within a few seconds the loop row goes and the session keeps running.
6. Quit, `Rename-Item` the throwaway `.config\opencode\AGENT.md`, start the screen again with the
   same command: the Geneseed panel is hidden.

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
