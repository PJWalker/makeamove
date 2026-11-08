import { FilterableMenu } from "./FilterableMenu";

export interface PickerOption {
  id: string;
  name: string;
  text?: string;
  /** A heading it sits under, shown with its name ("Gain a Path"). */
  group?: string;
}

/**
 * Picks one of a set of named, described options. The menu shows each
 * option's description for browsing; once chosen, only the name shows, with
 * its description as a tooltip.
 */
export function OptionPicker({
  label,
  options,
  value,
  onChange,
  disabled = false,
  emptyLabel = "None",
}: {
  label: string;
  options: PickerOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  emptyLabel?: string;
}) {
  const selected = options.find((option) => option.id === value);
  // A value from before the options changed shows as it is.
  const name = selected
    ? selected.group
      ? `${selected.group} · ${selected.name}`
      : selected.name
    : value || emptyLabel;
  return (
    <div className="field field-inline option-picker">
      <span aria-hidden="true">{label}</span>
      {disabled ? (
        <span
          className="option-picker-value"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable so its tooltip is reachable by keyboard
          tabIndex={0}
          aria-label={`${label}: ${name}`}
          data-tip={selected?.text}
          data-tip-long
        >
          {name}
        </span>
      ) : (
        <FilterableMenu
          label={label}
          layout="list"
          trigger={name}
          triggerProps={{
            className: "option-picker-trigger",
            "aria-label": `${label}: ${name}`,
            "data-tip": selected?.text,
            "data-tip-long": true,
          }}
          searchLabel={`Search ${label}`}
          placeholder="Filter"
          options={[{ id: "", name: emptyLabel } as PickerOption, ...options].map((option) => ({
            id: option.id,
            label: option.name,
            ...(option.text || option.group
              ? { keywords: [option.group, option.text].filter(Boolean).join(" ") }
              : {}),
            content: (
              <>
                {option.group && <span className="option-picker-group">{option.group}</span>}
                <strong>{option.name}</strong>
                {option.text && <span>{option.text}</span>}
              </>
            ),
          }))}
          selected={value}
          onSelect={onChange}
        />
      )}
    </div>
  );
}
