import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import {
  RadioButton,
  RadioField,
  RadioGroup,
  ToggleButton,
  ToggleButtonGroup,
} from "react-aria-components";

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
      onChange={(next) => {
        onChange(next as T);
      }}
      {...(disabled === undefined ? {} : { isDisabled: disabled })}
    >
      {options.map((o) => {
        // An icon shows no label, so its tooltip names it.
        const tip = o.title ?? (o.icon ? o.label : undefined);
        return (
          <RadioField
            key={o.id}
            value={o.id}
            className="segment-field"
            {...(o.disabled === undefined ? {} : { isDisabled: o.disabled })}
            {...(o.icon ? { "aria-label": o.label } : {})}
          >
            <RadioButton
              className="segment"
              {...(o.icon ? { "data-icon": true } : {})}
              {...(tip === undefined ? {} : { "data-tip": tip })}
            >
              {o.icon ?? o.label}
            </RadioButton>
          </RadioField>
        );
      })}
    </RadioGroup>
  );
}

/**
 * Segmented when its options fit side by side at their natural width, else a
 * select. A hidden copy of the segmented control is measured as the space
 * changes.
 */
export function SegmentedOrSelect<T extends string>(
  properties: Parameters<typeof Segmented<T>>[0],
) {
  const { label, value, options, onChange, disabled } = properties;
  const rootReference = useRef<HTMLDivElement>(null);
  const measureReference = useRef<HTMLDivElement>(null);
  const fits = useSegmentedFit(rootReference, measureReference);
  return (
    <div className="segmented-or-select" ref={rootReference}>
      <div className="segmented-measure" ref={measureReference} aria-hidden="true" inert>
        <Segmented label={label} value={value} options={options} onChange={() => {}} />
      </div>
      {fits ? (
        <Segmented {...properties} />
      ) : (
        <select
          aria-label={label}
          value={value}
          disabled={disabled}
          onChange={(event) => {
            onChange(event.currentTarget.value as T);
          }}
        >
          {options.map((option) => (
            <option key={option.id} value={option.id} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function useSegmentedFit(
  rootReference: RefObject<HTMLDivElement | null>,
  measureReference: RefObject<HTMLDivElement | null>,
) {
  const [fits, setFits] = useState(true);
  useLayoutEffect(() => {
    const root = rootReference.current;
    const measure = measureReference.current;
    if (!root || !measure) return;
    const check = () => {
      setFits(measure.offsetWidth <= root.clientWidth);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(root);
    ro.observe(measure);
    return () => {
      ro.disconnect();
    };
  }, [fits, measureReference, rootReference]);
  return fits;
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
      onSelectionChange={(keys) => {
        onChange(options.flatMap((o) => (keys.has(o.id) ? [o.id] : [])));
      }}
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
