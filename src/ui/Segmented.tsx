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
