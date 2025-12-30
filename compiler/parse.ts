import fs from "fs"
import * as parse5 from "parse5"
import type { ZenFile, ScriptBlock, StyleBlock } from "./types"

export function parseZen(path: string): ZenFile {
  const source = fs.readFileSync(path, "utf-8");
  const document = parse5.parse(source);

  const scripts: ScriptBlock[] = [];
  const styles: StyleBlock[] = [];
  let scriptIndex = 0;
  let stylesIndex = 0;

  function extractTextContent(node: any): string {
    if (!node.childNodes?.length) return '';
    return node.childNodes
      .filter((n: any) => n.nodeName === '#text')
      .map((n: any) => n.value || '')
      .join('');
  }

  function walk(node: any) {
    if (node.nodeName === "script" && node.childNodes?.length) {
      const content = extractTextContent(node);
      scripts.push({ content, index: scriptIndex++ })
    }
    if (node.nodeName === "style" && node.childNodes?.length) {
      const content = extractTextContent(node);
      styles.push({
        content,
        index: stylesIndex++
      })
    }


    node.childNodes?.forEach(walk)
  }
  walk(document)

  return {
    html: source,
    scripts,
    styles
  }
}
