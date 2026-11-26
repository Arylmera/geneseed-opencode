import { test } from "node:test"
import assert from "node:assert/strict"
import { storeCandidates, readMemoryUse, learned, storeNamed } from "../src/read/memory.js"

const DASH = "\u2014"
const done = (name, input, text, completed) => ({
  type: "tool",
  id: "t",
  name,
  state: { status: "completed", input, content: [{ type: "text", text }] },
  time: completed === undefined ? undefined : { completed },
})
const msg = (...content) => ({ role: "assistant", content })
const fact = (n) => `fact-${n} ${DASH} desc ${n} (topic)`

test("candidates for a global install, in resolveMemoryDir order", () => {
  const env = { GENESEED_MEMORY: "/m", GENESEED_HARNESS: "/h" }
  const got = storeCandidates(env, { kind: "global", root: "/cfg" }, "/cfg", "/mach", "/w", true)
  assert.deepEqual(got, ["/m", "/h/memory", "/mach/memory", "/cfg/memory", "/w/memory", "/w/Harness/memory"])
})
test("candidates for a project install use root/.opencode and skip the shared tier when not read", () => {
  const got = storeCandidates({}, { kind: "project", root: "/p" }, "/cfg", "/mach", "/p/sub", false)
  assert.deepEqual(got, ["/p/.opencode/memory", "/p/sub/memory", "/p/sub/Harness/memory"])
})
test("windows paths keep backslashes", () => {
  const got = storeCandidates({}, { kind: "global", root: "C:\\cfg" }, "C:\\cfg", "C:\\mach", "C:\\w", true)
  assert.deepEqual(got, ["C:\\mach\\memory", "C:\\cfg\\memory", "C:\\w\\memory", "C:\\w\\Harness\\memory"])
})

test("a search with a heading and 4 fact lines counts 4", () => {
  const text = ["Facts in /s (read <slug>.md there for the whole fact):", 1, 2, 3, 4].map((x) => (typeof x === "number" ? fact(x) : x)).join("\n") + "\n\n(end of list)"
  const rows = readMemoryUse([msg(done("memory_search", { query: "parity" }, text, 5))], "/s")
  assert.deepEqual(rows, [{ kind: "searched", label: "parity", count: 4, at: 5 }])
})
test("a No fact result counts 0", () => {
  const rows = readMemoryUse([msg(done("memory_search", { query: "zz" }, 'No fact in /s matches "zz".'))], "/s")
  assert.deepEqual(rows, [{ kind: "searched", label: "zz", count: 0, at: null }])
})
test("a read of a fact under the store gives its slug", () => {
  const rows = readMemoryUse([msg(done("read", { filePath: "/s/host-parity-rule.md" }, "x", 9))], "/s")
  assert.deepEqual(rows, [{ kind: "read", label: "host-parity-rule", at: 9 }])
})
test("indexes and folders are not facts", () => {
  const reads = ["MEMORY.md", "README.md", "topics/x.md", "archive/a.md", "agents/b.md", "notes.txt"].map((n) =>
    done("read", { filePath: `/s/${n}` }, "x"),
  )
  assert.deepEqual(readMemoryUse([msg(...reads)], "/s"), [])
})
test("a read outside the store gives nothing, and a sibling prefix is outside", () => {
  const m = msg(done("read", { filePath: "/elsewhere/a.md" }, "x"), done("read", { path: "/s2/a.md" }, "x"))
  assert.deepEqual(readMemoryUse([m], "/s"), [])
})
test("windows: case-insensitive, either separator", () => {
  const rows = readMemoryUse([msg(done("read", { filePath: "c:/Mem/Fact-One.md" }, "x"))], "C:\\mem")
  assert.deepEqual(rows.map((r) => r.label), ["Fact-One"])
})
test("Facts in <dir> in a result makes that dir the store", () => {
  const search = done("memory_search", { query: "q" }, `Facts in D:/other (read x):\n${fact(1)}`)
  const rows = readMemoryUse([msg(search, done("read", { filePath: "D:/other/a-fact.md" }, "x"))], "/s")
  assert.deepEqual(rows.map((r) => `${r.kind}:${r.label}`), ["searched:q", "read:a-fact"])
})
test("not completed, junk and a null store give nothing", () => {
  const pending = { type: "tool", id: "p", name: "read", state: { status: "running", input: { filePath: "/s/a.md" } } }
  assert.deepEqual(readMemoryUse([msg(pending), null, { content: 3 }], "/s"), [])
  assert.deepEqual(readMemoryUse("x", "/s"), [])
  assert.deepEqual(readMemoryUse([msg(done("read", { filePath: "/s/a.md" }, "x"))], null), [])
})

test("learned drops indexes, folders, non-md and old files; newest first", () => {
  const entries = [
    { name: "old.md", mtimeMs: 50 },
    { name: "a.md", mtimeMs: 100 },
    { name: "b.md", mtimeMs: 300 },
    { name: "MEMORY.md", mtimeMs: 400 },
    { name: "README.md", mtimeMs: 400 },
    { name: "topics/t.md", mtimeMs: 400 },
    { name: "archive\\z.md", mtimeMs: 400 },
    { name: "agents/g.md", mtimeMs: 400 },
    { name: "x.txt", mtimeMs: 400 },
    null,
  ]
  assert.deepEqual(learned(entries, 100), [
    { kind: "learned", label: "b", at: 300 },
    { kind: "learned", label: "a", at: 100 },
  ])
  assert.deepEqual(learned("x", 0), [])
})

test("a No fact in <dir> result names the store too", () => {
  const none = done("memory_search", { query: "q" }, 'No fact in D:/other matches "q".')
  const rows = readMemoryUse([msg(none, done("read", { filePath: "D:/other/a.md" }, "x"))], "/s")
  assert.deepEqual(rows.map((r) => `${r.kind}:${r.label}`), ["searched:q", "read:a"])
})
test("a POSIX store is case-sensitive", () => {
  assert.deepEqual(readMemoryUse([msg(done("read", { filePath: "/S/a.md" }, "x"))], "/s"), [])
})
test("the path input key reads a fact under the store", () => {
  assert.deepEqual(readMemoryUse([msg(done("read", { path: "/s/a.md" }, "x", 3))], "/s"), [{ kind: "read", label: "a", at: 3 }])
})

test("storeNamed gives the dir the last search result names, else null", () => {
  const a = done("memory_search", { query: "a" }, `Facts in D:/one (read x):\n${fact(1)}`)
  const b = done("memory_search", { query: "b" }, `No fact in /two matches "b".`)
  const c = done("memory_search", { query: "c" }, "something else")
  assert.equal(storeNamed([msg(a), msg(b, c)]), "/two")
  assert.equal(storeNamed([msg(a)]), "D:/one")
  assert.equal(storeNamed([msg(c)]), null)
  assert.equal(storeNamed("x"), null)
})

test("listFacts: .md files to depth 2, never inside archive, agents or topics", async () => {
  const { listFacts } = await import("../src/read/memory.js")
  const tree = {
    "/s": [["a.md", false], ["notes.txt", false], ["sub", true], ["archive", true], ["Topics", true]],
    "/s/sub": [["b.md", false], ["deep", true]],
    "/s/sub/deep": [["c.md", false]],
    "/s/archive": [["old.md", false]],
    "/s/Topics": [["t.md", false]],
  }
  const seen = []
  const io = {
    list: (d) => {
      seen.push(d)
      if (!tree[d]) throw new Error("ENOENT")
      return tree[d].map(([name, dir]) => ({ name, dir }))
    },
    mtime: (p) => (p.endsWith("a.md") ? 1 : 2),
  }
  assert.deepEqual(listFacts("/s", io), [{ name: "a.md", mtimeMs: 1 }, { name: "sub/b.md", mtimeMs: 2 }])
  assert.deepEqual(seen, ["/s", "/s/sub"])
  assert.deepEqual(listFacts("/nope", io), [])
  const gone = { ...io, mtime: () => { throw new Error("ENOENT") } }
  assert.deepEqual(listFacts("/s", gone), [])
})
