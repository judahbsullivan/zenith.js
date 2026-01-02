// compiler/component.ts
// Phase 3: Component discovery, parsing, and metadata extraction

import fs from "fs";
import path from "path";
import { parseZen } from "./parse";
import { extractStateDeclarations } from "./parse";
import * as parse5 from "parse5";

export interface ComponentMetadata {
  name: string; // PascalCase component name (e.g., "Button", "UIButton")
  filePath: string;
  isLayout: boolean; // true for layouts, false for components
  props: Map<string, string>; // prop name -> default value expression (empty string = no default)
  stateDeclarations: Map<string, string>; // state name -> initial value
  hasSlots: boolean; // true if component uses <Slot /> or <Slot name="..."/>
  slotNames: Set<string>; // set of slot names used (includes "default" for default slot)
  html: string; // component HTML (with slots)
  scripts: string[]; // component scripts
  styles: string[]; // component styles
}

/**
 * Convert filename to PascalCase component name
 * Examples:
 *   components/Button.zen -> Button
 *   components/ui/Button.zen -> UIButton
 *   layouts/Main.zen -> Main
 *   MyComponent.zen -> MyComponent
 */
function filenameToComponentName(filePath: string, baseDir: string): string {
  // Get relative path from base directory
  const relativePath = path.relative(baseDir, filePath);
  // Remove .zen extension
  const withoutExt = relativePath.replace(/\.zen$/, "");
  // Split by path separator
  const parts = withoutExt.split(path.sep);
  
  // Strip "components" or "layouts" prefix (first part if it's one of these)
  const filteredParts = parts.filter((part, index) => {
    // Keep all parts except the first if it's "components" or "layouts"
    return index > 0 || (part !== "components" && part !== "layouts");
  });
  
  // Convert each part to PascalCase
  const pascalParts = filteredParts.map(part => {
    // Handle kebab-case, snake_case, or camelCase
    return part
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join("");
  });
  
  return pascalParts.join("");
}

/**
 * Extract props from script content
 * Looks for:
 * 1. TypeScript-style: type Props = { propName?: type; ... }
 * 2. props.propName = value;
 * 3. props = { propName: value, ... }
 * Returns Map of prop name -> default value expression (empty string = no default, "?" = optional)
 */
function extractProps(scriptContent: string): Map<string, string> {
  const props = new Map<string, string>();
  
  // Pattern 1: TypeScript-style type Props = { propName?: type; ... }
  // Match: type Props = { ... } (multiline, handles nested braces and function types)
  // This regex handles: type Props = { prop?: type; } with nested braces in function types
  const typePropsRegex = /type\s+Props\s*=\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/s;
  const typeMatch = typePropsRegex.exec(scriptContent);
  if (typeMatch && typeMatch[1]) {
    const propsBody = typeMatch[1];
    // Parse prop definitions: propName?: type; or propName: type;
    // Match prop name, optional ?, type (can include function types like (x: number) => void, generics, etc.)
    // Use a more robust regex that handles function types with nested parentheses
    const propDefRegex = /(\w+)(\?)?\s*:\s*((?:\([^)]*\)\s*=>\s*[^;]+|[^;]+?))(?:\s*;|\s*$)/g;
    let propMatch: RegExpExecArray | null;
    while ((propMatch = propDefRegex.exec(propsBody)) !== null) {
      const propName = propMatch[1];
      if (!propName) continue; // Skip if prop name is missing
      const isOptional = propMatch[2] === '?';
      // For type definitions, we don't store the type, just mark as optional if needed
      // Optional props get "?" as default value indicator
      // This allows the component to know which props are optional
      props.set(propName, isOptional ? "?" : "");
    }
  }
  
  // Pattern 2: props.propName = value;
  const dotPropRegex = /props\.(\w+)\s*=\s*([^;]+?)(?:\s*;|\s*$)/gm;
  let match;
  while ((match = dotPropRegex.exec(scriptContent)) !== null) {
    const propName = match[1];
    const defaultValue = match[2]?.trim() || "";
    if (propName) {
      // Only override if not already set from type Props (preserve type info)
      if (!props.has(propName)) {
        props.set(propName, defaultValue);
      }
    }
  }
  
  // Pattern 3: props = { propName: value, ... }
  const objPropRegex = /props\s*=\s*\{([^}]+)\}/s;
  const objMatch = objPropRegex.exec(scriptContent);
  if (objMatch) {
    const propsObj = objMatch[1];
    // Parse key: value pairs
    const propPairs = propsObj?.match(/(\w+)\s*:\s*([^,}]+)/g);
    if (propPairs) {
      for (const pair of propPairs) {
        const propMatch = pair.match(/(\w+)\s*:\s*(.+)/);
        if (propMatch) {
          const propName = propMatch[1];
          const defaultValue = propMatch[2]?.trim() || "";
          // Only override if not already set from type Props
          if (propName && typeof propName === 'string' && !props.has(propName)) {
            props.set(propName.trim(), defaultValue.trim());
          }
        }
      }
    }
  }
  
  return props;
}

/**
 * Extract slot usage from HTML
 * Returns: { hasSlots: boolean, slotNames: Set<string> }
 */
function extractSlots(html: string): { hasSlots: boolean; slotNames: Set<string> } {
  const slotNames = new Set<string>();
  const document = parse5.parse(html);
  
  function walk(node: any) {
    if (node.tagName === "Slot" || node.tagName === "slot") {
      slotNames.add("default"); // Default slot
      
      // Check for name attribute
      const nameAttr = node.attrs?.find((attr: any) => attr.name === "name");
      if (nameAttr?.value) {
        slotNames.add(nameAttr.value);
      }
    }
    
    if (node.childNodes) {
      node.childNodes.forEach(walk);
    }
  }
  
  walk(document);
  
  return {
    hasSlots: slotNames.size > 0,
    slotNames
  };
}

/**
 * Discover and parse all component files in a directory
 */
export function discoverComponents(
  componentsDir: string,
  baseDir: string
): Map<string, ComponentMetadata> {
  const components = new Map<string, ComponentMetadata>();
  
  if (!fs.existsSync(componentsDir)) {
    return components; // Return empty map if directory doesn't exist
  }
  
  function scanDirectory(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        scanDirectory(fullPath); // Recurse into subdirectories
      } else if (entry.isFile() && entry.name.endsWith(".zen")) {
        try {
          const zenFile = parseZen(fullPath);
          const componentName = filenameToComponentName(fullPath, baseDir);
          
          // Extract metadata from all scripts
          const allProps = new Map<string, string>();
          const allStateDeclarations = new Map<string, string>();
          
          for (const script of zenFile.scripts) {
            const props = extractProps(script.content);
            const stateDecls = extractStateDeclarations(script.content);
            
            // Merge props (later scripts override earlier ones)
            for (const [name, value] of props.entries()) {
              allProps.set(name, value);
            }
            
            // Merge state declarations (later scripts override earlier ones)
            for (const [name, value] of stateDecls.entries()) {
              allStateDeclarations.set(name, value);
            }
          }
          
          // Extract slots
          const { hasSlots, slotNames } = extractSlots(zenFile.html);
          
          const metadata: ComponentMetadata = {
            name: componentName,
            filePath: fullPath,
            isLayout: false,
            props: allProps,
            stateDeclarations: allStateDeclarations,
            hasSlots,
            slotNames,
            html: zenFile.html,
            scripts: zenFile.scripts.map(s => s.content),
            styles: zenFile.styles.map(s => s.content)
          };
          
          components.set(componentName, metadata);
        } catch (error) {
          console.warn(`Warning: Failed to parse component ${fullPath}:`, error);
        }
      }
    }
  }
  
  scanDirectory(componentsDir);
  return components;
}

/**
 * Discover and parse all layout files in a directory
 */
export function discoverLayouts(
  layoutsDir: string,
  baseDir: string
): Map<string, ComponentMetadata> {
  const layouts = new Map<string, ComponentMetadata>();
  
  if (!fs.existsSync(layoutsDir)) {
    return layouts; // Return empty map if directory doesn't exist
  }
  
  const entries = fs.readdirSync(layoutsDir, { withFileTypes: true });
  
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".zen")) {
      const fullPath = path.join(layoutsDir, entry.name);
      try {
        const zenFile = parseZen(fullPath);
        const layoutName = filenameToComponentName(fullPath, baseDir);
        
        // Extract metadata from all scripts
        const allProps = new Map<string, string>();
        const allStateDeclarations = new Map<string, string>();
        
        for (const script of zenFile.scripts) {
          const props = extractProps(script.content);
          const stateDecls = extractStateDeclarations(script.content);
          
          // Merge props (later scripts override earlier ones)
          for (const [name, value] of props.entries()) {
            allProps.set(name, value);
          }
          
          // Merge state declarations (later scripts override earlier ones)
          for (const [name, value] of stateDecls.entries()) {
            allStateDeclarations.set(name, value);
          }
        }
        
        // Extract slots
        const { hasSlots, slotNames } = extractSlots(zenFile.html);
        
        const metadata: ComponentMetadata = {
          name: layoutName,
          filePath: fullPath,
          isLayout: true,
          props: allProps,
          stateDeclarations: allStateDeclarations,
          hasSlots,
          slotNames,
          html: zenFile.html,
          scripts: zenFile.scripts.map(s => s.content),
          styles: zenFile.styles.map(s => s.content)
        };
        
        layouts.set(layoutName, metadata);
      } catch (error) {
        console.warn(`Warning: Failed to parse layout ${fullPath}:`, error);
      }
    }
  }
  
  return layouts;
}

