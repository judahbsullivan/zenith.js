/**
 * Zenith Memo - Computed/Derived Value
 * 
 * A memo is a lazily-evaluated, cached computation that automatically
 * tracks its dependencies and only recomputes when those dependencies change.
 * 
 * Features:
 * - Lazy evaluation (only computes when read)
 * - Automatic dependency tracking
 * - Cached value until dependencies change
 * - Read-only (no setter)
 * 
 * @example
 * ```ts
 * const firstName = zenSignal('John')
 * const lastName = zenSignal('Doe')
 * 
 * // Memo computes full name, tracks firstName and lastName
 * const fullName = zenMemo(() => `${firstName()} ${lastName()}`)
 * 
 * console.log(fullName()) // "John Doe"
 * 
 * firstName('Jane')
 * console.log(fullName()) // "Jane Doe" (recomputed)
 * console.log(fullName()) // "Jane Doe" (cached, no recomputation)
 * ```
 */

import {
  pushContext,
  popContext,
  cleanupContext,
  trackDependency,
  type TrackingContext,
  type Subscriber
} from './tracking'

/**
 * Memo interface - callable getter
 */
export interface Memo<T> {
  /** Get the current computed value */
  (): T
  /** Peek at cached value without tracking (may be stale) */
  peek(): T
}

/**
 * Memo state
 */
interface MemoState<T> {
  /** The computation function */
  fn: () => T
  /** Cached value */
  value: T | undefined
  /** Whether the cached value is valid */
  dirty: boolean
  /** Tracking context for dependency collection */
  context: TrackingContext
  /** Subscribers to this memo */
  subscribers: Set<Subscriber>
  /** Whether this is the first computation */
  initialized: boolean
}

/**
 * Create a memoized computed value
 * 
 * @param fn - The computation function
 * @returns A memo that can be read to get the computed value
 */
export function zenMemo<T>(fn: () => T): Memo<T> {
  const state: MemoState<T> = {
    fn,
    value: undefined,
    dirty: true,
    context: {
      execute: () => markDirty(state),
      dependencies: new Set()
    },
    subscribers: new Set(),
    initialized: false
  }
  
  function memo(): T {
    // Track that something is reading this memo
    trackDependency(state.subscribers)
    
    // Recompute if dirty
    if (state.dirty) {
      computeMemo(state)
    }
    
    return state.value as T
  }
  
  // Add peek method
  ;(memo as Memo<T>).peek = function(): T {
    // Return cached value without tracking or recomputing
    if (state.dirty && !state.initialized) {
      computeMemo(state)
    }
    return state.value as T
  }
  
  return memo as Memo<T>
}

/**
 * Compute the memo value, tracking dependencies
 */
function computeMemo<T>(state: MemoState<T>): void {
  // Clean up old dependencies
  cleanupContext(state.context)
  
  // Push this memo onto the tracking stack
  pushContext(state.context)
  
  try {
    // Compute new value
    state.value = state.fn()
    state.dirty = false
    state.initialized = true
  } finally {
    // Pop from tracking stack
    popContext()
  }
}

/**
 * Mark the memo as dirty (needs recomputation)
 * Called when a dependency changes
 */
function markDirty<T>(state: MemoState<T>): void {
  if (!state.dirty) {
    state.dirty = true
    
    // Notify any effects/memos that depend on this memo
    // Copy to avoid issues during iteration
    const subscribers = [...state.subscribers]
    for (const subscriber of subscribers) {
      subscriber()
    }
  }
}

