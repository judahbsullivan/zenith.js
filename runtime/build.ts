/**
 * Zenith App Build Script
 * 
 * Builds all pages into a single SPA with file-based routing.
 */

import { buildSPA } from "../compiler/spa-build"
import path from "path"

const appDir = path.resolve(import.meta.dir, "..", "app")

buildSPA({
  pagesDir: path.join(appDir, "pages"),
  outDir: path.join(appDir, "dist"),
  baseDir: appDir
})

