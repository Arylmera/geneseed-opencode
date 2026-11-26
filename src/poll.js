/**
 * Poll files by a stat token, re-reading one only when its token changes. Polls once at start, then
 * every `every` ms. `stat` and `read` may be sync or async; a throw from either gives null for that
 * file. The token is compared with ===, so a caller may return a fingerprint (a folder listing) in
 * place of an mtime. `onChange` gets a fresh { path: value|null } snapshot on the first poll and on
 * any change, never after stop. A tick while the previous poll still runs is skipped. A `files`
 * getter gets the values read so far, so paths it derives from a changed file join the same tick.
 * @param {{
 *   files: string[] | ((snapshot: Record<string, unknown>) => string[]),
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
      const next = new Map()
      const valuesOf = (paths) => {
        const out = {}
        for (const p of paths) {
          const v = next.get(p) ?? seen.get(p)
          if (v) out[p] = v.value
        }
        return out
      }
      const listFor = (snap) => {
        try {
          const l = typeof files === "function" ? files(snap) : files
          return Array.isArray(l) ? [...new Set(l)] : []
        } catch {
          return []
        }
      }
      let changed = false
      let list = listFor(valuesOf(seen.keys()))
      // A path the getter derives from a changed file (a registry row's LOOP.md) is read in the same
      // tick: re-derive the list from what was just read, a few rounds at most.
      for (let round = 0; round < 4; round++) {
        const todo = list.filter((p) => !next.has(p))
        if (!todo.length) break
        for (const p of todo) {
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
        list = listFor(valuesOf(list))
      }
      for (const p of [...next.keys()]) if (!list.includes(p)) next.delete(p)
      if (first || next.size !== seen.size || [...next.keys()].some((p) => !seen.has(p))) changed = true
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
