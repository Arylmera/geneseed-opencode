import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { readRefusals } from "../src/read/refusals.js"

const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/refusal.json", import.meta.url), "utf8"))
const msg = (...content) => ({ role: "assistant", content })
const part = (message, input, status = "error", id = "p") => ({
  type: "tool",
  id,
  name: "write",
  state: { status, input, error: { message } },
})
const MARK = 'No tool named "BLOCKED, not a missing tool: [geneseed-guard] blocked: x'

test("the recorded fixture gives one row with rule Sealed Secrets", () => {
  const rows = readRefusals([msg(fixture)])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, "call_canary_1")
  assert.equal(rows[0].rule, "Sealed Secrets")
  assert.equal(rows[0].detail, "<TMP>/project/.ssh/id_rsa")
})
test("no parenthesised rule gives refused", () => {
  const m = `${MARK}\nIt was refused because nothing in brackets.\nmore`
  assert.equal(readRefusals([msg(part(m, {}))])[0].rule, "refused")
})
test("no 'It was refused because' line gives refused", () => {
  assert.equal(readRefusals([msg(part(`${MARK} (Sealed Secrets)`, {}))])[0].rule, "refused")
})
test("last parentheses on the line win", () => {
  const m = `${MARK}\nIt was refused because of (a thing) here. (Deletion Gate)`
  assert.equal(readRefusals([msg(part(m, {}))])[0].rule, "Deletion Gate")
})
test("marker on the third line is not a refusal", () => {
  const m = `one\ntwo\n${MARK}\nIt was refused because x. (Sealed Secrets)`
  assert.deepEqual(readRefusals([msg(part(m, {}))]), [])
})
test("leading whitespace before the marker still counts", () => {
  assert.equal(readRefusals([msg(part(`  \n${MARK}`, {}))]).length, 1)
})
test("a completed part gives nothing", () => {
  assert.deepEqual(readRefusals([msg(part(MARK, {}, "completed"))]), [])
})
test("detail: empty for {} and missing input", () => {
  assert.equal(readRefusals([msg(part(MARK, {}))])[0].detail, "")
  assert.equal(readRefusals([msg(part(MARK, undefined))])[0].detail, "")
})
test("detail: command, and key precedence filePath > path > command", () => {
  assert.equal(readRefusals([msg(part(MARK, { command: "git push -f" }))])[0].detail, "git push -f")
  const all = { command: "c", path: "p", filePath: "f" }
  assert.equal(readRefusals([msg(part(MARK, all))])[0].detail, "f")
  assert.equal(readRefusals([msg(part(MARK, { filePath: "", path: "p", command: "c" }))])[0].detail, "p")
})
test("detail never reads content: a secret in content leaks nowhere", () => {
  const secret = "-----BEGIN PRIVATE KEY-----"
  const rows = readRefusals([msg(part(MARK, { content: secret }))])
  assert.equal(rows[0].detail, "")
  assert.ok(!JSON.stringify(rows).includes(secret))
})
test("newest first across messages and parts", () => {
  const a = part(MARK, {}, "error", "a")
  const b = part(MARK, {}, "error", "b")
  const c = part(MARK, {}, "error", "c")
  assert.deepEqual(readRefusals([msg(a, b), msg(c)]).map((r) => r.id), ["c", "b", "a"])
})
test("tolerates junk input", () => {
  assert.deepEqual(readRefusals(undefined), [])
  assert.deepEqual(readRefusals(null), [])
  assert.deepEqual(readRefusals("x"), [])
  assert.deepEqual(readRefusals([null, 3, {}, { content: "s" }, { content: [null, 1, "s", {}, { type: "tool" }, { type: "tool", state: null }] }]), [])
})
test("non-string error message is tolerated", () => {
  assert.deepEqual(readRefusals([msg({ type: "tool", state: { status: "error", error: { message: 5 } } })]), [])
})
