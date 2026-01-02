/**
 * Zenith Router Types
 * 
 * File-based routing system types for build-time manifest generation
 * and runtime route resolution.
 */

/**
 * A compiled route record used for runtime matching
 */
export interface RouteRecord {
  /** The route pattern (e.g., /blog/:id, /posts/*slug) */
  path: string
  /** Compiled regex for matching URLs */
  regex: RegExp
  /** Parameter names extracted from the route pattern */
  paramNames: string[]
  /** Dynamic import function for the page module */
  load: () => Promise<PageModule>
  /** Route priority score for deterministic matching */
  score: number
  /** Original file path (for debugging) */
  filePath: string
}

/**
 * A compiled page module containing the page's compiled code
 */
export interface PageModule {
  /** The compiled HTML template */
  html: string
  /** Array of compiled script contents */
  scripts: string[]
  /** Array of compiled style contents */
  styles: string[]
  /** Page metadata (title, etc.) */
  meta?: PageMeta
}

/**
 * Page metadata for head management
 */
export interface PageMeta {
  title?: string
  description?: string
  [key: string]: string | undefined
}

/**
 * The reactive route state exposed to components
 */
export interface RouteState {
  /** Current pathname (e.g., /blog/123) */
  path: string
  /** Extracted route parameters (e.g., { id: '123' }) */
  params: Record<string, string>
  /** Parsed query string parameters */
  query: Record<string, string>
  /** The matched route record (if any) */
  matched?: RouteRecord
}

/**
 * Navigation options for programmatic navigation
 */
export interface NavigateOptions {
  /** Replace current history entry instead of pushing */
  replace?: boolean
}

/**
 * Route segment types for scoring
 */
export enum SegmentType {
  /** Static segment (e.g., "blog") - highest priority */
  STATIC = 'static',
  /** Dynamic parameter (e.g., "[id]") - medium priority */
  DYNAMIC = 'dynamic',
  /** Required catch-all (e.g., "[...slug]") - low priority */
  CATCH_ALL = 'catch_all',
  /** Optional catch-all (e.g., "[[...slug]]") - lowest priority */
  OPTIONAL_CATCH_ALL = 'optional_catch_all'
}

/**
 * Parsed segment information
 */
export interface ParsedSegment {
  /** The segment type */
  type: SegmentType
  /** The parameter name (for dynamic/catch-all segments) */
  paramName?: string
  /** The raw segment string */
  raw: string
}

/**
 * Build-time route definition before regex compilation
 */
export interface RouteDefinition {
  /** The route pattern */
  path: string
  /** Parsed segments */
  segments: ParsedSegment[]
  /** Parameter names */
  paramNames: string[]
  /** Route score */
  score: number
  /** Source file path */
  filePath: string
}

/**
 * Route manifest generated at build time
 */
export interface RouteManifest {
  /** Array of route records, sorted by score (highest first) */
  routes: RouteRecord[]
  /** Timestamp of manifest generation */
  generatedAt: number
}

/**
 * Router instance interface (for future ZenLink extension)
 */
export interface Router {
  /** Current reactive route state */
  readonly route: RouteState
  
  /** Navigate to a new URL */
  navigate(to: string, options?: NavigateOptions): Promise<void>
  
  /** Resolve a route without navigating */
  resolve(path: string): { record: RouteRecord; params: Record<string, string> } | null
  
  /** Add a navigation guard (future extension point) */
  beforeEach?(guard: NavigationGuard): () => void
  
  /** Add an after-navigation hook (future extension point) */
  afterEach?(hook: NavigationHook): () => void
}

/**
 * Navigation guard for route protection (future extension)
 */
export type NavigationGuard = (
  to: RouteState,
  from: RouteState
) => boolean | string | Promise<boolean | string>

/**
 * Navigation hook for post-navigation actions (future extension)
 */
export type NavigationHook = (
  to: RouteState,
  from: RouteState
) => void | Promise<void>

/**
 * Router view mount options
 */
export interface RouterViewOptions {
  /** Container element or selector */
  container: HTMLElement | string
  /** Whether to preserve layout between routes */
  preserveLayout?: boolean
}

