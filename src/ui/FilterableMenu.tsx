import type { ComponentChildren } from "preact";
import { createPortal } from "preact/compat";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { Button } from "./Button";
import { IconSearch } from "./icons";
import { useMenuOverlay } from "./menuOverlay";

export interface FilterableMenuOption {
  id: string;
  label: string;
  keywords?: string;
  content: ComponentChildren;
}

export function FilterableMenu({
  label,
  buttonLabel,
  searchLabel,
  placeholder,
  emptyMessage = "No matches",
  options,
  selected,
  onSelect,
}: {
  label: string;
  buttonLabel: string;
  searchLabel: string;
  placeholder: string;
  emptyMessage?: string;
  options: FilterableMenuOption[];
  selected?: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const restoreFocus = useRef(false);
  const triggerButton = () =>
    root.current?.querySelector<HTMLButtonElement>(":scope > button") ?? null;
  const matches = options.filter((option) =>
    `${option.label} ${option.keywords ?? ""}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );

  const close = (restore = false) => {
    restoreFocus.current = restore;
    setOpen(false);
    setQuery("");
  };

  useLayoutEffect(() => {
    if (open || !restoreFocus.current) return;
    restoreFocus.current = false;
    triggerButton()?.focus();
  }, [open]);

  const bounds = triggerButton()?.getBoundingClientRect();
  useMenuOverlay({
    open,
    ref: panel,
    anchor: bounds
      ? { left: bounds.left, top: bounds.top, bottom: bounds.bottom }
      : null,
    inside: [root.current],
    onDismiss: () => close(),
    positionKey: matches.length,
  });

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" || event.key === "ArrowLeft") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === "Tab") {
      close();
      return;
    }
    const surface = panel.current;
    if (!surface?.contains(event.target as Node)) return;
    const buttons = [
      ...surface.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    ];
    if (!buttons.length) return;
    if (event.target === search.current) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        buttons[0].focus();
      } else if (event.key === "Enter") {
        event.preventDefault();
        buttons[0].click();
      }
      return;
    }
    const at = buttons.indexOf(event.target as HTMLButtonElement);
    let next: number | null = null;
    if (event.key === "ArrowDown") next = (at + 1) % buttons.length;
    else if (event.key === "ArrowUp")
      next = (at - 1 + buttons.length) % buttons.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = buttons.length - 1;
    if (next !== null) {
      event.preventDefault();
      event.stopPropagation();
      buttons[next].focus();
    }
  };

  useLayoutEffect(() => {
    if (!open) return;
    search.current?.focus();
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, matches.length]);

  return (
    <div ref={root} class="filterable-menu">
      <Button
        size="sm"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (open) close(true);
          else {
            setQuery("");
            setOpen(true);
          }
        }}
      >
        <IconSearch size={22} /> {buttonLabel}
      </Button>
      {open &&
        createPortal(
          <section
            ref={panel}
            class="filterable-menu-panel context-menu panel bevel"
            role="dialog"
            aria-label={label}
            onContextMenu={(event) => event.preventDefault()}
          >
            <label class="filterable-menu-search">
              <span class="sr-only">{searchLabel}</span>
              <input
                ref={search}
                type="search"
                class="input bevel"
                value={query}
                placeholder={placeholder}
                autoComplete="off"
                onInput={(event) => setQuery(event.currentTarget.value)}
              />
            </label>
            {matches.length ? (
              <div
                class="filterable-menu-options"
                role="listbox"
                aria-label={label}
              >
                {matches.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={option.id === selected}
                    class="filterable-menu-option bevel"
                    onPointerMove={(event) =>
                      event.currentTarget.focus({ preventScroll: true })
                    }
                    onClick={() => {
                      onSelect(option.id);
                      close(true);
                    }}
                  >
                    {option.content}
                  </button>
                ))}
              </div>
            ) : (
              <p class="filterable-menu-empty">{emptyMessage}</p>
            )}
          </section>,
          document.body,
        )}
    </div>
  );
}
