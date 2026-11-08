import { morphOpen, setMorphOrigin } from "./morph";
import { withTransition } from "./transition";
import type { ComponentType } from "react";
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import {
  Menu,
  MenuItem as AriaMenuItem,
  MenuSection,
  Popover,
  Separator,
} from "react-aria-components";
import { IconCheck } from "./icons";
import type { IconProps } from "./icons";

export type MenuItem =
  | {
      label: string;
      Icon?: ComponentType<IconProps>;
      shortcut?: string;
      danger?: boolean;
      disabled?: boolean;
      /** For an item that turns something on or off: ticked when it's on. */
      checked?: boolean;
      onSelect: () => void;
    }
  | {
      /**
       * A colour picker. While a colour is being picked, onPreview shows it
       * (null: stop showing it); onPick keeps it, once per drag, or when the
       * menu closes after picking by keyboard.
       */
      label: string;
      colour: string;
      onPreview: (colour: string | null) => void;
      onPick: (colour: string) => void;
    }
  | "divider";

export function ContextMenu({
  x,
  y,
  items,
  onClose,
  label,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef(document.activeElement as HTMLElement);
  const closed = useRef(false);
  useLayoutEffect(() => {
    closed.current = false;
  }, [items, x, y]);
  const dismiss = () => {
    if (closed.current) return;
    closed.current = true;
    onClose();
  };
  const choose = (item: Extract<MenuItem, { onSelect: () => void }>, index: number) => {
    if (closed.current || item.disabled) return;
    closed.current = true;
    const origin = ref.current?.querySelector<HTMLElement>(`[data-action-index="${index}"]`);
    const run = () => {
      onClose();
      item.onSelect();
    };
    if (origin && item.label.endsWith("…")) morphOpen(origin, run);
    else {
      if (origin) {
        setMorphOrigin(origin);
        origin.style.viewTransitionName = `menu-selection-${crypto.randomUUID()}`;
        void withTransition(run).finally(() => {
          origin.style.removeProperty("view-transition-name");
        });
      } else run();
    }
  };

  // Press, drag and release with the right button chooses the item it's released on;
  // React Aria only acts on the left button's release. It takes a drag inside the
  // menu first, so a plain right-click doesn't choose whatever opened under it.
  const dragged = useRef(false);
  const onRightRelease = useEffectEvent((event: PointerEvent) => {
    if (event.button !== 2 || !dragged.current) return;
    const row = (event.target as Element).closest<HTMLElement>("[data-action-index]");
    if (!row || !ref.current?.contains(row)) return;
    const index = Number(row.dataset.actionIndex);
    const item = items[index];
    if (item && item !== "divider" && "onSelect" in item) choose(item, index);
  });
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (event.buttons & 2 && ref.current?.contains(event.target as Node)) dragged.current = true;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onRightRelease);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onRightRelease);
    };
  }, []);

  return (
    <Popover
      ref={ref}
      triggerRef={triggerRef}
      getTargetRect={() => new DOMRect(x, y, 0, 0)}
      isOpen
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
      placement="bottom start"
      offset={0}
      maxHeight={innerHeight - 16}
      aria-label={label ?? "Actions"}
      className="context-menu panel"
      onContextMenu={(e) => e.preventDefault()}
    >
      <Menu aria-label={label ?? "Actions"} className="context-menu-actions" autoFocus="first">
        {items.map((item, index) => {
          if (item === "divider") return <Separator key={index} className="context-divider" />;
          if ("colour" in item) return null;
          const action = (
            <AriaMenuItem
              key={index}
              id={String(index)}
              textValue={item.label}
              {...(item.disabled !== undefined ? { isDisabled: item.disabled } : {})}
              className="menu-item"
              data-action-index={index}
              data-danger={item.danger}
              onAction={() => choose(item, index)}
            >
              {item.checked !== undefined &&
                (item.checked ? (
                  <IconCheck size={22} className="menu-check" />
                ) : (
                  <span className="menu-icon-space" />
                ))}
              {item.Icon ? <item.Icon size={22} /> : <span className="menu-icon-space" />}
              <span className="menu-label">{item.label}</span>
              {item.shortcut && <kbd className="menu-shortcut">{item.shortcut}</kbd>}
            </AriaMenuItem>
          );
          return item.checked === undefined ? (
            action
          ) : (
            <MenuSection
              key={index}
              aria-label={item.label}
              selectionMode="multiple"
              selectedKeys={item.checked ? [String(index)] : []}
            >
              {action}
            </MenuSection>
          );
        })}
      </Menu>
      {items.map((item, index) =>
        item !== "divider" && "colour" in item ? <MenuColour key={index} item={item} /> : null,
      )}
    </Popover>
  );
}

/** A colour input embedded in a menu. */
function MenuColour({ item }: { item: Extract<MenuItem, { colour: string }> }) {
  const [shown, setShown] = useState(item.colour);
  const inputRef = useRef<HTMLInputElement>(null);
  const pending = useRef<string | null>(null);
  const keep = useEffectEvent(() => {
    const colour = pending.current;
    if (!colour) return;
    pending.current = null;
    item.onPick(colour);
    item.onPreview(null);
  });
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const onChange = () => keep();
    input.addEventListener("change", onChange);
    return () => {
      input.removeEventListener("change", onChange);
      keep();
    };
  }, []);
  return (
    <div className="menu-colour" role="group" aria-label={item.label}>
      <span className="menu-label">{item.label}</span>
      <input
        ref={inputRef}
        type="color"
        aria-label={item.label}
        value={shown}
        onInput={(event) => {
          const colour = event.currentTarget.value;
          setShown(colour);
          pending.current = colour;
          item.onPreview(colour);
        }}
      />
    </div>
  );
}
