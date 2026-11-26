import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { cut, wrapList, readsTierOf, runPaths, storeOf, watchList, panelLines } from "../src/panel.js"

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
// Lines as "role|text", so a test names both.
const shown = (w, snap, messages, o) => {
  const lines = panelLines(w, snap, messages, opts(o))
  return lines && lines.map((l) => `${l.role}|${l.text}`)
}
const HEAD = ["text|Geneseed", "text| Gates"]
const DEFAULT_GATES = ["muted|  on   secrets, deletion,", "muted|       ownership, external", "muted|  n/a  done (OpenCode 2)"]

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

test("cut keeps 30 characters, the last an ellipsis, and never splits a character", () => {
  assert.equal(cut("a".repeat(30)), "a".repeat(30))
  assert.equal(cut("a".repeat(31)), "a".repeat(29) + "…")
  assert.equal(cut("\u{1F600}".repeat(31)), "\u{1F600}".repeat(29) + "…")
})

test("wrapList breaks at ', ', aligns under the first name, never cuts a name", () => {
  assert.deepEqual(wrapList("  on   ", ["secrets", "deletion", "ownership", "external"]), [
    "  on   secrets, deletion,",
    "       ownership, external",
  ])
  assert.deepEqual(wrapList("  on   ", ["secrets"]), ["  on   secrets"])
  const long = "x".repeat(40)
  assert.deepEqual(wrapList("  on   ", [long, "a"]), [`  on   ${long},`, "       a"])
})

test("no carrier: no panel", () => {
  assert.equal(panelLines(W, {}, [], opts()), null)
  assert.equal(panelLines(W, { "/h/AGENT.md": null, "/cfg/AGENT.md": null }, [], opts()), null)
})

test("the default install shows only the gates, wrapped, in order", () => {
  assert.deepEqual(shown(W, { "/cfg/AGENT.md": "carrier" }, []), [...HEAD, ...DEFAULT_GATES])
})

test("the first readable carrier wins", () => {
  const snap = { "/h/AGENT.md": "Secrets gate: off\n", "/cfg/AGENT.md": "carrier" }
  assert.deepEqual(shown(W, snap, []).slice(2, 4), ["muted|  on   deletion, ownership,", "muted|       external"])
})

test("guard off or warn replaces the list", () => {
  const snap = { "/cfg/AGENT.md": "carrier" }
  assert.deepEqual(shown(W, snap, [], { env: { GENESEED_GUARD: "off" } }), [...HEAD, "warning|  guard off"])
  assert.deepEqual(shown(W, snap, [], { env: { GENESEED_GUARD: "warn" } }), [...HEAD, "warning|  warn only"])
})

test("off gates and strict consent", () => {
  const text = "Deletion gate: off\r\nOwnership gate: off\r\nOwn-branch pass: off\r\n"
  assert.deepEqual(shown(W, { "/cfg/AGENT.md": text }, []), [
    ...HEAD,
    "muted|  on   secrets, external",
    "muted|  off  deletion, ownership",
    "muted|  n/a  done (OpenCode 2)",
    "muted|  strict consent",
  ])
})

test("refused: count, newest 3, then +N; one line when it fits, else rule then detail", () => {
  const messages = [1, 2, 3, 4].map((i) => msg(refused(i, { path: `/p/${i}`, content: "SECRET" })))
  messages.push(msg(refused(5, { command: "git push --force origin some-long-branch" })))
  assert.deepEqual(shown(W, { "/cfg/AGENT.md": "carrier" }, messages), [
    ...HEAD,
    ...DEFAULT_GATES,
    "warning| Refused  5",
    "muted|  Sealed Secrets",
    "muted|    git push --force origin s…",
    "muted|  Sealed Secrets  /p/4",
    "muted|  Sealed Secrets  /p/3",
    "muted|  +2",
  ])
  assert.ok(!shown(W, { "/cfg/AGENT.md": "carrier" }, messages).join("\n").includes("SECRET"))
})

test("memory: used newest first, then learned, each 3 and +N", () => {
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
  assert.deepEqual(shown(W, { "/cfg/AGENT.md": "carrier", "/cfg/memory": listing }, messages).slice(5), [
    "text| Memory",
    "muted|  read      host-parity-rule",
    'muted|  searched  "two"  0',
    "muted|  read      first-fact",
    "muted|  +1",
    "muted|  learned   d  T500",
    "muted|  learned   c  T400",
    "muted|  learned   b  T300",
    "muted|  +1",
  ])
})

test("memory: learned alone shows the section", () => {
  const snap = { "/cfg/AGENT.md": "carrier", "/r/memory": [{ name: "topics/x.md", mtimeMs: 900 }, { name: "n.md", mtimeMs: 900 }] }
  assert.deepEqual(shown(W, snap, []).slice(5), ["text| Memory", "muted|  learned   n  T900"])
})

test("a store a search result names wins for learned too", () => {
  const messages = [msg(done("memory_search", { query: "q" }, `Facts in /seen (read x):\nf ${DASH} a`, 1))]
  const snap = {
    "/cfg/AGENT.md": "carrier",
    "/cfg/memory": [{ name: "candidate.md", mtimeMs: 900 }],
    "/seen": [{ name: "observed.md", mtimeMs: 800 }],
  }
  assert.equal(storeOf(W, snap, messages), "/seen")
  assert.equal(storeOf(W, snap, []), "/cfg/memory")
  assert.equal(storeOf(W, { "/cfg/memory": null }, []), null)
  assert.deepEqual(shown(W, snap, messages).slice(5), ["text| Memory", 'muted|  searched  "q"  1', "muted|  learned   observed  T800"])
})

test("loops and factories: two lines each, newest first by start, done hidden, long lines cut", () => {
  const loops = JSON.stringify({
    loops: [
      { root: "/r", initAt: "2026-01-01T00:00:00Z" },
      { root: "/r/sub", initAt: "2026-02-01T00:00:00Z" },
      { root: "/elsewhere", initAt: "2026-03-01T00:00:00Z" },
    ],
  })
  const factories = JSON.stringify({ factories: [{ root: "/r", started: "2026-01-01T00:00:00Z" }] })
  const snap = {
    "/cfg/AGENT.md": "carrier",
    "/m/loops.json": loops,
    "/m/factories.json": factories,
    "/r/LOOP.md": state("loop-state", { title: "older", node: "plan", iteration: 1, status: "running" }),
    "/r/sub/LOOP.md": state("loop-state", { title: "refactor", node: "check", iteration: 3, status: "running" }),
    "/elsewhere/LOOP.md": state("loop-state", { title: "nope", node: "x", status: "running" }),
    "/r/FACTORY.md": state("factory-state", { title: "issue-to-pr", stage: "pr-open", status: "awaiting" }),
  }
  assert.deepEqual(shown(W, snap, []).slice(5), [
    "muted| Loop  refactor",
    "muted|   check · #3",
    "muted| Loop  older",
    "muted|   plan · #1",
    "muted| Factory  issue-to-pr",
    "muted|   pr-open · waits for you",
  ])
  snap["/r/sub/LOOP.md"] = state("loop-state", { title: "refactor-auth", node: "check", status: "done" })
  snap["/r/FACTORY.md"] = null
  snap["/r/LOOP.md"] = state("loop-state", { title: "x".repeat(40), node: "plan", status: "stopped", reason: "budget spent" })
  assert.deepEqual(shown(W, snap, []).slice(5), [`muted| Loop  ${"x".repeat(22)}…`, "muted|   plan · budget spent"])
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
