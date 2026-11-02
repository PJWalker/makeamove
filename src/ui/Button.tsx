import type * as React from "react";
import type { ReactNode } from "react";
import { forwardRef } from "react";
import { mergeProps, useButton, useObjectRef } from "react-aria";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "icon";

type Props = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "size"> & {
  [attribute: `data-${string}`]: string | number | boolean | undefined;
  variant?: Variant;
  size?: "sm" | "md";
  /** Accessible name; required for icon-only buttons and shown as a tooltip. */
  label?: string;
  pressed?: boolean;
  children?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = "secondary",
    size = "md",
    label,
    pressed,
    className: className,
    children,
    ...rest
  }: Props,
  forwardedRef,
) {
  const ref = useObjectRef(forwardedRef);
  const { buttonProps } = useButton(
    {
      type: rest.type ?? "button",
      ...(rest.disabled !== undefined ? { isDisabled: rest.disabled } : {}),
    },
    ref,
  );
  const classes = [
    "btn",
    `btn-${variant}`,
    size === "sm" && "btn-sm",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      {...mergeProps(buttonProps, rest)}
      ref={ref}
      type={rest.type ?? "button"}
      className={classes}
      aria-label={
        rest["aria-label"] ?? (variant === "icon" ? label : undefined)
      }
      title={rest.title ?? label}
      aria-pressed={pressed ?? rest["aria-pressed"]}
    >
      {children}
    </button>
  );
});
