/**
 * Zenith Reactivity System
 * 
 * This module exports all reactive primitives for the Zenith framework.
 * 
 * Exports both explicit `zen*` names (internal) and clean aliases (public DX).
 */

// Core primitives - explicit names
import { zenSignal as _zenSignal, type Signal } from './zen-signal'
import { zenState as _zenState } from './zen-state'
import { zenEffect as _zenEffect, type EffectFn, type DisposeFn } from './zen-effect'
import { zenMemo as _zenMemo, type Memo } from './zen-memo'
import { zenRef as _zenRef, type Ref } from './zen-ref'
import { zenBatch as _zenBatch } from './zen-batch'
import { zenUntrack as _zenUntrack } from './zen-untrack'

// Re-export with explicit names
export const zenSignal = _zenSignal
export const zenState = _zenState
export const zenEffect = _zenEffect
export const zenMemo = _zenMemo
export const zenRef = _zenRef
export const zenBatch = _zenBatch
export const zenUntrack = _zenUntrack

// Re-export types
export type { Signal, Memo, Ref, EffectFn, DisposeFn }

// Internal tracking utilities (for advanced use)
export {
  type Subscriber,
  type TrackingContext,
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
} from './tracking'

// Public DX aliases - clean names
export const signal = _zenSignal
export const state = _zenState
export const effect = _zenEffect
export const memo = _zenMemo
export const ref = _zenRef
export const batch = _zenBatch
export const untrack = _zenUntrack

