// compiler/component-process.ts
// Phase 3: Main component processing pipeline

import path from "path";
import fs from "fs";
import * as parse5 from "parse5";
import type { ZenFile, ScriptBlock, StyleBlock } from "./types";
import { parseZen } from "./parse";
import { discoverComponents, discoverLayouts, type ComponentMetadata } from "./component";
import { extractStateDeclarations } from "./parse";

interface ProcessedComponent {
  metadata: ComponentMetadata;
  instanceId: string;
  props: Map<string, string>; // prop name -> value from parent
}

/**
 * Process a ZenFile to inline all component usages and handle layouts
 * Returns a new ZenFile with components inlined
 */
export function processComponents(entryFile: ZenFile, entryPath: string): ZenFile {
  const entryDir = path.dirname(entryPath);
  
  // For file-based routing: if entry is in pages/, look for components/layouts in parent directory
  // Otherwise, look in the same directory as the entry file
  let baseDir = entryDir;
  if (entryDir.endsWith("pages") || entryDir.endsWith(path.join("playground", "pages"))) {
    baseDir = path.dirname(entryDir);
  }
  
  const componentsDir = path.join(baseDir, "components");
  const layoutsDir = path.join(baseDir, "layouts");
  
  // Discover components and layouts
  const components = discoverComponents(componentsDir, baseDir);
  const layouts = discoverLayouts(layoutsDir, baseDir);
  
  // Keep components and layouts separate
  // Components will be processed in the component loop
  // Layouts are processed separately first
  const allComponents = new Map<string, ComponentMetadata>();
  const componentNameMap = new Map<string, string>(); // lowercase -> original case
  
  // Only add actual components (not layouts) to the component processing map
  for (const [name, metadata] of components.entries()) {
    allComponents.set(name, metadata);
    componentNameMap.set(name.toLowerCase(), name);
  }
  
  // Layouts are stored separately and processed before components
  const layoutNames = new Set(layouts.keys());
  const layoutNamesLowercase = new Set(Array.from(layoutNames).map(n => n.toLowerCase()));
  
  if (allComponents.size === 0) {
    // No components, return original file
    return entryFile;
  }
  
  // Check if entry file uses a layout
  const layoutUsage = findLayoutUsage(entryFile.html, layouts);
  
  // Process layout first (if used)
  let processedHtml = entryFile.html;
  let processedScripts = [...entryFile.scripts];
  let processedStyles = [...entryFile.styles];
  
  if (layoutUsage) {
    const layout = layouts.get(layoutUsage.layoutName);
    if (layout) {
      // Extract page content (everything except html/head/body tags)
      const pageContent = extractPageContent(entryFile.html);
      
      // For layouts, we need special handling - layouts define the HTML structure
      const layoutResult = inlineLayout(layout, pageContent, `layout-${layoutUsage.layoutName}`, layoutUsage.props);
      
      processedHtml = layoutResult.html;
      // Layout scripts must come BEFORE page scripts so layout state is declared first
      processedScripts = [...layoutResult.scripts, ...processedScripts];
      processedStyles = [...layoutResult.styles, ...processedStyles];
    }
  }
  
  // Process all component usages (process from innermost to outermost)
  // Exclude layouts from component processing (they're already processed)
  let instanceCounter = 0;
  const componentNamesLowercase = new Set(Array.from(allComponents.keys()).map(n => n.toLowerCase()));
  const functionProps = new Set<string>(); // Track function names passed as props
  const maxIterations = 100; // Prevent infinite loops
  let iterations = 0;
  
  // Filter out layouts from component usage check
  // Also skip elements that have data-zen-component attribute (already processed)
  function hasComponentUsageFiltered(html: string, componentNamesLowercase: Set<string>, componentNameMap: Map<string, string>, excludeLayouts: Set<string>): boolean {
    const document = parse5.parse(html);
    let found = false;
    
    function walk(node: any): void {
      if (found) return; // Early exit if already found
      
      if (node.tagName) {
        const tagLower = node.tagName.toLowerCase();
        // Skip layouts and already-replaced nodes (have data-zen-replaced)
        const hasReplaced = node.attrs && node.attrs.some((attr: any) => attr.name === 'data-zen-replaced' && attr.value === 'true');
        const hasZenComponent = node.attrs && node.attrs.some((attr: any) => attr.name === 'data-zen-component');
        
        // Only count as found if: not a layout, not already replaced, and matches a component name
        if (!hasReplaced && !hasZenComponent && !excludeLayouts.has(tagLower) && componentNamesLowercase.has(tagLower)) {
          found = true;
          return;
        }
      }
      if (node.childNodes && !found) {
        node.childNodes.forEach(walk);
      }
    }
    
    walk(document);
    return found;
  }
  
  // Helper function to find first component usage (excluding layouts)
  function findFirstComponentUsageFiltered(html: string, componentNamesLowercase: Set<string>, componentNameMap: Map<string, string>, excludeLayouts: Set<string>): { tagName: string; node: any; children: any[]; props: Map<string, string> } | null {
    const document = parse5.parse(html);
    let found: { tagName: string; node: any; children: any[]; props: Map<string, string> } | null = null;
    
    function walk(node: any): void {
      if (found) return; // Early exit if already found
      
      if (node.tagName) {
        const tagLower = node.tagName.toLowerCase();
        // Skip layouts and already-replaced nodes (have data-zen-replaced)
        const hasReplaced = node.attrs && node.attrs.some((attr: any) => attr.name === 'data-zen-replaced' && attr.value === 'true');
        const hasZenComponent = node.attrs && node.attrs.some((attr: any) => attr.name === 'data-zen-component');
        
        // Only process if: not a layout, not already replaced, and matches a component name
        if (!hasReplaced && !hasZenComponent && !excludeLayouts.has(tagLower)) {
          const originalName = componentNameMap.get(tagLower);
          if (originalName) {
            // Extract props from attributes
            const props = new Map<string, string>();
            if (node.attrs) {
              for (const attr of node.attrs) {
                if (attr.name !== "slot") {
                  props.set(attr.name, attr.value || "");
                }
              }
            }
            
            // Get children (excluding slot attribute nodes)
            const children = (node.childNodes || []).filter((child: any) => {
              // Keep element nodes and text nodes, but filter out slot attributes
              return child.nodeName !== "#comment";
            });
            
            found = { tagName: originalName, node, children, props };
            return;
          }
        }
      }
      if (node.childNodes && !found) {
        node.childNodes.forEach(walk);
      }
    }
    
    walk(document);
    return found;
  }
  
  while (iterations < maxIterations) {
    // Re-check for components at the start of each iteration
    const hasComponents = hasComponentUsageFiltered(processedHtml, componentNamesLowercase, componentNameMap, layoutNamesLowercase);
    if (!hasComponents) {
      break;
    }
    
    iterations++;
    const usage = findFirstComponentUsageFiltered(processedHtml, componentNamesLowercase, componentNameMap, layoutNamesLowercase);
    if (!usage) {
      break;
    }
    
    const component = allComponents.get(usage.tagName);
    if (!component) {
      break;
    }
    
    // Extract props from parent script context if available
    // Look for variables/functions in parent scripts that match prop names
    const enhancedProps = new Map(usage.props);
    // Create case-insensitive lookup for enhancedProps (parse5 lowercases attribute names)
    const enhancedPropsLowercase = new Map<string, string>();
    for (const [key, value] of enhancedProps.entries()) {
      enhancedPropsLowercase.set(key.toLowerCase(), value);
    }
    // Track function props from usage.props
    for (const [propName, propValue] of usage.props.entries()) {
      // Check if propValue is a function name (not quoted, valid identifier)
      // Handle both {variable} and variable syntax
      let trimmedValue = propValue.trim();
      // Strip braces if present: {increment} -> increment
      if (trimmedValue.startsWith('{') && trimmedValue.endsWith('}')) {
        trimmedValue = trimmedValue.slice(1, -1).trim();
      }
      const isFunctionOrVar = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(trimmedValue) && 
                              !trimmedValue.startsWith('"') && 
                              !trimmedValue.startsWith("'");
      if (isFunctionOrVar) {
        // This is a function prop - track it for mutation validator
        functionProps.add(trimmedValue);
      }
    }
    for (const [propName] of component.props.entries()) {
      // Check case-insensitively (parse5 lowercases attribute names)
      const hasProp = enhancedProps.has(propName) || enhancedPropsLowercase.has(propName.toLowerCase());
      if (!hasProp) {
        // Check if this prop name exists as a variable/function in parent scripts
        // This allows passing functions and variables from parent script context
        for (const script of processedScripts) {
          const scriptContent = script.content;
          // Check if propName is a function or variable in the script
          // Simple heuristic: look for "function propName" or "const propName" or "let propName" or "var propName"
          const functionMatch = new RegExp(`function\\s+${propName}\\s*\\(`).test(scriptContent);
          const varMatch = new RegExp(`(?:const|let|var)\\s+${propName}\\s*[=;]`).test(scriptContent);
          if (functionMatch || varMatch) {
            // Found in parent script - use it as-is (don't quote it)
            enhancedProps.set(propName, propName);
            functionProps.add(propName); // Track as function prop
            break;
          }
        }
      }
    }
    
    const instanceId = `comp-${instanceCounter++}`;
    const result = inlineComponentIntoHtml(
      processedHtml,
      component,
      usage.children,
      instanceId,
      enhancedProps
    );
    
    // Verify the replacement actually happened
    if (!result || result.html === processedHtml) {
      break;
    }
    
    processedHtml = result.html;
    processedScripts = [...processedScripts, ...result.scripts];
    processedStyles = [...processedStyles, ...result.styles];
    
    // Safety check: if we've processed more than expected, something is wrong
    if (instanceCounter > 100) {
      break;
    }
  }
  
  return {
    html: processedHtml,
    scripts: processedScripts,
    styles: processedStyles,
    functionProps: functionProps
  };
}

/**
 * Inline a layout - layouts define the HTML structure (html/head/body)
 * Replaces <Slot /> with page content
 */
function inlineLayout(
  layout: ComponentMetadata,
  pageContent: any[],
  instanceId: string,
  layoutUsageProps: Map<string, string> = new Map()
): { html: string; scripts: ScriptBlock[]; styles: StyleBlock[] } {
  // Layout HTML already has html/head/body structure
  const layoutDoc = parse5.parse(layout.html);
  
  // Find the body element to replace slots
  let bodyElement: any = null;
  function findBody(node: any): void {
    if (node.tagName === "body") {
      bodyElement = node;
      return;
    }
    if (node.childNodes) {
      for (const child of node.childNodes) {
        findBody(child);
        if (bodyElement) return;
      }
    }
  }
  findBody(layoutDoc);
  
  if (!bodyElement) {
    // No body found, return layout HTML as-is
    return { html: layout.html, scripts: [], styles: [] };
  }
  
  // Replace slots in body with page content
  function replaceSlots(node: any): void {
    if (!node.childNodes) return;
    
    const newChildren: any[] = [];
    
    for (const child of node.childNodes) {
      if (child.tagName === "Slot" || child.tagName === "slot") {
        const slotNameAttr = child.attrs?.find((a: any) => a.name === "name");
        const slotName = slotNameAttr?.value || "default";
        
        // Find content for this slot
        const content = pageContent.filter(node => {
          const slotAttr = node.attrs?.find((a: any) => a.name === "slot");
          const nodeSlotName = slotAttr?.value || "default";
          return nodeSlotName === slotName;
        });
        
        // Add slot content
        for (const slotNode of content) {
          newChildren.push(cloneNode(slotNode));
        }
      } else {
        replaceSlots(child);
        newChildren.push(child);
      }
    }
    
    node.childNodes = newChildren;
  }
  
  replaceSlots(bodyElement);
  
  // Serialize the layout document back to HTML
  const html = parse5.serialize(layoutDoc);
  
  // Process layout scripts with props
  // NOTE: Layouts are document-level, so we DON'T transform state names (keep them as-is)
  // This allows { title } in HTML to match state title in scripts
  const processedScripts: ScriptBlock[] = [];
  let scriptIndex = 0;
  
  // Create props object for layout
  const propsObjEntries: string[] = [];
  // Extract props from layout usage
  for (const [propName, defaultValue] of layout.props.entries()) {
    const propValue = layoutUsageProps.get(propName);
    if (propValue !== undefined) {
      // Use provided value - quote if it's a string
      propsObjEntries.push(`  ${propName}: "${propValue}"`);
    } else if (defaultValue === "?") {
      // Optional prop from type Props - use undefined
      propsObjEntries.push(`  ${propName}: undefined`);
    } else if (defaultValue) {
      // Use default value (already an expression)
      propsObjEntries.push(`  ${propName}: ${defaultValue}`);
    } else {
      // No default, use undefined
      propsObjEntries.push(`  ${propName}: undefined`);
    }
  }
  const propsObjCode = propsObjEntries.length > 0 
    ? `const props = {\n${propsObjEntries.join(",\n")}\n};`
    : `const props = {};`;
  
  for (const script of layout.scripts) {
    let processedScript = script;
    
    // Remove type Props definitions (TypeScript types are compile-time only, not needed in JavaScript)
    processedScript = processedScript.replace(/type\s+Props\s*=\s*\{[^}]*(?:\{[^}]*\}[^}]*)*\}\s*/gs, '');
    
    // Replace props references in state declarations with actual prop values
    // e.g., "state title = props.title || 'My App'" -> "state title = 'Home Page' || 'My App'"
    for (const [propName, propValue] of layoutUsageProps.entries()) {
      // Replace props.propName with the actual value (quote if it's a string)
      const quotedValue = propValue ? `"${propValue}"` : 'undefined';
      const propsRefRegex = new RegExp(`props\\.${propName}\\b`, 'g');
      processedScript = processedScript.replace(propsRefRegex, quotedValue);
    }
    
    // Layouts use state names as-is (no instance scoping)
    // Wrap in IIFE to scope props (even though we've replaced props references above)
    const wrappedScript = `(function() {\n  // Props for layout\n  ${propsObjCode}\n\n${processedScript}\n})();`;
    
    processedScripts.push({ content: wrappedScript, index: scriptIndex++ });
  }
  
  // Process layout styles with scoping
  const processedStyles: StyleBlock[] = [];
  let styleIndex = 0;
  for (const style of layout.styles) {
    // Layout styles don't need scoping - they're at the document level
    processedStyles.push({ content: style, index: styleIndex++ });
  }
  
  return {
    html,
    scripts: processedScripts,
    styles: processedStyles
  };
}

/**
 * Check if a layout is used in HTML (looks for layout component as root element)
 */
function findLayoutUsage(html: string, layouts: Map<string, ComponentMetadata>): { layoutName: string; node: any; props: Map<string, string> } | null {
  const document = parse5.parse(html);
  
  // Create lowercase map for case-insensitive matching
  const layoutLowercaseMap = new Map<string, string>();
  for (const name of layouts.keys()) {
    layoutLowercaseMap.set(name.toLowerCase(), name);
  }
  
  function findLayout(node: any): { layoutName: string; node: any; props: Map<string, string> } | null {
    if (node.tagName) {
      const originalName = layoutLowercaseMap.get(node.tagName.toLowerCase());
      if (originalName) {
        // Extract props from attributes
        const props = new Map<string, string>();
        if (node.attrs) {
          for (const attr of node.attrs) {
            props.set(attr.name, attr.value || "");
          }
        }
        return { layoutName: originalName, node, props };
      }
    }
    if (node.childNodes) {
      for (const child of node.childNodes) {
        const result = findLayout(child);
        if (result) return result;
      }
    }
    return null;
  }
  
  return findLayout(document);
}

/**
 * Extract page content from HTML (everything inside body, or root content if no body/html)
 */
function extractPageContent(html: string): any[] {
  const document = parse5.parse(html);
  
  function findContent(node: any): any[] {
    // If we find body, return its children
    if (node.tagName === "body") {
      return node.childNodes || [];
    }
    // If we find html, look for body inside it
    if (node.tagName === "html") {
      if (node.childNodes) {
        for (const child of node.childNodes) {
          if (child.tagName === "body") {
            return child.childNodes || [];
          }
        }
      }
      // No body tag, return html's children (skip head)
      return (node.childNodes || []).filter((n: any) => n.tagName !== "head");
    }
    // If this is the document root, look for the first element (skip #documentType, etc)
    if (node.nodeName === "#document") {
      if (node.childNodes) {
        for (const child of node.childNodes) {
          if (child.tagName === "html") {
            return findContent(child);
          }
          // No html tag - page content is directly at root level
          if (child.tagName && child.tagName !== "#documentType") {
            return [child];
          }
        }
        // No html tag found - return all non-document-type nodes
        return (node.childNodes || []).filter((n: any) => 
          n.tagName && n.tagName !== "#documentType"
        );
      }
    }
    return [];
  }
  
  return findContent(document);
}

/**
 * Check if HTML contains any component usages
 */
function hasComponentUsage(
  html: string, 
  componentNamesLowercase: Set<string>,
  componentNameMap: Map<string, string>
): boolean {
  const document = parse5.parse(html);
  let found = false;
  
  function walk(node: any): void {
    if (node.tagName && componentNamesLowercase.has(node.tagName.toLowerCase())) {
      found = true;
      return;
    }
    if (node.childNodes && !found) {
      node.childNodes.forEach(walk);
    }
  }
  
  walk(document);
  return found;
}

/**
 * Find the first component usage in HTML
 */
function findFirstComponentUsage(
  html: string,
  componentNamesLowercase: Set<string>,
  componentNameMap: Map<string, string>
): { tagName: string; node: any; children: any[]; props: Map<string, string> } | null {
  const document = parse5.parse(html);
  let found: { tagName: string; node: any; children: any[]; props: Map<string, string> } | null = null;
  
  function walk(node: any): void {
    if (found) return;
    
    if (node.tagName && componentNamesLowercase.has(node.tagName.toLowerCase())) {
      // Get the original component name (with correct case)
      const originalName = componentNameMap.get(node.tagName.toLowerCase()) || node.tagName;
      
      const props = new Map<string, string>();
      if (node.attrs) {
        for (const attr of node.attrs) {
          props.set(attr.name, attr.value || "");
        }
      }
      
      found = {
        tagName: originalName, // Use original case name
        node,
        children: node.childNodes || [],
        props
      };
      return;
    }
    
    if (node.childNodes) {
      node.childNodes.forEach(walk);
    }
  }
  
  walk(document);
  return found;
}

/**
 * Inline a component into HTML, replacing the component tag with component HTML
 * and handling slots, props, styles, and scripts
 */
function inlineComponentIntoHtml(
  html: string,
  component: ComponentMetadata,
  slotContent: any[],
  instanceId: string,
  props: Map<string, string> = new Map()
): { html: string; scripts: ScriptBlock[]; styles: StyleBlock[] } {
  const document = parse5.parse(html);
  
  // Strip script and style tags from component HTML before parsing (they're handled separately)
  let componentHtml = component.html;
  componentHtml = componentHtml.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  componentHtml = componentHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  componentHtml = componentHtml.trim();
  
  
  // Use parseFragment instead of parse to avoid html/head/body wrapper
  const componentFragment = parse5.parseFragment(componentHtml);
  
  // Find component root - should be the first element in the fragment
  let componentRoot: any = null;
  
  function findFirstElement(node: any): void {
    if (!node) return;
    
    // Skip script/style/document nodes
    if (node.tagName) {
      const tagLower = node.tagName.toLowerCase();
      if (tagLower === "script" || tagLower === "style") {
        return;
      }
      // Found a valid component root element
      componentRoot = node;
      return;
    }
    
    // For non-element nodes, recurse into children
    if (node.childNodes && Array.isArray(node.childNodes)) {
      for (const child of node.childNodes) {
        findFirstElement(child);
        if (componentRoot) return;
      }
    }
  }
  
  findFirstElement(componentFragment);
  
  if (!componentRoot) {
    return { html, scripts: [], styles: [] };
  }
  
  // Transform state references in component HTML before cloning
  const stateDecls = new Set<string>();
  for (const script of component.scripts) {
    const decls = extractStateDeclarations(script);
    for (const [stateName] of decls.entries()) {
      stateDecls.add(stateName);
    }
  }
  
  // Note: We don't create clonedRoot here anymore - we create a fresh clone
  // for each replacement in replaceComponentTag to avoid reusing nodes with parentNode set
  
  // Track prop-based handlers that need wrapper functions (propName -> eventType)
  // This will be populated during component inlining and used to generate wrappers
  const propHandlers = new Map<string, string>(); // propName -> eventType (e.g., "onClick" -> "click")
  
  // Replace slots with slot content (this function will be used in replaceComponentTag)
  function replaceSlots(node: any): void {
    if (!node.childNodes || node.childNodes.length === 0) return;
    
    const newChildren: any[] = [];
    
    for (const child of node.childNodes) {
      if (child.tagName === "Slot" || child.tagName === "slot") {
        const slotNameAttr = child.attrs?.find((a: any) => a.name === "name");
        const slotName = slotNameAttr?.value || "default";
        
        // Find content for this slot
        const content = slotContent.filter(node => {
          const slotAttr = node.attrs?.find((a: any) => a.name === "slot");
          const nodeSlotName = slotAttr?.value || "default";
          return nodeSlotName === slotName;
        });
        
        // Add slot content
        for (const slotNode of content) {
          newChildren.push(cloneNode(slotNode));
        }
      } else {
        replaceSlots(child);
        newChildren.push(child);
      }
    }
    
    node.childNodes = newChildren;
  }
  
  // Replace component tag with cloned root in document
  // Create a fresh clone for EACH replacement to avoid reusing nodes with parentNode set
  // Note: parse5 lowercases tag names, so compare case-insensitively
  let replaced = false;
  function replaceComponentTag(node: any): boolean {
    if (node.childNodes) {
      for (let i = 0; i < node.childNodes.length; i++) {
        const child = node.childNodes[i];
        // Check if this is a component tag that needs replacement
        // Must match component name (case-insensitive) and NOT have data-zen-replaced
        const childTagLower = child.tagName ? child.tagName.toLowerCase() : '';
        const componentNameLower = component.name.toLowerCase();
        const isComponentTag = childTagLower === componentNameLower;
        const alreadyReplaced = child.attrs && child.attrs.some((attr: any) => attr.name === 'data-zen-replaced' && attr.value === 'true');
        
        if (isComponentTag && !alreadyReplaced) {
          // Found the component tag - create a FRESH clone for this replacement
          const freshClone = cloneNode(componentRoot);
          
          // Replace hyphens in instanceId with underscores for valid JavaScript identifiers
          const safeInstanceId = instanceId.replace(/-/g, '_');
          
          // Transform state references in the fresh clone
          function transformStateInHtml(node: any): void {
            // Transform text bindings: { stateName } to { __zen_instanceId_stateName }
            // Also inline prop values: { propName } -> actual prop value
            if (node.nodeName === "#text" && node.value) {
              // First, inline prop values (props are constants, not reactive)
              for (const [propName, propValue] of props.entries()) {
                // Check if propValue is a simple identifier (function/state reference) - don't inline those
                let trimmedValue = propValue.trim();
                if (trimmedValue.startsWith('{') && trimmedValue.endsWith('}')) {
                  trimmedValue = trimmedValue.slice(1, -1).trim();
                }
                const isFunctionOrVar = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(trimmedValue) && 
                                        !trimmedValue.startsWith('"') && 
                                        !trimmedValue.startsWith("'");
                
                // Only inline if it's not a function/state reference (i.e., it's a literal value)
                if (!isFunctionOrVar) {
                  // Inline the prop value directly
                  const regex = new RegExp(`\\{\\s*${propName}\\s*\\}`, 'g');
                  // Get the actual prop value - remove quotes for text content
                  let inlineValue = propValue.trim();
                  if ((inlineValue.startsWith('"') && inlineValue.endsWith('"')) ||
                      (inlineValue.startsWith("'") && inlineValue.endsWith("'"))) {
                    inlineValue = inlineValue.slice(1, -1); // Remove quotes
                  }
                  node.value = node.value.replace(regex, inlineValue);
                }
              }
              
              // Then transform state references to instance-scoped names
              for (const stateName of stateDecls) {
                const instanceStateName = `__zen_${safeInstanceId}_${stateName}`;
                const regex = new RegExp(`\\{\\s*${stateName}\\s*\\}`, 'g');
                node.value = node.value.replace(regex, `{ ${instanceStateName} }`);
              }
            }
            
            // Transform attribute bindings (:class, :value) to use instance-scoped state names
            // Also inline prop values in attribute values and handle :attr bindings
            if (node.attrs && Array.isArray(node.attrs)) {
              for (const attr of node.attrs) {
                let attrValue = attr.value || '';
                
                // Handle :attr bindings (like :href, :src) - inline prop values or transform state references
                if (attr.name && attr.name.startsWith(':') && attr.name !== ':class' && attr.name !== ':value') {
                  // This is a non-reactive attribute binding (e.g., :href)
                  // Inline prop values first
                  for (const [propName, propValue] of props.entries()) {
                    let trimmedValue = propValue.trim();
                    if (trimmedValue.startsWith('{') && trimmedValue.endsWith('}')) {
                      trimmedValue = trimmedValue.slice(1, -1).trim();
                    }
                    const isFunctionOrVar = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(trimmedValue) && 
                                            !trimmedValue.startsWith('"') && 
                                            !trimmedValue.startsWith("'");
                    
                    if (!isFunctionOrVar) {
                      // Inline prop value for attribute
                      const propRegex = new RegExp(`\\b${propName}\\b`, 'g');
                      let inlineValue = propValue.trim();
                      // Remove quotes for attribute values (parse5 will handle quoting)
                      if ((inlineValue.startsWith('"') && inlineValue.endsWith('"')) ||
                          (inlineValue.startsWith("'") && inlineValue.endsWith("'"))) {
                        inlineValue = inlineValue.slice(1, -1); // Remove quotes
                      }
                      attrValue = attrValue.replace(propRegex, inlineValue);
                    }
                  }
                  
                  // Transform state references
                  for (const stateName of stateDecls) {
                    const instanceStateName = `__zen_${safeInstanceId}_${stateName}`;
                    const stateRefRegex = new RegExp(`\\b${stateName}\\b`, 'g');
                    attrValue = attrValue.replace(stateRefRegex, instanceStateName);
                  }
                  
                  // Replace :attr with regular attr (remove colon)
                  attr.name = attr.name.slice(1);
                  attr.value = attrValue;
                }
                
                // Handle reactive bindings (:class, :value)
                const isBindingAttr = attr.name === ':class' || attr.name === ':value' || 
                                     attr.name === 'data-zen-class' || attr.name === 'data-zen-value';
                if (isBindingAttr) {
                  for (const stateName of stateDecls) {
                    const instanceStateName = `__zen_${safeInstanceId}_${stateName}`;
                    // Replace state references in attribute values using word boundaries
                    // This handles expressions like "{ 'btn': true, 'btn-clicked': clicks > 0 }"
                    const stateRefRegex = new RegExp(`\\b${stateName}\\b`, 'g');
                    attrValue = attrValue.replace(stateRefRegex, instanceStateName);
                  }
                  attr.value = attrValue;
                }
                
                // Handle regular attributes with {propName} syntax
                if (attrValue && attrValue.includes('{')) {
                  // Inline prop values in attribute values
                  for (const [propName, propValue] of props.entries()) {
                    let trimmedValue = propValue.trim();
                    if (trimmedValue.startsWith('{') && trimmedValue.endsWith('}')) {
                      trimmedValue = trimmedValue.slice(1, -1).trim();
                    }
                    const isFunctionOrVar = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(trimmedValue) && 
                                            !trimmedValue.startsWith('"') && 
                                            !trimmedValue.startsWith("'");
                    
                    if (!isFunctionOrVar) {
                      // Inline prop value
                      const propRegex = new RegExp(`\\{\\s*${propName}\\s*\\}`, 'g');
                      let inlineValue = propValue.trim();
                      if (inlineValue.startsWith('"') || inlineValue.startsWith("'")) {
                        inlineValue = inlineValue.slice(1, -1); // Remove quotes for attribute value
                      }
                      attrValue = attrValue.replace(propRegex, inlineValue);
                    }
                  }
                  attr.value = attrValue;
                }
              }
            }
            
            if (node.childNodes) {
              node.childNodes.forEach(transformStateInHtml);
            }
          }
          transformStateInHtml(freshClone);
          
          // Add instance attributes
          if (!freshClone.attrs) freshClone.attrs = [];
          freshClone.attrs.push({ name: "data-zen-instance", value: instanceId });
          freshClone.attrs.push({ name: "data-zen-component", value: component.name });
          freshClone.attrs.push({ name: "data-zen-replaced", value: "true" });
          
          // Transform event handler attributes to use instance-scoped function names
          // This ensures each component instance has unique handler names
          // Handle both onclick (before split.ts) and data-zen-click (after split.ts)
          for (const attr of freshClone.attrs) {
            const attrName = attr.name ? attr.name.toLowerCase() : '';
            // Check for onclick, onchange, etc. (before split.ts transforms them)
            if (attrName.startsWith('on') && attrName.length > 2) {
              const handlerName = attr.value;
              if (handlerName && /^\w+$/.test(handlerName)) {
                // Check if this handler name is a prop (not a function)
                // Convert camelCase prop name (onClick) to event type (click)
                const eventType = attrName.slice(2); // Remove "on" prefix
                if (component.props.has(handlerName)) {
                  // It's a prop - bind directly (no wrapper function)
                  // Store the mapping for later use (to register on window)
                  propHandlers.set(handlerName, eventType);
                  // Use instance-scoped name that will reference the prop directly
                  const handlerRefName = `__zen_${safeInstanceId}_${handlerName}`;
                  attr.value = handlerRefName;
                } else {
                  // It's a regular function name, make it instance-scoped
                  attr.value = `__zen_${safeInstanceId}_${handlerName}`;
                }
              }
            }
            // Check for data-zen-click, data-zen-change, etc. (after split.ts transforms them)
            else if (attr.name && attr.name.startsWith('data-zen-') && 
                attr.name !== 'data-zen-instance' && 
                attr.name !== 'data-zen-component' && 
                attr.name !== 'data-zen-replaced' && 
                attr.name !== 'data-zen-class' && 
                attr.name !== 'data-zen-value' &&
                attr.name !== 'data-zen-bind' &&
                attr.name !== 'data-zen-bind-id') {
              // This is likely an event handler (data-zen-click, etc.)
              // Transform the handler name to instance-scoped version
              const handlerName = attr.value;
              if (handlerName && /^\w+$/.test(handlerName)) {
                // It's a simple function name, make it instance-scoped
                attr.value = `__zen_${safeInstanceId}_${handlerName}`;
              }
            }
          }
          
          // Replace slots if needed
          if (component.hasSlots) {
            replaceSlots(freshClone);
          }
          
          // Replace the component tag with the fresh clone
          node.childNodes[i] = freshClone;
          freshClone.parentNode = node;
          replaced = true;
          return true;
        }
        if (replaceComponentTag(child)) {
          return true;
        }
      }
    }
    return false;
  }
  
  replaceComponentTag(document);
  
  if (!replaced) {
    return { html, scripts: [], styles: [] };
  }
  
  // Process component scripts with props and instance-scoped state
  const processedScripts: ScriptBlock[] = [];
  let scriptIndex = 0;
  
  // First, extract state declarations to know what to transform
  const allStateDecls = new Set<string>();
  for (const script of component.scripts) {
    const decls = extractStateDeclarations(script);
    for (const [stateName] of decls.entries()) {
      allStateDecls.add(stateName);
    }
  }
  
  // Props as direct bindings (NOT a props object)
  // Inline props directly into component scope as const bindings
  const propBindings: string[] = []; // Array of "const propName = ..." statements
  const stateProps = new Set<string>(); // Track which props are state variables (bind to parent state)
  const functionProps = new Set<string>(); // Track which props are function references (bind to parent function)
  
  // Create case-insensitive lookup map for props (parse5 lowercases attribute names)
  // Also create a reverse map: lowercase -> original key for case-insensitive lookup
  const propsLowercase = new Map<string, string>(); // lowercase key -> original value
  const propsKeyMap = new Map<string, string>(); // lowercase key -> original key
  for (const [key, value] of props.entries()) {
    const keyLower = key.toLowerCase();
    propsLowercase.set(keyLower, value);
    propsKeyMap.set(keyLower, key);
  }
  
  for (const [propName, defaultValue] of component.props.entries()) {
    // Look up prop value case-insensitively (parse5 lowercases attribute names)
    // Try exact match first, then case-insensitive match
    let propValue = props.get(propName);
    if (propValue === undefined || propValue === "") {
      propValue = propsLowercase.get(propName.toLowerCase());
    }
    if (propValue !== undefined && propValue !== "") {
      // Handle both {variable} and variable syntax
      let trimmedValue = propValue.trim();
      // Strip braces if present: {increment} -> increment, {clicks} -> clicks
      if (trimmedValue.startsWith('{') && trimmedValue.endsWith('}')) {
        trimmedValue = trimmedValue.slice(1, -1).trim();
      }
      // Check if propValue is a function reference or variable (not quoted, valid identifier)
      const isFunctionOrVar = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(trimmedValue) && 
                              !trimmedValue.startsWith('"') && 
                              !trimmedValue.startsWith("'");
      
      if (isFunctionOrVar) {
        // It's a function reference or state variable - bind to parent via window
        // We'll determine if it's a function or state when we generate the binding code
        propBindings.push(`const ${propName} = window.${trimmedValue};`);
        // Note: trimmedValue (e.g., "increment") needs to be added to top-level functionProps
        // This is handled earlier in the component processing loop (line ~209)
        // The local functionProps set here is not used for mutation validation
      } else if (/^["']/.test(trimmedValue)) {
        // Already quoted string - use as-is
        propBindings.push(`const ${propName} = ${trimmedValue};`);
      } else {
        // String literal - quote it
        propBindings.push(`const ${propName} = "${trimmedValue}";`);
      }
    } else if (defaultValue === "?") {
      // Optional prop from type Props - use undefined
      propBindings.push(`const ${propName} = undefined;`);
    } else if (defaultValue) {
      // Use default value (already an expression)
      propBindings.push(`const ${propName} = ${defaultValue};`);
    } else {
      // No default, use undefined
      propBindings.push(`const ${propName} = undefined;`);
    }
  }
  
  const propsBindingsCode = propBindings.length > 0 
    ? propBindings.join("\n  ") + "\n"
    : "";
  
  // Replace hyphens in instanceId with underscores for valid JavaScript identifiers
  const safeInstanceId = instanceId.replace(/-/g, '_');
  
  for (const script of component.scripts) {
    let processedScript = script;
    
    // Remove type Props definitions (TypeScript types are compile-time only, not needed in JavaScript)
    // This keeps the compiled output clean and prevents confusion
    // Match: type Props = { ... } with multiline support and nested braces
    processedScript = processedScript.replace(/type\s+Props\s*=\s*\{[^}]*(?:\{[^}]*\}[^}]*)*\}\s*/gs, '');
    
    // Transform state declarations to be instance-scoped
    for (const stateName of allStateDecls) {
      const instanceStateName = `__zen_${safeInstanceId}_${stateName}`;
      // Replace state declarations first
      processedScript = processedScript.replace(
        new RegExp(`state\\s+${stateName}\\s*=`, 'g'),
        `state ${instanceStateName} =`
      );
    }
    
    // Now replace state references (but not in state declarations, which we already transformed)
    // Replace ALL occurrences of state name with instance-scoped name
    // Important: Use window.property to ensure setter is triggered for mutations
    for (const stateName of allStateDecls) {
      const instanceStateName = `__zen_${safeInstanceId}_${stateName}`;
      // Replace state references using word boundaries
      // For assignments (including +=, -=, etc.), use window property to trigger setters
      // This handles: clicks, clicks += 1, clicks > 0, console.log("clicked", clicks)
      // But NOT: state clicks = 0 (already transformed above)
      
      // Replace assignment operations first (including +=, -=, *=, /=, etc.)
      const assignmentOps = ['\\+=', '-=', '\\*=', '/=', '%=', '\\*\\*='];
      for (const op of assignmentOps) {
        const assignmentRegex = new RegExp(`\\b${stateName}\\s*${op}`, 'g');
        processedScript = processedScript.replace(assignmentRegex, `window.${instanceStateName} ${op.replace('\\', '')}`);
      }
      
      // Then replace regular assignments (stateName = ...)
      const simpleAssignRegex = new RegExp(`\\b${stateName}\\s*=\\s*(?!\\s*[=!<>])`, 'g');
      processedScript = processedScript.replace(simpleAssignRegex, `window.${instanceStateName} =`);
      
      // Finally, replace all other references (reads) with instance-scoped name
      // For reads, we can use the variable directly since the getter will be called
      const stateRefRegex = new RegExp(`\\b${stateName}\\b`, 'g');
      processedScript = processedScript.replace(stateRefRegex, instanceStateName);
    }
    
    // Extract function declarations and register them on window for event delegation
    // Match: function functionName(...) { ... }
    const functionRegex = /function\s+(\w+)\s*\([^)]*\)\s*\{/g;
    const functionNames: string[] = [];
    let match;
    while ((match = functionRegex.exec(processedScript)) !== null) {
      if (match[1]) {
        functionNames.push(match[1]);
      }
    }
    
    // Replace props.propName references with direct propName (props are now direct bindings)
    // This handles cases where component code might still reference props.propName
    for (const propName of component.props.keys()) {
      const propsRefRegex = new RegExp(`props\\.${propName}\\b`, 'g');
      processedScript = processedScript.replace(propsRefRegex, propName);
    }
    
    // Wrap script in IIFE to scope props and register functions on window
    // Props are inlined as direct bindings (NOT a props object)
    let wrappedScript = `(function() {\n  // Props as direct bindings (inlined from parent)\n  ${propsBindingsCode}`;
    
    // Add the processed script content
    wrappedScript += processedScript;
    
    // Register functions on window for event delegation with instance-scoped names
    // This ensures each component instance has unique function names
    if (functionNames.length > 0) {
      wrappedScript += `\n\n  // Register functions on window for event delegation (instance-scoped)\n`;
      for (const funcName of functionNames) {
        const instanceFuncName = `__zen_${safeInstanceId}_${funcName}`;
        wrappedScript += `  window.${instanceFuncName} = ${funcName};\n`;
      }
    }
    
    // Register prop-based event handlers directly (no wrapper functions)
    // onclick="onClick" where onClick is a prop -> directly reference the bound function
    if (propHandlers.size > 0) {
      wrappedScript += `\n\n  // Register prop-based event handlers directly (no wrappers)\n`;
      for (const [propName, eventType] of propHandlers.entries()) {
        // Create an instance-scoped reference to the prop function
        const handlerName = `__zen_${safeInstanceId}_${propName}`;
        wrappedScript += `  // Bind ${propName} prop to handler name for event delegation\n`;
        wrappedScript += `  const ${handlerName} = ${propName};\n`;
        wrappedScript += `  if (typeof ${handlerName} === 'function') {\n`;
        wrappedScript += `    window.${handlerName} = ${handlerName};\n`;
        wrappedScript += `  }\n\n`;
      }
    }
    
    wrappedScript += `})();`;
    
    processedScripts.push({ content: wrappedScript, index: scriptIndex++ });
  }
  
  // Process component styles with scoping
  const processedStyles: StyleBlock[] = [];
  let styleIndex = 0;
  for (const style of component.styles) {
    // Scope styles to component instance
    const scopedStyle = scopeStyle(style, component.name);
    processedStyles.push({ content: scopedStyle, index: styleIndex++ });
  }
  
  const serializedHtml = parse5.serialize(document);
  
  return {
    html: serializedHtml,
    scripts: processedScripts,
    styles: processedStyles
  };
}

/**
 * Clone a parse5 node
 */
function cloneNode(node: any): any {
  // For text nodes, just copy the value
  if (node.nodeName === "#text") {
    return {
      nodeName: node.nodeName,
      value: node.value,
      parentNode: undefined
    };
  }
  
  // For element nodes, clone with proper structure
  const cloned: any = {
    nodeName: node.nodeName,
    tagName: node.tagName,
    attrs: node.attrs ? node.attrs.map((a: any) => ({ ...a })) : [],
    childNodes: [],
    parentNode: undefined
  };
  
  if (node.childNodes && node.childNodes.length > 0) {
    cloned.childNodes = node.childNodes.map((child: any) => {
      const clonedChild = cloneNode(child);
      clonedChild.parentNode = cloned;
      return clonedChild;
    });
  }
  
  return cloned;
}

/**
 * Scope CSS styles to component instances
 */
function scopeStyle(style: string, componentName: string): string {
  const scopeSelector = `[data-zen-component="${componentName}"]`;
  
  // Simple CSS scoping - prepend scope selector to each rule
  // This is a simplified approach
  return style.replace(/([^{]+)\{/g, (match, selector) => {
    const trimmed = selector.trim();
    if (trimmed.startsWith("@")) {
      // Media queries, keyframes, etc.
      return match;
    }
    return `${scopeSelector} ${trimmed} {`;
  });
}

