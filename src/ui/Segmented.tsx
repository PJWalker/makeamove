import { useSignal } from "@preact/signals-react";
import { useLayoutEffect, useRef } from "react";
import { Radio, RadioGroup } from "react-aria-components";

/** A row of mutually exclusive choices, like a set of radio buttons. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: { id: T; label: string; disabled?: boolean | undefined; title?: string | undefined }[];
  onChange: (id: T) => void;
  disabled?: boolean | undefined;
}) {
  return (
    <RadioGroup
      className="segmented"
      aria-label={label}
      orientation="horizontal"
      value={value}
      onChange={(next) => onChange(next as T)}
      {...(disabled !== undefined ? { isDisabled: disabled } : {})}
    >
      {options.map((o) => (
        <Radio
          key={o.id}
          value={o.id}
          className="segment"
          {...(o.disabled !== undefined ? { isDisabled: o.disabled } : {})}
          {...(o.title !== undefined ? { "data-tip": o.title } : {})}
        >
          {o.label}
        </Radio>
      ))}
    </RadioGroup>
  );
}

/**
 * Segmented when its options fit side by side at their natural width, else a
 * select. A hidden copy of the segmented control is measured as the space
 * changes.
 */
export function SegmentedOrSelect<T extends string>(props: Parameters<typeof Segmented<T>>[0]) {
  const { label, value, options, onChange, disabled } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const fits = useSignal(true);
  useLayoutEffect(() => {
    const root = rootRef.current;
    const measure = measureRef.current;
    if (!root || !measure) return;
    const check = () => (fits.value = measure.offsetWidth <= root.clientWidth);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(root);
    ro.observe(measure);
    return () => ro.disconnect();
  }, [fits]);
  return (
    <div className="segmented-or-select" ref={rootRef}>
      <div className="segmented-measure" ref={measureRef} aria-hidden="true" inert>
        <Segmented label={label} value={value} options={options} onChange={() => {}} />
      </div>
      {fits.value ? (
        <Segmented {...props} />
      ) : (
        <select
          aria-label={label}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.currentTarget.value as T)}
        >
          {options.map((o) => (
            <option key={o.id} value={o.id} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
