/**
 * Zenith Ref - Mutable Reference Container
 * 
 * A ref is a mutable container that does NOT trigger reactivity.
 * It's useful for:
 * - Storing DOM element references
 * - Imperative escape hatches
 * - Values that change but shouldn't trigger re-renders
 * 
 * Features:
 * - Mutable `.current` property
 * - Does NOT track dependencies
 * - Does NOT trigger effects
 * - Persists across effect re-runs
 * 
 * @example
 * ```ts
 * // DOM reference
 * const inputRef = zenRef<HTMLInputElement>()
 * 
 * // Later, after mount
 * inputRef.current = document.querySelector('input')
 * inputRef.current?.focus()
 * 
 * // Mutable value that doesn't trigger reactivity
 * const previousValue = zenRef(0)
 * previousValue.current = count() // No effect triggered
 * ```
 */

/**
 * Ref interface - mutable container with .current
 */
export interface Ref<T> {
  /** The current value */
  current: T
}

/**
 * Create a mutable reference container
 * 
 * @param initialValue - The initial value (optional, defaults to undefined)
 * @returns A ref object with a mutable .current property
 */
export function zenRef<T>(): Ref<T | undefined>
export function zenRef<T>(initialValue: T): Ref<T>
export function zenRef<T>(initialValue?: T): Ref<T | undefined> {
  return {
    current: initialValue
  }
}

