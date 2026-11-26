import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { rowsFor, readState, runLine, MARKERS } from "../src/read/runs.js"

const fx = (n) => fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8")
const MID = " \u00b7 "

test("the LOOP.md fixture made by the real CLI parses", () => {
  const s = readState(fx("LOOP.md"), "loop-state")
  assert.equal(s.title, "Add widget")
  assert.equal(s.node, "plan")
  assert.equal(s.status, "running")
})
test("the FACTORY.md fixture made by the real CLI parses", () => {
  const s = readState(fx("FACTORY.md"), "factory-state")
  assert.equal(s.title, "Fix crash")
  assert.equal(s.stage, "intake")
})
test("CRLF and LF both parse", () => {
  const lf = fx("LOOP.md").replace(/\r\n/g, "\n")
  const crlf = lf.replace(/\n/g, "\r\n")
  assert.deepEqual(readState(crlf, "loop-state"), readState(lf, "loop-state"))
  assert.equal(readState(crlf, "loop-state").title, "Add widget")
})
test("a half-written block gives null", () => {
  const t = fx("LOOP.md").replace(/\r\n/g, "\n")
  const cut = t.slice(0, t.indexOf("<!-- loop-state:end -->"))
  assert.equal(readState(cut, "loop-state"), null)
  assert.equal(readState(t.slice(0, t.indexOf('"node"')), "loop-state"), null)
  assert.equal(readState("", "loop-state"), null)
  assert.equal(readState(undefined, "loop-state"), null)
})
test("the last end marker closes the block, as parseLoopFile does", () => {
  const state = { title: "a <!-- loop-state:end --> b", node: "n" }
  const t = ["<!-- loop-state:begin -->", "```json", JSON.stringify(state), "```", "<!-- loop-state:end -->", ""].join(String.fromCharCode(10))
  assert.deepEqual(readState(t, "loop-state"), state)
})
test("a loop block is not read as a factory block", () => {
  assert.equal(readState(fx("LOOP.md"), "factory-state"), null)
})
test("a block that is not an object gives null", () => {
  const t = "<!-- loop-state:begin -->\n```json\n[1]\n```\n<!-- loop-state:end -->"
  assert.equal(readState(t, "loop-state"), null)
})

test("rows match on the root; the fixture rows carry a placeholder root", () => {
  const rows = rowsFor(fx("loops.json").replace("<ROOT>", "/w/r"), "loops", ["/w/r"], "linux")
  assert.equal(rows.length, 1)
  assert.equal(rows[0].root, "/w/r")
  assert.equal(rowsFor(fx("factories.json").replace("<ROOT>", "/w/r"), "factories", ["/w/r"], "linux").length, 1)
})
test("a root that is not asked for is left out, and either of two roots matches", () => {
  const text = fx("loops.json").replace("<ROOT>", "/w/r")
  assert.deepEqual(rowsFor(text, "loops", ["/w/other"], "linux"), [])
  assert.equal(rowsFor(text, "loops", ["/w/sub", "/w/r"], "linux").length, 1)
  assert.deepEqual(rowsFor(text, "factories", ["/w/r"], "linux"), [])
})
test("a corrupt registry gives []", () => {
  for (const t of ["{", "", "null", "[]", '{"loops":3}', '{"loops":{}}', undefined]) {
    assert.deepEqual(rowsFor(t, "loops", ["/w"], "linux"), [])
  }
})
test("rows without a string root, and junk rows, are ignored", () => {
  const t = JSON.stringify({ loops: [null, 4, "x", {}, { root: 5 }, { root: "/w" }] })
  assert.deepEqual(rowsFor(t, "loops", ["/w"], "linux"), [{ root: "/w" }])
})
test("a case-different Windows root matches, a posix one does not", () => {
  const t = JSON.stringify({ loops: [{ root: String.raw`C:\Users\Me\Repo` }] })
  assert.equal(rowsFor(t, "loops", [String.raw`c:\users\me\repo`], "win32").length, 1)
  assert.equal(rowsFor(t, "loops", [String.raw`c:\users\me\repo`], "linux").length, 0)
})

test("a loop at node check, iteration 3 gives step check #3", () => {
  const got = runLine("loop", { title: "T", node: "check", iteration: 3, status: "running" })
  assert.deepEqual(got, { name: "T", step: `check${MID}#3`, note: "" })
})
test("a factory gives its stage as the step", () => {
  assert.deepEqual(runLine("factory", { title: "F", stage: "review", status: "running" }), {
    name: "F",
    step: "review",
    note: "",
  })
})
test("awaiting gives waits for you", () => {
  assert.equal(runLine("loop", { title: "T", node: "n", iteration: 1, status: "awaiting", awaiting: "gate" }).note, "waits for you")
  assert.equal(runLine("factory", { title: "F", stage: "s", status: "awaiting" }).note, "waits for you")
})
test("stopped gives its reason, or an empty note", () => {
  assert.equal(runLine("loop", { title: "T", node: "n", iteration: 1, status: "stopped", reason: "gate amended 3 times" }).note, "gate amended 3 times")
  assert.equal(runLine("factory", { title: "F", stage: "s", status: "stopped", reason: null }).note, "")
})
test("title, step and reason are one line of text: whitespace a space, ESC and bidi dropped", () => {
  // The run file is written by the model: its text must not break, colour or reorder a row.
  const got = runLine("loop", { title: "fix\tthe\nbug\x1b]0;pwn\x07", node: "pl\x1ban\n", iteration: 2, status: "stopped", reason: "gate\r\namended\u202E" })
  assert.deepEqual(got, { name: "fix the bug]0;pwn", step: `plan${MID}#2`, note: "gate amended" })
  assert.equal(runLine("factory", { title: "F", stage: "re\tview", status: "running" }).step, "re view")
  // U+200D is kept: it joins an emoji family into one cluster.
  const family = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}"
  assert.equal(runLine("factory", { title: family, stage: "s" }).name, family)
})
test("done gives null", () => {
  assert.equal(runLine("loop", { title: "T", node: "n", iteration: 1, status: "done" }), null)
  assert.equal(runLine("factory", { title: "F", stage: "s", status: "done" }), null)
})
test("a state without a string title or step gives null", () => {
  assert.equal(runLine("loop", { node: "n", iteration: 1, status: "running" }), null)
  assert.equal(runLine("loop", { title: "T", iteration: 1, status: "running" }), null)
  assert.equal(runLine("factory", { title: "F", status: "running" }), null)
  assert.equal(runLine("factory", { title: "F", node: "n", status: "running" }), null)
  assert.equal(runLine("loop", null), null)
  assert.equal(runLine("loop", "x"), null)
})
test("the fixtures turn into lines", () => {
  assert.deepEqual(runLine("loop", readState(fx("LOOP.md"), "loop-state")), { name: "Add widget", step: `plan${MID}#0`, note: "" })
  assert.deepEqual(runLine("factory", readState(fx("FACTORY.md"), "factory-state")), { name: "Fix crash", step: "intake", note: "" })
})

// Geneseed formats are not a public API: the markers must equal the ones its engine writes.
const SRC = process.env.GENESEED_SRC
const scrape = (file, src) => {
  const text = fs.readFileSync(path.join(src, "js", file, "state.mjs"), "utf8")
  const get = (name) => new RegExp(`const ${name} = '([^']+)'`).exec(text)?.[1]
  return { begin: get("BEGIN"), end: get("END") }
}
test("contract: the markers equal the ones Geneseed writes", (t) => {
  if (!SRC) return t.skip("GENESEED_SRC is not set")
  assert.deepEqual(scrape("loop", SRC), MARKERS["loop-state"])
  assert.deepEqual(scrape("factory", SRC), MARKERS["factory-state"])
})
