import { useSignal } from '@preact/signals'
import { useLayoutEffect, useRef } from 'preact/hooks'

/** A row of mutually exclusive choices, like a set of radio buttons. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string
  value: T
  options: { id: T; label: string; disabled?: boolean; title?: string }[]
  onChange: (id: T) => void
  disabled?: boolean
}) {
  return (
    <div class="segmented bevel" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          class="segment bevel"
          disabled={disabled || o.disabled}
          title={o.title}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Segmented when its options fit side by side at their natural width, else a
 * select. A hidden copy of the segmented control is measured as the space
 * changes.
 */
export function SegmentedOrSelect<T extends string>(props: Parameters<typeof Segmented<T>>[0]) {
  const { label, value, options, onChange, disabled } = props
  const rootRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const fits = useSignal(true)
  useLayoutEffect(() => {
    const root = rootRef.current
    const measure = measureRef.current
    if (!root || !measure) return
    const check = () => (fits.value = measure.offsetWidth <= root.clientWidth)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(root)
    ro.observe(measure)
    return () => ro.disconnect()
  }, [])
  return (
    <div class="segmented-or-select" ref={rootRef}>
      <div class="segmented-measure" ref={measureRef} aria-hidden="true" inert>
        <Segmented label={label} value={value} options={options} onChange={() => {}} />
      </div>
      {fits.value ? (
        <Segmented {...props} />
      ) : (
        <select class="input bevel" aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.currentTarget.value as T)}>
          {options.map((o) => (
            <option key={o.id} value={o.id} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
