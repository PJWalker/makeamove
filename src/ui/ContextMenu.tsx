import type { ComponentType } from "react";
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import {
  Menu,
  MenuItem as AriaMenuItem,
  MenuSection,
  Popover,
  Separator,
} from "react-aria-components";
import { withTransition } from "./transition";
import { leave, morphOpen, setMorphOrigin } from "./morph";
import ColourPicker from "./ColourPicker";
import { IconCheck } from "./icons";
import type { IconProps as IconProperties } from "./icons";

export type MenuItem =
  "divider" | {
      /**
       * A colour picker. While a colour is being picked, onPreview shows it
       * (null: stop showing it); onPick keeps it when the picker or the menu
       * closes.
       */
      label: string;
      colour: string;
      /** Whether the colour has an opacity to pick. */
      alpha?: boolean;
      onPreview: (colour: string | null) => void;
      onPick: (colour: string) => void;
    } | {
      label: string;
      Icon?: ComponentType<IconProperties>;
      shortcut?: string;
      danger?: boolean;
      disabled?: boolean;
      /** For an item that turns something on or off: ticked when it's on. */
      checked?: boolean;
      onSelect: () => void;
    };

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
  const { ref, triggerRef, dismiss, choose } = useContextMenuActions(x, y, items, onClose);
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
      data-context-menu
      onContextMenu={(event) => { event.preventDefault(); }}
    >
      <Menu aria-label={label ?? "Actions"} className="context-menu-actions" autoFocus="first">
        {items.map((item, index) => {
          if (item === "divider")
            return (
              // eslint-disable-next-line react-doctor/no-array-index-key, react-doctor/no-array-index-as-key -- Dividers are stateless structural markers.
              <Separator key={index} className="context-divider" />
            );
          if ("colour" in item) return null;
          const action = (
            <AriaMenuItem
              key={item.label}
              id={item.label}
              textValue={item.label}
              {...(item.disabled === undefined ? {} : { isDisabled: item.disabled })}
              className="menu-item"
              data-action-index={index}
              data-danger={item.danger}
              onAction={() => { choose(item, index); }}
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
              key={item.label}
              aria-label={item.label}
              selectionMode="multiple"
              selectedKeys={item.checked ? [item.label] : []}
            >
              {action}
            </MenuSection>
          );
        })}
      </Menu>
      {items.map((item) =>
        item !== "divider" && "colour" in item ? (
          <MenuColour key={`${item.label}:${item.colour}`} item={item} />
        ) : null,
      )}
    </Popover>
  );
}

function useContextMenuActions(x: number, y: number, items: MenuItem[], onClose: () => void) {
  const reference = useRef<HTMLDivElement>(null);
  const triggerReference = useRef(document.activeElement as HTMLElement);
  const closed = useRef(false);
  useLayoutEffect(() => {
    closed.current = false;
  }, [items, x, y]);
  /** Dismissed without choosing: fade out, since there's nothing to go back into. */
  const dismiss = () => {
    if (closed.current) return;
    closed.current = true;
    if (reference.current) void leave(reference.current, onClose, null);
    else onClose();
  };
  const choose = (item: Extract<MenuItem, { onSelect: () => void }>, index: number) => {
    if (closed.current || item.disabled) return;
    closed.current = true;
    const origin = reference.current?.querySelector<HTMLElement>(`[data-action-index="${index}"]`);
    const run = () => {
      onClose();
      item.onSelect();
    };
    if (!origin) { run(); return; }
    // An item that opens a window ("…") grows into it.
    if (item.label.endsWith("…")) { morphOpen(origin, run); return; }
    setMorphOrigin(origin);
    origin.style.viewTransitionName = `menu-selection-${crypto.randomUUID()}`;
    void withTransition(run).finally(() => {
      origin.style.removeProperty("view-transition-name");
    });
  };

  const dragged = useRef(false);
  const onRightRelease = useEffectEvent((event: PointerEvent) => {
    if (event.button !== 2 || !dragged.current) return;
    const row = (event.target as Element).closest<HTMLElement>("[data-action-index]");
    if (!row || !reference.current?.contains(row)) return;
    const index = Number(row.dataset["actionIndex"]);
    const item = items[index];
    if (item && item !== "divider" && "onSelect" in item) choose(item, index);
  });
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (event.buttons & 2 && reference.current?.contains(event.target as Node)) dragged.current = true;
    };
    globalThis.addEventListener("pointermove", onMove);
    globalThis.addEventListener("pointerup", onRightRelease);
    return () => {
      globalThis.removeEventListener("pointermove", onMove);
      globalThis.removeEventListener("pointerup", onRightRelease);
    };
  }, []);

  return { ref: reference, triggerRef: triggerReference, dismiss, choose };
}

/** A colour picker embedded in a menu. */
function MenuColour({ item }: { item: Extract<MenuItem, { colour: string }> }) {
  const [preview, setPreview] = useState<string | null>(null);
  const shown = preview ?? item.colour;
  const pending = useRef<string | null>(null);
  const keep = () => {
    const colour = pending.current;
    if (!colour) return;
    pending.current = null;
    item.onPick(colour);
    item.onPreview(null);
  };
  // Closing the menu keeps what was picked, as putting the picker away does.
  const keepOnClose = useEffectEvent(keep);
  useEffect(() => () => { keepOnClose(); }, []);
  return (
    <fieldset className="menu-colour">
      <legend className="menu-label">{item.label}</legend>
      <ColourPicker
        label={item.label}
        alpha={item.alpha ?? false}
        value={shown}
        onChange={(colour) => {
          setPreview(colour);
          pending.current = colour;
          item.onPreview(colour);
        }}
        onClose={keep}
      />
    </fieldset>
  );
}
