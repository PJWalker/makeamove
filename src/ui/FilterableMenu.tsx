import type { ReactNode, ComponentProps } from "react";
import { useState } from "react";
import {
  Autocomplete,
  Dialog,
  DialogTrigger,
  Input,
  ListBox,
  ListBoxItem,
  Popover,
  SearchField,
} from "react-aria-components";
import { Button } from "./Button";

export interface FilterableMenuOption {
  id: string;
  label: string;
  keywords?: string | undefined;
  content: ReactNode;
}

export function FilterableMenu({
  label,
  trigger,
  triggerProps,
  layout = "grid",
  searchLabel,
  placeholder,
  emptyMessage = "No matches",
  options,
  selected,
  onSelect,
}: {
  label: string;
  trigger: ReactNode;
  triggerProps?: Omit<ComponentProps<typeof Button>, "onClick" | "children">;
  /** A grid of compact tiles, or a list of full-width rows. */
  layout?: "grid" | "list";
  searchLabel: string;
  placeholder: string;
  emptyMessage?: string;
  options: FilterableMenuOption[];
  selected?: string | undefined;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const matches = options.filter((option) =>
    `${option.label} ${option.keywords ?? ""}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );

  return (
    <div className="filterable-menu">
      <DialogTrigger
        isOpen={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setQuery("");
        }}
      >
        <Button size="sm" aria-haspopup="dialog" aria-expanded={open} {...triggerProps}>
          {trigger}
        </Button>
        <Popover
          placement="bottom start"
          offset={6}
          maxHeight={layout === "grid" ? 340 : 480}
          className="filterable-menu-panel context-menu panel"
          data-layout={layout}
        >
          <Dialog aria-label={label}>
            <Autocomplete inputValue={query} onInputChange={setQuery}>
              <SearchField className="filterable-menu-search" aria-label={searchLabel}>
                <Input autoFocus placeholder={placeholder} />
              </SearchField>
              <ListBox
                className="filterable-menu-options"
                aria-label={label}
                items={matches}
                layout={layout === "grid" ? "grid" : "stack"}
                selectionMode="single"
                disallowEmptySelection
                selectedKeys={selected ? [selected] : []}
                onSelectionChange={(keys) => {
                  const id = keys === "all" ? undefined : keys.values().next().value;
                  if (id !== undefined) {
                    setOpen(false);
                    onSelect(String(id));
                  }
                }}
                renderEmptyState={() => <p className="filterable-menu-empty">{emptyMessage}</p>}
              >
                {(option) => (
                  <ListBoxItem
                    id={option.id}
                    textValue={option.label}
                    className="filterable-menu-option"
                  >
                    {option.content}
                  </ListBoxItem>
                )}
              </ListBox>
            </Autocomplete>
          </Dialog>
        </Popover>
      </DialogTrigger>
    </div>
  );
}
