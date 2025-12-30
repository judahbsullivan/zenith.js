
import { parseZen } from "./parse"
import { splitZen } from "./split"
import { emit } from "./emit"
import { generateEventBindingRuntime } from "./event"

export function compile(entry: string, outDir = "dist") {
  const zen = parseZen(entry);
  const { html, styles, scripts, eventTypes } = splitZen(zen);

  // Generate runtime code only for event types actually used in the HTML
  const runtimeSnippet = generateEventBindingRuntime(eventTypes)

  const scriptsWithEvents = scripts.map(s => {
    // preserve original script content, then append small runtime,
    // so handlers defined in the script are available to the runtime snippet.
    return runtimeSnippet ? `${s}\n\n${runtimeSnippet}` : s;
  })
  emit(outDir, html, scriptsWithEvents, styles, entry);
}
