import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Radio, RadioGroup, ToggleButton, ToggleButtonGroup } from "react-aria-components";

/**
 * A row of mutually exclusive choices, like a set of radio buttons. An option
 * with an icon shows just the icon, with its label as its name and tooltip.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: {
    id: T;
    label: string;
    icon?: ReactNode;
    disabled?: boolean | undefined;
    title?: string | undefined;
  }[];
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
          {...(o.icon ? { "aria-label": o.label, "data-icon": true } : {})}
          {...((o.title ?? (o.icon ? o.label : undefined)) !== undefined
            ? { "data-tip": o.title ?? o.label }
            : {})}
        >
          {o.icon ?? o.label}
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
  const [fits, setFits] = useState(true);
  useLayoutEffect(() => {
    const root = rootRef.current;
    const measure = measureRef.current;
    if (!root || !measure) return;
    const check = () => setFits(measure.offsetWidth <= root.clientWidth);
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
      {fits ? (
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

/**
 * A row of choices that each turn on or off, any number at once: Segmented's
 * look, for a set of switches. Options show their icon, with the label as
 * name and tooltip.
 */
export function ToggleGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: readonly T[];
  options: { id: T; label: string; icon: ReactNode }[];
  onChange: (ids: T[]) => void;
}) {
  return (
    <ToggleButtonGroup
      className="segmented"
      aria-label={label}
      selectionMode="multiple"
      selectedKeys={value}
      onSelectionChange={(keys) =>
        // In the options' order, whatever order they were turned on in.
        onChange(options.flatMap((o) => (keys.has(o.id) ? [o.id] : [])))
      }
    >
      {options.map((o) => (
        <ToggleButton
          key={o.id}
          id={o.id}
          className="segment"
          aria-label={o.label}
          data-icon
          data-tip={o.label}
        >
          {o.icon}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
