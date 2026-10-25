import { useSignal } from '@preact/signals'
import { useEffect, useRef } from 'preact/hooks'
import type * as Y from 'yjs'

/**
 * Subscribe a component to a Yjs type. `read` derives a plain value from it;
 * the component re-renders when that Y type (or anything inside it) changes.
 */
export function useY<T>(type: Y.AbstractType<any> | null | undefined, read: () => T): T {
  const readRef = useRef(read)
  readRef.current = read
  const value = useSignal<T>(read())

  useEffect(() => {
    if (!type) return
    const update = () => {
      value.value = readRef.current()
    }
    update()
    type.observeDeep(update)
    return () => type.unobserveDeep(update)
  }, [type])

  return value.value
}
