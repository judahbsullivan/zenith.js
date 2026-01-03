/**
 * Zenith State - Deep Reactive Object
 * 
 * Creates a deeply reactive object using Proxy. Any property access
 * is tracked, and any mutation triggers effects.
 * 
 * Features:
 * - Deep reactivity via nested Proxies
 * - Automatic dependency tracking on property access
 * - Triggers effects on property mutation
 * 
 * @example
 * ```ts
 * const user = zenState({
 *   name: 'John',
 *   address: {
 *     city: 'NYC'
 *   }
 * })
 * 
 * // Access triggers tracking
 * console.log(user.name)
 * 
 * // Mutation triggers effects
 * user.name = 'Jane'
 * user.address.city = 'LA'
 * ```
 */

import { trackDependency, notifySubscribers, type Subscriber } from './tracking'

/**
 * WeakMap to store proxy targets and their subscriber maps
 * Key: target object
 * Value: Map of property key -> subscriber set
 */
const proxySubscribers = new WeakMap<object, Map<string | symbol, Set<Subscriber>>>()

/**
 * WeakMap to store original objects and their proxies
 * Prevents creating multiple proxies for the same object
 */
const proxyCache = new WeakMap<object, object>()

/**
 * Get or create subscriber set for a property
 */
function getPropertySubscribers(target: object, key: string | symbol): Set<Subscriber> {
  let propertyMap = proxySubscribers.get(target)
  
  if (!propertyMap) {
    propertyMap = new Map()
    proxySubscribers.set(target, propertyMap)
  }
  
  let subscribers = propertyMap.get(key)
  
  if (!subscribers) {
    subscribers = new Set()
    propertyMap.set(key, subscribers)
  }
  
  return subscribers
}

/**
 * Check if a value should be wrapped in a proxy
 */
function shouldProxy(value: unknown): value is object {
  if (value === null || typeof value !== 'object') {
    return false
  }
  
  // Don't proxy special objects
  if (value instanceof Date || 
      value instanceof RegExp || 
      value instanceof Map || 
      value instanceof Set ||
      value instanceof WeakMap ||
      value instanceof WeakSet ||
      value instanceof Promise ||
      ArrayBuffer.isView(value)) {
    return false
  }
  
  return true
}

/**
 * Create a reactive proxy for an object
 */
function createReactiveProxy<T extends object>(target: T): T {
  // Check cache first
  const cached = proxyCache.get(target)
  if (cached) {
    return cached as T
  }
  
  const proxy = new Proxy(target, {
    get(target, key, receiver) {
      // Track dependency
      const subscribers = getPropertySubscribers(target, key)
      trackDependency(subscribers)
      
      const value = Reflect.get(target, key, receiver)
      
      // Recursively proxy nested objects
      if (shouldProxy(value)) {
        return createReactiveProxy(value)
      }
      
      return value
    },
    
    set(target, key, value, receiver) {
      const oldValue = Reflect.get(target, key, receiver)
      
      // Unwrap proxies before storing
      const rawValue = value
      
      const result = Reflect.set(target, key, rawValue, receiver)
      
      // Only notify if value actually changed
      if (!Object.is(oldValue, rawValue)) {
        const subscribers = getPropertySubscribers(target, key)
        notifySubscribers(subscribers)
      }
      
      return result
    },
    
    deleteProperty(target, key) {
      const hadKey = Reflect.has(target, key)
      const result = Reflect.deleteProperty(target, key)
      
      if (hadKey && result) {
        const subscribers = getPropertySubscribers(target, key)
        notifySubscribers(subscribers)
      }
      
      return result
    },
    
    has(target, key) {
      // Track dependency for 'in' operator
      const subscribers = getPropertySubscribers(target, key)
      trackDependency(subscribers)
      
      return Reflect.has(target, key)
    },
    
    ownKeys(target) {
      // Track a special 'keys' dependency for iteration
      const subscribers = getPropertySubscribers(target, Symbol.for('zen:keys'))
      trackDependency(subscribers)
      
      return Reflect.ownKeys(target)
    }
  })
  
  // Cache the proxy
  proxyCache.set(target, proxy)
  
  return proxy
}

/**
 * Create a deeply reactive state object
 * 
 * @param initialValue - The initial state object
 * @returns A reactive proxy of the object
 */
export function zenState<T extends object>(initialValue: T): T {
  if (!shouldProxy(initialValue)) {
    throw new Error('zenState requires a plain object or array')
  }
  
  return createReactiveProxy(initialValue)
}

