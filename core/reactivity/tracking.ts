/**
 * Zenith Reactivity Tracking System
 * 
 * This module provides the core dependency tracking mechanism used by
 * signals, effects, and memos. It uses a stack-based approach to track
 * which reactive values are accessed during effect/memo execution.
 * 
 * Key concepts:
 * - Subscriber: A function that should be called when a dependency changes
 * - Tracking context: The currently executing effect/memo that should collect dependencies
 * - Dependency: A reactive value that an effect/memo depends on
 */

/**
 * A subscriber is a function that gets called when a reactive value changes
 */
export type Subscriber = () => void

/**
 * Tracking context - represents an effect or memo that is collecting dependencies
 */
export interface TrackingContext {
  /** The function to call when dependencies change */
  execute: Subscriber
  /** Set of dependency subscriber sets this context is registered with */
  dependencies: Set<Set<Subscriber>>
}

/**
 * Stack of currently executing tracking contexts
 * When an effect runs, it pushes itself onto this stack.
 * When a signal is read, it registers the top of the stack as a subscriber.
 */
const trackingStack: TrackingContext[] = []

/**
 * Flag to disable tracking (used by zenUntrack)
 */
let trackingDisabled = false

/**
 * Batch depth counter - when > 0, effect execution is deferred
 */
let batchDepth = 0

/**
 * Queue of effects to run after batch completes
 */
const pendingEffects: Set<Subscriber> = new Set()

/**
 * Get the current tracking context (if any)
 */
export function getCurrentContext(): TrackingContext | undefined {
  if (trackingDisabled) return undefined
  return trackingStack[trackingStack.length - 1]
}

/**
 * Push a new tracking context onto the stack
 */
export function pushContext(context: TrackingContext): void {
  trackingStack.push(context)
}

/**
 * Pop the current tracking context from the stack
 */
export function popContext(): TrackingContext | undefined {
  return trackingStack.pop()
}

/**
 * Track a dependency - called when a reactive value is read
 * 
 * @param subscribers - The subscriber set of the reactive value being read
 */
export function trackDependency(subscribers: Set<Subscriber>): void {
  const context = getCurrentContext()
  
  if (context) {
    // Register this effect as a subscriber to the signal
    subscribers.add(context.execute)
    // Track that this effect depends on this signal
    context.dependencies.add(subscribers)
  }
}

/**
 * Notify subscribers that a reactive value has changed
 * 
 * @param subscribers - The subscriber set to notify
 */
export function notifySubscribers(subscribers: Set<Subscriber>): void {
  // Copy subscribers to avoid issues if the set is modified during iteration
  const toNotify = [...subscribers]
  
  for (const subscriber of toNotify) {
    if (batchDepth > 0) {
      // Batching - defer effect execution
      pendingEffects.add(subscriber)
    } else {
      // Execute immediately
      subscriber()
    }
  }
}

/**
 * Clean up a tracking context - remove it from all dependency sets
 * 
 * @param context - The context to clean up
 */
export function cleanupContext(context: TrackingContext): void {
  for (const deps of context.dependencies) {
    deps.delete(context.execute)
  }
  context.dependencies.clear()
}

/**
 * Run a function without tracking dependencies
 * 
 * @param fn - The function to run
 * @returns The return value of the function
 */
export function runUntracked<T>(fn: () => T): T {
  const wasDisabled = trackingDisabled
  trackingDisabled = true
  try {
    return fn()
  } finally {
    trackingDisabled = wasDisabled
  }
}

/**
 * Start a batch - defer effect execution until batch ends
 */
export function startBatch(): void {
  batchDepth++
}

/**
 * End a batch - run all pending effects
 */
export function endBatch(): void {
  batchDepth--
  
  if (batchDepth === 0 && pendingEffects.size > 0) {
    // Run all pending effects
    const effects = [...pendingEffects]
    pendingEffects.clear()
    
    for (const effect of effects) {
      effect()
    }
  }
}

/**
 * Check if currently inside a batch
 */
export function isBatching(): boolean {
  return batchDepth > 0
}

