import type * as React from "react";
import type { ReactNode } from "react";
import { forwardRef } from "react";
import { mergeProps, useButton, useObjectRef } from "react-aria";
import type { Icon } from "./icons";
import { isString } from "../lib/guards";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "icon";

type Properties = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "size"> & {
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

export const Button = forwardRef<HTMLButtonElement, Properties>(function Button(
  {
    variant = "secondary",
    label,
    pressed,
    icon: ButtonIcon,
    className,
    children,
    onClick,
    ...rest
  }: Properties,
  forwardedReference,
) {
  const reference = useObjectRef(forwardedReference);
  const { buttonProps } = useButton(
    {
      type: rest.type ?? "button",
      ...(onClick
        ? { onClick: (event) => onClick(event as React.MouseEvent<HTMLButtonElement>) }
        : {}),
      ...(rest.disabled === undefined ? {} : { isDisabled: rest.disabled }),
    },
    reference,
  );
  const classes = ["btn", `btn-${variant}`, className].filter(Boolean).join(" ");
  const name = label ?? (ButtonIcon && isString(children) ? children : undefined);
  return (
    <button
      {...mergeProps(buttonProps, rest)}
      ref={reference}
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
