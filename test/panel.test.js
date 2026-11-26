import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { cut, readsTierOf, runPaths, storeOf, watchList, panelLines, glyphsFor, GLYPHS, GLYPH_TABLE } from "../src/panel.js"

const refusal = JSON.parse(fs.readFileSync(new URL("./fixtures/refusal.json", import.meta.url), "utf8"))
const DASH = "—"
const W = {
  carriers: ["/h/AGENT.md", "/cfg/AGENT.md"],
  stores: ["/cfg/memory", "/r/memory"],
  loopsReg: "/m/loops.json",
  factReg: "/m/factories.json",
  roots: ["/r/sub", "/r"],
  platform: "linux",
}
const opts = (o = {}) => ({ env: {}, sinceMs: 100, time: (ms) => `T${ms}`, ...o })
const len = (s) => Array.from(s).length
// Each row as its drawn text: the segments joined.
const rows = (w, snap, messages, o) => {
  const out = panelLines(w, snap, messages, opts(o))
  return out && out.map((r) => r.map((s) => s.text).join(""))
}
// Each row as "role|text" per segment ("!" bold, "^" inverse), for the tests that name the colours.
const roles = (w, snap, messages, o) =>
  panelLines(w, snap, messages, opts(o)).map((r) => r.map((s) => `${s.role}${s.bold ? "!" : ""}${s.inverse ? "^" : ""}|${s.text}`))
// Spaces to the width: the tests spell the text, this pads it.
const pad = (s, n = 32) => s + " ".repeat(n - len(s))
const R = "─"

const msg = (...content) => ({ role: "assistant", content })
const refused = (i, input) => ({ ...refusal, id: `r${i}`, state: { ...refusal.state, input } })
const done = (name, input, text, completed) => ({
  type: "tool",
  id: "t",
  name,
  state: { status: "completed", input, content: [{ type: "text", text }] },
  time: { completed },
})
const state = (tag, obj) => `x\n<!-- ${tag}:begin -->\n${JSON.stringify(obj)}\n<!-- ${tag}:end -->\n`
const CARRIER = { "/cfg/AGENT.md": "carrier" }

// The design brief's sketch data: two gates off, one refusal, a loop, a waiting factory, memory used
// twice (a search and a read) and one fact learned.
const WIN = { ...W, roots: [String.raw`C:\Users\g\proj`], platform: "win32" }
const FULL_SNAP = {
  "/cfg/AGENT.md": "Deletion gate: off\nOwnership gate: off\n",
  "/cfg/memory": [{ name: "repo-facts.md", mtimeMs: 200 }],
  "/m/loops.json": JSON.stringify({ loops: [{ root: String.raw`C:\Users\g\proj` }] }),
  "/m/factories.json": JSON.stringify({ factories: [{ root: String.raw`C:\Users\g\proj` }] }),
  [String.raw`C:\Users\g\proj\LOOP.md`]: state("loop-state", { title: "try-sidebar", node: "plan", iteration: 0, status: "running" }),
  [String.raw`C:\Users\g\proj\FACTORY.md`]: state("factory-state", { title: "fix-auth", stage: "pr-open", status: "awaiting" }),
}
const facts4 = `Facts in /cfg/memory (read <slug>.md there):\na ${DASH} 1\nb ${DASH} 2\nc ${DASH} 3\nd ${DASH} 4`
const FULL_MSGS = [
  msg(refused(1, { path: String.raw`C:\Users\g\proj\.ssh\id_rsa`, content: "SECRET" })),
  msg(done("read", { filePath: "/cfg/memory/host-parity-rule.md" }, "x", 1)),
  msg(done("memory_search", { query: "host parity" }, facts4, 2)),
]
const full = (o) => rows(WIN, FULL_SNAP, FULL_MSGS, o)

test("W=32: the full panel, every rule filled to the width, summaries at the right", () => {
  assert.deepEqual(full({ width: 32 }), [
    `GENESEED${" ".repeat(21)}▲ 2`,
    `── ● gates ${R.repeat(14)} 2 of 4`,
    pad("  ✓ secrets     ✓ external"),
    pad("  ○ deletion    ○ ownership"),
    pad("  – done n/a on OpenCode 2"),
    `── ▲ refused ${R.repeat(17)} 1`,
    pad("  Sealed Secrets"),
    pad(String.raw`  .ssh\id_rsa`),
    `── ↻ loop ${R.repeat(12)} plan · #0`,
    pad("  try-sidebar"),
    `── ⚙ factory ${R.repeat(11)} pr-open`,
    pad("  fix-auth"),
    pad("  ● waits for you"),
    `── ◆ memory ${R.repeat(10)} 2 · 1 new`,
    pad('  ⌕ "host parity"  4'),
    pad("  ◆ host-parity-rule"),
    pad("  + repo-facts"),
  ])
  assert.ok(!full({ width: 32 }).join("\n").includes("SECRET"))
})

test("W=32: roles: accent bold title, warning badge, muted rule, role-coloured glyph and summary", () => {
  const r = roles(WIN, FULL_SNAP, FULL_MSGS, { width: 32 })
  assert.deepEqual(r[0], ["accent!|GENESEED", `text|${" ".repeat(21)}`, "warning|▲ 2"])
  assert.deepEqual(r[1], ["muted|── ", "success|●", "text| gates ", `muted|${R.repeat(14)}`, "muted| ", "success|2 of 4"])
  assert.deepEqual(r[2].slice(0, 3), ["text|  ", "success|✓", "text| secrets     "])
  assert.deepEqual(r[3].slice(0, 3), ["text|  ", "error|○", "muted| deletion    "])
  assert.deepEqual(r[12].slice(0, 2), ["text|  ", "warning!|● waits for you"])
})

test("W=24: folded, one line a section, the summary at the right", () => {
  assert.deepEqual(full({ width: 24 }), [
    `GENESEED${" ".repeat(13)}▲ 2`,
    `● Gates${" ".repeat(11)}2 of 4`,
    `▲ Refused${" ".repeat(14)}1`,
    `↻ Loop${" ".repeat(9)}plan · #0`,
    `⚙ Factory${" ".repeat(8)}pr-open`,
    `◆ Memory${" ".repeat(7)}2 · 1 new`,
  ])
})

test("W=44: wide, gates on as many columns as fit (up to 4), items on one line", () => {
  const p = (s) => pad(s, 44)
  assert.deepEqual(full({ width: 44 }), [
    `GENESEED${" ".repeat(33)}▲ 2`,
    `── ● gates ${R.repeat(26)} 2 of 4`,
    p("  ✓ secrets     ✓ external    ○ deletion"),
    p("  ○ ownership"),
    p("  – done n/a on OpenCode 2"),
    `── ▲ refused ${R.repeat(29)} 1`,
    p(String.raw`  Sealed Secrets  .ssh\id_rsa`),
    `── ↻ loop ${R.repeat(24)} plan · #0`,
    p("  try-sidebar"),
    `── ⚙ factory ${R.repeat(23)} pr-open`,
    `  fix-auth${" ".repeat(19)}● waits for you`,
    `── ◆ memory ${R.repeat(22)} 2 · 1 new`,
    `  ⌕ "host parity"${" ".repeat(26)}4`,
    p("  ◆ host-parity-rule"),
    `  + repo-facts${" ".repeat(26)}T200`,
  ])
  // Four columns once they fit: 2 + 14 * 3 + 11.
  assert.equal(rows(W, { "/cfg/AGENT.md": "Deletion gate: off\n" }, [], { width: 55 })[2], pad("  ✓ secrets     ✓ ownership   ✓ external    ○ deletion", 55))
})

test("guard off: the header badge, an inverse error bar, and the gates section is one line", () => {
  assert.deepEqual(rows(W, CARRIER, [], { width: 32, env: { GENESEED_GUARD: "off" } }), [
    `GENESEED${" ".repeat(19)}■ off`,
    pad("GUARD OFF · nothing blocks"),
    pad("  GENESEED_GUARD=off"),
  ])
  const r = roles(W, CARRIER, [], { width: 32, env: { GENESEED_GUARD: "off" } })
  assert.deepEqual(r[0][2], "error|■ off")
  assert.deepEqual(r[1], [`error^|${pad("GUARD OFF · nothing blocks")}`])
  assert.deepEqual(r[2], ["muted|  GENESEED_GUARD=off", `text|${" ".repeat(12)}`])
})

test("warn: the header badge and one warning line under the gates rule; the grid stays", () => {
  assert.deepEqual(rows(W, CARRIER, [], { width: 32, env: { GENESEED_GUARD: "warn" } }), [
    `GENESEED${" ".repeat(18)}◐ warn`,
    `── ● gates ${R.repeat(14)} 4 of 4`,
    pad("  ◐ warn only · logs, no block"),
    pad("  ✓ secrets     ✓ deletion"),
    pad("  ✓ ownership   ✓ external"),
    pad("  – done n/a on OpenCode 2"),
  ])
})

test("restart: the gates the guard holds, the badge, and the hint under the gates", () => {
  const first = "Deletion gate: off\n"
  assert.deepEqual(rows(W, { "/cfg/AGENT.md": "Secrets gate: off\n" }, [], { width: 32, carrier: first }), [
    `GENESEED${" ".repeat(23)}↺`,
    `── ● gates ${R.repeat(14)} 3 of 4`,
    pad("  ✓ secrets     ✓ ownership"),
    pad("  ✓ external    ○ deletion"),
    pad("  – done n/a on OpenCode 2"),
    pad("  ↺ restart OpenCode to apply"),
  ])
})

test("a waiting factory and a stopped loop: waits in warning bold, the reason muted, the count badge", () => {
  const snap = {
    ...CARRIER,
    "/m/loops.json": JSON.stringify({ loops: [{ root: "/r" }] }),
    "/m/factories.json": JSON.stringify({ factories: [{ root: "/r/sub" }] }),
    "/r/LOOP.md": state("loop-state", { title: "refactor", node: "check", iteration: 3, status: "stopped", reason: "budget spent" }),
    "/r/sub/FACTORY.md": state("factory-state", { title: "issue-to-pr", stage: "pr-open", status: "awaiting" }),
  }
  const out = rows(W, snap, [], { width: 32 })
  assert.deepEqual([out[0], ...out.slice(5)], [
    `GENESEED${" ".repeat(21)}▲ 1`,
    `── ↻ loop ${R.repeat(11)} check · #3`,
    pad("  refactor"),
    pad("  budget spent"),
    `── ⚙ factory ${R.repeat(11)} pr-open`,
    pad("  issue-to-pr"),
    pad("  ● waits for you"),
  ])
  const r = roles(W, snap, [], { width: 32 })
  assert.deepEqual(r[7].slice(0, 2), ["text|  ", "muted|budget spent"])
  assert.deepEqual(r[10].slice(0, 2), ["text|  ", "warning!|● waits for you"])
})

test("ASCII set at W=32: the same panel, every glyph from the ASCII column", () => {
  assert.deepEqual(full({ width: 32, glyphs: GLYPHS.ascii }), [
    `GENESEED${" ".repeat(21)}! 2`,
    `-- * gates ${"-".repeat(14)} 2 of 4`,
    pad("  + secrets     + external"),
    pad("  o deletion    o ownership"),
    pad("  - done n/a on OpenCode 2"),
    `-- ! refused ${"-".repeat(17)} 1`,
    pad("  Sealed Secrets"),
    pad(String.raw`  .ssh\id_rsa`),
    `-- L loop ${"-".repeat(12)} plan · #0`,
    pad("  try-sidebar"),
    `-- F factory ${"-".repeat(11)} pr-open`,
    pad("  fix-auth"),
    pad("  * waits for you"),
    `-- M memory ${"-".repeat(10)} 2 · 1 new`,
    pad('  ? "host parity"  4'),
    pad("  M host-parity-rule"),
    pad("  + repo-facts"),
  ])
})

test("glyphs: one table, two sets; ASCII on options.ascii === true or GENESEED_SIDEBAR_ASCII=1", () => {
  assert.equal(GLYPH_TABLE.map((r) => r[1]).join(" "), "● ○ ✓ – ▲ ■ ◐ ↺ ↻ ⚙ ◆ ⌕ + ─")
  assert.equal(GLYPH_TABLE.map((r) => r[2]).join(" "), "* o + - ! # ~ R L F M ? + -")
  assert.equal(glyphsFor({ ascii: true }, {}), GLYPHS.ascii)
  assert.equal(glyphsFor({}, { GENESEED_SIDEBAR_ASCII: "1" }), GLYPHS.ascii)
  assert.equal(glyphsFor(undefined, undefined), GLYPHS.unicode)
  assert.equal(glyphsFor({ ascii: "true" }, { GENESEED_SIDEBAR_ASCII: "0" }), GLYPHS.unicode)
  assert.equal(glyphsFor({}, {}), GLYPHS.unicode)
  // Only "·" (from the run step) is left outside ASCII.
  for (const t of full({ width: 32, glyphs: glyphsFor({ ascii: true }, {}) })) assert.match(t, /^[\x20-\x7e·]*$/, t)
})

test("the layout boundaries: 27 folds, 28 and 40 are default, 41 is wide with 3 gate columns", () => {
  const at = (width) => full({ width })
  // 27: folded, one line a section.
  assert.equal(at(27)[1], `● Gates${" ".repeat(14)}2 of 4`)
  assert.equal(at(27).length, 6)
  // 28: default, the rule and a 2-column grid.
  assert.deepEqual(at(28).slice(1, 3), [`── ● gates ${R.repeat(10)} 2 of 4`, pad("  ✓ secrets     ✓ external", 28)])
  // 40: still default: 2 columns, the refused detail on its own line.
  const d40 = at(40)
  assert.equal(d40[2], pad("  ✓ secrets     ✓ external", 40))
  assert.deepEqual(d40.slice(6, 8), [pad("  Sealed Secrets", 40), pad(String.raw`  .ssh\id_rsa`, 40)])
  // 41: wide: 3 columns, the refused detail on the rule's line.
  const d41 = at(41)
  assert.deepEqual(d41.slice(2, 4), [pad("  ✓ secrets     ✓ external    ○ deletion", 41), pad("  ○ ownership", 41)])
  assert.equal(d41[6], pad(String.raw`  Sealed Secrets  .ssh\id_rsa`, 41))
})

test("every row is exactly W wide, at 24, 27, 28, 32, 40, 41 and 44, long content included", () => {
  const long = {
    ...FULL_SNAP,
    "/cfg/AGENT.md": "Deletion gate: off\nOwn-branch pass: off\n",
    [String.raw`C:\Users\g\proj\LOOP.md`]: state("loop-state", { title: "x".repeat(60), node: "a-very-long-node-name", iteration: 12, status: "stopped", reason: "r".repeat(60) }),
    [String.raw`C:\Users\g\proj\FACTORY.md`]: state("factory-state", { title: "f".repeat(60), stage: "s".repeat(50), status: "awaiting" }),
  }
  const msgs = [
    ...FULL_MSGS,
    msg(refused(2, { command: "git push --force origin some-very-long-branch-name-that-goes-on" })),
    msg(refused(3, { path: String.raw`C:\Users\g\AppData\Local\xxverylongfoldername\a_file_with_a_really_long_name_id_rsa` })),
    msg(refused(4, {})),
    msg(refused(5, { path: "/p/5" })),
    msg(done("memory_search", { query: "q".repeat(70) }, facts4, 3)),
  ]
  const cases = [
    [WIN, long, msgs, {}],
    [W, CARRIER, [], { env: { GENESEED_GUARD: "off" } }],
    [W, CARRIER, [], { env: { GENESEED_GUARD: "warn" } }],
    [W, { "/cfg/AGENT.md": "Secrets gate: off\n" }, [], { carrier: "" }],
    [WIN, FULL_SNAP, FULL_MSGS, { glyphs: GLYPHS.ascii }],
  ]
  for (const width of [24, 27, 28, 32, 40, 41, 44]) {
    for (const [w, snap, messages, o] of cases) {
      const out = rows(w, snap, messages, { ...o, width })
      assert.ok(out.length > 1)
      for (const t of out) assert.equal(len(t), width, `W=${width}: ${JSON.stringify(t)}`)
    }
  }
})

test("cut keeps the width, the last an ellipsis, and never splits a character", () => {
  assert.equal(cut("a".repeat(30), 30), "a".repeat(30))
  assert.equal(cut("a".repeat(31), 30), "a".repeat(29) + "…")
  assert.equal(cut("\u{1F600}".repeat(31), 30), "\u{1F600}".repeat(29) + "…")
})

test("no carrier: no panel", () => {
  assert.equal(panelLines(W, {}, [], opts()), null)
  assert.equal(panelLines(W, { "/h/AGENT.md": null, "/cfg/AGENT.md": null }, [], opts()), null)
})

test("the default install shows only the gates; the width defaults to 32", () => {
  assert.deepEqual(rows(W, CARRIER, []), [
    pad("GENESEED"),
    `── ● gates ${R.repeat(14)} 4 of 4`,
    pad("  ✓ secrets     ✓ deletion"),
    pad("  ✓ ownership   ✓ external"),
    pad("  – done n/a on OpenCode 2"),
  ])
})

test("the first readable carrier wins", () => {
  const snap = { "/h/AGENT.md": "Secrets gate: off\n", "/cfg/AGENT.md": "carrier" }
  assert.deepEqual(rows(W, snap, []).slice(1, 3), [`── ● gates ${R.repeat(14)} 3 of 4`, pad("  ✓ deletion    ✓ ownership")])
})

test("off gates and strict consent", () => {
  const text = "Deletion gate: off\r\nOwnership gate: off\r\nOwn-branch pass: off\r\n"
  assert.deepEqual(rows(W, { "/cfg/AGENT.md": text }, []).slice(1), [
    `── ● gates ${R.repeat(14)} 2 of 4`,
    pad("  ✓ secrets     ✓ external"),
    pad("  ○ deletion    ○ ownership"),
    pad("  – done n/a on OpenCode 2"),
    pad("  ✓ strict consent"),
  ])
})

test("refused: count, newest 3, then +N; rule, then the detail below it", () => {
  const messages = [1, 2, 3, 4].map((i) => msg(refused(i, { path: `/p/${i}`, content: "SECRET" })))
  messages.push(msg(refused(5, { command: "git push --force origin some-long-branch" })))
  const out = rows(W, CARRIER, messages)
  assert.deepEqual(out.slice(5), [
    `── ▲ refused ${R.repeat(17)} 5`,
    pad("  Sealed Secrets"),
    pad("  git push --force origin some-…"),
    pad("  Sealed Secrets"),
    pad("  /p/4"),
    pad("  Sealed Secrets"),
    pad("  /p/3"),
    pad("  +2"),
  ])
  assert.equal(out[0], `GENESEED${" ".repeat(21)}▲ 5`)
  assert.ok(!out.join("\n").includes("SECRET"))
})

test("memory: used newest first, then learned, each 3 and +N; the summary drops · 0 new", () => {
  const facts = (dir) => `Facts in ${dir} (read <slug>.md there):\nf-1 ${DASH} a\nf-2 ${DASH} b`
  const messages = [
    msg(done("memory_search", { query: "one" }, facts("/cfg/memory"), 1)),
    msg(done("read", { filePath: "/cfg/memory/first-fact.md" }, "x", 2)),
    msg(done("memory_search", { query: "two" }, "No fact in /cfg/memory matches \"two\".", 3)),
    msg(done("read", { filePath: "/cfg/memory/MEMORY.md" }, "x", 4)),
    msg(done("read", { filePath: "/cfg/memory/host-parity-rule.md" }, "x", 5)),
  ]
  const listing = [
    { name: "old.md", mtimeMs: 50 },
    { name: "a.md", mtimeMs: 200 },
    { name: "b.md", mtimeMs: 300 },
    { name: "c.md", mtimeMs: 400 },
    { name: "d.md", mtimeMs: 500 },
  ]
  assert.deepEqual(rows(W, { ...CARRIER, "/cfg/memory": listing }, messages).slice(5), [
    `── ◆ memory ${R.repeat(10)} 4 · 4 new`,
    pad("  ◆ host-parity-rule"),
    pad('  ⌕ "two"  0'),
    pad("  ◆ first-fact"),
    pad("  +1"),
    pad("  + d"),
    pad("  + c"),
    pad("  + b"),
    pad("  +1"),
  ])
  assert.equal(rows(W, CARRIER, messages.slice(0, 1))[5], `── ◆ memory ${R.repeat(18)} 1`)
})

test("memory: learned alone shows the section", () => {
  const snap = { ...CARRIER, "/r/memory": [{ name: "topics/x.md", mtimeMs: 900 }, { name: "n.md", mtimeMs: 900 }] }
  assert.deepEqual(rows(W, snap, []).slice(5), [`── ◆ memory ${R.repeat(10)} 0 · 1 new`, pad("  + n")])
})

test("a store a search result names wins for learned too", () => {
  const messages = [msg(done("memory_search", { query: "q" }, `Facts in /seen (read x):\nf ${DASH} a`, 1))]
  const snap = { ...CARRIER, "/cfg/memory": [{ name: "candidate.md", mtimeMs: 900 }], "/seen": [{ name: "observed.md", mtimeMs: 800 }] }
  assert.equal(storeOf(W, snap, messages), "/seen")
  assert.equal(storeOf(W, snap, []), "/cfg/memory")
  assert.equal(storeOf(W, { "/cfg/memory": null }, []), null)
  assert.deepEqual(rows(W, snap, messages).slice(6), [pad('  ⌕ "q"  1'), pad("  + observed")])
})

test("loops and factories: a rule a run, newest first by start, done hidden, long titles cut", () => {
  const loops = JSON.stringify({
    loops: [
      { root: "/r", initAt: "2026-01-01T00:00:00Z" },
      { root: "/r/sub", initAt: "2026-02-01T00:00:00Z" },
      { root: "/elsewhere", initAt: "2026-03-01T00:00:00Z" },
    ],
  })
  const snap = {
    ...CARRIER,
    "/m/loops.json": loops,
    "/r/LOOP.md": state("loop-state", { title: "older", node: "plan", iteration: 1, status: "running" }),
    "/r/sub/LOOP.md": state("loop-state", { title: "refactor", node: "check", iteration: 3, status: "running" }),
    "/elsewhere/LOOP.md": state("loop-state", { title: "nope", node: "x", status: "running" }),
  }
  assert.deepEqual(rows(W, snap, []).slice(5), [
    `── ↻ loop ${R.repeat(11)} check · #3`,
    pad("  refactor"),
    `── ↻ loop ${R.repeat(12)} plan · #1`,
    pad("  older"),
  ])
  snap["/r/sub/LOOP.md"] = state("loop-state", { title: "refactor-auth", node: "check", status: "done" })
  snap["/r/LOOP.md"] = state("loop-state", { title: "x".repeat(40), node: "plan", status: "running" })
  assert.deepEqual(rows(W, snap, []).slice(5), [`── ↻ loop ${R.repeat(17)} plan`, `  ${"x".repeat(29)}…`])
})

test("runs: newest 3, then +N", () => {
  const reg = JSON.stringify({ loops: [1, 2, 3, 4].map((i) => ({ root: `/r${i}`, initAt: `2026-0${i}-01T00:00:00Z` })) })
  const w = { ...W, roots: ["/r1", "/r2", "/r3", "/r4"] }
  const snap = { ...CARRIER, "/m/loops.json": reg }
  for (const i of [1, 2, 3, 4]) snap[`/r${i}/LOOP.md`] = state("loop-state", { title: `l${i}`, node: "n", status: "running" })
  assert.deepEqual(rows(w, snap, []).slice(5).filter((t) => !t.startsWith("──")), [pad("  l4"), pad("  l3"), pad("  l2"), pad("  +1")])
})

test("runPaths: rows without a time keep registry order, newest (last) first", () => {
  const reg = JSON.stringify({ loops: [{ root: "/r" }, { root: "/r/sub" }] })
  assert.deepEqual(runPaths(reg, "loops", "LOOP.md", ["/r", "/r/sub"], "linux"), ["/r/sub/LOOP.md", "/r/LOOP.md"])
  const timed = JSON.stringify({ loops: [{ root: "/r/sub", initAt: "2026-01-01T00:00:00Z" }, { root: "/r", started: "2026-05-01T00:00:00Z" }] })
  assert.deepEqual(runPaths(timed, "loops", "LOOP.md", ["/r", "/r/sub"], "linux"), ["/r/LOOP.md", "/r/sub/LOOP.md"])
  assert.deepEqual(runPaths("{bad", "loops", "LOOP.md", ["/r"], "linux"), [])
})

test("watchList: carriers, stores, the named store, registries, then run files", () => {
  const messages = [msg(done("memory_search", { query: "q" }, "Facts in /seen (read x):\n", 1))]
  const snap = { "/m/loops.json": JSON.stringify({ loops: [{ root: "/r" }] }) }
  assert.deepEqual(watchList(W, snap, messages), [
    "/h/AGENT.md",
    "/cfg/AGENT.md",
    "/cfg/memory",
    "/r/memory",
    "/seen",
    "/m/loops.json",
    "/m/factories.json",
    "/r/LOOP.md",
  ])
  assert.deepEqual(watchList(W, {}, []).length, 6)
})

test("readsTierOf: global always; project when .geneseed-emit ends with -global", () => {
  assert.equal(readsTierOf({ kind: "global", root: "/cfg" }, null), true)
  assert.equal(readsTierOf({ kind: "project", root: "/r" }, "opencode-global\r\n"), true)
  assert.equal(readsTierOf({ kind: "project", root: "/r" }, "opencode-project\n"), false)
  assert.equal(readsTierOf({ kind: "project", root: "/r" }, null), false)
})

test("watchList polls the stores only up to the first that exists, plus the named one", () => {
  const w = { ...W, stores: ["/a/memory", "/b/memory", "/c/memory", "/d/memory"] }
  const stores = (snap, messages = []) => watchList(w, snap, messages).filter((p) => p.endsWith("memory") || p === "/seen")
  // Nothing known yet: every candidate, so the first tick finds the first existing one.
  assert.deepEqual(stores({}), ["/a/memory", "/b/memory", "/c/memory", "/d/memory"])
  // /a missing, /b exists: /c and /d are no longer polled; /a still is, in case it appears.
  assert.deepEqual(stores({ "/a/memory": null, "/b/memory": [], "/c/memory": [] }), ["/a/memory", "/b/memory"])
  assert.deepEqual(stores({ "/a/memory": [] }), ["/a/memory"])
  const named = [msg(done("memory_search", { query: "q" }, "Facts in /seen (read x):\n", 1))]
  assert.deepEqual(stores({ "/a/memory": [] }, named), ["/a/memory", "/seen"])
})

// Ruling 22: one pin per plugin setup, "absent" (null) included; the hint compares gate results.
const HINT = pad("  ↺ restart OpenCode to apply")
const OLD = [
  pad("GENESEED"),
  `── ● gates ${R.repeat(14)} 3 of 4`,
  pad("  ✓ secrets     ✓ ownership"),
  pad("  ✓ external    ○ deletion"),
  pad("  – done n/a on OpenCode 2"),
]
const withBadge = (r) => [`GENESEED${" ".repeat(23)}↺`, ...r.slice(1)]
test("the pinned carrier: a later gate change keeps the old gates and says restart", async () => {
  const { carrierText } = await import("../src/panel.js")
  const first = "Deletion gate: off\n"
  assert.equal(carrierText(W, { "/h/AGENT.md": null, "/cfg/AGENT.md": first }), first)
  assert.equal(carrierText(W, {}), null)
  // Unchanged: no hint.
  assert.deepEqual(rows(W, { "/cfg/AGENT.md": first }, [], { carrier: first }), OLD)
  // Changed on disk: the gates the session started with, then the hint.
  assert.deepEqual(rows(W, { "/cfg/AGENT.md": "Secrets gate: off\n" }, [], { carrier: first }), [...withBadge(OLD), HINT])
  // Gone on disk: the same; the guard still holds what it read.
  assert.deepEqual(rows(W, {}, [], { carrier: first }), [...withBadge(OLD), HINT])
  // No pinned carrier (the first render): the current one, no hint.
  assert.deepEqual(rows(W, { "/cfg/AGENT.md": first }, []), OLD)
})

test("pinned absent, carrier present later: the gates the guard holds (all armed), then the hint", () => {
  const ARMED = [
    `GENESEED${" ".repeat(23)}↺`,
    `── ● gates ${R.repeat(14)} 4 of 4`,
    pad("  ✓ secrets     ✓ deletion"),
    pad("  ✓ ownership   ✓ external"),
    pad("  – done n/a on OpenCode 2"),
    HINT,
  ]
  assert.deepEqual(rows(W, { "/cfg/AGENT.md": "Deletion gate: off\n" }, [], { carrier: null }), ARMED)
  assert.deepEqual(rows(W, CARRIER, [], { carrier: null }), ARMED)
  // Absent at the pin and still absent: no panel.
  assert.equal(rows(W, {}, [], { carrier: null }), null)
})

test("a prose-only or line-ending-only rewrite of the carrier shows no hint", () => {
  const first = "# Harness\nDeletion gate: off\nSome rules.\n"
  assert.deepEqual(rows(W, { "/cfg/AGENT.md": "# Harness, reworded\nDeletion gate: off\nOther rules.\n" }, [], { carrier: first }), OLD)
  assert.deepEqual(rows(W, { "/cfg/AGENT.md": first.replace(/\n/g, "\r\n") }, [], { carrier: first }), OLD)
})

test("a gate flipped in the carrier shows the hint", () => {
  const first = "Deletion gate: off\n"
  const hint = (now) => rows(W, { "/cfg/AGENT.md": now }, [], { carrier: first }).includes(HINT)
  assert.equal(hint("Deletion gate: off\nSecrets gate: off\n"), true)
  assert.equal(hint(""), true)
  assert.equal(hint("Deletion gate: off\nOwn-branch pass: off\n"), true)
  assert.equal(hint("Deletion gate: off\n"), false)
})

test("refused path detail: relative to the session dir, else the last two segments; a command stays", () => {
  const detail = (w, input, width = 32) => {
    const all = rows(w, CARRIER, [msg(refused(1, input))], { width })
    return all.slice(all.findIndex((t) => t.startsWith("── ▲ refused")) + 1)
  }
  const win = { ...W, roots: [String.raw`C:\Users\g\proj`], platform: "win32" }
  const posix = { ...W, roots: ["/home/g/proj"], platform: "linux" }
  const two = (d) => [pad("  Sealed Secrets"), pad(`  ${d}`)]
  const cases = [
    ["win32 under the session dir", win, { path: String.raw`C:\Users\g\proj\.ssh\id_rsa` }, two(String.raw`.ssh\id_rsa`)],
    ["win32 different case", win, { path: String.raw`c:\users\G\PROJ\.ssh\id_rsa` }, two(String.raw`.ssh\id_rsa`)],
    ["posix under the session dir", posix, { filePath: "/home/g/proj/.ssh/id_rsa" }, two(".ssh/id_rsa")],
    ["posix is case-sensitive", posix, { path: "/home/g/PROJ/.ssh/id_rsa" }, two("…/.ssh/id_rsa")],
    ["win32 outside the session dir", win, { path: String.raw`C:\Users\g\AppData\Local\x\.ssh\id_rsa` }, two(String.raw`…\.ssh\id_rsa`)],
    ["posix outside the session dir", posix, { path: "/etc/ssh/keys/id_rsa" }, two("…/keys/id_rsa")],
    ["a sibling sharing the prefix is outside", posix, { path: "/home/g/proj2/a/id_rsa" }, two("…/a/id_rsa")],
    ["a command is left as it is, cut at the right", win, { command: "git push --force origin some-long-branch" }, two("git push --force origin some-…")],
    ["a command that looks like a path is left as it is", posix, { command: "/home/g/proj/.ssh/id_rsa" }, two("/home/g/proj/.ssh/id_rsa")],
    ["no detail: the rule alone", posix, {}, [pad("  Sealed Secrets")]],
  ]
  for (const [name, w, input, want] of cases) assert.deepEqual(detail(w, input), want, name)
  // Wide: one line, the detail after the rule.
  assert.deepEqual(detail(posix, { path: "/etc/ssh/keys/id_rsa" }, 44), [pad("  Sealed Secrets  …/keys/id_rsa", 44)])
})

test("refused path detail: a tail too wide for its row is cut from the left, the file name stays", () => {
  const w = { ...W, roots: [String.raw`C:\Users\g\proj`], platform: "win32" }
  const longPath = String.raw`C:\Users\g\AppData\Local\xxverylongfoldername\anotherfile_rsa`
  const detail = (path) => {
    const all = rows(w, CARRIER, [msg(refused(1, { path }))], { width: 32 })
    return all[all.findIndex((t) => t.startsWith("── ▲ refused")) + 2]
  }
  // An ellipsis plus the last 29 columns: 32 with its indent.
  assert.equal(detail(longPath), String.raw`  …ongfoldername\anotherfile_rsa`)
  assert.equal(detail(String.raw`C:\Users\g\AppData\Local\d\a_file_with_a_really_long_name_id_rsa`), "  …ith_a_really_long_name_id_rsa")
  // Wide: the same cut on the one line, after the rule.
  const wide = rows(w, CARRIER, [msg(refused(1, { path: longPath }))], { width: 44 })
  assert.equal(wide[6], String.raw`  Sealed Secrets  …oldername\anotherfile_rsa`)
})
