<div align="center">

<h1 align="center">opencode-geneseed</h1>

**What Geneseed is doing, in OpenCode's session sidebar.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![OpenCode 2 (>= 2.3.2)](https://img.shields.io/badge/OpenCode-2%20%28%3E%3D%202.3.2%29-1f6feb)](#%EF%B8%8F-limits)

[**Quick start**](#-quick-start) · [**What it shows**](#-what-it-shows) · [**Configuration**](#%EF%B8%8F-configuration) · [**How it works**](#-how-it-works) · [**Try it**](#-try-it-live) · [**Limits**](#%EF%B8%8F-limits)

</div>

---

**opencode-geneseed is an OpenCode 2 TUI plugin.** It adds a Geneseed panel to the session
sidebar: the gates in place, the tool calls the guard refused, the memory the session used and
learned, and the loops and factories that run on this repository.

It is a companion to [Geneseed](https://github.com/Arylmera/Geneseed), not a replacement. It reads
the state that a Geneseed install leaves on disk and in the session. It enforces nothing: the gates
are Geneseed's own OpenCode plugins. Geneseed never depends on this plugin, and without a Geneseed
install the panel stays hidden.

It is read-only. It reads files and the session's loaded messages. It writes nothing, spawns
nothing and calls no network.

All commands on this page run from the root of this repository, and the paths they name are
relative to it.

## 🚀 Quick start

You need a Geneseed install for OpenCode and OpenCode 2 (2.3.2 or later). The package is not on npm:
you install it from a checkout.

1. Clone this repository, then install its dependencies in the checkout:

   ```
   npm install --ignore-scripts
   ```

   OpenCode loads `src/tui.tsx` from the checkout, so `solid-js` and `@opentui/solid`, which it
   imports, must resolve from there.

2. Add the absolute path of the checkout to `plugins` in `~/.config/opencode/cli.json` (or
   `$OPENCODE_CONFIG_DIR/cli.json`):

   ```json
   {
     "plugins": ["C:/path/to/opencode-geneseed"]
   }
   ```

3. Start OpenCode and open a session. The Geneseed panel is appended to the
   sidebar content.

The package exports `./tui` (`src/tui.tsx`). There is no build step. This install form has not yet
been checked against a live OpenCode screen; [Try it live](#-try-it-live) is the procedure for that
check.

## 🧭 What it shows

The panel at the default width (32 columns), as `src/panel.js` renders it:

```text
GENESEED                     ▲ 2
── ● gates ────────────── 2 of 4
  ✓ secrets     ✓ external
  ○ deletion    ○ ownership
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
```

The panel appears only when a Geneseed carrier (`AGENT.md`) is found. A section with nothing to
show is left out. Each section opens with a rule line that carries its summary at the right.

| Section | What it lists | Summary |
| --- | --- | --- |
| **gates** | The four switchable gates: `✓` on, `○` off. Then `✓ strict consent` when the carrier has `Own-branch pass: off` | on of switchable |
| **refused** | Tool calls the guard refused in this session: the rule, then the path or command | the refusal count |
| **loop** | One rule per loop run on this repository that is not done: its title, then `● waits for you` or the stop reason | the step and iteration |
| **factory** | The same for factory runs | the stage |
| **memory** | Two lists. First what the session used: `⌕` a `memory_search` call with its result count, `◆` a fact file read. Then `+` the facts created or changed since the panel first showed the session | used · learned `new` |

Lists show the newest 3, then `+N`.

### Gates

A gate is on unless the carrier holds the line `<Name> gate: off` (Secrets, Deletion, Ownership,
External). The Done gate is not shown: OpenCode 2 turns are not judged.

The carrier is read once, when OpenCode starts the plugin, because Geneseed's guard also reads it
once at load. An absent carrier at that time counts as every gate armed. When the gates in the
carrier change later, or the carrier appears or goes, the panel keeps the gates the guard holds and
adds `↺ restart OpenCode to apply`. A rewrite that leaves the gates as they were adds nothing.

`GENESEED_GUARD`, read from the TUI's environment, is parsed as the guard parses it (any case, no
trimming):

- `off`, `0`, `false` or `no`: an inverse `GUARD OFF · nothing blocks` bar replaces the gates, and
  the section is one line, `GENESEED_GUARD=off`.
- `warn`: the gates stay, and `◐ warn only · logs, no block` is added under the rule.

### Refused

A refused path is shown relative to the session directory when it is under it, else as its last two
segments. Content that a refused write carried is never shown. A refusal whose text names no rule
(the ownership and relay refusals) shows as `refused`.

### Header badge

The header shows one badge, the first that applies:

| Badge | When |
| --- | --- |
| `■ off` | the guard is off |
| `◐ warn` | the guard is in warn mode |
| `↺` | a restart is due: the gates on disk differ from the gates the guard holds |
| `▲ <n>` | refusals plus runs that wait for you |

Nothing shows when none applies. In the folded panel, a restart due under `■ off` or `◐ warn` shows
as `↺` before that badge, because the folded panel has no hint line.

### Widths

Every row fits the sidebar's width exactly. The width is measured from the drawn box, and is 32
until the box is laid out.

| Width (columns) | Layout |
| --- | --- |
| under 28 | **folded**: one line a section, the summary at the right. A loop or factory line shows the newest run's step, after the run count when there is more than one run |
| 28 to 40 | **default**: as in the panel above |
| over 40 | **wide**: gates on up to four columns, each item on one line (a learned fact shows its time) |

The same panel at 24 columns:

```text
GENESEED             ▲ 2
● Gates           2 of 4
▲ Refused              1
↻ Loop         plan · #0
⚙ Factory        pr-open
◆ Memory       2 · 1 new
```

Paths are cut from the left, so the file name shows. Other text is cut from the right. Gate names
are never cut: the grid wraps instead. CJK characters and emoji count as two columns.

## ⚙️ Configuration

### ASCII glyphs

For terminals without these glyphs, turn on the `ascii` option. List the plugin in `cli.json` as an
object:

```json
{
  "plugins": [{ "package": "C:/path/to/opencode-geneseed", "options": { "ascii": true } }]
}
```

Or set `GENESEED_SIDEBAR_ASCII=1` in OpenCode's environment. The option must be exactly `true`, and
the variable exactly `1`. The panel then draws printable ASCII only:

| Unicode | `●` | `○` | `✓` | `–` | `▲` | `■` | `◐` | `↺` | `↻` | `⚙` | `◆` | `⌕` | `+` | `─` | `·` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ASCII | `*` | `o` | `+` | `-` | `!` | `#` | `~` | `R` | `L` | `F` | `M` | `?` | `+` | `-` | `.` |

The ellipsis `…` becomes `>` where text is cut at the right, and `<` where a path is cut at the left.

### Environment the plugin reads

The plugin has no other option. It finds Geneseed's files with the same variables Geneseed uses:

| Variable | Use |
| --- | --- |
| `GENESEED_SIDEBAR_ASCII` | `1` selects the ASCII glyphs |
| `GENESEED_GUARD` | the guard mode the panel shows (`off`, `warn`) |
| `GENESEED_HARNESS` | the first carrier looked for, and the memory store after `$GENESEED_MEMORY` |
| `GENESEED_MEMORY` | the memory store, before every other candidate |
| `OPENCODE_CONFIG_DIR` | the OpenCode config dir (else `$XDG_CONFIG_HOME/opencode`, else `~/.config/opencode`) |
| `XDG_CONFIG_HOME` | the base of the config dir and of Geneseed's machine dir (else `~/.config`) |

## 🔍 How it works

`src/tui.tsx` registers `geneseed.sidebar` and appends one slot to `sidebar.content`. It never
changes the order of OpenCode's own sections. It does the Solid wiring and the file reads only:
`src/panel.js` turns the files and the messages into rows of exactly the panel width, and the TUI
draws them as they are. Each reader in `src/read/` is pure, with no OpenCode import.

```text
carrier, registries, run files, memory store ──> src/poll.js ──┐
                                                               ├──> src/panel.js ──> rows ──> src/tui.tsx
session messages (data.session.message.list) ──────────────────┘
```

**Install.** From the session directory up to its git root, the first folder that holds
`.opencode/.geneseed-manifest.json` is a project install. Else the install is global, in the
OpenCode config dir.

**Sources.**

| Section | Source |
| --- | --- |
| gates | The first readable carrier, in the order Geneseed's guard looks for it: `$GENESEED_HARNESS/AGENT.md`, then `<config dir>/AGENT.md` and its parent's `AGENT.md` (global install), or `<root>/.opencode/AGENT.md` and `<root>/AGENT.md` (project install) |
| refused | Tool parts in state `error` whose message starts with `No tool named "BLOCKED, not a missing tool:` |
| loop | Rows of `<machine dir>/loops.json` whose root is the session directory or its git root, with the state between the `loop-state` markers in `<root>/LOOP.md`. A done run, or a run with no `LOOP.md`, is hidden |
| factory | The same with `factories.json`, `FACTORY.md` and the `factory-state` markers |
| memory | Completed `memory_search` and `read` tool parts, and the fact files in the store. The store is the first folder that exists, in Geneseed's order: `$GENESEED_MEMORY`, `$GENESEED_HARNESS/memory`, `<machine dir>/memory` (an install that reads the shared tier), `<install dir>/memory`, `<session dir>/memory`, `<session dir>/Harness/memory`. A store that a search result names wins. `MEMORY.md`, `README.md`, `topics/`, `archive/` and `agents/` are not facts. The store is read two folders deep |

The machine dir is `$XDG_CONFIG_HOME/geneseed`, else `~/.config/geneseed`.

**Polling.** Files are checked every 3 seconds while a session is open, and read again only when
they change. A memory store is checked by its fact listing, because a changed fact leaves the
folder's own time unchanged. A source that is missing or broken hides its section; the session is
never disturbed.

## 🧪 Try it live

`scripts/try.mjs` builds a throwaway home under your temp dir and checks the plugin there. It
prints PowerShell commands, so it is for Windows.

```
node scripts/try.mjs --geneseed <Geneseed checkout> [--opencode <opencode.exe>]
```

You can leave out `--geneseed` when `GENESEED_SRC` is set. Run `npm install --ignore-scripts` first
(see [Quick start](#-quick-start)): one check fails when `solid-js` or `@opentui/solid` does not
resolve from the checkout.

What it does:

1. It emits Geneseed (`--emit opencode-global`) into the throwaway home and lists this checkout in
   that home's `cli.json`.
2. It starts a scripted model on 127.0.0.1 (`scripts/fake-model.mjs`: no real model, no
   credentials). After one prompt, the model tries to write `.ssh/id_rsa`, calls `memory_search`
   for "geneseed", then writes `allowed.txt`.
3. It registers a real loop in a temp git repo.
4. It prints `ok` or `FAIL` for each headless check.
5. It prints one PowerShell command that opens OpenCode's screen in that home, the checklist below,
   and the command that stops the scripted model. The model also stops itself after 30 minutes. The
   script never opens the screen itself.

Its child processes, and the screen command, get only an allowlist of environment variables (PATH,
the Windows system variables, the terminal variables) plus the throwaway locations. No ambient
OpenCode, Geneseed, Claude, proxy or credential variable reaches the run. The script also compares
the top-level entries and modification times of your real OpenCode config dir and Geneseed machine
dir before and after, and reports a change as `FAIL`.

Checklist for the live run, in the screen it opens:

1. The Geneseed section is in the sidebar, with the gates.
2. After you type any prompt, a Refused row appears (Sealed Secrets, `.ssh/id_rsa`).
3. A Loop row `try-sidebar` is shown.
4. Memory: a searched row appears after the second turn.
5. In another PowerShell, `Rename-Item` the throwaway `.config\geneseed\loops.json` (in the home
   the script printed): within a few seconds the loop row goes and the session keeps running.
6. Quit, `Rename-Item` the throwaway `.config\opencode\AGENT.md`, start the screen again with the
   same command: the Geneseed panel is hidden.

Remove a home with this command. It refuses any folder that is not a `gs-try-*` folder directly
under the temp dir.

```
node scripts/try.mjs --clean <dir>
```

## 🩺 Troubleshooting

| What you see | Cause and fix |
| --- | --- |
| No Geneseed panel | No carrier was found at the paths in [How it works](#-how-it-works), the checkout is not in `plugins`, or `solid-js` and `@opentui/solid` do not resolve from the checkout. Run `npm install --ignore-scripts` in the checkout |
| Boxes or `?` in place of the glyphs | Turn on the `ascii` option, or set `GENESEED_SIDEBAR_ASCII=1` |
| A gate edit does not change the gates; `↺` shows | By design: the guard reads the carrier once at load. Restart OpenCode |
| Refusal or memory counts look low | Only the messages the TUI has loaded are counted |
| A change to a loop or a fact shows late | Files are checked every 3 seconds |

## ⚠️ Limits

- **OpenCode 2 only, from 2.3.2.** OpenCode 1 and the desktop app are not supported.
- **The done gate is not shown.** OpenCode 2 turns are not judged.
- **Counts are what is in view.** Refusals and memory come from the messages the TUI has loaded,
  and older messages may be missing.
- **The TUI's own environment and disk.** The guard mode and the file paths are read where the TUI
  runs. When the TUI is attached to a remote server, the server's environment may differ.
- **"learned" is not tied to a session.** Geneseed records no session for a fact, so the label never
  says "learned here".
- **Facts injected at session start are not listed.** Nothing records which of them the model used.

## 🧪 Tests

```
npm test
```

It runs `node --test` over `test/**/*.test.js`. Set `GENESEED_SRC` to a Geneseed checkout to also
run the contract checks: they scrape the refusal and `memory_search` texts from Geneseed's OpenCode
plugins, feed them through the readers, and fail when the formats drift. Without it, those checks
are skipped.

## 🗂 Layout

```text
opencode-geneseed/
├── src/
│   ├── tui.tsx       the plugin: Solid wiring and file reads, draws the rows
│   ├── panel.js      every row of the panel, exactly the panel width; the glyph sets
│   ├── read/         one pure reader per section: gates, refusals, memory, runs
│   ├── paths.js      config dir, machine dir, install and carrier lookup
│   ├── poll.js       the 3-second poll, re-reading a file only when it changed
│   ├── style.js      theme roles to OpenTUI colours, with fallbacks
│   └── width.js      display width in terminal columns
├── scripts/
│   ├── try.mjs       the live check in a throwaway home
│   ├── try-env.mjs   its allowlisted environment and printed commands
│   └── fake-model.mjs  the scripted model on loopback
├── test/             node --test suites and Geneseed-format fixtures
└── docs/             the design spec, the plan and the spike notes
```

## 🤝 Contributing

Issues and pull requests are welcome at
[github.com/Arylmera/geneseed-opencode](https://github.com/Arylmera/geneseed-opencode). There is
no CI: run `npm test`, and the contract checks with `GENESEED_SRC` set, before you open a pull
request.

Read [the design spec](docs/specs/2026-11-24-sidebar-design.md) first. Three rules hold the design:

- **Read-only.** The plugin writes nothing, spawns nothing and calls no network. A broken source
  hides its section and never disturbs the session.
- **No copied gate logic.** The panel shows what Geneseed's guard holds; a missing gate is fixed in
  Geneseed.
- **Geneseed's formats are not a public API.** When you read a new Geneseed format, add it to the
  contract checks in `test/contract.test.js`.

## 🙏 Credits

- `scripts/fake-model.mjs` is adapted from `tests/helpers/fake_model.mjs` in
  [Arylmera/Geneseed](https://github.com/Arylmera/Geneseed), by Guillaume Lemer (MIT), and
  modified: the script is a list of tool calls, so one prompt can be refused, search memory, then
  write.
- [OpenTUI](https://github.com/anomalyco/opentui) (`@opentui/core`, `@opentui/solid`, MIT): the
  terminal UI that draws the panel.
- [Solid](https://github.com/solidjs/solid) (`solid-js`) by Ryan Carniato (MIT): the reactive
  layer of `src/tui.tsx`.
- [OpenCode](https://github.com/anomalyco/opencode) (`@opencode/plugin`, MIT): the plugin API.

## 📄 License

[MIT](LICENSE) — built by [@Arylmera](https://github.com/Arylmera).
