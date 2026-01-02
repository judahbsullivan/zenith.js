# File-Based Routing Runtime Fix

## Design Document for Zenith File-Based Routing Correctness

**Date:** January 2, 2026  
**Status:** Analysis Complete - Awaiting Implementation  
**Author:** Zenith Core Team

---

## 1. Problem Statement

### The Bug

When navigating to different routes (e.g., `/about`), the URL changes but the UI always renders `pages/index.zen`. Hard refresh also renders `index.zen` regardless of the URL path.

### Expected Behavior

- `/` should render `pages/index.zen`
- `/about` should render `pages/about.zen`
- Hard refresh should render the correct page for the current URL
- Back/forward navigation should update the rendered page

### Observed Behavior

- All routes render `pages/index.zen`
- URL may change but page content does not
- No mechanism exists to render different pages

---

## 2. Current Architecture

### 2.1 Build Process

**File: `playground/build.ts`**

```typescript
import { compile } from "../compiler"

compile("./playground/pages/index.zen", "./playground/dist")
```

**Critical Finding:** The build process is **hardcoded** to compile only `pages/index.zen`. No other pages are discovered or compiled.

### 2.2 Compiler Entry Point

**File: `compiler/index.ts`**

The `compile()` function accepts a single entry file path and outputs to a single directory. There is no concept of:
- Page discovery
- Route generation
- Multi-page compilation

### 2.3 Emit Process

**File: `compiler/emit.ts`**

```typescript
fs.writeFileSync(
  path.join(outDir, "index.html"),
  outputHTML
)
```

**Critical Finding:** The emit function **always** writes output to `index.html`. There is no mechanism to:
- Generate route-specific HTML files
- Create a manifest of routes
- Output multiple HTML files for multiple pages

### 2.4 Development Server

**File: `playground/serve.ts`**

```typescript
serve({
  port: 3000,
  fetch(req) {
    const url = new URL(req.url)
    const filePath =
      url.pathname === "/"
        ? "./playground/dist/index.html"
        : `./playground/dist${url.pathname}`

    try {
      const file = Bun.file(filePath)
      return new Response(file)
    } catch {
      return new Response("Not found", { status: 404 })
    }
  }
})
```

**Critical Finding:** The server is a simple static file server with no routing logic. It:
- Maps `/` to `dist/index.html`
- Maps other paths to literal file paths in `dist/`
- Has no SPA fallback
- Has no route matching
- Has no page resolution logic

### 2.5 Component/Layout Processing

**File: `compiler/component-process.ts`**

The component processor handles:
- Layout composition via `<Slot />`
- Component discovery from `components/` directory
- Layout discovery from `layouts/` directory

**Note:** This is working correctly and should not be modified.

### 2.6 Pages Directory Structure

```
playground/
├── pages/
│   └── index.zen      ← Only this file exists and is compiled
├── components/
│   ├── Button.zen
│   └── Link.zen
├── layouts/
│   └── Main.zen
└── dist/
    └── index.html     ← Only output file
```

---

## 3. Root Cause Analysis

### Primary Root Cause

**File-based routing was never implemented.** The system has:

1. **No page discovery** - `build.ts` hardcodes the entry point
2. **No route generation** - No mapping from file paths to URL patterns
3. **No multi-page compilation** - Compiler processes one file, emits one HTML
4. **No runtime router** - Server is a dumb static file server
5. **No page mounting logic** - No mechanism to switch rendered content

### Why Does This Happen?

| Step | Current Behavior | Expected Behavior |
|------|-----------------|-------------------|
| Build | Compiles only `index.zen` | Discovers all pages, compiles each |
| Emit | Outputs single `index.html` | Outputs HTML per route OR manifest |
| Serve | Maps `/` → `index.html`, others → 404 | Resolves routes to correct pages |
| Navigate | No client-side handling | Updates rendered page content |

### What is NOT the Problem

The following are working correctly:
- Component processing
- Layout composition  
- State management
- Event handling
- Style scoping

---

## 4. Correct Mental Model

### Route Resolution Flow

```
URL Pathname → Route Matcher → File Path → Page Component → Render
```

### Key Concepts

1. **Pattern** - The URL pattern used for matching (e.g., `/about`, `/blog/:id`)
2. **Pathname** - The actual browser URL path (e.g., `/about`, `/blog/123`)
3. **FilePath** - The source `.zen` file (e.g., `pages/about.zen`)
4. **Page Content** - The compiled HTML/JS/CSS for that page

### Route Generation Rules

| File Path | URL Pattern | Notes |
|-----------|-------------|-------|
| `pages/index.zen` | `/` | Index route |
| `pages/about.zen` | `/about` | Simple route |
| `pages/blog/index.zen` | `/blog` | Nested index |
| `pages/blog/[id].zen` | `/blog/:id` | Dynamic segment (future) |

### Source of Truth

- **Build time:** File system structure → Route manifest
- **Runtime:** URL pathname → Route lookup → Page render

---

## 5. Proposed Fix (Minimal)

### Approach: Static Multi-Page Generation

Generate a separate HTML file for each page at build time. The server serves the correct HTML file based on the URL.

### 5.1 Files to Modify

| File | Change Description |
|------|-------------------|
| `playground/build.ts` | Discover all pages, compile each |
| `compiler/emit.ts` | Accept output filename parameter |
| `playground/serve.ts` | SPA fallback for client navigation |

### 5.2 Detailed Changes

#### `playground/build.ts`

**Before:**
```typescript
compile("./playground/pages/index.zen", "./playground/dist")
```

**After:**
```typescript
import fs from "fs"
import path from "path"
import { compile } from "../compiler"

const pagesDir = "./playground/pages"
const outDir = "./playground/dist"

// Discover all .zen files in pages/
function discoverPages(dir: string, baseDir: string = dir): string[] {
  const pages: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      pages.push(...discoverPages(fullPath, baseDir))
    } else if (entry.isFile() && entry.name.endsWith(".zen")) {
      pages.push(fullPath)
    }
  }
  return pages
}

// Convert file path to route pattern
function filePathToRoute(filePath: string, pagesDir: string): string {
  const relative = path.relative(pagesDir, filePath)
  const withoutExt = relative.replace(/\.zen$/, "")
  
  // index.zen -> /
  // about.zen -> /about
  // blog/index.zen -> /blog
  // blog/post.zen -> /blog/post
  if (withoutExt === "index") return "/"
  if (withoutExt.endsWith("/index")) {
    return "/" + withoutExt.slice(0, -6)
  }
  return "/" + withoutExt
}

// Compile all pages
const pages = discoverPages(pagesDir)

for (const pagePath of pages) {
  const route = filePathToRoute(pagePath, pagesDir)
  compile(pagePath, outDir, route)
}
```

#### `compiler/emit.ts`

**Before:**
```typescript
export function emit(
  outDir: string,
  html: string,
  scripts: string[],
  styles: string[],
  entryPath?: string
) {
  // ...
  fs.writeFileSync(
    path.join(outDir, "index.html"),
    outputHTML
  )
}
```

**After:**
```typescript
export function emit(
  outDir: string,
  html: string,
  scripts: string[],
  styles: string[],
  entryPath?: string,
  route: string = "/"  // NEW PARAMETER
) {
  // ...
  
  // Determine output filename from route
  // / -> index.html
  // /about -> about.html
  // /blog -> blog/index.html
  let outputFile: string
  if (route === "/") {
    outputFile = "index.html"
  } else {
    // /about -> about.html
    // /blog/post -> blog/post.html
    outputFile = route.slice(1) + ".html"
  }
  
  // Ensure directory exists for nested routes
  const outputPath = path.join(outDir, outputFile)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  
  fs.writeFileSync(outputPath, outputHTML)
}
```

#### `compiler/index.ts`

**Before:**
```typescript
export function compile(entry: string, outDir = "dist") {
  // ...
  emit(outDir, html, scriptsWithRuntime, styles, entry)
}
```

**After:**
```typescript
export function compile(entry: string, outDir = "dist", route = "/") {
  // ...
  emit(outDir, html, scriptsWithRuntime, styles, entry, route)
}
```

#### `playground/serve.ts`

**Before:**
```typescript
const filePath =
  url.pathname === "/"
    ? "./playground/dist/index.html"
    : `./playground/dist${url.pathname}`
```

**After:**
```typescript
const url = new URL(req.url)
let filePath: string

// Static assets (JS, CSS, ICO, etc.)
if (url.pathname.match(/\.(js|css|ico|png|jpg|svg)$/)) {
  filePath = `./playground/dist${url.pathname}`
} else {
  // HTML pages - resolve route to HTML file
  if (url.pathname === "/") {
    filePath = "./playground/dist/index.html"
  } else {
    // /about -> about.html
    // /blog/post -> blog/post.html
    const htmlPath = `./playground/dist${url.pathname}.html`
    if (fs.existsSync(htmlPath)) {
      filePath = htmlPath
    } else {
      // Try index.html in that directory (for /blog -> blog/index.html)
      const indexPath = `./playground/dist${url.pathname}/index.html`
      if (fs.existsSync(indexPath)) {
        filePath = indexPath
      } else {
        // SPA fallback - serve index.html for client-side routing
        filePath = "./playground/dist/index.html"
      }
    }
  }
}
```

### 5.3 Data Flow After Fix

```
Build Time:
  pages/index.zen → compile → dist/index.html
  pages/about.zen → compile → dist/about.html
  pages/blog/index.zen → compile → dist/blog/index.html

Runtime:
  GET /        → dist/index.html
  GET /about   → dist/about.html  
  GET /blog    → dist/blog/index.html
```

---

## 6. Non-Goals

This fix explicitly does **NOT** include:

- ❌ **ZenLink implementation** - Navigation component is Phase 2
- ❌ **Compiler changes** - Only emit.ts route parameter addition
- ❌ **Component system changes** - Component processing unchanged
- ❌ **Layout refactor** - Layout composition unchanged
- ❌ **New abstractions** - No new classes/patterns introduced
- ❌ **Client-side SPA router** - Static multi-page for now
- ❌ **Dynamic routes** - `[id].zen` syntax is Phase 3
- ❌ **Route manifest** - Not needed for static approach

---

## 7. Testing Plan

### Manual Testing

1. Create `pages/about.zen` with distinct content
2. Run build
3. Verify `dist/about.html` exists
4. Navigate to `http://localhost:3000/about`
5. Verify about page content renders
6. Hard refresh - verify correct page renders
7. Navigate to `/` - verify index page renders
8. Test 404 behavior for non-existent routes

### Expected Results After Fix

| Test | Expected Result |
|------|----------------|
| `GET /` | Renders index.zen content |
| `GET /about` | Renders about.zen content |
| Hard refresh `/about` | Renders about.zen content |
| `GET /nonexistent` | SPA fallback OR 404 |
| Layout shared | Both pages use Main layout |
| Styles scoped | Each page has correct styles |

---

## 8. Risks and Mitigations

### Risk: Breaking Existing Functionality

**Mitigation:** Changes are additive. The compiler signature adds optional parameter with default value.

### Risk: Layout Breaks

**Mitigation:** Layout composition happens before emit. Route parameter doesn't affect composition.

### Risk: Script/Style Paths

**Mitigation:** Scripts and styles use relative paths (`./script-0.js`). May need adjustment for nested routes.

**Nested Route Consideration:**
For `/blog/post`, if HTML is at `dist/blog/post.html`, relative paths like `./script-0.js` would resolve to `dist/blog/script-0.js`. 

**Potential Solution:** Output scripts/styles to route-specific directories OR use absolute paths.

---

## 9. Future Considerations (Not In Scope)

1. **Client-side navigation** - ZenLink will handle SPA-style navigation
2. **Dynamic routes** - `pages/blog/[id].zen` pattern support
3. **Route manifest** - JSON file mapping routes to metadata
4. **Prefetching** - Preload linked pages for faster navigation
5. **Shared layouts** - Persist layout state across navigation

---

## 10. Conclusion

The root cause of the routing bug is simple: **file-based routing was never implemented**. The system only compiles `index.zen` and outputs `index.html`.

The fix is straightforward:
1. Discover all pages at build time
2. Compile each page to its own HTML file
3. Serve the correct HTML based on URL path

This minimal fix enables basic file-based routing without introducing unnecessary complexity. It provides a foundation for future enhancements (ZenLink, dynamic routes) while solving the immediate correctness issue.

---

## Appendix: File Reference

### Files Analyzed

| File | Purpose | Lines |
|------|---------|-------|
| `playground/build.ts` | Build entry point | 3 |
| `playground/serve.ts` | Dev server | 22 |
| `compiler/index.ts` | Compilation orchestration | 57 |
| `compiler/emit.ts` | HTML/JS/CSS output | 73 |
| `compiler/component-process.ts` | Component/layout processing | 1134 |
| `compiler/component.ts` | Component discovery | 301 |
| `compiler/parse.ts` | Zen file parsing | 149 |
| `compiler/split.ts` | HTML/script/style splitting | 426 |

### Key Code Locations

- **Hardcoded entry:** `build.ts:3`
- **Hardcoded output:** `emit.ts:55`
- **Server routing:** `serve.ts:7-10`
- **Page discovery pattern:** `component.ts:165-232` (for reference)
