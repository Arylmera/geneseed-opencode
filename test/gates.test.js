import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { readGates, KNOWN_MARKERS } from "../src/read/gates.js"

test("no switches: four on, done not listed", () => {
  const g = readGates("", {})
  assert.deepEqual(g.on, ["secrets", "deletion", "ownership", "external"])
  assert.deepEqual(g.off, [])
  assert.equal("na" in g, false)
  assert.equal(g.strict, false)
  assert.equal(g.guard, "on")
})
test("CRLF off lines", () => {
  const g = readGates("Deletion gate: off\r\nOwnership gate: off", {})
  assert.deepEqual(g.off, ["deletion", "ownership"])
  assert.deepEqual(g.on, ["secrets", "external"])
})
test("Own-branch pass off is strict", () => {
  const g = readGates("Own-branch pass: off", {})
  assert.equal(g.strict, true)
  assert.deepEqual(g.off, [])
})
test("Done gate off is not listed", () => {
  const g = readGates("Done gate: off", {})
  assert.deepEqual(g.on, ["secrets", "deletion", "ownership", "external"])
  assert.deepEqual(g.off, [])
})
test("null carrier is null", () => assert.equal(readGates(null, {}), null))
test("GENESEED_GUARD off and warn", () => {
  assert.equal(readGates("", { GENESEED_GUARD: "off" }).guard, "off")
  assert.equal(readGates("", { GENESEED_GUARD: "warn" }).guard, "warn")
})
// The guard's own parse (geneseed-guard.js): (GENESEED_GUARD || "on").toLowerCase(), no trim.
for (const [value, guard] of [
  [undefined, "on"], ["", "on"], ["on", "on"], ["off", "off"], ["OFF", "off"], ["0", "off"],
  ["false", "off"], ["no", "off"], ["No", "off"], ["warn", "warn"], ["WARN", "warn"],
  [" off", "on"], ["off ", "on"], ["warn ", "on"], ["1", "on"], ["yes", "on"],
]) {
  test(`GENESEED_GUARD ${JSON.stringify(value)} is ${guard}`, () => {
    assert.equal(readGates("", { GENESEED_GUARD: value }).guard, guard)
  })
}

test("contract: GATE_SWITCHES markers match the reader", (t) => {
  const src = process.env.GENESEED_SRC
  if (!src) return t.skip("GENESEED_SRC is not set")
  const text = fs.readFileSync(src.replace(/[\/]$/, "") + "/js/build/source.mjs", "utf8")
  const start = text.indexOf("export const GATE_SWITCHES")
  assert.ok(start >= 0, "GATE_SWITCHES not found")
  const block = text.slice(start, text.indexOf("\n];", start))
  const markers = [...block.matchAll(/marker:\s*'([^']+)'/g)].map((m) => m[1])
  assert.ok(markers.length >= 7, `only ${markers.length} markers`)
  assert.deepEqual([...markers].sort(), [...KNOWN_MARKERS, "Test note"].sort())
})
test("marker must start the line, even when the line ends in off", () => {
  assert.deepEqual(readGates("text Deletion gate: off here", {}).off, [])
  assert.deepEqual(readGates("text Deletion gate: off", {}).off, [])
  assert.deepEqual(readGates("Deletion gate: off here", {}).off, [])
})
