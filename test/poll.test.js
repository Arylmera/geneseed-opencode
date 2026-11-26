import { test } from "node:test"
import assert from "node:assert/strict"
import { createPoll } from "../src/poll.js"

// Fake timers: the interval callback is captured and fired by hand. No real waiting.
function fakeTimers() {
  const t = { fn: null, every: null, cleared: 0 }
  t.setInterval = (fn, ms) => {
    t.fn = fn
    t.every = ms
    return 7
  }
  t.clearInterval = (id) => {
    if (id === 7) t.cleared++
    t.fn = null
  }
  return t
}

// Fake fs: path -> { mtime, text }. Counts every read.
function fakeFs(init) {
  const files = new Map(Object.entries(init))
  const reads = []
  return {
    files,
    reads,
    stat: (p) => {
      if (!files.has(p)) throw new Error("ENOENT")
      return files.get(p).mtime
    },
    read: (p) => {
      reads.push(p)
      return files.get(p).text
    },
  }
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

test("polls at once, then on each tick; an unchanged mtime is read once", async () => {
  const t = fakeTimers()
  const fs = fakeFs({ a: { mtime: 1, text: "A1" } })
  const seen = []
  createPoll({ files: ["a"], read: fs.read, stat: fs.stat, onChange: (s) => seen.push(s), every: 3000, timers: t })
  await flush()
  assert.equal(t.every, 3000)
  assert.deepEqual(seen, [{ a: "A1" }])
  t.fn()
  await flush()
  t.fn()
  await flush()
  assert.deepEqual(fs.reads, ["a"])
  assert.equal(seen.length, 1)
})

test("a changed mtime re-reads and calls onChange", async () => {
  const t = fakeTimers()
  const fs = fakeFs({ a: { mtime: 1, text: "A1" }, b: { mtime: 5, text: "B" } })
  const seen = []
  createPoll({ files: ["a", "b"], read: fs.read, stat: fs.stat, onChange: (s) => seen.push(s), every: 3000, timers: t })
  await flush()
  fs.files.set("a", { mtime: 2, text: "A2" })
  t.fn()
  await flush()
  assert.deepEqual(seen, [
    { a: "A1", b: "B" },
    { a: "A2", b: "B" },
  ])
  assert.deepEqual(fs.reads, ["a", "b", "a"])
})

test("a stat token is compared as is, so a string fingerprint works", async () => {
  const t = fakeTimers()
  const fs = fakeFs({ d: { mtime: "2:100", text: ["x"] } })
  const seen = []
  createPoll({ files: ["d"], read: fs.read, stat: fs.stat, onChange: (s) => seen.push(s), every: 3000, timers: t })
  await flush()
  fs.files.set("d", { mtime: "3:100", text: ["x", "y"] })
  t.fn()
  await flush()
  assert.deepEqual(seen, [{ d: ["x"] }, { d: ["x", "y"] }])
})

test("a throwing stat gives null and no throw; a throwing read gives null", async () => {
  const t = fakeTimers()
  const fs = fakeFs({ a: { mtime: 1, text: "A" } })
  const seen = []
  const read = (p) => {
    if (p === "bad") throw new Error("EACCES")
    return fs.read(p)
  }
  const stat = (p) => (p === "bad" ? 9 : fs.stat(p))
  createPoll({ files: ["a", "gone", "bad"], read, stat, onChange: (s) => seen.push(s), every: 3000, timers: t })
  await flush()
  assert.deepEqual(seen, [{ a: "A", gone: null, bad: null }])
  fs.files.delete("a")
  assert.doesNotThrow(() => t.fn())
  await flush()
  assert.deepEqual(seen[1], { a: null, gone: null, bad: null })
})

test("files may be a getter; a path that leaves the set leaves the snapshot", async () => {
  const t = fakeTimers()
  const fs = fakeFs({ a: { mtime: 1, text: "A" }, b: { mtime: 1, text: "B" } })
  let list = ["a"]
  const seen = []
  createPoll({ files: () => list, read: fs.read, stat: fs.stat, onChange: (s) => seen.push(s), every: 3000, timers: t })
  await flush()
  list = ["b"]
  t.fn()
  await flush()
  assert.deepEqual(seen, [{ a: "A" }, { b: "B" }])
})

test("paths the getter derives from a changed file are read in the same tick", async () => {
  const t = fakeTimers()
  const fs = fakeFs({ reg: { mtime: 1, text: "" }, "x/LOOP.md": { mtime: 1, text: "L" } })
  const seen = []
  const files = (snap) => ["reg", ...(snap.reg ? [snap.reg] : [])]
  createPoll({ files, read: fs.read, stat: fs.stat, onChange: (s) => seen.push(s), every: 3000, timers: t })
  await flush()
  assert.deepEqual(seen, [{ reg: "" }])
  fs.files.set("reg", { mtime: 2, text: "x/LOOP.md" })
  t.fn()
  await flush()
  assert.deepEqual(seen, [{ reg: "" }, { reg: "x/LOOP.md", "x/LOOP.md": "L" }])
})

test("a throwing onChange does not stop the poll", async () => {
  const t = fakeTimers()
  const fs = fakeFs({ a: { mtime: 1, text: "A1" } })
  let calls = 0
  const onChange = () => {
    calls++
    throw new Error("render broke")
  }
  createPoll({ files: ["a"], read: fs.read, stat: fs.stat, onChange, every: 3000, timers: t })
  await flush()
  fs.files.set("a", { mtime: 2, text: "A2" })
  t.fn()
  await flush()
  assert.equal(calls, 2)
})

test("after stop no call happens, even for a read in flight", async () => {
  const t = fakeTimers()
  let release
  const gate = new Promise((r) => (release = r))
  let stats = 0
  let reads = 0
  const seen = []
  const stop = createPoll({
    files: ["a"],
    stat: () => {
      stats++
      return 1
    },
    read: async () => {
      reads++
      await gate
      return "A"
    },
    onChange: (s) => seen.push(s),
    every: 3000,
    timers: t,
  })
  await flush()
  assert.equal(reads, 1)
  stop()
  assert.equal(t.cleared, 1)
  release()
  await flush()
  assert.deepEqual(seen, [])
  assert.equal(stats, 1)
})

test("a tick while the previous poll runs is skipped", async () => {
  const t = fakeTimers()
  let release
  const gate = new Promise((r) => (release = r))
  let stats = 0
  createPoll({
    files: ["a"],
    stat: async () => {
      stats++
      await gate
      return 1
    },
    read: () => "A",
    onChange: () => {},
    every: 3000,
    timers: t,
  })
  t.fn()
  t.fn()
  assert.equal(stats, 1)
  release()
  await flush()
})

test("stop twice is safe", async () => {
  const t = fakeTimers()
  const fs = fakeFs({ a: { mtime: 1, text: "A" } })
  const stop = createPoll({ files: ["a"], read: fs.read, stat: fs.stat, onChange: () => {}, every: 3000, timers: t })
  await flush()
  stop()
  assert.doesNotThrow(() => stop())
  assert.equal(t.cleared, 1)
})
