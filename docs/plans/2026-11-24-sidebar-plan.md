# opencode-geneseed sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An OpenCode 2 sidebar panel: Geneseed gates, refusals, memory that fired, loops, factories.

**Architecture:** One pure reader per section (text or message objects in, rows out) plus one file
poller. `src/tui.tsx` joins them in `sidebar.content`. Nothing writes, spawns or calls the network.

**Tech Stack:** ESM JavaScript, JSX with `@opentui/solid`, `node --test` (Node 22), no build step.

**Spec:** `docs/specs/2026-11-24-sidebar-design.md` (today in
`~/.config/geneseed/notebook/opencode-geneseed/`; Task 1 copies it and this plan into the repo).

## Global Constraints

- Repo `Arylmera/geneseed-opencode` (public on GitHub since 2026-11-26). No npm publish without a
  separate yes from the owner.
- OpenCode 2 from 2.3.2. Plugin id `geneseed.sidebar`. Slot `append: "sidebar.content"`.
- Only the spec's five sections. Nothing OpenCode shows by default.
- `src/read/*.js` imports no OpenCode module. A reader returns its empty value on any bad input.
- Theme roles only, no raw colours. `box` and `text` only. Poll 3 s. Newest 3 rows, then `+N`.
- MIT, Copyright (c) 2026 Guillaume Lemer. Conventional commits.
- Every new test is seen red first, then red again when its reader is broken by hand.

## Review Focus

1. Windows path spelled `c:\Repo` against `C:/repo`: the same root, the loop shows. (Task 2, Task 5)
2. `LOOP.md` read while the engine rewrites it: empty rows, no throw, next poll recovers. (Task 5)
3. Session switch or close while a poll runs: no update after cleanup, no leaked timer. (Task 6)
4. An `AGENT.md` whose prose quotes `Deletion gate: off` mid-line: not read as off. (Task 2)
5. A red test whose output quotes the refusal text further down: not a refusal. (Task 3)

## Files

- `package.json`, `LICENSE`, `README.md`, `.gitignore`, `docs/specs/`, `docs/plans/`
- `src/paths.js`, `src/read/{gates,refusals,memory,runs}.js`, `src/poll.js`, `src/tui.tsx`
- `test/*.test.js`, `test/fixtures/`, `spike/` (throwaway, never copied into `src/`)

### Task 1: Spike, then repo skeleton

**Files:** Create `package.json`, `LICENSE`, `.gitignore`, `docs/`, `spike/tui.tsx`, `test/fixtures/refusal.json`
**Produces:** recorded facts for Tasks 3, 4 and 6: the tool-part shape and how the slot renders.

- [ ] `git init`; copy spec and plan into `docs/`. `package.json`: name `opencode-geneseed`, version
  `0.0.1`, `type: module`, `exports: { "./tui": "./src/tui.tsx" }`, dependency `@opencode/plugin`,
  peers `@opentui/core >=0.8.4`, `@opentui/solid >=0.8.4`, `solid-js >=1.9.0`, script
  `test`: `node --test "test/**/*.test.js"`. Commit.
- [ ] `spike/tui.tsx`, pragma `/** @jsxImportSource @opentui/solid */`: one `<text>` in the slot with a
  counter updated each second from a signal, and a dump of `session.message.list(sessionID)` to a temp file.
- [ ] Load it in a throwaway OpenCode 2 home: set `OPENCODE_CONFIG_DIR` and `XDG_CONFIG_HOME` to temp
  folders and list the spike in that home's `cli.json`. Never edit the real `~/.config/opencode`.
  Emit Geneseed there with `geneseed build --emit opencode-global` under the same two variables.
- [ ] Drive it with Geneseed's `tests/helpers/fake_model.mjs` writing `.ssh/id_rsa`, as
  `tests/host_canary.mjs` does. No real model and no credentials.
- [ ] Expected: the counter ticks, and the dump holds a `tool` part in state `error`. Save that part as
  `test/fixtures/refusal.json`. Note in `docs/spike.md`: is `state.input` empty, does the message carry
  the `(Sealed Secrets)` line, does a local `.tsx` follow its signals.
- [ ] **STOP** if the counter does not tick, or the error text does not start with
  `No tool named "BLOCKED`: report it, because the spec changes. Else delete `spike/`, commit fixture and note.

### Task 2: Paths and gates

**Files:** Create `src/paths.js`, `src/read/gates.js`, `test/paths.test.js`, `test/gates.test.js`
**Produces:**
- `cfgDir(env, home): string`, `machineDir(env, home): string`, `sameRoot(a, b, platform): boolean`
- `findInstall(dir, cfg, exists): { kind: "project"|"global", root: string }`
- `carrierPaths(env, install, cfg): string[]`
- `readGates(text: string|null, env): null | { on: string[], off: string[], na: string[], strict: boolean, guard: "on"|"off"|"warn" }`

- [ ] Failing tests, asserting exactly:
  - `cfgDir`: `OPENCODE_CONFIG_DIR` wins, then `XDG_CONFIG_HOME/opencode`, then `home/.config/opencode`.
  - `sameRoot("c:\\Repo", "C:/repo", "win32")` is true; `sameRoot("/Repo", "/repo", "linux")` is false.
  - `findInstall`: a manifest in a parent folder gives `project`; none gives `global` at `cfg`.
  - `carrierPaths`: `GENESEED_HARNESS` first; a global install gives `<cfg>/AGENT.md`; a project `<root>/AGENT.md`.
  - `readGates("", {})`: on `["secrets","deletion","ownership","external"]`, off `[]`, na `["done"]`.
  - `"Deletion gate: off\r\nOwnership gate: off"`: off `["deletion","ownership"]`, on `["secrets","external"]`.
  - `"text Deletion gate: off here"`: off `[]`. `"Own-branch pass: off"`: strict true, off `[]`.
  - `"Done gate: off"`: na `["done"]`, off `[]`. `readGates(null, {})` is `null`.
  - `GENESEED_GUARD` `off` and `warn` give that `guard` value.
- [ ] Run `npm test`: red. Implement; match `^<marker>:[ \t]*off[ \t]*\r?$` with the `m` flag. Green.
- [ ] Contract test, run only with `GENESEED_SRC`, else `t.skip("GENESEED_SRC is not set")`: scrape the
  `marker:` values of `GATE_SWITCHES` in `js/build/source.mjs`; require at least 7, and the exact set
  the reader knows plus `Test note`. Prove it red with a marker added to a temp copy. Commit.

### Task 3: Refusals

**Files:** Create `src/read/refusals.js`, `test/refusals.test.js`
**Consumes:** `test/fixtures/refusal.json`. **Produces:** `readRefusals(messages): { id, rule, detail }[]`, newest first.

- [ ] Failing tests: the fixture gives one row with rule `Sealed Secrets`; no parenthesised rule on the
  `It was refused because` line gives rule `refused`; the marker on the third line of a text gives `[]`;
  a `completed` part gives `[]`; input `{}` gives detail `""`; input `{ command: "git push -f" }` gives
  that detail; `readRefusals(undefined)` gives `[]`.
- [ ] Red, implement with a start-anchored test on the trimmed message, green, commit.

### Task 4: Memory

**Files:** Create `src/read/memory.js`, `test/memory.test.js`
**Produces:**
- `storeCandidates(env, install, cfg, machine, cwd, readsTier): string[]` in the spec's order
- `readMemoryUse(messages, store): { kind: "searched"|"read", label, count?, at }[]`
- `learned(entries: { name, mtimeMs }[], sinceMs): { kind: "learned", label, at }[]`

- [ ] Failing tests: candidate order for global and project installs; a search result of a heading and
  4 lines with ` — ` gives count 4; a `No fact in` result gives count 0; a read of
  `<store>/host-parity-rule.md` gives that slug; reads of `MEMORY.md`, `README.md`, `topics/x.md` give `[]`;
  a read outside the store gives `[]`; `learned` drops those names and files older than `sinceMs`;
  `Facts in D:/other` in a result makes `D:/other` the store.
- [ ] Red, implement, green, commit.

### Task 5: Loops and factories

**Files:** Create `src/read/runs.js`, `test/runs.test.js`, `test/fixtures/LOOP.md`, `test/fixtures/FACTORY.md`
**Consumes:** `sameRoot`. **Produces:**
- `rowsFor(registryText, key: "loops"|"factories", roots: string[], platform): { root }[]`
- `readState(text, tag: "loop-state"|"factory-state"): object | null`
- `runLine(kind: "loop"|"factory", state): { name, step, note } | null`

- [ ] Make the fixtures with real `geneseed loop init` and `factory init` in a temp repo, under a temp `XDG_CONFIG_HOME`.
- [ ] Failing tests: both fixtures parse; a half-written block gives `null`; CRLF parses; a corrupt
  registry gives `[]`; a case-different Windows root matches; a loop at node `check`, iteration 3 gives
  step `check · #3`; `awaiting` gives note `waits for you`; `stopped` gives its reason; `done` gives `null`.
- [ ] Contract test with `GENESEED_SRC`: delimiters scraped from `js/loop/state.mjs` and `js/factory/state.mjs` equal ours.
- [ ] Red, implement, green, commit.

### Task 6: Poller and panel

**Files:** Create `src/poll.js`, `src/tui.tsx`, `test/poll.test.js`, `README.md`
**Consumes:** every reader above. **Produces:** `createPoll({ files, read, stat, onChange, every, timers }): () => void`

- [ ] Failing tests with fake timers and fs: an unchanged mtime is read once; a changed mtime calls
  `onChange`; a throwing `stat` gives `null` and no throw; after the returned stop function no call
  happens, even for a read in flight; stop twice is safe.
- [ ] Red, implement `createPoll`, green.
- [ ] `src/tui.tsx`: sections in spec order, empty ones absent, whole panel absent when `readGates` is
  `null`; refusals and memory from `context.data.session.message.list` in a memo; each session's poller
  stopped in `onCleanup`. Cut rows at 30 characters with `…`.
- [ ] README: what it shows, install by absolute path in `cli.json` `plugins`, the limits (OpenCode 2
  only, done gate n/a, loaded messages only, remote-server environment). Commit.

### Task 7: Live proof

- [ ] In the Task 1 throwaway home: the panel renders, the scripted refusal appears, a scripted
  `memory_search` appears, a `loop init` in the repo appears within 3 s and leaves when `LOOP.md` is removed.
- [ ] Corrupt `loops.json`, then delete `AGENT.md`: the section, then the panel, disappears; the session runs on.
- [ ] Save a screen capture to `docs/`, run `npm test` with and without `GENESEED_SRC`, commit.
- [ ] Ask the owner before adding it to their real `cli.json` and before creating the GitHub repo.
