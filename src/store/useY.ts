import { useSignal } from '@preact/signals'
import { useEffect } from 'preact/hooks'
import type * as Y from 'yjs'

/**
 * Subscribe a component to a Yjs type. `read` derives a plain value from it;
 * the component re-renders when that Y type (or anything inside it) changes.
 *
 * `read` runs on every render rather than being cached, so a value that also
 * depends on props or state (such as "does element `id` exist?") is never
 * stale when only the prop changes.
 */
export function useY<T>(type: Y.AbstractType<any> | null | undefined, read: () => T): T {
  const changes = useSignal(0)

  useEffect(() => {
    if (!type) return
    const bump = () => changes.value++
    type.observeDeep(bump)
    return () => type.unobserveDeep(bump)
  }, [type])

  // Reading the counter subscribes this component to it.
  void changes.value
  return read()
}
