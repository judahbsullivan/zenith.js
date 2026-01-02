// compiler/mutation.ts
// State mutation detection and validation

export interface EventHandlerInfo {
  functionName: string;
  isInline: boolean; // true if it's an inline arrow function
  inlineCode?: string; // the arrow function code if isInline is true
}

/**
 * Extract event handler names from HTML (both function names and inline arrow functions)
 * Returns: { eventHandlers: Set<string>, inlineHandlers: Map<string, string> }
 * where eventHandlers contains all function names (including generated ones for inline functions)
 * and inlineHandlers maps generated function names to their code
 */
export interface InlineHandlerInfo {
  body: string;
  paramName: string; // the parameter name from the arrow function (e.g., "e", "event", "")
}

export function extractEventHandlers(html: string): {
  eventHandlers: Set<string>;
  inlineHandlers: Map<string, InlineHandlerInfo>; // functionName -> arrow function info
} {
  const eventHandlers = new Set<string>();
  const inlineHandlers = new Map<string, InlineHandlerInfo>();
  let inlineCounter = 0;

  // Simple regex to find onclick="..." and similar attributes
  // Match: onclick="..." or onclick='...'
  const eventAttrRegex = /on(\w+)="([^"]*)"|on(\w+)='([^']*)'/gi;
  let match;

  while ((match = eventAttrRegex.exec(html)) !== null) {
    const handlerValue = match[2] || match[4]; // Get value from either quote type
    
    if (!handlerValue) continue;

    // Check if it's an inline arrow function: () => ... or (e) => ... or (event) => ...
    const arrowFunctionMatch = handlerValue.match(/^\s*\(([^)]*)\)\s*=>\s*(.+)$/);
    
    if (arrowFunctionMatch) {
      // It's an inline arrow function - generate a function name
      const generatedName = `__zen_inline_handler_${inlineCounter++}`;
      eventHandlers.add(generatedName);
      
      // Extract the parameter name and body
      const paramName = (arrowFunctionMatch[1] || '').trim();
      const arrowBody = (arrowFunctionMatch[2] || '').trim();
      inlineHandlers.set(generatedName, { body: arrowBody, paramName });
    } else {
      // It's a function name reference
      const functionName = handlerValue.trim();
      if (functionName && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(functionName)) {
        eventHandlers.add(functionName);
        
        // Also extract the base function name if it's instance-scoped (__zen_comp_0_handleClick -> handleClick)
        const instanceScopedMatch = functionName.match(/^__zen_comp_\d+_(.+)$/);
        if (instanceScopedMatch && instanceScopedMatch[1]) {
          eventHandlers.add(instanceScopedMatch[1]); // Add the base function name
        }
      }
    }
  }

  // Also extract function names from component props (e.g., <Button onClick=increment />)
  // Look for component tags with attributes that are function names (not quoted, valid identifier)
  // Pattern: <ComponentName propName=functionName /> or <ComponentName propName="functionName" />
  const componentPropRegex = /<[A-Z]\w+\s+[^>]*?(\w+)=([a-zA-Z_$][a-zA-Z0-9_$]*)[^>]*>/gi;
  let componentMatch;
  while ((componentMatch = componentPropRegex.exec(html)) !== null) {
    const propValue = componentMatch[2];
    // If it's a valid function name (not quoted, valid identifier), add it to event handlers
    // This allows functions passed as props to mutate state
    if (propValue && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(propValue)) {
      eventHandlers.add(propValue);
    }
  }

  return { eventHandlers, inlineHandlers };
}

/**
 * Detect state mutations in JavaScript code
 * Returns an array of mutation locations: { functionName, line, column, stateName }
 */
export interface MutationLocation {
  functionName: string | null; // null means top-level (outside any function)
  line: number;
  column: number;
  stateName: string;
  code: string; // the mutation code for error reporting
}

/**
 * Extract function declarations and their boundaries from JavaScript code
 */
interface FunctionInfo {
  name: string;
  startLine: number;
  endLine: number;
}

function extractFunctions(scriptContent: string): FunctionInfo[] {
  const functions: FunctionInfo[] = [];
  const lines = scriptContent.split('\n');
  
  // Simple regex to match: function name(...) {
  const functionRegex = /function\s+(\w+)\s*\([^)]*\)\s*\{/g;
  
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    if (!line) continue;
    const match = functionRegex.exec(line);
    
    if (match && match[1]) {
      const funcName = match[1];
      const startLine = lineIndex;
      
      // Find the matching closing brace using brace counting
      let braceCount = 1;
      let endLine = startLine;
      
      for (let i = lineIndex + 1; i < lines.length && braceCount > 0; i++) {
        const currentLine = lines[i];
        if (!currentLine) continue;
        const openBraces = (currentLine.match(/\{/g) || []).length;
        const closeBraces = (currentLine.match(/\}/g) || []).length;
        braceCount += openBraces - closeBraces;
        if (braceCount === 0) {
          endLine = i;
          break;
        }
      }
      
      functions.push({ name: funcName, startLine, endLine });
    }
    
    // Reset regex for next line
    functionRegex.lastIndex = 0;
  }
  
  return functions;
}

export function detectStateMutations(
  scriptContent: string,
  declaredStates: Set<string>
): MutationLocation[] {
  const mutations: MutationLocation[] = [];
  const lines = scriptContent.split('\n');
  const functions = extractFunctions(scriptContent);
  
  // Check each line for mutations
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    if (!line) continue;
    
    // Find which function this line belongs to (if any)
    let currentFunction: string | null = null;
    for (const func of functions) {
      if (lineIndex >= func.startLine && lineIndex <= func.endLine) {
        currentFunction = func.name;
        break;
      }
    }
    
    // Skip state declarations (state name = value;)
    if (/^\s*state\s+\w+\s*=/.test(line)) {
      continue; // Skip this line, it's a state declaration, not a mutation
    }
    
    // Check for state mutations on this line
    for (const stateName of Array.from(declaredStates)) {
      // Pattern 1: stateName++ or stateName-- (postfix)
      // Pattern 2: ++stateName or --stateName (prefix)
      const incrementPattern = new RegExp(`(?:^|[^a-zA-Z0-9_$])(\\+\\+|--)?\\s*${stateName}\\s*(\\+\\+|--)?`, 'g');
      let incMatch;
      while ((incMatch = incrementPattern.exec(line)) !== null) {
        if ((incMatch[1] || incMatch[2]) && incMatch.index !== undefined) { // Found ++ or --
          mutations.push({
            functionName: currentFunction,
            line: lineIndex + 1,
            column: incMatch.index + 1,
            stateName,
            code: line.trim()
          });
        }
      }
      
      // Pattern 3: assignment stateName = ... (but not == or ===, and not state declarations)
      const assignPattern = new RegExp(`(?:^|[^a-zA-Z0-9_$])${stateName}\\s*=(?!=)`, 'g');
      let assignMatch;
      while ((assignMatch = assignPattern.exec(line)) !== null) {
        // Double-check it's not a state declaration
        if (assignMatch.index !== undefined && !/^\s*state\s+/.test(line.substring(0, assignMatch.index))) {
          mutations.push({
            functionName: currentFunction,
            line: lineIndex + 1,
            column: assignMatch.index + 1,
            stateName,
            code: line.trim()
          });
        }
      }
      
      // Pattern 4: compound assignment stateName += ... etc.
      const compoundPattern = new RegExp(`(?:^|[^a-zA-Z0-9_$])${stateName}\\s*([+\\-*/%]|\\*\\*)=`, 'g');
      let compoundMatch;
      while ((compoundMatch = compoundPattern.exec(line)) !== null) {
        if (compoundMatch.index !== undefined) {
          mutations.push({
            functionName: currentFunction,
            line: lineIndex + 1,
            column: compoundMatch.index + 1,
            stateName,
            code: line.trim()
          });
        }
      }
      
      // Pattern 5: state.stateName mutations (for state. prefix syntax)
      const stateDotPattern = new RegExp(`(?:^|[^a-zA-Z0-9_$])state\\.${stateName}\\s*([+\\-*/%]|\\*\\*)?=(?!=)|(?:^|[^a-zA-Z0-9_$])(\\+\\+|--)?\\s*state\\.${stateName}`, 'g');
      let stateDotMatch;
      while ((stateDotMatch = stateDotPattern.exec(line)) !== null) {
        if (stateDotMatch.index !== undefined) {
          mutations.push({
            functionName: currentFunction,
            line: lineIndex + 1,
            column: stateDotMatch.index + 1,
            stateName,
            code: line.trim()
          });
        }
      }
    }
  }
  
  return mutations;
}

/**
 * Validate that state mutations only occur inside event handlers
 * Throws a compile-time error if mutations are found outside event handlers
 */
export function validateStateMutations(
  mutations: MutationLocation[],
  eventHandlers: Set<string>,
  scriptIndex: number
): void {
  for (const mutation of mutations) {
    // Top-level mutations (outside any function) are not allowed
    if (mutation.functionName === null) {
      throw new Error(
        `Compiler Error: State mutation is only allowed inside event handlers.\n` +
        `  Found mutation of "${mutation.stateName}" at script ${scriptIndex + 1}, line ${mutation.line}, column ${mutation.column}.\n` +
        `  Code: ${mutation.code}\n` +
        `  State mutations must occur inside functions that are used as event handlers.`
      );
    }
    
    // Mutations in functions that are not event handlers are not allowed
    // Check if the function is an event handler (either directly or as an instance-scoped name)
    const isEventHandler = eventHandlers.has(mutation.functionName) || 
      // Check if it's an instance-scoped function name (__zen_comp_0_handleClick -> handleClick)
      /^__zen_comp_\d+_(.+)$/.test(mutation.functionName) && 
      eventHandlers.has(mutation.functionName.replace(/^__zen_comp_\d+_/, ''));
    
    if (!isEventHandler) {
      throw new Error(
        `Compiler Error: State mutation is only allowed inside event handlers.\n` +
        `  Found mutation of "${mutation.stateName}" in function "${mutation.functionName}" at script ${scriptIndex + 1}, line ${mutation.line}, column ${mutation.column}.\n` +
        `  Code: ${mutation.code}\n` +
        `  The function "${mutation.functionName}" is not registered as an event handler.\n` +
        `  State mutations must occur inside functions referenced by onclick, oninput, onchange, etc.`
      );
    }
  }
}

