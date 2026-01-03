/**
 * Zenith Untrack - Escape Dependency Tracking
 * 
 * Allows reading reactive values without creating a dependency.
 * Useful when you need to read a value inside an effect but don't
 * want the effect to re-run when that value changes.
 * 
 * Features:
 * - Disables dependency tracking within the callback
 * - Returns the callback's return value
 * - Can be nested
 * 
 * @example
 * ```ts
 * const count = zenSignal(0)
 * const multiplier = zenSignal(2)
 * 
 * zenEffect(() => {
 *   // This creates a dependency on 'count'
 *   const c = count()
 *   
 *   // This does NOT create a dependency on 'multiplier'
 *   const m = zenUntrack(() => multiplier())
 *   
 *   console.log(c * m)
 * })
 * 
 * count(5)       // Effect re-runs
 * multiplier(3)  // Effect does NOT re-run
 * ```
 */

import { runUntracked } from './tracking'

/**
 * Execute a function without tracking dependencies
 * 
 * @param fn - The function to execute
 * @returns The return value of the function
 */
export function zenUntrack<T>(fn: () => T): T {
  return runUntracked(fn)
}

