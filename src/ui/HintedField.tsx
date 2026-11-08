import { useId, type ReactNode } from "react";

/** The props that tie an input to its label and hint. */
export interface HintedInputProps {
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
  children: (input: HintedInputProps) => ReactNode;
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
