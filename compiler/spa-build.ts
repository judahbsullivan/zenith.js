/**
 * Zenith SPA Build System
 * 
 * Builds all pages into a single index.html with:
 * - Route manifest
 * - Compiled page modules (inlined)
 * - Runtime router
 * - Shell HTML with router outlet
 */

import fs from "fs"
import path from "path"
import { parseZen } from "./parse"
import { splitZen } from "./split"
import { processComponents } from "./component-process"
import { 
  discoverPages, 
  generateRouteDefinition,
  routePathToRegex 
} from "../router/manifest"

interface CompiledPage {
  routePath: string
  filePath: string
  html: string
  scripts: string[]
  styles: string[]
  score: number
  paramNames: string[]
  regex: RegExp
}

interface SPABuildOptions {
  /** Pages directory */
  pagesDir: string
  /** Output directory */
  outDir: string
  /** Base directory for components/layouts */
  baseDir?: string
}

/**
 * Compile a single page file
 */
function compilePage(
  pagePath: string,
  pagesDir: string
): CompiledPage {
  // Parse the .zen file
  const zen = parseZen(pagePath)
  
  // Process components and layouts
  const processedZen = processComponents(zen, pagePath)
  
  // Split into html, scripts, styles
  const { 
    html, 
    styles, 
    scripts, 
    eventTypes, 
    stateBindings, 
    stateDeclarations, 
    bindings 
  } = splitZen(processedZen)
  
  // Import runtime generators
  const { generateEventBindingRuntime } = require("./event")
  const { generateBindingRuntime } = require("./binding")
  const { generateAttributeBindingRuntime } = require("./bindings")
  
  // Generate runtime code
  const eventRuntime = generateEventBindingRuntime(eventTypes)
  const bindingRuntime = generateBindingRuntime(stateBindings, stateDeclarations)
  const attributeBindingRuntime = generateAttributeBindingRuntime(bindings)
  
  // Combine scripts with runtime
  const scriptsWithRuntime = scripts.map((s, index) => {
    let result = ""
    if (bindingRuntime) {
      result += bindingRuntime + "\n\n"
    }
    if (attributeBindingRuntime) {
      result += attributeBindingRuntime + "\n\n"
    }
    result += s
    if (eventRuntime && index === 0) {
      result += `\n\n${eventRuntime}`
    }
    return result
  })
  
  // Generate route definition
  const routeDef = generateRouteDefinition(pagePath, pagesDir)
  const regex = routePathToRegex(routeDef.path)
  
  return {
    routePath: routeDef.path,
    filePath: pagePath,
    html,
    scripts: scriptsWithRuntime,
    styles,
    score: routeDef.score,
    paramNames: routeDef.paramNames,
    regex
  }
}

/**
 * Generate the runtime router code (inlined into the bundle)
 */
function generateRuntimeRouterCode(): string {
  return `
// ============================================
// Zenith Runtime Router
// ============================================

(function() {
  'use strict';
  
  // Current route state
  let currentRoute = {
    path: '/',
    params: {},
    query: {}
  };
  
  // Route listeners
  const routeListeners = new Set();
  
  // Router outlet element
  let routerOutlet = null;
  
  // Page modules registry
  const pageModules = {};
  
  // Route manifest
  let routeManifest = [];
  
  /**
   * Parse query string
   */
  function parseQueryString(search) {
    const query = {};
    if (!search || search === '?') return query;
    const params = new URLSearchParams(search);
    params.forEach((value, key) => { query[key] = value; });
    return query;
  }
  
  /**
   * Resolve route from pathname
   */
  function resolveRoute(pathname) {
    const normalizedPath = pathname === '' ? '/' : pathname;
    
    for (const route of routeManifest) {
      const match = route.regex.exec(normalizedPath);
      if (match) {
        const params = {};
        for (let i = 0; i < route.paramNames.length; i++) {
          const paramValue = match[i + 1];
          if (paramValue !== undefined) {
            params[route.paramNames[i]] = decodeURIComponent(paramValue);
          }
        }
        return { record: route, params };
      }
    }
    return null;
  }
  
  /**
   * Clean up previous page
   */
  function cleanupPreviousPage() {
    // Trigger unmount lifecycle hooks
    if (window.__zenith && window.__zenith.triggerUnmount) {
      window.__zenith.triggerUnmount();
    }
    
    // Remove previous page styles
    document.querySelectorAll('style[data-zen-page-style]').forEach(s => s.remove());
    
    // Clean up window properties (state variables, functions)
    // This is important for proper state isolation between pages
    if (window.__zenith_cleanup) {
      window.__zenith_cleanup.forEach(key => {
        try { delete window[key]; } catch(e) {}
      });
    }
    window.__zenith_cleanup = [];
  }
  
  /**
   * Inject styles
   */
  function injectStyles(styles) {
    styles.forEach((content, i) => {
      const style = document.createElement('style');
      style.setAttribute('data-zen-page-style', String(i));
      style.textContent = content;
      document.head.appendChild(style);
    });
  }
  
  /**
   * Execute scripts
   */
  function executeScripts(scripts) {
    scripts.forEach(content => {
      try {
        const fn = new Function(content);
        fn();
      } catch (e) {
        console.error('[Zenith Router] Script error:', e);
      }
    });
  }
  
  /**
   * Render page
   */
  function renderPage(pageModule) {
    if (!routerOutlet) {
      console.warn('[Zenith Router] No router outlet');
      return;
    }
    
    cleanupPreviousPage();
    routerOutlet.innerHTML = pageModule.html;
    injectStyles(pageModule.styles);
    executeScripts(pageModule.scripts);
    
    // Trigger mount lifecycle hooks after scripts are executed
    if (window.__zenith && window.__zenith.triggerMount) {
      window.__zenith.triggerMount();
    }
  }
  
  /**
   * Notify listeners
   */
  function notifyListeners(route, prevRoute) {
    routeListeners.forEach(listener => {
      try { listener(route, prevRoute); } catch(e) {}
    });
  }
  
  /**
   * Resolve and render
   */
  function resolveAndRender(path, query, updateHistory, replace) {
    replace = replace || false;
    const prevRoute = { ...currentRoute };
    const resolved = resolveRoute(path);
    
    if (resolved) {
      currentRoute = {
        path,
        params: resolved.params,
        query,
        matched: resolved.record
      };
      
      const pageModule = pageModules[resolved.record.path];
      if (pageModule) {
        renderPage(pageModule);
      }
    } else {
      currentRoute = { path, params: {}, query, matched: undefined };
      console.warn('[Zenith Router] No route matched:', path);
      
      // Render 404 if available, otherwise show message
      if (routerOutlet) {
        routerOutlet.innerHTML = '<div style="padding: 2rem; text-align: center;"><h1>404</h1><p>Page not found</p></div>';
      }
    }
    
    if (updateHistory) {
      const url = path + (Object.keys(query).length ? '?' + new URLSearchParams(query) : '');
      if (replace) {
        window.history.replaceState(null, '', url);
      } else {
        window.history.pushState(null, '', url);
      }
    }
    
    notifyListeners(currentRoute, prevRoute);
    window.__zenith_route = currentRoute;
  }
  
  /**
   * Handle popstate
   */
  function handlePopState() {
    // Don't update history on popstate - browser already changed it
    resolveAndRender(
      window.location.pathname,
      parseQueryString(window.location.search),
      false,
      false
    );
  }
  
  /**
   * Navigate (public API)
   */
  function navigate(to, options) {
    options = options || {};
    let path, query = {};
    
    if (to.includes('?')) {
      const parts = to.split('?');
      path = parts[0];
      query = parseQueryString('?' + parts[1]);
    } else {
      path = to;
    }
    
    if (!path.startsWith('/')) {
      const currentDir = currentRoute.path.split('/').slice(0, -1).join('/');
      path = currentDir + '/' + path;
    }
    
    // Normalize path for comparison
    const normalizedPath = path === '' ? '/' : path;
    const currentPath = currentRoute.path === '' ? '/' : currentRoute.path;
    
    // Check if we're already on this path
    const isSamePath = normalizedPath === currentPath;
    
    // If same path and same query, don't navigate (idempotent)
    if (isSamePath && JSON.stringify(query) === JSON.stringify(currentRoute.query)) {
      return;
    }
    
    // Resolve and render with replace option if specified
    resolveAndRender(path, query, true, options.replace || false);
  }
  
  /**
   * Get current route
   */
  function getRoute() {
    return { ...currentRoute };
  }
  
  /**
   * Subscribe to route changes
   */
  function onRouteChange(listener) {
    routeListeners.add(listener);
    return () => routeListeners.delete(listener);
  }
  
  /**
   * Check if path is active
   */
  function isActive(path, exact) {
    if (exact) return currentRoute.path === path;
    return currentRoute.path.startsWith(path);
  }
  
  /**
   * Prefetch a route (preload page module)
   */
  const prefetchedRoutes = new Set();
  function prefetch(path) {
    const normalizedPath = path === '' ? '/' : path;
    if (prefetchedRoutes.has(normalizedPath)) {
      return Promise.resolve();
    }
    prefetchedRoutes.add(normalizedPath);
    
    // Find matching route
    const resolved = resolveRoute(normalizedPath);
    if (!resolved) {
      return Promise.resolve();
    }
    
    // Preload the module if it exists
    if (pageModules[resolved.record.path]) {
      // Module already loaded
      return Promise.resolve();
    }
    
    // Could prefetch here if we had a way to load modules dynamically
    return Promise.resolve();
  }
  
  /**
   * Initialize router
   */
  function initRouter(manifest, modules, outlet) {
    routeManifest = manifest;
    Object.assign(pageModules, modules);
    
    if (outlet) {
      routerOutlet = typeof outlet === 'string' 
        ? document.querySelector(outlet) 
        : outlet;
    }
    
    window.addEventListener('popstate', handlePopState);
    
    // Initial route resolution
    resolveAndRender(
      window.location.pathname,
      parseQueryString(window.location.search),
      false
    );
  }
  
  // Expose router API globally
  window.__zenith_router = {
    navigate,
    getRoute,
    onRouteChange,
    isActive,
    prefetch,
    initRouter
  };
  
  // Also expose navigate directly for convenience
  window.navigate = navigate;
  
})();
`
}

/**
 * Generate the Zen primitives runtime code
 * This makes zen* primitives available globally for auto-imports
 */
function generateZenPrimitivesRuntime(): string {
  return `
// ============================================
// Zenith Reactivity Primitives Runtime
// ============================================
// Auto-imported zen* primitives are resolved from window.__zenith

(function() {
  'use strict';
  
  // ============================================
  // Dependency Tracking System
  // ============================================
  
  let currentEffect = null;
  const effectStack = [];
  let batchDepth = 0;
  const pendingEffects = new Set();
  
  function pushContext(effect) {
    effectStack.push(currentEffect);
    currentEffect = effect;
  }
  
  function popContext() {
    currentEffect = effectStack.pop() || null;
  }
  
  function trackDependency(subscribers) {
    if (currentEffect) {
      subscribers.add(currentEffect);
      currentEffect.dependencies.add(subscribers);
    }
  }
  
  function notifySubscribers(subscribers) {
    const effects = [...subscribers];
    for (const effect of effects) {
      if (batchDepth > 0) {
        pendingEffects.add(effect);
      } else {
        effect.run();
      }
    }
  }
  
  function cleanupEffect(effect) {
    for (const deps of effect.dependencies) {
      deps.delete(effect);
    }
    effect.dependencies.clear();
  }
  
  // ============================================
  // zenSignal - Atomic reactive value
  // ============================================
  
  function zenSignal(initialValue) {
    let value = initialValue;
    const subscribers = new Set();
    
    function signal(newValue) {
      if (arguments.length === 0) {
        trackDependency(subscribers);
        return value;
      }
      if (newValue !== value) {
        value = newValue;
        notifySubscribers(subscribers);
      }
      return value;
    }
    
    return signal;
  }
  
  // ============================================
  // zenState - Deep reactive object
  // ============================================
  
  function zenState(initialObj) {
    const subscribers = new Map(); // path -> Set of effects
    
    function getSubscribers(path) {
      if (!subscribers.has(path)) {
        subscribers.set(path, new Set());
      }
      return subscribers.get(path);
    }
    
    function createProxy(obj, path = '') {
      if (typeof obj !== 'object' || obj === null) return obj;
      
      return new Proxy(obj, {
        get(target, prop) {
          const propPath = path ? path + '.' + String(prop) : String(prop);
          trackDependency(getSubscribers(propPath));
          const value = target[prop];
          if (typeof value === 'object' && value !== null) {
            return createProxy(value, propPath);
          }
          return value;
        },
        set(target, prop, value) {
          const propPath = path ? path + '.' + String(prop) : String(prop);
          target[prop] = value;
          notifySubscribers(getSubscribers(propPath));
          // Also notify parent path for nested updates
          if (path) {
            notifySubscribers(getSubscribers(path));
          }
          return true;
        }
      });
    }
    
    return createProxy(initialObj);
  }
  
  // ============================================
  // zenEffect - Auto-tracked side effect
  // ============================================
  
  function zenEffect(fn) {
    const effect = {
      fn,
      dependencies: new Set(),
      run() {
        cleanupEffect(this);
        pushContext(this);
        try {
          this.fn();
        } finally {
          popContext();
        }
      },
      dispose() {
        cleanupEffect(this);
      }
    };
    
    effect.run();
    return () => effect.dispose();
  }
  
  // ============================================
  // zenMemo - Cached computed value
  // ============================================
  
  function zenMemo(fn) {
    let cachedValue;
    let dirty = true;
    const subscribers = new Set();
    
    const effect = {
      dependencies: new Set(),
      run() {
        dirty = true;
        notifySubscribers(subscribers);
      }
    };
    
    function compute() {
      if (dirty) {
        cleanupEffect(effect);
        pushContext(effect);
        try {
          cachedValue = fn();
          dirty = false;
        } finally {
          popContext();
        }
      }
      trackDependency(subscribers);
      return cachedValue;
    }
    
    return compute;
  }
  
  // ============================================
  // zenRef - Non-reactive mutable container
  // ============================================
  
  function zenRef(initialValue) {
    return { current: initialValue !== undefined ? initialValue : null };
  }
  
  // ============================================
  // zenBatch - Batch updates
  // ============================================
  
  function zenBatch(fn) {
    batchDepth++;
    try {
      fn();
    } finally {
      batchDepth--;
      if (batchDepth === 0) {
        const effects = [...pendingEffects];
        pendingEffects.clear();
        for (const effect of effects) {
          effect.run();
        }
      }
    }
  }
  
  // ============================================
  // zenUntrack - Read without tracking
  // ============================================
  
  function zenUntrack(fn) {
    const prevEffect = currentEffect;
    currentEffect = null;
    try {
      return fn();
    } finally {
      currentEffect = prevEffect;
    }
  }
  
  // ============================================
  // Lifecycle Hooks
  // ============================================
  
  const mountCallbacks = [];
  const unmountCallbacks = [];
  let isMounted = false;
  
  function zenOnMount(fn) {
    if (isMounted) {
      // Already mounted, run immediately
      const cleanup = fn();
      if (typeof cleanup === 'function') {
        unmountCallbacks.push(cleanup);
      }
    } else {
      mountCallbacks.push(fn);
    }
  }
  
  function zenOnUnmount(fn) {
    unmountCallbacks.push(fn);
  }
  
  // Called by router when page mounts
  function triggerMount() {
    isMounted = true;
    for (const cb of mountCallbacks) {
      const cleanup = cb();
      if (typeof cleanup === 'function') {
        unmountCallbacks.push(cleanup);
      }
    }
    mountCallbacks.length = 0;
  }
  
  // Called by router when page unmounts
  function triggerUnmount() {
    isMounted = false;
    for (const cb of unmountCallbacks) {
      try { cb(); } catch(e) { console.error('[Zenith] Unmount error:', e); }
    }
    unmountCallbacks.length = 0;
  }
  
  // ============================================
  // Export to window.__zenith
  // ============================================
  
  window.__zenith = {
    // Reactivity primitives
    signal: zenSignal,
    state: zenState,
    effect: zenEffect,
    memo: zenMemo,
    ref: zenRef,
    batch: zenBatch,
    untrack: zenUntrack,
    // Lifecycle
    onMount: zenOnMount,
    onUnmount: zenOnUnmount,
    // Internal hooks for router
    triggerMount,
    triggerUnmount
  };
  
  // Also expose with zen* prefix for direct usage
  window.zenSignal = zenSignal;
  window.zenState = zenState;
  window.zenEffect = zenEffect;
  window.zenMemo = zenMemo;
  window.zenRef = zenRef;
  window.zenBatch = zenBatch;
  window.zenUntrack = zenUntrack;
  window.zenOnMount = zenOnMount;
  window.zenOnUnmount = zenOnUnmount;
  
  // Clean aliases
  window.signal = zenSignal;
  window.state = zenState;
  window.effect = zenEffect;
  window.memo = zenMemo;
  window.ref = zenRef;
  window.batch = zenBatch;
  window.untrack = zenUntrack;
  window.onMount = zenOnMount;
  window.onUnmount = zenOnUnmount;
  
})();
`
}

/**
 * Generate the HTML shell
 */
function generateHTMLShell(
  pages: CompiledPage[],
  layoutStyles: string[]
): string {
  // Collect all global styles (from layouts)
  const globalStyles = layoutStyles.join("\n")
  
  // Generate route manifest JavaScript
  const manifestJS = pages.map(page => ({
    path: page.routePath,
    regex: page.regex.toString(),
    paramNames: page.paramNames,
    score: page.score,
    filePath: page.filePath
  }))
  
  // Generate page modules JavaScript  
  const modulesJS = pages.map(page => {
    const escapedHtml = JSON.stringify(page.html)
    const escapedScripts = JSON.stringify(page.scripts)
    const escapedStyles = JSON.stringify(page.styles)
    
    return `${JSON.stringify(page.routePath)}: {
      html: ${escapedHtml},
      scripts: ${escapedScripts},
      styles: ${escapedStyles}
    }`
  }).join(",\n    ")
  
  // Generate manifest with actual RegExp objects
  const manifestCode = `[
    ${pages.map(page => `{
      path: ${JSON.stringify(page.routePath)},
      regex: ${page.regex.toString()},
      paramNames: ${JSON.stringify(page.paramNames)},
      score: ${page.score}
    }`).join(",\n    ")}
  ]`
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zenith App</title>
  <link rel="icon" type="image/x-icon" href="./favicon.ico">
  <style>
    /* Global/Layout Styles */
    ${globalStyles}
  </style>
</head>
<body>
  <!-- Router Outlet -->
  <div id="app"></div>
  
  <!-- Zenith Primitives Runtime -->
  <script>
    ${generateZenPrimitivesRuntime()}
  </script>
  
  <!-- Zenith Runtime Router -->
  <script>
    ${generateRuntimeRouterCode()}
  </script>
  
  <!-- Route Manifest & Page Modules -->
  <script>
    (function() {
      // Route manifest (sorted by score, highest first)
      const manifest = ${manifestCode};
      
      // Page modules keyed by route path
      const modules = {
    ${modulesJS}
  };
      
      // Initialize router when DOM is ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
          window.__zenith_router.initRouter(manifest, modules, '#app');
        });
      } else {
        window.__zenith_router.initRouter(manifest, modules, '#app');
      }
    })();
  </script>
</body>
</html>`
}

/**
 * Build SPA from pages directory
 */
export function buildSPA(options: SPABuildOptions): void {
  const { pagesDir, outDir, baseDir } = options
  
  // Clean output directory
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true })
  }
  fs.mkdirSync(outDir, { recursive: true })
  
  // Discover all pages
  const pageFiles = discoverPages(pagesDir)
  
  if (pageFiles.length === 0) {
    console.warn("[Zenith Build] No pages found in", pagesDir)
    return
  }
  
  console.log(`[Zenith Build] Found ${pageFiles.length} page(s)`)
  
  // Compile all pages
  const compiledPages: CompiledPage[] = []
  const layoutStyles: string[] = []
  
  for (const pageFile of pageFiles) {
    console.log(`[Zenith Build] Compiling: ${path.relative(pagesDir, pageFile)}`)
    
    try {
      const compiled = compilePage(pageFile, pagesDir)
      compiledPages.push(compiled)
    } catch (error) {
      console.error(`[Zenith Build] Error compiling ${pageFile}:`, error)
      throw error
    }
  }
  
  // Sort pages by score (highest first)
  compiledPages.sort((a, b) => b.score - a.score)
  
  // Extract layout styles (they should be global)
  // For now, we'll include any styles from the first page that uses a layout
  // TODO: Better layout handling
  
  // Generate HTML shell
  const htmlShell = generateHTMLShell(compiledPages, layoutStyles)
  
  // Write index.html
  fs.writeFileSync(path.join(outDir, "index.html"), htmlShell)
  
  // Copy favicon if it exists
  const faviconPath = path.join(path.dirname(pagesDir), "favicon.ico")
  if (fs.existsSync(faviconPath)) {
    fs.copyFileSync(faviconPath, path.join(outDir, "favicon.ico"))
  }
  
  console.log(`[Zenith Build] Successfully built ${compiledPages.length} page(s)`)
  console.log(`[Zenith Build] Output: ${outDir}/index.html`)
  
  // Log route manifest
  console.log("\n[Zenith Build] Route Manifest:")
  for (const page of compiledPages) {
    console.log(`  ${page.routePath.padEnd(25)} → ${path.relative(pagesDir, page.filePath)} (score: ${page.score})`)
  }
}

/**
 * Watch mode for development (future)
 */
export function watchSPA(_options: SPABuildOptions): void {
  // TODO: Implement file watching
  console.log("[Zenith Build] Watch mode not yet implemented")
}

