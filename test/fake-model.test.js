import { test } from "node:test"
import assert from "node:assert/strict"
import { chunks, replyTo } from "../scripts/fake-model.mjs"
import { tryTurns } from "../scripts/try-env.mjs"

const tools = [
  { type: "function", function: { name: "write", parameters: { properties: { filePath: {}, content: {} } } } },
  { type: "function", function: { name: "memory_search", parameters: { properties: { query: {}, limit: {} } } } },
]
const after = (n) => ({ tools, messages: [{ role: "user" }, ...Array.from({ length: n }, () => ({ role: "tool" }))] })

test("try's script: refused write, memory_search geneseed, allowed write, then text", () => {
  const turns = tryTurns("/p")
  const calls = [0, 1, 2].map((n) => replyTo(after(n), turns).call)
  assert.deepEqual(calls.map((c) => c.name), ["write", "memory_search", "write"])
  assert.match(calls[0].args.filePath.replace(/\\/g, "/"), /\/p\/\.ssh\/id_rsa$/)
  assert.deepEqual(calls[1].args, { query: "geneseed" })
  assert.match(calls[2].args.filePath.replace(/\\/g, "/"), /\/p\/allowed\.txt$/)
  assert.deepEqual(replyTo(after(3), turns), { text: "done" })
})

test("the write's path key comes from the host's schema", () => {
  const body = { tools: [{ function: { name: "Write", parameters: { properties: { path: {} } } } }], messages: [] }
  assert.deepEqual(replyTo(body, [{ tool: "write", path: "/a", content: "x" }]).call, { id: "call_canary_1", name: "Write", args: { path: "/a", content: "x" } })
})

test("no tools, or a tool not on offer, is plain text", () => {
  assert.deepEqual(replyTo({ messages: [] }, [{ tool: "write", path: "/a" }]), { text: "canary" })
  const body = { tools: [{ function: { name: "write" } }], messages: [] }
  assert.deepEqual(replyTo(body, [{ tool: "memory_search", args: { query: "q" } }]), { text: "no memory_search tool on offer" })
})

test("a call streams as a tool_calls chunk", () => {
  const c = chunks({ call: { id: "i", name: "memory_search", args: { query: "q" } } }, "fake")
  assert.equal(c[0].choices[0].delta.tool_calls[0].function.name, "memory_search")
  assert.equal(c[1].choices[0].finish_reason, "tool_calls")
})
