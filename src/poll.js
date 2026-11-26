/**
 * Poll files by a stat token, re-reading one only when its token changes. Polls once at start, then
 * every `every` ms. `stat` and `read` may be sync or async; a throw from either gives null for that
 * file. The token is compared with ===, so a caller may return a fingerprint (a folder listing) in
 * place of an mtime. `onChange` gets a fresh { path: value|null } snapshot on the first poll and on
 * any change, never after stop. A tick while the previous poll still runs is skipped.
 * @param {{
 *   files: string[] | (() => string[]),
 *   read: (p: string) => unknown,
 *   stat: (p: string) => unknown,
 *   onChange: (snapshot: Record<string, unknown>) => void,
 *   every?: number,
 *   timers?: { setInterval: Function, clearInterval: Function },
 * }} opts
 * @returns {() => void} stop; safe to call twice
 */
export function createPoll({ files, read, stat, onChange, every = 3000, timers = globalThis }) {
  let stopped = false
  let busy = false
  let first = true
  /** @type {Map<string, { token: unknown, value: unknown }>} */
  const seen = new Map()

  const tryCall = async (fn, p) => {
    try {
      return await fn(p)
    } catch {
      return null
    }
  }

  async function tick() {
    if (stopped || busy) return
    busy = true
    try {
      let list = []
      try {
        list = typeof files === "function" ? files() : files
      } catch {
        list = []
      }
      list = Array.isArray(list) ? [...new Set(list)] : []
      let changed = first || list.length !== seen.size || list.some((p) => !seen.has(p))
      const next = new Map()
      for (const p of list) {
        const token = await tryCall(stat, p)
        if (stopped) return
        const old = seen.get(p)
        if (token == null) {
          next.set(p, { token: null, value: null })
          if (!old || old.value !== null) changed = true
          continue
        }
        if (old && old.token === token) {
          next.set(p, old)
          continue
        }
        const value = await tryCall(read, p)
        if (stopped) return
        next.set(p, { token, value })
        changed = true
      }
      seen.clear()
      for (const [p, v] of next) seen.set(p, v)
      first = false
      if (!changed) return
      const snapshot = {}
      for (const [p, v] of seen) snapshot[p] = v.value
      try {
        onChange(snapshot)
      } catch {
        // A broken render must not stop the poll.
      }
    } finally {
      busy = false
    }
  }

  const id = timers.setInterval(() => void tick(), every)
  void tick()
  return () => {
    if (stopped) return
    stopped = true
    timers.clearInterval(id)
  }
}
