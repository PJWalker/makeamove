import type * as React from "react";
import type { ComponentType } from "react";
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import {
  Menu,
  MenuItem as AriaMenuItem,
  MenuSection,
  Popover,
  Separator,
  SubmenuTrigger,
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
      /** A submenu: its items open beside it. */
      label: string;
      Icon?: ComponentType<IconProperties>;
      items: MenuItem[];
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

type Action = Extract<MenuItem, { onSelect: () => void }>;

/** The item at a path of indexes, such as "3.1": the second item in the fourth item's submenu. */
function itemAt(items: MenuItem[], path: string): MenuItem | undefined {
  let item: MenuItem | undefined;
  let list: MenuItem[] | undefined = items;
  for (const index of path.split(".")) {
    item = list?.[Number(index)];
    list = item && item !== "divider" && "items" in item ? item.items : undefined;
  }
  return item;
}

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
      onContextMenu={(event) => {
        event.preventDefault();
      }}
    >
      <Menu aria-label={label ?? "Actions"} className="context-menu-actions" autoFocus="first">
        {menuItems(items, "", choose)}
      </Menu>
      {items.map((item) =>
        item !== "divider" && "colour" in item ? (
          <MenuColour key={`${item.label}:${item.colour}`} item={item} />
        ) : null,
      )}
    </Popover>
  );
}

/** A menu's items as React Aria renders them; `prefix` is the path of the submenu they're in. */
function menuItems(
  items: MenuItem[],
  prefix: string,
  choose: (item: Action, path: string) => void,
): React.ReactNode[] {
  return items.map((item, index) => {
    const path = `${prefix}${index}`;
    if (item === "divider")
      // eslint-disable-next-line react-doctor/no-array-index-as-key -- Dividers are stateless structural markers.
      return <Separator key={path} className="context-divider" />;
    if ("colour" in item) return null;
    const lead = item.Icon ? <item.Icon size={22} /> : <span className="menu-icon-space" />;
    if ("items" in item)
      return (
        <SubmenuTrigger key={item.label}>
          <AriaMenuItem
            id={item.label}
            textValue={item.label}
            className="menu-item"
            data-action-index={path}
          >
            {lead}
            <span className="menu-label">{item.label}</span>
            <span className="menu-submenu-caret" aria-hidden="true" />
          </AriaMenuItem>
          <Popover className="context-menu panel" data-context-menu placement="end top" offset={-4}>
            <Menu aria-label={item.label} className="context-menu-actions">
              {menuItems(item.items, `${path}.`, choose)}
            </Menu>
          </Popover>
        </SubmenuTrigger>
      );
    const action = (
      <AriaMenuItem
        key={item.label}
        id={item.label}
        textValue={item.label}
        {...(item.disabled === undefined ? {} : { isDisabled: item.disabled })}
        className="menu-item"
        data-action-index={path}
        data-danger={item.danger}
        onAction={() => {
          choose(item, path);
        }}
      >
        {item.checked !== undefined &&
          (item.checked ? (
            <IconCheck size={22} className="menu-check" />
          ) : (
            <span className="menu-icon-space" />
          ))}
        {lead}
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
  });
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
  const choose = (item: Action, path: string) => {
    if (closed.current || item.disabled) return;
    closed.current = true;
    // A submenu's items are in a pop-up of their own, outside the menu.
    const origin = document.querySelector<HTMLElement>(
      `[data-context-menu] [data-action-index="${path}"]`,
    );
    const run = () => {
      onClose();
      item.onSelect();
    };
    if (!origin) {
      run();
      return;
    }
    // An item that opens a window ("…") grows into it.
    if (item.label.endsWith("…")) {
      morphOpen(origin, run);
      return;
    }
    setMorphOrigin(origin);
    origin.style.viewTransitionName = `menu-selection-${crypto.randomUUID()}`;
    void withTransition(run).finally(() => {
      origin.style.removeProperty("view-transition-name");
    });
  };

  const dragged = useRef(false);
  const onRightRelease = useEffectEvent((event: PointerEvent) => {
    if (event.button !== 2 || !dragged.current) return;
    const row = (event.target as Element).closest<HTMLElement>(
      "[data-context-menu] [data-action-index]",
    );
    if (!row) return;
    const path = row.dataset["actionIndex"] ?? "";
    const item = itemAt(items, path);
    if (item && item !== "divider" && "onSelect" in item) choose(item, path);
  });
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const { target } = event;
      if (event.buttons & 2 && target instanceof Element && target.closest("[data-context-menu]"))
        dragged.current = true;
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
  useEffect(
    () => () => {
      keepOnClose();
    },
    [],
  );
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
