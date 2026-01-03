/**
 * Zenith Signal - Atomic Reactive Value
 * 
 * A signal is the most basic reactive primitive. It holds a single value
 * and notifies subscribers when the value changes.
 * 
 * Features:
 * - Getter/setter model
 * - Automatic dependency tracking
 * - Fine-grained reactivity (no component re-rendering)
 * 
 * @example
 * ```ts
 * const count = zenSignal(0)
 * 
 * // Read value
 * console.log(count()) // 0
 * 
 * // Write value
 * count(1)
 * 
 * // Or use .value
 * count.value = 2
 * console.log(count.value) // 2
 * ```
 */

import { trackDependency, notifySubscribers, type Subscriber } from './tracking'

/**
 * Signal interface - callable getter/setter with .value accessor
 */
export interface Signal<T> {
  /** Get the current value (also tracks dependency) */
  (): T
  /** Set a new value */
  (value: T): void
  /** Get/set value via property */
  value: T
  /** Peek at value without tracking */
  peek(): T
  /** Subscribe to changes */
  subscribe(fn: (value: T) => void): () => void
}

/**
 * Internal signal state
 */
interface SignalState<T> {
  value: T
  subscribers: Set<Subscriber>
}

/**
 * Create a reactive signal
 * 
 * @param initialValue - The initial value of the signal
 * @returns A signal that can be read and written
 */
export function zenSignal<T>(initialValue: T): Signal<T> {
  const state: SignalState<T> = {
    value: initialValue,
    subscribers: new Set()
  }

  // The signal function - acts as both getter and setter
  function signal(newValue?: T): T {
    if (arguments.length === 0) {
      // Getter - track dependency and return value
      trackDependency(state.subscribers)
      return state.value
    } else {
      // Setter - update value and notify
      const oldValue = state.value
      state.value = newValue as T
      
      if (!Object.is(oldValue, newValue)) {
        notifySubscribers(state.subscribers)
      }
      
      return state.value
    }
  }

  // Add .value accessor
  Object.defineProperty(signal, 'value', {
    get() {
      trackDependency(state.subscribers)
      return state.value
    },
    set(newValue: T) {
      const oldValue = state.value
      state.value = newValue
      
      if (!Object.is(oldValue, newValue)) {
        notifySubscribers(state.subscribers)
      }
    },
    enumerable: true,
    configurable: false
  })

  // Add .peek() - read without tracking
  ;(signal as Signal<T>).peek = function(): T {
    return state.value
  }

  // Add .subscribe() - manual subscription
  ;(signal as Signal<T>).subscribe = function(fn: (value: T) => void): () => void {
    const subscriber: Subscriber = () => fn(state.value)
    state.subscribers.add(subscriber)
    
    // Return unsubscribe function
    return () => {
      state.subscribers.delete(subscriber)
    }
  }

  return signal as Signal<T>
}

