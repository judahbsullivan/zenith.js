/**
 * Zenith OnUnmount - Pre-Unmount Lifecycle Hook
 * 
 * Registers a cleanup callback to run before a component is disposed.
 * Useful for cleaning up subscriptions, timers, event listeners, etc.
 * 
 * Features:
 * - Runs before component is removed from DOM
 * - Can register multiple callbacks
 * - Callbacks run in registration order
 * 
 * @example
 * ```ts
 * zenOnUnmount(() => {
 *   console.log('Cleaning up...')
 *   subscription.unsubscribe()
 *   clearInterval(timerId)
 * })
 * ```
 * 
 * Note: This hook registers callbacks that will be executed by the
 * component lifecycle system when the component is disposed.
 */

/**
 * Unmount callback type
 */
export type UnmountCallback = () => void

/**
 * Queue of registered unmount callbacks
 */
const unmountCallbacks: Set<UnmountCallback> = new Set()

/**
 * Register a callback to run before component unmount
 * 
 * @param callback - Function to run before unmount
 * @returns Dispose function to cancel the unmount callback
 */
export function zenOnUnmount(callback: UnmountCallback): () => void {
  unmountCallbacks.add(callback)
  
  // Return dispose function
  return () => {
    unmountCallbacks.delete(callback)
  }
}

/**
 * Execute all unmount callbacks
 * Called by the component lifecycle system before disposal
 * 
 * @internal
 */
export function executeUnmountCallbacks(): void {
  // Execute in registration order
  for (const callback of unmountCallbacks) {
    try {
      callback()
    } catch (error) {
      console.error('[Zenith] Error in onUnmount callback:', error)
    }
  }
  
  // Clear all callbacks after execution
  unmountCallbacks.clear()
}

/**
 * Get count of registered unmount callbacks
 * Useful for testing
 * 
 * @internal
 */
export function getUnmountCallbackCount(): number {
  return unmountCallbacks.size
}

/**
 * Reset unmount state - for testing purposes
 * 
 * @internal
 */
export function resetUnmountState(): void {
  unmountCallbacks.clear()
}

