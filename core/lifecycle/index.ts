/**
 * Zenith Lifecycle Hooks
 * 
 * This module exports lifecycle hooks for component mount/unmount events.
 * These are effect wrappers that integrate with the component lifecycle system.
 * 
 * Exports both explicit `zen*` names (internal) and clean aliases (public DX).
 */

// Import lifecycle hooks
import {
  zenOnMount as _zenOnMount,
  triggerMount,
  triggerUnmount,
  getIsMounted,
  resetMountState,
  type MountCallback
} from './zen-mount'

import {
  zenOnUnmount as _zenOnUnmount,
  executeUnmountCallbacks,
  getUnmountCallbackCount,
  resetUnmountState,
  type UnmountCallback
} from './zen-unmount'

// Re-export with explicit names
export const zenOnMount = _zenOnMount
export const zenOnUnmount = _zenOnUnmount

// Re-export utilities
export {
  triggerMount,
  triggerUnmount,
  getIsMounted,
  resetMountState,
  executeUnmountCallbacks,
  getUnmountCallbackCount,
  resetUnmountState
}

// Re-export types
export type { MountCallback, UnmountCallback }

// Public DX aliases - clean names
export const onMount = _zenOnMount
export const onUnmount = _zenOnUnmount

