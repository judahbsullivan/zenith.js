/**
 * Zenith Effect - Auto-Tracked Side Effect
 * 
 * Effects are functions that automatically track their reactive dependencies
 * and re-run when those dependencies change. They are the bridge between
 * reactive state and side effects (DOM updates, logging, API calls, etc.)
 * 
 * Features:
 * - Automatic dependency tracking (no dependency arrays)
 * - Runs immediately on creation
 * - Re-runs when dependencies change
 * - Supports cleanup functions
 * - Can be manually disposed
 * 
 * @example
 * ```ts
 * const count = zenSignal(0)
 * 
 * // Effect runs immediately, then re-runs when count changes
 * const dispose = zenEffect(() => {
 *   console.log('Count:', count())
 *   
 *   // Optional cleanup - runs before next execution or on dispose
 *   return () => {
 *     console.log('Cleanup')
 *   }
 * })
 * 
 * count(1) // Logs: "Cleanup", then "Count: 1"
 * 
 * dispose() // Cleanup and stop watching
 * ```
 */

import {
  pushContext,
  popContext,
  cleanupContext,
  type TrackingContext
} from './tracking'

/**
 * Effect function type - can optionally return a cleanup function
 */
export type EffectFn = () => void | (() => void)

/**
 * Dispose function - call to stop the effect
 */
export type DisposeFn = () => void

/**
 * Effect state
 */
interface EffectState {
  /** The effect function */
  fn: EffectFn
  /** Current cleanup function (if any) */
  cleanup: (() => void) | null
  /** Tracking context for dependency collection */
  context: TrackingContext
  /** Whether the effect has been disposed */
  disposed: boolean
}

/**
 * Create an auto-tracked side effect
 * 
 * @param fn - The effect function to run
 * @returns A dispose function to stop the effect
 */
export function zenEffect(fn: EffectFn): DisposeFn {
  const state: EffectState = {
    fn,
    cleanup: null,
    context: {
      execute: () => runEffect(state),
      dependencies: new Set()
    },
    disposed: false
  }
  
  // Run the effect immediately
  runEffect(state)
  
  // Return dispose function
  return () => disposeEffect(state)
}

/**
 * Run an effect, tracking dependencies
 */
function runEffect(state: EffectState): void {
  if (state.disposed) return
  
  // Run cleanup from previous execution
  if (state.cleanup) {
    state.cleanup()
    state.cleanup = null
  }
  
  // Clean up old dependencies
  cleanupContext(state.context)
  
  // Push this effect onto the tracking stack
  pushContext(state.context)
  
  try {
    // Run the effect function
    const result = state.fn()
    
    // Store cleanup if returned
    if (typeof result === 'function') {
      state.cleanup = result
    }
  } finally {
    // Pop from tracking stack
    popContext()
  }
}

/**
 * Dispose an effect - run cleanup and stop watching
 */
function disposeEffect(state: EffectState): void {
  if (state.disposed) return
  
  state.disposed = true
  
  // Run cleanup
  if (state.cleanup) {
    state.cleanup()
    state.cleanup = null
  }
  
  // Remove from all dependency sets
  cleanupContext(state.context)
}

