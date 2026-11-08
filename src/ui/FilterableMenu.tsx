import type { ReactNode, ComponentProps } from "react";
import { useRef, useState } from "react";
import {
  Autocomplete,
  Dialog,
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  /** Whether the press now ending started with a mouse, which already opened the menu on mousedown. */
  const mousePress = useRef(false);
  const toggle = () => {
    if (!open) setQuery("");
    setOpen(!open);
  };
  const matches = options.filter((option) =>
    `${option.label} ${option.keywords ?? ""}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );

  return (
    <div className="filterable-menu">
      <Button
        ref={triggerRef}
        size="sm"
        aria-haspopup="dialog"
        aria-expanded={open}
        {...triggerProps}
        // A mouse opens it on mousedown, like a native menu; touch and keyboard on click.
        onPointerDown={(event) => {
          mousePress.current = event.pointerType === "mouse";
          if (!mousePress.current || event.button !== 0) return;
          // Preventing the default also stops the press focusing the button, and the menu
          // hands focus back to whatever had it when it opened.
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
          toggle();
        }}
        onClick={(event) => {
          // A keyboard or screen reader click (detail 0) always toggles: the mouse press may have
          // released over the menu, so its own click never came to clear the flag.
          const mouse = mousePress.current && event.detail > 0;
          mousePress.current = false;
          if (!mouse) toggle();
        }}
      >
        {trigger}
      </Button>
      <Popover
        triggerRef={triggerRef}
        isOpen={open}
        onOpenChange={setOpen}
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
    </div>
  );
}
