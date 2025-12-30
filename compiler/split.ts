import type { ZenFile } from "./types"
import * as parse5 from "parse5"

// Transform on* attributes to data-zen-* attributes during compilation
// Returns: { transformedHtml, eventTypes } where eventTypes is a Set of used event types
function transformEventAttributes(html: string): { transformedHtml: string; eventTypes: Set<string> } {
  const document = parse5.parse(html);
  const eventTypes = new Set<string>();
  
  function walk(node: any) {
    // Transform attributes on element nodes
    if (node.attrs && Array.isArray(node.attrs)) {
      node.attrs = node.attrs.map((attr: any) => {
        const attrName = attr.name.toLowerCase();
        // Check if attribute starts with "on" (event handler)
        if (attrName.startsWith('on') && attrName.length > 2) {
          // Convert onclick -> data-zen-click, onchange -> data-zen-change, etc.
          const eventType = attrName.slice(2); // Remove "on" prefix
          eventTypes.add(eventType); // Track which event types are used
          return {
            name: `data-zen-${eventType}`,
            value: attr.value
          };
        }
        return attr;
      });
    }
    
    // Recursively process child nodes
    if (node.childNodes) {
      node.childNodes.forEach(walk);
    }
  }
  
  walk(document);
  
  // Serialize back to HTML string
  return {
    transformedHtml: parse5.serialize(document),
    eventTypes
  };
}

// Strip script and style tags from HTML since they're extracted to separate files
function stripScriptAndStyleTags(html: string): string {
  // Remove script tags (including content)
  html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  // Remove style tags (including content)
  html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  return html;
}

// this function splits the props into what we are compiling the them down too 
// html styles and scripts
export function splitZen(file: ZenFile) {
  // First transform event attributes, then strip script/style tags
  const { transformedHtml, eventTypes } = transformEventAttributes(file.html);
  return {
    html: stripScriptAndStyleTags(transformedHtml),
    scripts: file.scripts.map(s => s.content),
    styles: file.styles.map(style => style.content),
    eventTypes: Array.from(eventTypes).sort() // Return sorted array of event types
  }
}
