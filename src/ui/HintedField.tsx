import { useId  } from "react";
import type {ReactNode} from "react";

/** The properties that tie an input to its label and hint. */
export interface HintedInputProperties {
  id: string;
  "aria-describedby"?: string;
}

/** A labelled input with a hint shown under it. */
export function HintedField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string | undefined;
  children: (input: HintedInputProperties) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(hint ? { id, "aria-describedby": hintId } : { id })}
      {hint && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
    </div>
  );
}
