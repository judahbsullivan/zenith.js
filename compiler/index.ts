
import fs from "fs"
import path from "path"
import { parseZen } from "./parse"
import { splitZen } from "./split"
import { emit } from "./emit"
import { generateEventBindingRuntime } from "./event"
import { generateBindingRuntime } from "./binding"
import { generateAttributeBindingRuntime } from "./bindings"
import { processComponents } from "./component-process"

export function compile(entry: string, outDir = "dist") {
  // Delete dist directory if it exists
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  
  const zen = parseZen(entry);
  
  // Phase 3: Process components and layouts (inline them into the file)
  const processedZen = processComponents(zen, entry);
  
  const { html, styles, scripts, eventTypes, stateBindings, stateDeclarations, bindings } = splitZen(processedZen);

  // Generate runtime code for event types
  const eventRuntime = generateEventBindingRuntime(eventTypes);
  
  // Generate runtime code for text bindings (state variables)
  const bindingRuntime = generateBindingRuntime(stateBindings, stateDeclarations);
  
  // Generate runtime code for attribute bindings (:class, :value)
  const attributeBindingRuntime = generateAttributeBindingRuntime(bindings);

  const scriptsWithRuntime = scripts.map((s, index) => {
    // Order: 
    // 1. Text binding runtime first (creates state variables and sets up text bindings)
    // 2. Attribute binding runtime (creates window.state proxy for :class/:value)
    // 3. User script content (can use state variables)
    // 4. Event runtime (sets up event delegation) - ONLY ONCE in the first script
    let result = "";
    if (bindingRuntime) {
      result += bindingRuntime + "\n\n";
    }
    if (attributeBindingRuntime) {
      result += attributeBindingRuntime + "\n\n";
    }
    result += s;
    // Only add event runtime to the first script to avoid redeclaration errors
    if (eventRuntime && index === 0) {
      result += `\n\n${eventRuntime}`;
    }
    return result;
  })
  
  emit(outDir, html, scriptsWithRuntime, styles, entry);
}
