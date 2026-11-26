/** @jsxImportSource @opentui/solid */
// THROWAWAY SPIKE (Task 1). Not part of the package: proves the sidebar slot renders and follows a
// signal, and dumps what `data.session.message.list` returns. Delete once the render check is done.
// Call shapes checked against @opencode/plugin 2.3.2 dist/tui/{plugin,context}.d.ts; NOT run (no pty here).
import { createSignal, onCleanup } from "solid-js"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Plugin } from "@opencode/plugin/tui"

const DUMP = process.env.GENESEED_SPIKE_DUMP ?? path.join(os.tmpdir(), "geneseed-spike-dump.json")

export default Plugin.define({
  id: "geneseed.sidebar.spike",
  setup(context) {
    return context.ui.slot({
      append: "sidebar.content",
      render(props: { sessionID?: string }) {
        const [n, setN] = createSignal(0)
        const timer = setInterval(() => {
          setN((v) => v + 1)
          try {
            const list = context.data.session.message.list(props.sessionID)
            fs.writeFileSync(DUMP, JSON.stringify({ tick: n(), sessionID: props.sessionID, list }, null, 2))
          } catch (e) {
            fs.writeFileSync(DUMP + ".err", String((e as Error)?.stack ?? e))
          }
        }, 1000)
        onCleanup(() => clearInterval(timer))
        return <text>{`spike tick ${n()}`}</text>
      },
    })
  },
})
