# opencode-geneseed — sidebar panel, design

Status: approved by the owner, 2026-11-24. First commit of the new repo.

## Intent
A separate OpenCode 2 TUI plugin that shows, in the session sidebar, what Geneseed is doing:
gates in place, gates that fired, memory that fired, loops, factories.
Why a separate repo: Geneseed ADR 0008 (a feature ships to every host or not at all), and its
OpenCode plugins are single files with no dependencies. Geneseed never depends on this plugin.

## Goals
- Only Geneseed information, in OpenCode's sidebar, with no console or daemon running.
- Read-only. A broken or missing source hides its section; the session is never disturbed.

## Non-goals (first version)
- Anything OpenCode shows by default: context, limits, cost, model, to-dos, MCP, sub-agents, files.
- Harness identity: theme, posture, mode, version.
- File overlaps with other sessions (dropped for now by the owner).
- Commands, buttons, pages, Desktop GUI, OpenCode 1.

## Anti-goals
- It enforces nothing, writes nothing, spawns nothing, calls no network.
- It never copies Geneseed gate logic. A missing gate is fixed in Geneseed.

## Panel
    Geneseed
     Gates
      on   secrets, external
      off  deletion, ownership
      n/a  done (OpenCode 2)
     Refused  2
      Sealed Secrets      .ssh/id_rsa
      Deletion Is Delib…  git push -f
     Memory
      searched  "host parity"  4
      read      host-parity-rule
      learned   repo-facts  14:02
     Loop  refactor-auth   step check · #3
     Factory  issue-to-pr   pr-open · waits for you
Names over the sidebar width are cut with an ellipsis. Lists show the newest 3, then "+N". The
panel never changes the order of OpenCode's sections; it appends to `sidebar.content`.

## Sections and sources
CFG = $OPENCODE_CONFIG_DIR, else $XDG_CONFIG_HOME/opencode, else ~/.config/opencode.
MACHINE = $XDG_CONFIG_HOME/geneseed, else ~/.config/geneseed. MSGS =
`context.data.session.message.list(sessionID)`. DIR = the session's directory.
INSTALL = the nearest install: from DIR up to its git root, the first folder that holds
`.opencode/.geneseed-manifest.json`, else CFG (a global install).

G1 Gates in place — always shown. Source: the carrier, first readable of
   `$GENESEED_HARNESS/AGENT.md`, `<CFG>/AGENT.md` (global) or `<root>/AGENT.md` (project install).
   The order must match CARRIER_DIRS in geneseed-guard.js. The owner's global install has it in CFG.
   No count: names only, because always-on gates (disk destruction, root scan, rule store, wiki)
   have no switch. Switchable gates, exactly four plus one:
   Secrets, Deletion, Ownership, External: on unless the line `<Name> gate: off` is there.
   Done: n/a, OpenCode 2 turns are not judged. `Own-branch pass: off` adds "strict consent".
   Test note is advisory and is not listed. Excluding a doctrine drops its text, not this gate.
   `GENESEED_GUARD` off or warn replaces the list: "guard off" / "warn only", read from the TUI
   process (a remote server may differ). No carrier: the whole panel is hidden.
G2 Refused — this session, from MSGS. A `tool` part in state `error` whose error.message, trimmed,
   starts with `No tool named "BLOCKED, not a missing tool:`. Rule = the parenthesised name that
   ends the line "It was refused because …"; none found: show "refused". Detail = the first
   string among state.input filePath, path, command; none (the guard empties the input): the rule
   alone. Read in source: the guard's own `gateText` writes that sentence on V2 too. The ownership
   and relay refusals have their own words, so they show as "refused". NOT YET SEEN LIVE: the
   spike records one real refusal as the fixture, and G2 is not built before that.
G3 Memory — "fired" covers three events:
   searched: a completed `memory_search` tool part; its query and the count of " — " result lines.
   read: a completed `read` tool part whose path is under the store; the file's slug. MEMORY.md,
     README.md and topics/ are excluded: they are indexes.
   learned: a fact file created or changed in the store since the TUI opened this session; slug and
     time. Not tied to a session, because the learn plugin records none: the label says "learned",
     never "learned here". `archive/`, `agents/`, `topics/`, MEMORY.md, README.md are excluded.
   Store, in the order of `resolveMemoryDir` (geneseed-learn.js), first existing folder:
   $GENESEED_MEMORY; $GENESEED_HARNESS/memory; MACHINE/memory for an install that reads the shared
   tier (`readsTier`); <install dir>/memory, where install dir is CFG or `<root>/.opencode`;
   <cwd>/memory; <cwd>/Harness/memory. A memory_search result also names its store
   ("Facts in <dir>"): when one is in view, that path wins, as the fact observed.
   Facts the harness injects at session start are not listed: nothing records which the model used.
G4 Loops — MACHINE/loops.json `loops[]` rows whose `root` is DIR or its git root (compared
   case-insensitively on Windows). State is the JSON between `<!-- loop-state:begin -->` and
   `<!-- loop-state:end -->` in `<root>/LOOP.md`: title, node, iteration, status; `awaiting` adds
   "waits for you", `stopped` adds its reason. No LOOP.md: finished, hidden.
G5 Factories — the same with `factories.json` `factories[]`, FACTORY.md and `factory-state`:
   factory, stage, status, awaiting, reason. A loop and a factory on one root are two lines.

## Approaches
- P1 OpenCode's data only: smallest, but no gates in place, loops or factories. Rejected.
- P2 `geneseed web` API: reuses its logic, but blank when the console is off. Rejected.
- P3 Both: MSGS for G2 and G3, files for the rest. Recommended by the agent; the owner narrowed
  the sections, then approved this document, which chose P3.

## Architecture
- `src/read/*.js`: one pure reader per section (text or objects in, plain rows out). No OpenCode import.
- `src/tui.tsx`: `Plugin.define({ id: "geneseed.sidebar", setup })`, `ui.slot({ append: "sidebar.content" })`.
- Files are polled every 3 s by mtime while a session is open, re-read only when changed. The timer
  is cleared on cleanup. Readers return empty on any error.
- MSGS is the TUI's loaded window; older messages may be absent. Counts are "in view".

## Packaging
Repo `Arylmera/opencode-geneseed`, public, licence the same as Geneseed's. Plain source, no build
step. Local install: a package entry in `~/.config/opencode/cli.json` `plugins`. npm publish is a
later decision. OpenCode 2 from 2.3.2: its published types hold the slots and
`data.session.message.list`, and the installed 2.3.2 binary holds `sidebar.content`. Not run yet.

## Proof
- Unit tests (`node --test`) per reader: present, absent, corrupt, CRLF, Windows paths; each shown
  to fail when its reader is broken. Geneseed-format fixtures come from real Geneseed output.
- Contract check: one test reads the marker names and state delimiters in a Geneseed checkout when
  `GENESEED_SRC` is set, and fails on drift. Skipped and said so when unset.
- One real OpenCode 2 run: panel renders, a guard refusal appears in G2, memory_search in G3.
- The first step is a throwaway spike that proves the slot renders and records the refusal shape.

## Risks
- OpenCode's Rust client runs these plugins through a compatibility layer: keep to box and text.
- Geneseed formats are not a public API: G4/G5 and the markers are guarded by the contract check.
- Geneseed's "No TUI" refusal (PR #169) concerned its own ANSI screen; here OpenCode draws. The
  owner approved it here.

## Left to the builder
Colours (theme roles only), collapse behaviour, exact cut widths, file layout inside `src/`.
