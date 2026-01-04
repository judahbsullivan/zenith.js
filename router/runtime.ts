/**
 * Zenith Runtime Router
 * 
 * SPA-style client-side router that handles:
 * - URL resolution and route matching
 * - Browser history management (pushState/popstate)
 * - Reactive route state
 * - Page component mounting/unmounting
 * 
 * Extension points for future ZenLink:
 * - navigate() API
 * - beforeEach/afterEach guards
 * - Active link state
 */

import type { 
  RouteState, 
  NavigateOptions,
  RouteRecord,
  PageModule 
} from "./types"

/**
 * Runtime route record (with load function bound)
 */
interface RuntimeRouteRecord {
  path: string
  regex: RegExp
  paramNames: string[]
  score: number
  filePath: string
  /** Page module or loader function */
  module?: PageModule
  load?: () => PageModule
}

/**
 * Global route state - reactive and accessible from page components
 */
let currentRoute: RouteState = {
  path: "/",
  params: {},
  query: {}
}

/**
 * Route change listeners
 */
type RouteListener = (route: RouteState, prevRoute: RouteState) => void
const routeListeners: Set<RouteListener> = new Set()

/**
 * Route manifest (populated at build time)
 */
let routeManifest: RuntimeRouteRecord[] = []

/**
 * Current page module
 */
let currentPageModule: PageModule | null = null

/**
 * Router outlet element
 */
let routerOutlet: HTMLElement | null = null

/**
 * Initialize the router with the route manifest
 */
export function initRouter(
  manifest: RuntimeRouteRecord[],
  outlet?: HTMLElement | string
): void {
  routeManifest = manifest
  
  // Set router outlet
  if (outlet) {
    routerOutlet = typeof outlet === "string" 
      ? document.querySelector(outlet) 
      : outlet
  }
  
  // Listen for popstate (back/forward navigation)
  window.addEventListener("popstate", handlePopState)
  
  // Resolve initial route
  const initialPath = window.location.pathname
  const initialQuery = parseQueryString(window.location.search)
  
  resolveAndRender(initialPath, initialQuery, false)
}

/**
 * Parse query string into object
 */
function parseQueryString(search: string): Record<string, string> {
  const query: Record<string, string> = {}
  
  if (!search || search === "?") {
    return query
  }
  
  const params = new URLSearchParams(search)
  params.forEach((value, key) => {
    query[key] = value
  })
  
  return query
}

/**
 * Handle browser back/forward navigation
 */
function handlePopState(_event: PopStateEvent): void {
  const path = window.location.pathname
  const query = parseQueryString(window.location.search)
  
  // Don't update history on popstate - browser already changed it
  resolveAndRender(path, query, false, false)
}

/**
 * Resolve route from path
 */
export function resolveRoute(
  pathname: string
): { record: RuntimeRouteRecord; params: Record<string, string> } | null {
  // Normalize pathname
  const normalizedPath = pathname === "" ? "/" : pathname
  
  for (const route of routeManifest) {
    const match = route.regex.exec(normalizedPath)
    
    if (match) {
      // Extract params from capture groups
      const params: Record<string, string> = {}
      
      for (let i = 0; i < route.paramNames.length; i++) {
        const paramName = route.paramNames[i]
        const paramValue = match[i + 1] // +1 because match[0] is full match
        
        if (paramName && paramValue !== undefined) {
          params[paramName] = decodeURIComponent(paramValue)
        }
      }
      
      return { record: route, params }
    }
  }
  
  return null
}

/**
 * Resolve route and render page
 */
async function resolveAndRender(
  path: string,
  query: Record<string, string>,
  updateHistory: boolean = true,
  replace: boolean = false
): Promise<void> {
  const prevRoute = { ...currentRoute }
  
  const resolved = resolveRoute(path)
  
  if (resolved) {
    // Update route state
    currentRoute = {
      path,
      params: resolved.params,
      query,
      matched: resolved.record as unknown as RouteRecord
    }
    
    // Load and render page
    const pageModule = resolved.record.module || 
      (resolved.record.load ? resolved.record.load() : null)
    
    if (pageModule) {
      await renderPage(pageModule)
    }
  } else {
    // No route matched - could render 404
    currentRoute = {
      path,
      params: {},
      query,
      matched: undefined
    }
    
    console.warn(`[Zenith Router] No route matched for path: ${path}`)
  }
  
  // Update browser history
  if (updateHistory) {
    const url = path + (Object.keys(query).length > 0 
      ? "?" + new URLSearchParams(query).toString() 
      : "")
    
    if (replace) {
      window.history.replaceState(null, "", url)
    } else {
      window.history.pushState(null, "", url)
    }
  }
  
  // Notify listeners
  notifyListeners(currentRoute, prevRoute)
  
  // Expose route to window for component access
  ;(window as any).__zenith_route = currentRoute
}

/**
 * Render a page module to the router outlet
 */
async function renderPage(pageModule: PageModule): Promise<void> {
  if (!routerOutlet) {
    console.warn("[Zenith Router] No router outlet configured")
    return
  }
  
  // Clear previous page scripts from window
  cleanupPreviousPage()
  
  currentPageModule = pageModule
  
  // Render HTML to outlet
  routerOutlet.innerHTML = pageModule.html
  
  // Inject styles
  injectStyles(pageModule.styles)
  
  // Execute scripts
  executeScripts(pageModule.scripts)
}

/**
 * Clean up previous page (remove event listeners, etc.)
 */
function cleanupPreviousPage(): void {
  // Remove previous page styles
  const prevStyles = document.querySelectorAll("style[data-zen-page-style]")
  prevStyles.forEach(style => style.remove())
  
  // Note: Script cleanup is handled by the state management system
  // State variables and event handlers will be overwritten by new page
}

/**
 * Inject page styles into document head
 */
function injectStyles(styles: string[]): void {
  styles.forEach((styleContent, index) => {
    const styleEl = document.createElement("style")
    styleEl.setAttribute("data-zen-page-style", String(index))
    styleEl.textContent = styleContent
    document.head.appendChild(styleEl)
  })
}

/**
 * Execute page scripts
 */
function executeScripts(scripts: string[]): void {
  scripts.forEach(scriptContent => {
    try {
      // Create a function and execute it
      const scriptFn = new Function(scriptContent)
      scriptFn()
    } catch (error) {
      console.error("[Zenith Router] Error executing page script:", error)
    }
  })
}

/**
 * Notify route change listeners
 */
function notifyListeners(route: RouteState, prevRoute: RouteState): void {
  routeListeners.forEach(listener => {
    try {
      listener(route, prevRoute)
    } catch (error) {
      console.error("[Zenith Router] Error in route listener:", error)
    }
  })
}

/**
 * Navigate to a new URL (SPA navigation)
 * 
 * This is the main API for programmatic navigation.
 * ZenLink will use this internally.
 * 
 * @param to - The target URL path
 * @param options - Navigation options
 */
export async function navigate(
  to: string,
  options: NavigateOptions = {}
): Promise<void> {
  // Parse the URL
  let path: string
  let query: Record<string, string> = {}
  
  if (to.includes("?")) {
    const [pathname, search] = to.split("?")
    path = pathname || "/"
    query = parseQueryString("?" + (search || ""))
  } else {
    path = to
  }
  
  // Normalize path
  if (!path.startsWith("/")) {
    // Relative path - resolve against current path
    const currentDir = currentRoute.path.split("/").slice(0, -1).join("/")
    path = currentDir + "/" + path
  }
  
  // Normalize path for comparison (ensure trailing slash consistency)
  const normalizedPath = path === "" ? "/" : path
  const currentPath = currentRoute.path === "" ? "/" : currentRoute.path
  
  // Check if we're already on this path
  const isSamePath = normalizedPath === currentPath
  
  // If same path and same query, don't navigate (idempotent)
  if (isSamePath && JSON.stringify(query) === JSON.stringify(currentRoute.query)) {
    return
  }
  
  // Resolve and render with replace option if specified
  await resolveAndRender(path, query, true, options.replace || false)
}

/**
 * Get current route state
 */
export function getRoute(): RouteState {
  return { ...currentRoute }
}

/**
 * Subscribe to route changes
 */
export function onRouteChange(listener: RouteListener): () => void {
  routeListeners.add(listener)
  
  // Return unsubscribe function
  return () => {
    routeListeners.delete(listener)
  }
}

/**
 * FUTURE EXTENSION POINTS
 * 
 * These are placeholders for features ZenLink and other extensions will use.
 * They are not implemented yet but define the API surface.
 */

/**
 * Navigation guards (future extension)
 */
type NavigationGuard = (
  to: RouteState,
  from: RouteState
) => boolean | string | Promise<boolean | string>

const beforeGuards: NavigationGuard[] = []

/**
 * Register a navigation guard (future extension)
 */
export function beforeEach(guard: NavigationGuard): () => void {
  beforeGuards.push(guard)
  return () => {
    const index = beforeGuards.indexOf(guard)
    if (index > -1) beforeGuards.splice(index, 1)
  }
}

/**
 * After navigation hooks (future extension)
 */
type AfterHook = (to: RouteState, from: RouteState) => void | Promise<void>

const afterHooks: AfterHook[] = []

/**
 * Register an after-navigation hook (future extension)
 */
export function afterEach(hook: AfterHook): () => void {
  afterHooks.push(hook)
  return () => {
    const index = afterHooks.indexOf(hook)
    if (index > -1) afterHooks.splice(index, 1)
  }
}

/**
 * Check if a path is active (for ZenLink active state)
 */
export function isActive(path: string, exact: boolean = false): boolean {
  if (exact) {
    return currentRoute.path === path
  }
  return currentRoute.path.startsWith(path)
}

/**
 * Prefetch a route for faster navigation
 * 
 * This preloads the page module into the route manifest cache,
 * so when the user navigates to it, there's no loading delay.
 */
const prefetchedRoutes = new Set<string>()

export async function prefetch(path: string): Promise<void> {
  // Normalize path
  const normalizedPath = path === "" ? "/" : path
  
  // Don't prefetch if already done
  if (prefetchedRoutes.has(normalizedPath)) {
    return
  }
  
  // Find matching route
  const resolved = resolveRoute(normalizedPath)
  
  if (!resolved) {
    console.warn(`[Zenith Router] Cannot prefetch: no route matches ${path}`)
    return
  }
  
  // Mark as prefetched
  prefetchedRoutes.add(normalizedPath)
  
  // If route has a load function, call it to preload the module
  if (resolved.record.load && !resolved.record.module) {
    try {
      resolved.record.module = resolved.record.load()
    } catch (error) {
      console.warn(`[Zenith Router] Error prefetching ${path}:`, error)
    }
  }
}

/**
 * Check if a route has been prefetched
 */
export function isPrefetched(path: string): boolean {
  return prefetchedRoutes.has(path === "" ? "/" : path)
}

