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
    GENESEED                     ▲ 2
    ── ● gates ────────────── 2 of 4
      ✓ secrets     ✓ external
      ○ deletion    ○ ownership
      – done n/a on OpenCode 2
    ── ▲ refused ───────────────── 1
      Sealed Secrets
      .ssh/id_rsa
    ── ↻ loop ──────────── plan · #0
      try-sidebar
    ── ⚙ factory ─────────── pr-open
      fix-auth
      ● waits for you
    ── ◆ memory ────────── 2 · 1 new
      ⌕ "host parity"  4
      ◆ host-parity-rule
      + repo-facts

Default width (32 columns), as src/panel.js renders it. src/panel.js owns every row: it takes the
inner width W and a glyph set and returns rows of segments (text, theme role, bold, inverse) whose
texts add up to exactly W; src/tui.tsx draws them as they are. W is the drawn box's width
(OpenTUI `onSizeChange` / `width`), 32 until it is laid out.
- Row text (src/clean.js): text the model or a file wrote (a refused path or command, a memory
  query, a run's title, step and stop reason) is one line, each whitespace run one space, the ends
  trimmed. No row holds a control character or a format character (bidi overrides and isolates
  included) other than U+200D, the joiner of an emoji sequence; every segment's text passes this
  filter as it enters a row.
- Header: GENESEED (accent, bold) and one badge at the right, in priority order: `■ off` (error),
  `◐ warn`, `↺` (restart due), `▲ <n>` (refusals plus runs that wait); nothing when quiet. Folded
  (W < 28), where there is no hint line, a restart due under `■ off` or `◐ warn` puts `↺` before it.
- Each section opens with `── <glyph> <name> `, `─` filling the width, then ` <summary>`. Order:
  gates (`<on> of <switchable>`), refused (`<n>`), one per loop run (`<step> · #<i>`), one per
  factory run (`<stage>`), memory (`<used> · <learned> new`, `· 0 new` dropped).
- Gates: a grid of `✓ name` then `○ name`, as many columns as fit (2, or up to 4 when wide); a name
  is never cut. Then `– done n/a on OpenCode 2`, `✓ strict consent` when set, and
  `↺ restart OpenCode to apply` when the gates changed since the pin.
- Guard off: an inverse error bar `GUARD OFF · nothing blocks` under the header, and the gates
  section is one line `GENESEED_GUARD=off`. Warn: `◐ warn only · logs, no block` under the rule.
- Refused: the rule name, then the path or command below it. A path is relative to DIR when under
  it, else its last two segments, cut from the left when still too wide; a command is cut at the
  right. Tool input content is never shown.
- Runs: the title, then `● waits for you` (warning, bold) or the stop reason (muted).
- Memory: `⌕ "query"  <count>`, `◆ slug` for a fact read, `+ slug` for one learned.
- W < 28: one line a section, `<glyph> <Name>` left and the summary right; loops and factories
  are one line each too, the newest run's step after `<n> · ` when there are n > 1 runs, no "+N".
  W > 40: items on one line each, label left and detail or summary right (a learned fact shows its
  time).
- Lists show the newest 3, then "+N". ASCII glyphs (`* o + - ! # ~ R L F M ? + - .`, the last for `·`;
  `…` is `>` for a cut at the right and `<` for a path cut at the left, so only printable ASCII is
  drawn) when the plugin
  option `ascii` is true or GENESEED_SIDEBAR_ASCII=1. The panel never changes the order of
  OpenCode's sections; it appends to `sidebar.content`.

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
   `GENESEED_GUARD` off replaces the list ("GUARD OFF"), warn adds "warn only", read from the TUI
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
Repo `Arylmera/geneseed-opencode` (npm name `opencode-geneseed`), public, licence the same as Geneseed's. Plain source, no build
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
