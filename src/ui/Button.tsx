import type { ComponentChildren, JSX } from 'preact'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon'

type Props = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'size'> & {
  variant?: Variant
  size?: 'sm' | 'md'
  /** Accessible name; required for icon-only buttons and shown as a tooltip. */
  label?: string
  pressed?: boolean
  children?: ComponentChildren
}

export function Button({
  variant = 'secondary',
  size = 'md',
  label,
  pressed,
  class: className,
  children,
  ...rest
}: Props) {
  const classes = ['btn', 'bevel', `btn-${variant}`, size === 'sm' && 'btn-sm', className]
    .filter(Boolean)
    .join(' ')
  return (
    <button
      type="button"
      class={classes}
      aria-label={variant === 'icon' ? label : undefined}
      title={label}
      aria-pressed={pressed === undefined ? undefined : pressed}
      {...rest}
    >
      {children}
    </button>
  )
}
