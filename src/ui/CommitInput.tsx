import { useRef, useState, type InputHTMLAttributes } from "react";

/**
 * A text field that commits when it loses focus or on Enter, so an edit is
 * one change rather than one per keystroke. Escape puts it back. It follows
 * `value` whenever it isn't being edited.
 */
export function CommitInput({
  value,
  onCommit,
  className = "input",
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange"> & {
  value: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  return (
    <input
      autoComplete="off"
      {...rest}
      className={className}
      value={draft ?? value}
      onFocus={(e) => {
        setDraft(value);
        rest.onFocus?.(e);
      }}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onBlur={(e) => {
        const next = draft?.trim();
        setDraft(null);
        if (!cancelled.current && next !== undefined && next !== value) onCommit(next);
        cancelled.current = false;
        rest.onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        else if (e.key === "Escape" && draft !== null && draft !== value) {
          e.stopPropagation();
          e.preventDefault();
          cancelled.current = true;
          e.currentTarget.blur();
        }
        rest.onKeyDown?.(e);
      }}
    />
  );
}
