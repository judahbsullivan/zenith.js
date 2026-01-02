/**
 * Zenith Route Manifest Generator
 * 
 * Scans pages/ directory at build time and generates a route manifest
 * with proper scoring for deterministic route matching.
 */

import fs from "fs"
import path from "path"
import {
  type RouteDefinition,
  type ParsedSegment,
  SegmentType
} from "./types"

/**
 * Scoring constants for route ranking
 * Higher scores = higher priority
 */
const SEGMENT_SCORES = {
  [SegmentType.STATIC]: 10,
  [SegmentType.DYNAMIC]: 5,
  [SegmentType.CATCH_ALL]: 1,
  [SegmentType.OPTIONAL_CATCH_ALL]: 0
} as const

/**
 * Discover all .zen files in the pages directory
 */
export function discoverPages(pagesDir: string): string[] {
  const pages: string[] = []
  
  function walk(dir: string): void {
    if (!fs.existsSync(dir)) return
    
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile() && entry.name.endsWith(".zen")) {
        pages.push(fullPath)
      }
    }
  }
  
  walk(pagesDir)
  return pages
}

/**
 * Convert a file path to a route path
 * 
 * Examples:
 *   pages/index.zen       → /
 *   pages/about.zen       → /about
 *   pages/blog/index.zen  → /blog
 *   pages/blog/[id].zen   → /blog/:id
 *   pages/posts/[...slug].zen → /posts/*slug
 *   pages/[[...all]].zen  → /*all (optional)
 */
export function filePathToRoutePath(filePath: string, pagesDir: string): string {
  // Get relative path from pages directory
  const relativePath = path.relative(pagesDir, filePath)
  
  // Remove .zen extension
  const withoutExt = relativePath.replace(/\.zen$/, "")
  
  // Split into segments
  const segments = withoutExt.split(path.sep)
  
  // Transform segments
  const routeSegments: string[] = []
  
  for (const segment of segments) {
    // Handle index files (they represent the directory root)
    if (segment === "index") {
      continue
    }
    
    // Handle optional catch-all: [[...param]]
    const optionalCatchAllMatch = segment.match(/^\[\[\.\.\.(\w+)\]\]$/)
    if (optionalCatchAllMatch) {
      routeSegments.push(`*${optionalCatchAllMatch[1]}?`)
      continue
    }
    
    // Handle required catch-all: [...param]
    const catchAllMatch = segment.match(/^\[\.\.\.(\w+)\]$/)
    if (catchAllMatch) {
      routeSegments.push(`*${catchAllMatch[1]}`)
      continue
    }
    
    // Handle dynamic segment: [param]
    const dynamicMatch = segment.match(/^\[(\w+)\]$/)
    if (dynamicMatch) {
      routeSegments.push(`:${dynamicMatch[1]}`)
      continue
    }
    
    // Static segment
    routeSegments.push(segment)
  }
  
  // Build route path
  const routePath = "/" + routeSegments.join("/")
  
  // Normalize trailing slashes
  return routePath === "/" ? "/" : routePath.replace(/\/$/, "")
}

/**
 * Parse a route path into segments with type information
 */
export function parseRouteSegments(routePath: string): ParsedSegment[] {
  if (routePath === "/") {
    return []
  }
  
  const segments = routePath.slice(1).split("/")
  const parsed: ParsedSegment[] = []
  
  for (const segment of segments) {
    // Optional catch-all: *param?
    if (segment.startsWith("*") && segment.endsWith("?")) {
      parsed.push({
        type: SegmentType.OPTIONAL_CATCH_ALL,
        paramName: segment.slice(1, -1),
        raw: segment
      })
      continue
    }
    
    // Required catch-all: *param
    if (segment.startsWith("*")) {
      parsed.push({
        type: SegmentType.CATCH_ALL,
        paramName: segment.slice(1),
        raw: segment
      })
      continue
    }
    
    // Dynamic: :param
    if (segment.startsWith(":")) {
      parsed.push({
        type: SegmentType.DYNAMIC,
        paramName: segment.slice(1),
        raw: segment
      })
      continue
    }
    
    // Static
    parsed.push({
      type: SegmentType.STATIC,
      raw: segment
    })
  }
  
  return parsed
}

/**
 * Calculate route score based on segments
 * Higher scores = higher priority for matching
 */
export function calculateRouteScore(segments: ParsedSegment[]): number {
  if (segments.length === 0) {
    // Root route gets a high score
    return 100
  }
  
  let score = 0
  
  for (const segment of segments) {
    score += SEGMENT_SCORES[segment.type]
  }
  
  // Bonus for having more static segments (specificity)
  const staticCount = segments.filter(s => s.type === SegmentType.STATIC).length
  score += staticCount * 2
  
  return score
}

/**
 * Extract parameter names from parsed segments
 */
export function extractParamNames(segments: ParsedSegment[]): string[] {
  return segments
    .filter(s => s.paramName !== undefined)
    .map(s => s.paramName!)
}

/**
 * Convert route path to regex pattern
 * 
 * Examples:
 *   /about         → /^\/about\/?$/
 *   /blog/:id      → /^\/blog\/([^/]+)\/?$/
 *   /posts/*slug   → /^\/posts\/(.+)\/?$/
 *   /              → /^\/$/
 *   /*all?         → /^(?:\/(.*))?$/  (optional catch-all)
 */
export function routePathToRegex(routePath: string): RegExp {
  if (routePath === "/") {
    return /^\/$/
  }
  
  const segments = routePath.slice(1).split("/")
  const regexParts: string[] = []
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (!segment) continue
    
    // Optional catch-all: *param?
    if (segment.startsWith("*") && segment.endsWith("?")) {
      // Optional catch-all - matches zero or more path segments
      // Should only be at the end
      regexParts.push("(?:\\/(.*))?")
      continue
    }
    
    // Required catch-all: *param
    if (segment.startsWith("*")) {
      // Required catch-all - matches one or more path segments
      regexParts.push("\\/(.+)")
      continue
    }
    
    // Dynamic: :param
    if (segment.startsWith(":")) {
      regexParts.push("\\/([^/]+)")
      continue
    }
    
    // Static segment - escape special regex characters
    const escaped = segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    regexParts.push(`\\/${escaped}`)
  }
  
  // Build final regex with optional trailing slash
  const pattern = `^${regexParts.join("")}\\/?$`
  return new RegExp(pattern)
}

/**
 * Generate a route definition from a file path
 */
export function generateRouteDefinition(
  filePath: string,
  pagesDir: string
): RouteDefinition {
  const routePath = filePathToRoutePath(filePath, pagesDir)
  const segments = parseRouteSegments(routePath)
  const paramNames = extractParamNames(segments)
  const score = calculateRouteScore(segments)
  
  return {
    path: routePath,
    segments,
    paramNames,
    score,
    filePath
  }
}

/**
 * Generate route manifest from pages directory
 * Returns route definitions sorted by score (highest first)
 */
export function generateRouteManifest(pagesDir: string): RouteDefinition[] {
  const pages = discoverPages(pagesDir)
  
  const definitions = pages.map(filePath => 
    generateRouteDefinition(filePath, pagesDir)
  )
  
  // Sort by score descending (highest priority first)
  definitions.sort((a, b) => b.score - a.score)
  
  return definitions
}

/**
 * Generate the route manifest as JavaScript code for runtime
 */
export function generateRouteManifestCode(definitions: RouteDefinition[]): string {
  const routeEntries = definitions.map(def => {
    const regex = routePathToRegex(def.path)
    
    return `  {
    path: ${JSON.stringify(def.path)},
    regex: ${regex.toString()},
    paramNames: ${JSON.stringify(def.paramNames)},
    score: ${def.score},
    filePath: ${JSON.stringify(def.filePath)}
  }`
  })
  
  return `// Auto-generated route manifest
// Do not edit directly

export const routeManifest = [
${routeEntries.join(",\n")}
];
`
}

