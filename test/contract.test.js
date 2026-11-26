// Contract checks against a Geneseed checkout (GENESEED_SRC): the refusal and memory_search texts the
// readers parse are scraped from Geneseed's own source and fed back through the readers.
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { MARKER, REFUSED_BECAUSE, readRefusals } from "../src/read/refusals.js"
import { FACTS_HEAD, NO_FACT_HEAD, readMemoryUse, storeNamed } from "../src/read/memory.js"

const SRC = process.env.GENESEED_SRC
const PLUGINS = ["adapters", "opencode", "plugins"]
const source = (file) => fs.readFileSync(path.join(SRC, ...PLUGINS, file), "utf8")

/** The body of `function <name>(` up to the next top-level `\n}`. */
function body(text, name) {
  const start = text.indexOf(`function ${name}(`)
  assert.ok(start >= 0, `${name} not found`)
  return text.slice(start, text.indexOf("\n}", start))
}
/** The template literal in `text` that starts with `head`, its `${x}` slots filled from `vars`. */
function template(text, head, vars) {
  const m = new RegExp("`(" + head.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[^`]*)`").exec(text)
  assert.ok(m, `no template starting ${JSON.stringify(head)}`)
  return m[1].replace(/\$\{([^}]+)\}/g, (_, k) => {
    assert.ok(k in vars, `unexpected slot \${${k}} in ${JSON.stringify(m[1])}`)
    return vars[k]
  })
}

test("contract: the guard's refusal marker and sentence are what readRefusals parses", (t) => {
  if (!SRC) return t.skip("GENESEED_SRC is not set")
  const guard = source("geneseed-guard.js")
  // OpenCode core wraps the renamed tool as `No tool named "<name>"`; Geneseed writes the name.
  const named = /event\.tool = `(BLOCKED[^`$]*)\$\{/.exec(guard)
  assert.ok(named, "the refusal's event.tool template not found")
  assert.equal(MARKER, `No tool named "${named[1].trimEnd()}`)

  const gate = body(guard, "gateText")
  const tag = /const tag = a\.rule \? `([^`]*)`/.exec(gate)
  assert.ok(tag, "gateText's rule tag not found")
  const sentence = template(gate, REFUSED_BECAUSE, { "a.why": "a key is never written", tag: tag[1].replace("${a.rule}", "Sealed Secrets") })
  const message = `${MARKER} [geneseed-guard] blocked: Tell the user this, word for word: x\n${sentence}\nYou can do it."`
  const part = { type: "tool", id: "c1", state: { status: "error", input: { path: "/p/.ssh/id_rsa" }, error: { message } } }
  assert.deepEqual(readRefusals([{ content: [part] }]), [{ id: "c1", rule: "Sealed Secrets", detail: "/p/.ssh/id_rsa" }])
})

test("contract: memory_search's two heads are what the memory reader parses", (t) => {
  if (!SRC) return t.skip("GENESEED_SRC is not set")
  const search = body(source("geneseed-learn.js"), "memorySearchText")
  const vars = { memDir: "/store", query: "geneseed" }
  const facts = template(search, FACTS_HEAD, vars)
  const none = template(search, NO_FACT_HEAD, vars)
  const part = (text) => ({ type: "tool", name: "memory_search", state: { status: "completed", input: { query: "geneseed" }, content: [{ type: "text", text }] } })
  const hit = [facts, "a-fact — what it says (topic)", "b-fact — more (topic)"].join("\n")
  assert.equal(storeNamed([{ content: [part(hit)] }]), "/store")
  assert.equal(storeNamed([{ content: [part(none)] }]), "/store")
  assert.deepEqual(readMemoryUse([{ content: [part(hit)] }], null), [{ kind: "searched", label: "geneseed", count: 2 }])
  assert.deepEqual(readMemoryUse([{ content: [part(none)] }], null), [{ kind: "searched", label: "geneseed", count: 0 }])
})
