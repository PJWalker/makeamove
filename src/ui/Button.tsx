import type * as React from "react";
import type { ReactNode } from "react";
import { forwardRef } from "react";
import { mergeProps, useButton, useObjectRef } from "react-aria";
import type { Icon } from "./icons";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "icon";

type Props = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "size"> & {
  [attribute: `data-${string}`]: string | number | boolean | undefined;
  variant?: Variant;
  /** Accessible name; required for icon-only buttons and shown as a tooltip. */
  label?: string;
  pressed?: boolean;
  /**
   * Shown before the label. The label may be hidden for room (a compact
   * panel header), so a string label also names the button and is its
   * tooltip while hidden.
   */
  icon?: Icon;
  children?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "secondary", label, pressed, icon: ButtonIcon, className, children, ...rest }: Props,
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
  const classes = ["btn", `btn-${variant}`, className].filter(Boolean).join(" ");
  const name = label ?? (ButtonIcon && typeof children === "string" ? children : undefined);
  return (
    <button
      {...mergeProps(buttonProps, rest)}
      ref={ref}
      type={rest.type ?? "button"}
      className={classes}
      aria-label={rest["aria-label"] ?? (variant === "icon" || ButtonIcon ? name : undefined)}
      title={rest.title ?? name}
      aria-pressed={pressed ?? rest["aria-pressed"]}
    >
      {ButtonIcon ? (
        <>
          <ButtonIcon size={22} />
          <span className="btn-label">{children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
});
