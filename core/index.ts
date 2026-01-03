/**
 * Zenith Core Runtime
 * 
 * This is the foundational layer of the Zenith framework, providing:
 * - Reactive primitives (signals, state, effects, memos)
 * - Lifecycle hooks (onMount, onUnmount)
 * 
 * Design principles:
 * - Auto-tracked reactivity (no dependency arrays)
 * - No VDOM or render loops
 * - Runtime-agnostic (works in browser, SSR, tests)
 * - Hybrid naming: internal `zen*` + public clean names
 * 
 * @example
 * ```ts
 * // Using clean names (recommended for application code)
 * import { signal, effect, onMount } from 'zenith/core'
 * 
 * const count = signal(0)
 * 
 * effect(() => {
 *   console.log('Count:', count())
 * })
 * 
 * onMount(() => {
 *   console.log('Mounted!')
 * })
 * ```
 * 
 * @example
 * ```ts
 * // Using explicit zen* names (for library/internal code)
 * import { zenSignal, zenEffect, zenOnMount } from 'zenith/core'
 * 
 * const count = zenSignal(0)
 * zenEffect(() => console.log(count()))
 * zenOnMount(() => console.log('Ready'))
 * ```
 */

// ============================================
// Reactivity Primitives
// ============================================

// Explicit zen* exports (internal naming)
export {
  zenSignal,
  zenState,
  zenEffect,
  zenMemo,
  zenRef,
  zenBatch,
  zenUntrack
} from './reactivity'

// Types
export type {
  Signal,
  Memo,
  Ref,
  EffectFn,
  DisposeFn,
  Subscriber,
  TrackingContext
} from './reactivity'

// Clean name exports (public DX)
export {
  signal,
  state,
  effect,
  memo,
  ref,
  batch,
  untrack
} from './reactivity'

// Internal tracking utilities (advanced use)
export {
  trackDependency,
  notifySubscribers,
  getCurrentContext,
  pushContext,
  popContext,
  cleanupContext,
  runUntracked,
  startBatch,
  endBatch,
  isBatching
} from './reactivity'

// ============================================
// Lifecycle Hooks
// ============================================

// Explicit zen* exports (internal naming)
export {
  zenOnMount,
  zenOnUnmount
} from './lifecycle'

// Clean name exports (public DX)
export {
  onMount,
  onUnmount
} from './lifecycle'

// Types
export type {
  MountCallback,
  UnmountCallback
} from './lifecycle'

// Internal lifecycle utilities (for component system)
export {
  triggerMount,
  triggerUnmount,
  executeUnmountCallbacks,
  getIsMounted,
  getUnmountCallbackCount,
  resetMountState,
  resetUnmountState
} from './lifecycle'

