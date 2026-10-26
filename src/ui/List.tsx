import type { ComponentChildren, JSX } from 'preact'

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

type LiProps = Omit<JSX.HTMLAttributes<HTMLLIElement>, 'children'> & Record<`data-${string}`, unknown>
type ButtonProps = Omit<JSX.HTMLAttributes<HTMLButtonElement>, 'children' | 'type'> & Record<`data-${string}`, unknown>

export function List({ children, label }: { children: ComponentChildren; label?: string }) {
  return (
    <ul class="list" aria-label={label}>
      {children}
    </ul>
  )
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
  children,
}: {
  /** An icon or avatar before the name. */
  lead?: ComponentChildren
  name: string
  /** A short chip after the name, such as a stat or "NPC". */
  tag?: string | null
  /** Quieter detail after that, such as weight or uses. */
  meta?: string
  selected?: boolean
  /** Shown faded, such as gear that isn't equipped. */
  dim?: boolean
  onPick?: (e: JSX.TargetedMouseEvent<HTMLButtonElement>) => void
  /** Extra attributes for the row (tooltips, drags onto it). */
  row?: LiProps
  /** Extra attributes for the name button (menus, drags from it). */
  pick?: ButtonProps
  /** Buttons after the name. */
  children?: ComponentChildren
}) {
  return (
    <li class="list-row" data-selected={selected || undefined} data-dim={dim || undefined} {...row}>
      <button type="button" class="list-pick" aria-current={selected || undefined} onClick={onPick} {...pick}>
        {lead && <span class="list-lead">{lead}</span>}
        <span class="list-name">{name}</span>
        {tag && <span class="list-tag bevel">{tag}</span>}
        {meta && <span class="list-meta">{meta}</span>}
      </button>
      {children}
    </li>
  )
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
  label: string
  /** An icon before the label, such as a folder. */
  lead?: ComponentChildren
  count?: number
  open: boolean
  onToggle: () => void
  /** Extra attributes for the heading (menus). */
  head?: ButtonProps
  /** Shown instead of the heading, such as a field to rename the group. */
  replaceHead?: ComponentChildren
  /** Extra attributes for the group (drops into it). */
  group?: Omit<JSX.HTMLAttributes<HTMLElement>, 'children'> & Record<`data-${string}`, unknown>
  /** The rows, shown while open. */
  children?: ComponentChildren
}) {
  return (
    <section class="list-group" data-open={open} {...group}>
      {replaceHead ?? (
        <button type="button" class="list-group-head" aria-expanded={open} onClick={onToggle} {...head}>
          <span class="list-caret" aria-hidden="true" />
          {lead && <span class="list-lead">{lead}</span>}
          <span class="list-name">{label}</span>
          {count !== undefined && <span class="list-meta">{count}</span>}
        </button>
      )}
      {open && children}
    </section>
  )
}

/** A short chip, as rows show after a name; for the same look elsewhere. */
export function Tag({ children }: { children: ComponentChildren }) {
  return <span class="list-tag bevel">{children}</span>
}
