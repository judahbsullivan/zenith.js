// compiler/binding.ts
// Phase 2: Reactive text bindings runtime generator
// Generates code to update DOM when state values change
// Extended to support component instance-scoped state

import type { StateBinding } from "./types"

// Extract instance ID and base state name from instance-scoped state name
// e.g., "__zen_comp_0_clicks" -> { instanceId: "comp-0", baseState: "clicks" }
function parseInstanceState(stateName: string): { instanceId: string; baseState: string } | null {
  const match = stateName.match(/^__zen_comp_(\d+)_(.+)$/);
  if (match) {
    const instanceNum = match[1];
    const baseState = match[2];
    return { instanceId: `comp-${instanceNum}`, baseState };
  }
  return null;
}

export function generateBindingRuntime(
  stateBindings: StateBinding[],
  stateDeclarations: Map<string, string>
): string {
  if (stateBindings.length === 0 && stateDeclarations.size === 0) {
    return "";
  }

  const stateNames = Array.from(stateDeclarations.keys());

  // Separate global state and instance-scoped state
  const globalStates = new Set<string>();
  const instanceStates = new Map<string, Map<string, string[]>>(); // instanceId -> baseState -> fullStateNames

  for (const stateName of stateNames) {
    const instanceInfo = parseInstanceState(stateName);
    if (instanceInfo) {
      if (!instanceStates.has(instanceInfo.instanceId)) {
        instanceStates.set(instanceInfo.instanceId, new Map());
      }
      const instanceMap = instanceStates.get(instanceInfo.instanceId)!;
      if (!instanceMap.has(instanceInfo.baseState)) {
        instanceMap.set(instanceInfo.baseState, []);
      }
      instanceMap.get(instanceInfo.baseState)!.push(stateName);
    } else {
      globalStates.add(stateName);
    }
  }

  // Generate binding update map - collect all nodes for each state
  // Order is preserved: bindings are processed in the order they appear in stateBindings array
  // (which matches DOM traversal order from compilation)
  const bindingMapEntries: string[] = [];
  const bindingMap = new Map<string, string[]>();
  
  // Iterate over stateBindings array to preserve compile-time order
  // Maps preserve insertion order, so this maintains deterministic ordering
  for (const stateBinding of stateBindings) {
    if (!bindingMap.has(stateBinding.stateName)) {
      bindingMap.set(stateBinding.stateName, []);
    }
    const selectors = bindingMap.get(stateBinding.stateName)!;
    // Push bindings in the order they appear in stateBinding.bindings array
    // This preserves the DOM traversal order from compilation
    for (const binding of stateBinding.bindings) {
      const bindId = `bind-${binding.nodeIndex}`;
      
      // Check if this is an instance-scoped binding
      const instanceInfo = parseInstanceState(stateBinding.stateName);
      if (instanceInfo) {
        // Scope selector to component instance root
        selectors.push(`[data-zen-instance="${instanceInfo.instanceId}"] span[data-zen-bind="${stateBinding.stateName}"][data-zen-bind-id="${bindId}"]`);
      } else {
        // Global binding
        selectors.push(`span[data-zen-bind="${stateBinding.stateName}"][data-zen-bind-id="${bindId}"]`);
      }
    }
  }

  // Generate update functions for each binding
  // Each function captures a DOM node reference directly
  // Map.entries() preserves insertion order, maintaining compile-time binding order
  for (const [stateName, selectors] of bindingMap.entries()) {
    if (selectors.length > 0) {
      // Generate an array of update functions, each capturing a node reference
      const updateFunctions = selectors.map((selector, index) => {
        const escapedSelector = selector.replace(/"/g, '\\"');
        // Create a function that captures the node and updates it
        // We'll query the node once during init, then the function captures it
        return `(function() {
        const node = document.querySelector("${escapedSelector}");
        return function(value) {
          if (node) node.textContent = String(value);
        };
      })()`;
      }).join(",\n      ");
      
      bindingMapEntries.push(
        `    "${stateName}": [\n      ${updateFunctions}\n    ]`
      );
    }
  }

  const bindingMapCode = bindingMapEntries.length > 0 
    ? `__zen_bindings = {\n${bindingMapEntries.join(",\n")}\n  };`
    : `__zen_bindings = {};`;

  // Generate global state initialization code
  const globalStateInitCode = Array.from(globalStates).map(name => {
    const initialValue = stateDeclarations.get(name) || "undefined";
    return `
  // Initialize global state: ${name}
  (function() {
    let __zen_${name} = ${initialValue};
    Object.defineProperty(window, "${name}", {
      get: function() { return __zen_${name}; },
      set: function(value) {
        __zen_${name} = value;
        // Immediately trigger synchronous updates - no batching, no async
        __zen_update_bindings("${name}", value);
      },
      enumerable: true,
      configurable: true
    });
  })();`;
  }).join("");

  // Generate instance state initialization code
  const instanceStateInitCode: string[] = [];
  for (const [instanceId, baseStateMap] of instanceStates.entries()) {
    const safeInstanceId = instanceId.replace(/-/g, '_');
    
    for (const [baseState, fullStateNames] of baseStateMap.entries()) {
      // For each instance, create a state proxy scoped to that instance
      // Only process the first fullStateName (they should all have the same instance)
      const fullStateName = fullStateNames[0];
      const initialValue = stateDeclarations.get(fullStateName) || "undefined";
      
      instanceStateInitCode.push(`
  // Initialize instance-scoped state: ${fullStateName} (${instanceId}.${baseState})
  (function() {
    const instanceRoot = document.querySelector('[data-zen-instance="${instanceId}"]');
    if (!instanceRoot) {
      console.warn('[Zenith] Component instance "${instanceId}" not found in DOM');
      return;
    }
    
    let __zen_${safeInstanceId}_${baseState} = ${initialValue};
    
    // Create instance-scoped state proxy
    const instanceState = new Proxy({}, {
      get(target, prop) {
        if (prop === '${baseState}') {
          return __zen_${safeInstanceId}_${baseState};
        }
        return undefined;
      },
      set(target, prop, value) {
        if (prop === '${baseState}') {
          __zen_${safeInstanceId}_${baseState} = value;
          // Trigger updates only for bindings within this instance
          __zen_update_bindings("${fullStateName}", value);
          return true;
        }
        return false;
      }
    });
    
    // Store instance state on window for component access
    if (!window.__zen_instances) {
      window.__zen_instances = {};
    }
    if (!window.__zen_instances["${instanceId}"]) {
      window.__zen_instances["${instanceId}"] = instanceState;
    } else {
      window.__zen_instances["${instanceId}"].${baseState} = __zen_${safeInstanceId}_${baseState};
    }
    
      // Create global property accessor for instance-scoped state
    Object.defineProperty(window, "${fullStateName}", {
      get: function() { return __zen_${safeInstanceId}_${baseState}; },
      set: function(value) {
        __zen_${safeInstanceId}_${baseState} = value;
        // Update instance state object
        if (window.__zen_instances && window.__zen_instances["${instanceId}"]) {
          window.__zen_instances["${instanceId}"].${baseState} = value;
        }
        __zen_update_bindings("${fullStateName}", value);
        // Also trigger attribute binding updates for this instance
        if (window.__zen_update_attribute_bindings) {
          window.__zen_update_attribute_bindings("${instanceId}");
        }
      },
      enumerable: true,
      configurable: true
    });
  })();`);
    }
  }

  // Generate initialization call (after DOM is ready)
  const initBindingsCode = stateNames.map(name => {
    return `    __zen_update_bindings("${name}", ${name});`;
  }).join("\n");

  return `
// Phase 2: Reactive text bindings runtime (with component instance support)
(function() {
  let __zen_bindings = {};

  // Update function for a specific state
  // Calls all registered update functions for the given state property
  // Executes synchronously, immediately, in compile-order (array order)
  // No batching, no async scheduling, no reordering
  function __zen_update_bindings(stateName, value) {
    const updaters = __zen_bindings[stateName];
    if (updaters) {
      // Execute update functions in deterministic order (compile-time order)
      // forEach executes synchronously, preserving array order
      updaters.forEach(updateFn => {
        if (typeof updateFn === 'function') {
          updateFn(value);
        }
      });
    }
  }

${globalStateInitCode}
${instanceStateInitCode.join('')}

  // Initialize binding map and bindings after DOM is ready
  function __zen_init_bindings() {
${bindingMapCode.split('\n').map(line => '    ' + line).join('\n')}
${initBindingsCode.split('\n').map(line => '    ' + line).join('\n')}
  }

  // Initialize bindings when DOM is ready (scripts are deferred, so DOM should be ready)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', __zen_init_bindings);
  } else {
    __zen_init_bindings();
  }
})();
`;
}

