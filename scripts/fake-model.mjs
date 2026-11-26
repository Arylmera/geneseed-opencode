#!/usr/bin/env node
// Adapted from Geneseed tests/helpers/fake_model.mjs, modified.
// Upstream: https://github.com/Arylmera/Geneseed, by Guillaume Lemer, MIT licence (the same as this
// repo's, see LICENSE). Changed: the script is a list of tool calls (any tool the host offers, not
// only `write`), so one prompt can be refused, search memory, then write.
/**
 * A SCRIPTED MODEL ON LOOPBACK, for scripts/try.mjs: an OpenAI-compatible `/v1/chat/completions`
 * that never thinks. It asks the host for the tool calls it was given, one per turn, then says a
 * word and stops. No real model, no credentials, no network beyond 127.0.0.1.
 *
 *   node scripts/fake-model.mjs --port-file <f> --requests <f> --turns <json> [--ttl <s>]
 *
 *   --port-file  written once the socket listens: the ephemeral port, as decimal text
 *   --requests   every request body, appended as one JSON line
 *   --turns      `[{"tool": "write", "path": "...", "content": "..."},
 *                  {"tool": "memory_search", "args": {"query": "..."}}, ...]`, one call per turn
 *   --ttl        seconds until it exits by itself (default 600)
 *
 * STATELESS: the turn is the number of `role: "tool"` messages the request carries, so a retried
 * request gets the same answer. A request with no `tools` (a title, a summary) gets plain text.
 * THE TOOL IS READ FROM THE REQUEST: the call is built from the tool list the host sent; a write's
 * path goes under whichever path key its schema declares. A tool the host does not offer ends the
 * script with plain text.
 */
import fs from "node:fs"
import http from "node:http"

const PATH_KEYS = ["filePath", "file_path", "path", "filepath"]

/** The tool named `name` (any case) in an OpenAI `tools` array: its name and its property names. */
export function findTool(tools, name) {
  for (const t of Array.isArray(tools) ? tools : []) {
    const fn = t?.function ?? t
    if (String(fn?.name ?? "").toLowerCase() !== name.toLowerCase()) continue
    return { name: fn.name, props: Object.keys(fn?.parameters?.properties ?? {}) }
  }
  return null
}

/** The arguments for one scripted turn, shaped for the tool the host offered. */
function argsFor(turn, tool) {
  if (turn.tool.toLowerCase() !== "write") return { ...(turn.args ?? {}) }
  const pathKey = PATH_KEYS.find((k) => tool.props.includes(k)) ?? "filePath"
  return { [pathKey]: turn.path, content: turn.content }
}

/**
 * What the model "says" to one request body: `{ call: { id, name, args } }` or `{ text }`.
 * Turn n (0-based, the count of tool results so far) asks for `turns[n]`; past the script, or
 * when the host offers no such tool, it is plain text.
 */
export function replyTo(body, turns) {
  if (!Array.isArray(body?.tools) || !body.tools.length) return { text: "canary" }
  const n = (body?.messages ?? []).filter((m) => m?.role === "tool").length
  const turn = turns[n]
  if (!turn) return { text: "done" }
  const tool = findTool(body.tools, String(turn.tool ?? ""))
  if (!tool) return { text: `no ${turn.tool} tool on offer` }
  return { call: { id: `call_canary_${n + 1}`, name: tool.name, args: argsFor(turn, tool) } }
}

const USAGE = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }

function message(reply) {
  return reply.call
    ? { role: "assistant", content: null, tool_calls: [{ id: reply.call.id, type: "function", function: { name: reply.call.name, arguments: JSON.stringify(reply.call.args) } }] }
    : { role: "assistant", content: reply.text }
}

/** The reply as chat-completion chunks, the last carrying `finish_reason` and `usage`. */
export function chunks(reply, model) {
  const base = { id: "chatcmpl-canary", object: "chat.completion.chunk", created: 0, model }
  const m = message(reply)
  const delta = reply.call
    ? { role: "assistant", tool_calls: m.tool_calls.map((c) => ({ index: 0, ...c })) }
    : { role: "assistant", content: reply.text }
  return [
    { ...base, choices: [{ index: 0, delta, finish_reason: null }] },
    { ...base, choices: [{ index: 0, delta: {}, finish_reason: reply.call ? "tool_calls" : "stop" }], usage: USAGE },
  ]
}

export function serve({ turns, requests }) {
  return http.createServer((req, res) => {
    let raw = ""
    req.setEncoding("utf8")
    req.on("data", (d) => { raw += d })
    req.on("end", () => {
      const json = (status, obj) => {
        res.writeHead(status, { "content-type": "application/json" })
        res.end(JSON.stringify(obj))
      }
      if (req.method === "GET" && /\/models$/.test(req.url)) {
        return json(200, { object: "list", data: [{ id: "fake", object: "model", owned_by: "canary" }] })
      }
      if (req.method !== "POST" || !/\/chat\/completions$/.test(req.url)) {
        if (requests) fs.appendFileSync(requests, `${JSON.stringify({ unhandled: `${req.method} ${req.url}` })}\n`)
        return json(404, { error: { message: `fake model: no route ${req.method} ${req.url}` } })
      }
      let body
      try { body = JSON.parse(raw) } catch { return json(400, { error: { message: "fake model: body is not JSON" } }) }
      if (requests) fs.appendFileSync(requests, `${JSON.stringify(body)}\n`)
      const reply = replyTo(body, turns)
      const model = body.model ?? "fake"
      if (!body.stream) {
        return json(200, { id: "chatcmpl-canary", object: "chat.completion", created: 0, model,
          choices: [{ index: 0, message: message(reply), finish_reason: reply.call ? "tool_calls" : "stop" }], usage: USAGE })
      }
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "close" })
      for (const c of chunks(reply, model)) res.write(`data: ${JSON.stringify(c)}\n\n`)
      res.end("data: [DONE]\n\n")
    })
  })
}

// Run as a script, not imported: `process.argv[1]` is this file.
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url))) {
  const arg = (name, dflt) => {
    const i = process.argv.indexOf(name)
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt
  }
  const portFile = arg("--port-file")
  const requests = arg("--requests")
  if (!portFile || !requests) {
    console.error("usage: fake-model.mjs --port-file <f> --requests <f> --turns <json> [--ttl <s>]")
    process.exit(2)
  }
  const turns = JSON.parse(arg("--turns", "[]"))
  fs.writeFileSync(requests, "")
  const server = serve({ turns, requests })
  server.listen(0, "127.0.0.1", () => {
    // Written whole under another name, then renamed: a reader never sees half a port.
    fs.writeFileSync(`${portFile}.tmp`, String(server.address().port))
    fs.renameSync(`${portFile}.tmp`, portFile)
  })
  setTimeout(() => process.exit(0), Number(arg("--ttl", "600")) * 1000).unref()
  for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => process.exit(0))
}
