import type * as React from "react";
import type { ReactNode } from "react";

/*
 * The one list design, for every list of things in a panel: characters and
 * their folders, the Libraries' collections, a sheet's moves and inventory.
 *
 * A row is a leading icon or avatar, a name, an optional short tag and
 * detail, and any buttons after. Hovering turns the name and icon gold; a
 * selected row also has a gold bar at its start. Rows carry no background of
 * their own. A group is a foldable heading (caret, optional icon, label,
 * count) with its rows indented beneath.
 */

type LiProps = Omit<React.HTMLAttributes<HTMLLIElement>, "children"> &
  Record<`data-${string}`, unknown>;
type ButtonProps = Omit<React.HTMLAttributes<HTMLButtonElement>, "children" | "type"> &
  Record<`data-${string}`, unknown>;

export function List({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul className="list" aria-label={label}>
      {children}
    </ul>
  );
}

export function ListRow({
  lead,
  name,
  tag,
  meta,
  selected,
  dim,
  onPick,
  row,
  pick,
  before,
  children,
}: {
  /** Before the row's button, such as a toggle to show what it holds. */
  before?: ReactNode | undefined;
  /** An icon or avatar before the name. */
  lead?: ReactNode | undefined;
  name: string;
  /** A short chip after the name, such as a stat or "NPC". */
  tag?: string | null | undefined;
  /** Quieter detail after that, such as weight or uses. */
  meta?: string | undefined;
  selected?: boolean | undefined;
  /** Shown faded, such as gear that isn't equipped. */
  dim?: boolean | undefined;
  onPick?: ((e: React.MouseEvent<HTMLButtonElement>) => void) | undefined;
  /** Extra attributes for the row (tooltips, drags onto it). */
  row?: LiProps | undefined;
  /** Extra attributes for the name button (menus, drags from it). */
  pick?: ButtonProps | undefined;
  /** Buttons after the name. */
  children?: ReactNode | undefined;
}) {
  return (
    <li
      className="list-row"
      data-selected={selected || undefined}
      data-dim={dim || undefined}
      {...row}
    >
      {before}
      <button
        type="button"
        className="list-pick"
        aria-current={selected || undefined}
        onClick={onPick}
        {...pick}
      >
        {lead && <span className="list-lead">{lead}</span>}
        <span className="list-name">{name}</span>
        {tag && <span className="list-tag">{tag}</span>}
        {meta && <span className="list-meta">{meta}</span>}
      </button>
      {children}
    </li>
  );
}

export function ListGroup({
  label,
  lead,
  count,
  open,
  onToggle,
  head,
  replaceHead,
  group,
  children,
}: {
  label: string;
  /** An icon before the label, such as a folder. */
  lead?: ReactNode;
  count?: number;
  open: boolean;
  onToggle: () => void;
  /** Extra attributes for the heading (menus). */
  head?: ButtonProps;
  /** Shown instead of the heading, such as a field to rename the group. */
  replaceHead?: ReactNode;
  /** Extra attributes for the group (drops into it). */
  group?: Omit<React.HTMLAttributes<HTMLElement>, "children"> & Record<`data-${string}`, unknown>;
  /** The rows, shown while open. */
  children?: ReactNode;
}) {
  return (
    <section className="list-group" data-open={open} {...group}>
      {replaceHead ?? (
        <button
          type="button"
          className="list-group-head"
          aria-expanded={open}
          onClick={onToggle}
          {...head}
        >
          <span className="list-caret" aria-hidden="true" />
          {lead && <span className="list-lead">{lead}</span>}
          <span className="list-name">{label}</span>
          {count !== undefined && <span className="list-meta">{count}</span>}
        </button>
      )}
      {open && children}
    </section>
  );
}

/** A row's toggle to show or hide what it holds; a spacer in its place keeps names aligned. */
export function ListExpand({
  open,
  onToggle,
  label,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className="list-expand"
      aria-expanded={open}
      aria-label={label}
      onClick={onToggle}
    >
      <span className="list-caret" aria-hidden="true" />
    </button>
  );
}

/** A short chip, as rows show after a name; for the same look elsewhere. */
export function Tag({ children }: { children: ReactNode }) {
  return <span className="list-tag">{children}</span>;
}
