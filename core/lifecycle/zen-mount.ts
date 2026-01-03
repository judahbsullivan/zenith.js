/**
 * Zenith OnMount - Post-Mount Lifecycle Hook
 * 
 * Registers a callback to run after a component's DOM is inserted.
 * This is an effect wrapper that defers execution until the mount phase.
 * 
 * Features:
 * - Runs after DOM is available
 * - Only runs once per mount
 * - Supports cleanup function return
 * - Works with component lifecycle system
 * 
 * @example
 * ```ts
 * zenOnMount(() => {
 *   console.log('Component mounted!')
 *   const el = document.querySelector('.my-element')
 *   
 *   // Optional cleanup - runs on unmount
 *   return () => {
 *     console.log('Component will unmount')
 *   }
 * })
 * ```
 * 
 * Note: This hook registers callbacks that will be executed by the
 * component lifecycle system. If no mount scheduler is active,
 * callbacks are queued for later execution.
 */

/**
 * Mount callback type - can optionally return a cleanup function
 */
export type MountCallback = () => void | (() => void)

/**
 * Mount hook state
 */
interface MountHookState {
  callback: MountCallback
  cleanup: (() => void) | null
  mounted: boolean
}

/**
 * Queue of pending mount callbacks
 * These are registered but not yet executed because mount hasn't occurred
 */
const pendingMountCallbacks: MountHookState[] = []

/**
 * Currently active mount hooks (for cleanup on unmount)
 */
const activeMountHooks: Set<MountHookState> = new Set()

/**
 * Flag indicating whether we're in a mounted state
 * This is controlled by the component lifecycle system
 */
let isMounted = false

/**
 * Register a callback to run after component mount
 * 
 * @param callback - Function to run after mount (can return cleanup function)
 * @returns Dispose function to cancel the mount callback
 */
export function zenOnMount(callback: MountCallback): () => void {
  const state: MountHookState = {
    callback,
    cleanup: null,
    mounted: false
  }
  
  if (isMounted) {
    // Already mounted - run immediately
    executeMountCallback(state)
  } else {
    // Queue for later execution
    pendingMountCallbacks.push(state)
  }
  
  activeMountHooks.add(state)
  
  // Return dispose function
  return () => {
    // Remove from pending if not yet executed
    const pendingIndex = pendingMountCallbacks.indexOf(state)
    if (pendingIndex !== -1) {
      pendingMountCallbacks.splice(pendingIndex, 1)
    }
    
    // Run cleanup if already mounted
    if (state.mounted && state.cleanup) {
      state.cleanup()
      state.cleanup = null
    }
    
    activeMountHooks.delete(state)
  }
}

/**
 * Execute a mount callback
 */
function executeMountCallback(state: MountHookState): void {
  if (state.mounted) return
  
  state.mounted = true
  
  try {
    const result = state.callback()
    
    if (typeof result === 'function') {
      state.cleanup = result
    }
  } catch (error) {
    console.error('[Zenith] Error in onMount callback:', error)
  }
}

/**
 * Trigger mount phase - called by component lifecycle system
 * Executes all pending mount callbacks
 * 
 * @internal
 */
export function triggerMount(): void {
  isMounted = true
  
  // Execute all pending callbacks
  const callbacks = [...pendingMountCallbacks]
  pendingMountCallbacks.length = 0
  
  for (const state of callbacks) {
    executeMountCallback(state)
  }
}

/**
 * Trigger unmount phase - called by component lifecycle system
 * Runs cleanup functions for all active mount hooks
 * 
 * @internal
 */
export function triggerUnmount(): void {
  isMounted = false
  
  // Run all cleanup functions
  for (const state of activeMountHooks) {
    if (state.cleanup) {
      try {
        state.cleanup()
      } catch (error) {
        console.error('[Zenith] Error in onMount cleanup:', error)
      }
      state.cleanup = null
    }
    state.mounted = false
  }
}

/**
 * Check if currently in mounted state
 * 
 * @internal
 */
export function getIsMounted(): boolean {
  return isMounted
}

/**
 * Reset mount state - for testing purposes
 * 
 * @internal
 */
export function resetMountState(): void {
  isMounted = false
  pendingMountCallbacks.length = 0
  activeMountHooks.clear()
}

