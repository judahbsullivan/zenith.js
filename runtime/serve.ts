/**
 * Zenith Development Server
 * 
 * SPA-compatible server that:
 * - Serves static assets directly (js, css, ico, images)
 * - Serves index.html for all other routes (SPA fallback)
 * 
 * This enables client-side routing to work on:
 * - Direct URL entry
 * - Hard refresh
 * - Back/forward navigation
 */

import { serve } from "bun"
import path from "path"

const distDir = path.resolve(import.meta.dir, "..", "app", "dist")

// File extensions that should be served as static assets
const STATIC_EXTENSIONS = new Set([
  ".js",
  ".css",
  ".ico",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".json",
  ".map"
])

serve({
  port: 3000,
  
  async fetch(req) {
    const url = new URL(req.url)
    const pathname = url.pathname
    
    // Get file extension
    const ext = path.extname(pathname).toLowerCase()
    
    // Check if this is a static asset request
    if (STATIC_EXTENSIONS.has(ext)) {
      const filePath = path.join(distDir, pathname)
      const file = Bun.file(filePath)
      
      // Check if file exists
      if (await file.exists()) {
        return new Response(file)
      }
      
      // Static file not found
      return new Response("Not found", { status: 404 })
    }
    
    // For all other routes, serve index.html (SPA fallback)
    const indexPath = path.join(distDir, "index.html")
    const indexFile = Bun.file(indexPath)
    
    if (await indexFile.exists()) {
      return new Response(indexFile, {
        headers: {
          "Content-Type": "text/html; charset=utf-8"
        }
      })
    }
    
    // No index.html found - likely need to run build first
    return new Response(
      `<html>
        <head><title>Zenith - Build Required</title></head>
        <body style="font-family: system-ui; padding: 2rem; text-align: center;">
          <h1>Build Required</h1>
          <p>Run <code>bun runtime/build.ts</code> first to compile the pages.</p>
        </body>
      </html>`,
      { 
        status: 500,
        headers: { "Content-Type": "text/html; charset=utf-8" }
      }
    )
  }
})

console.log("🚀 Zenith dev server running at http://localhost:3000")
console.log("   SPA mode: All routes serve index.html")

