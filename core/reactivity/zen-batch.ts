/**
 * Zenith Batch - Deferred Effect Execution
 * 
 * Batching allows you to make multiple reactive updates without
 * triggering effects until all updates are complete. This improves
 * performance by preventing redundant effect executions.
 * 
 * Features:
 * - Groups multiple mutations
 * - Defers effect execution until batch completes
 * - Supports nested batches
 * - Automatically flushes on completion
 * 
 * @example
 * ```ts
 * const firstName = zenSignal('John')
 * const lastName = zenSignal('Doe')
 * 
 * zenEffect(() => {
 *   console.log(`${firstName()} ${lastName()}`)
 * })
 * // Logs: "John Doe"
 * 
 * // Without batch - effect runs twice
 * firstName('Jane')  // Logs: "Jane Doe"
 * lastName('Smith')  // Logs: "Jane Smith"
 * 
 * // With batch - effect runs once
 * zenBatch(() => {
 *   firstName('Bob')
 *   lastName('Brown')
 * })
 * // Logs: "Bob Brown" (only once)
 * ```
 */

import { startBatch, endBatch } from './tracking'

/**
 * Execute a function with batched updates
 * 
 * All reactive updates inside the batch will be collected,
 * and effects will only run once after the batch completes.
 * 
 * @param fn - The function to execute
 * @returns The return value of the function
 */
export function zenBatch<T>(fn: () => T): T {
  startBatch()
  
  try {
    return fn()
  } finally {
    endBatch()
  }
}

