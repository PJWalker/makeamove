import { MoveBody } from "../workspace/MoveBody";
import {
  baseSystemOf,
  canEdit,
  getCharacter,
  actingCharacterId,
  systemOf,
} from "../features/characters/api";
import {
  KIND_LABEL,
  useLibrariesFor,
  libraryKey,
  sourceEntries,
  topLevelKeys,
  viewEntries,
  type EntryKind,
  type EntryView,
  type LibraryEntry,
} from "../features/library";
import { toggleSetValue } from "../lib/set";
import type { Campaign } from "../campaign/campaign";
import { useQuery } from "../ui/useQuery";
import { Button } from "../ui/Button";
import { Segmented } from "../ui/Segmented";
import { IconGive, IconImage } from "../ui/icons";
import { List, ListExpand, ListGroup, Tag } from "../ui/List";
import { EntryRow, EntryWindow } from "../workspace/EntryWindow";
import { useEntryWindows } from "../workspace/entryWindowState";
import { dragEntity } from "../workspace/entityDrag";
import { entity } from "../workspace/dragEntities";
import { linkProxy } from "../workspace/linkProxy";
import { makeVerb, rollTag } from "../workspace/actionPresentation";
import { actionMenuItems } from "../workspace/actionMenu";
import { getEntityGraphic } from "../workspace/entityGraphics";
import { CampaignEntityGraphic } from "../workspace/EntityGraphic";
import type { ItemDef } from "../systems/types";
import { useCampaign } from "../workspace/campaignContext";
import { acquireItem, npcFromMonster, startMove } from "../workspace/commands/characters";
import { can } from "../workspace/commands/views";

const metaOf = (e: LibraryEntry) =>
  [
    e.note ?? "",
    ...(e.kind === "item"
      ? [
          e.item.weight ? `${e.item.weight} wt` : "",
          e.item.uses ? `${e.item.uses} ${e.item.uses === 1 ? "use" : "uses"}` : "",
          e.item.wealthCost ? `${e.item.wealthCost.tier} (${e.item.wealthCost.rank})` : "",
        ]
      : []),
  ]
    .filter(Boolean)
    .join(" · ") || undefined;

/** An entry's text, with what it holds listed after. */
const textOf = (e: LibraryEntry) =>
  [
    e.text,
    ...(e.groups ?? []).map(
      (g) => `${g.name}${g.note ? ` (${g.note})` : ""}: ${g.entries.map((c) => c.name).join(", ")}`,
    ),
  ].join("\n\n");

/**
 * The Libraries: everything the game system and plugins contribute (items,
 * moves, options, tags), grouped by where it comes from. Gear can be added
 * to the selected character, and moves made by them.
 */
export function LibrariesPanel({ campaign }: { campaign: Campaign }) {
  const ctx = useCampaign();
  const system = systemOf(campaign);
  // The Libraries are the system's own; homebrew is in the Items panel.
  const sources = useLibrariesFor(baseSystemOf(campaign));
  const meId = useQuery(campaign.members, () => actingCharacterId(campaign));
  const me = useQuery(campaign.characters, () => getCharacter(campaign, meId));
  const canAct = !!me && canEdit(campaign, me);
  const windows = useEntryWindows();
  const { kind, query } = useQuery(ctx.library.view);
  const openedIds = useQuery(ctx.library.openedEntries);
  const searching = query.trim() !== "";

  const kinds = (Object.keys(KIND_LABEL) as EntryKind[]).filter((k) =>
    sources.some((s) => s.collections.some((c) => c.kind === k)),
  );
  const acquisition = (item: ItemDef) => system.acquireItem?.(item, me);
  /** True, or why the acting character can't get it. */
  const purchase = (item: ItemDef) =>
    me
      ? ctx.commands.check(acquireItem, { characterId: me.id, item: item.id })
      : "Choose a character first";
  const canPurchase = (item: ItemDef) => purchase(item) === true;
  const acquire = (item: ItemDef) =>
    me && ctx.execute(acquireItem, { characterId: me.id, item: item.id });
  const toggle = (id: string) => {
    ctx.library.openedEntries.set(toggleSetValue(ctx.library.openedEntries.value, id));
  };

  /** The buttons an entry offers, in its row or its window. */
  const actions = (e: LibraryEntry, inWindow = false) => {
    if (e.kind === "item" && inWindow) {
      return (
        <Button
          variant="primary"
          disabled={!canPurchase(e.item)}
          title={canPurchase(e.item) ? undefined : String(purchase(e.item))}
          onClick={() => acquire(e.item)}
        >
          {acquisition(e.item)?.label ?? (me ? `Give to ${me.name}` : "Choose a Character")}
        </Button>
      );
    }
    if (e.kind === "move" && inWindow) {
      const { label, Icon } = makeVerb(e.move);
      return (
        <Button
          variant="primary"
          disabled={!canAct}
          onClick={() => me && ctx.execute(startMove, { characterId: me.id, move: e.move.id })}
        >
          <Icon size={22} /> {label}
          {me ? ` as ${me.name}` : ""}
        </Button>
      );
    }
    if (e.kind === "monster" && inWindow) {
      return (
        <Button
          variant="primary"
          disabled={!can(ctx, npcFromMonster, { monster: e.monster.id })}
          onClick={() => ctx.execute(npcFromMonster, { monster: e.monster.id })}
        >
          Create NPC
        </Button>
      );
    }
    return null;
  };

  const tagOf = (e: LibraryEntry) => (e.kind === "move" ? rollTag(system, e.move) : null);

  const menuItemsFor = (e: LibraryEntry) => {
    const actions =
      e.kind === "item"
        ? actionMenuItems(ctx, [{ id: `library:${e.id}`, title: e.name }])
        : e.kind === "move"
          ? actionMenuItems(ctx, [{ id: `move:${e.id}`, title: e.name }])
          : [];
    const items =
      e.kind === "item"
        ? [
            {
              label:
                acquisition(e.item)?.label ?? (me ? `Give to ${me.name}` : "Choose a Character"),
              Icon: IconGive,
              disabled: !canPurchase(e.item),
              onSelect: () => {
                acquire(e.item);
              },
            },
            ...(actions.length ? (["divider"] as const) : []),
            ...actions,
          ]
        : e.kind === "move"
          ? [
              {
                label: "Make",
                disabled: !canAct,
                onSelect: () => {
                  if (me && canAct) ctx.execute(startMove, { characterId: me.id, move: e.move.id });
                },
              },
              ...(actions.length ? (["divider"] as const) : []),
              ...actions,
            ]
          : e.kind === "monster"
            ? [
                {
                  label: "Create NPC",
                  disabled: !can(ctx, npcFromMonster, { monster: e.monster.id }),
                  onSelect: () => ctx.execute(npcFromMonster, { monster: e.monster.id }),
                },
              ]
            : actions;
    return [
      ...items,
      ...(items.length ? (["divider"] as const) : []),
      {
        label: "Change Graphic…",
        Icon: IconImage,
        onSelect: () => ctx.table.editGraphic(e.kind, e.id, e.name, e.icon),
      },
    ];
  };

  const all: (readonly [string, ReturnType<typeof sourceEntries>[number]])[] = [];
  for (const s of sources) for (const e of sourceEntries(s)) all.push([s.id, e]);
  const shown = sources.flatMap((s) => {
    const listed = topLevelKeys(s);
    const collections = s.collections.flatMap((c) => {
      const views = viewEntries(c.entries, query, kind, listed);
      return views.length > 0 ? [{ c, views }] : [];
    });
    return collections.length > 0 ? [{ s, collections }] : [];
  });

  const row = (sourceId: string, path: string, v: EntryView, aligned: boolean) => {
    const e = v.entry;
    const id = `${path}/${e.id}`;
    const open =
      v.groups.length > 0 && (searching ? v.reveal || openedIds.has(id) : openedIds.has(id));
    return [
      <EntryRow
        key={e.id}
        name={e.name}
        before={
          v.groups.length ? (
            <ListExpand
              open={open}
              onToggle={() => toggle(id)}
              label={`${open ? "Hide" : "Show"} what ${e.name} holds`}
            />
          ) : aligned ? (
            <span className="list-expand" aria-hidden="true" />
          ) : undefined
        }
        lead={
          <CampaignEntityGraphic
            campaign={campaign}
            kind={e.kind}
            id={e.id}
            defaultIcon={e.icon}
            size={22}
          />
        }
        tag={tagOf(e)}
        meta={metaOf(e)}
        tip={
          e.kind === "item"
            ? `${e.text}\n\nDrag onto a character to give it to them, or into a note to link it.`
            : e.kind === "move"
              ? `${e.text}\n\nDrag onto a character to teach it to them, or into a note to link it.`
              : e.text
        }
        onOpen={(rowElement) => windows.show(libraryKey(sourceId, e), rowElement)}
        menuItems={menuItemsFor(e)}
        onPointerDown={
          e.kind === "monster"
            ? undefined
            : (ev) =>
                dragEntity(
                  ctx.canvas,
                  ev,
                  e.kind === "item" || e.kind === "move"
                    ? entity(ctx, e.kind, e.id, e.name)
                    : {
                        label: e.name,
                        libraryEntry: { kind: e.kind, id: e.id },
                        token: {
                          name: e.name,
                          graphic: getEntityGraphic(campaign, e.kind, e.id, e.icon),
                          entityRef: { kind: e.kind, id: e.id },
                        },
                      },
                )
        }
      >
        {actions(e)}
      </EntryRow>,
      open && (
        <li key={`${e.id}/held`} className="library-nest">
          {v.groups.map(({ group, entries }) => (
            <section
              key={group.id}
              className="library-nest-group"
              aria-label={`${e.name}: ${group.name}`}
            >
              {(v.groups.length > 1 || group.note) && (
                <h4 className="library-nest-name">
                  {group.name}
                  {group.note && <span className="list-meta">{group.note}</span>}
                </h4>
              )}
              {rows(sourceId, `${id}/${group.id}`, entries)}
            </section>
          ))}
        </li>
      ),
    ];
  };
  const rows = (sourceId: string, path: string, views: EntryView[]) => {
    const aligned = views.some((v) => v.groups.length > 0);
    return <List>{views.flatMap((v) => row(sourceId, path, v, aligned))}</List>;
  };

  return (
    <div className="panel-scroll libraries">
      <div className="panel-bar libraries-tools">
        <input
          type="search"
          placeholder="Search the Libraries…"
          aria-label="Search the Libraries"
          value={query}
          onInput={(e) =>
            ctx.library.view.set({ ...ctx.library.view.value, query: e.currentTarget.value })
          }
        />
        {kinds.length > 1 && (
          <Segmented
            label="Show"
            value={kind}
            options={[
              { id: "all", label: "All" },
              ...kinds.map((k) => ({ id: k, label: KIND_LABEL[k] })),
            ]}
            onChange={(k) => ctx.library.view.set({ ...ctx.library.view.value, kind: k })}
          />
        )}
      </div>
      <p className="muted libraries-target">
        {me
          ? canAct
            ? `Adding to ${me.name}`
            : `${me.name} isn’t yours to change`
          : "Choose a character to add things to"}
      </p>

      {shown.map(({ s, collections }) => (
        <section key={s.id} className="library-source" aria-label={s.name}>
          <h3 className="eyebrow">{s.name}</h3>
          {collections.map(({ c, views }) => {
            const id = `${s.id}/${c.id}`;
            const open = searching || openedIds.has(id);
            return (
              <ListGroup
                key={c.id}
                label={c.name}
                count={views.length}
                open={open}
                onToggle={() => toggle(id)}
              >
                {rows(s.id, id, views)}
              </ListGroup>
            );
          })}
          {s.attribution && <p className="muted sheet-attribution">{s.attribution}</p>}
        </section>
      ))}
      {searching && !shown.length && <p className="empty">Nothing matches “{query.trim()}”.</p>}

      {windows.keys.map((key) => {
        const found = all.find(([sid, e]) => libraryKey(sid, e) === key);
        if (!found) return null;
        const e = found[1];
        const tag = tagOf(e);
        return (
          <EntryWindow
            key={key}
            entryKey={key}
            title={e.name}
            text={textOf(e)}
            body={
              e.kind === "move" ? (
                <MoveBody campaign={campaign} move={e.move} characterId={me?.id ?? null} />
              ) : undefined
            }
            tags={e.tags}
            onClose={() => windows.close(key)}
            graphicRef={{ kind: e.kind, id: e.id }}
            graphicDefaultIcon={e.icon}
            proxy={
              e.kind === "item" || e.kind === "move"
                ? linkProxy(ctx, e.kind, e.id, e.name, e.icon)
                : undefined
            }
            menuItems={menuItemsFor(e)}
          >
            {tag && <Tag>{tag}</Tag>}
            {metaOf(e) && <span className="muted">{metaOf(e)}</span>}
            {actions(e, true)}
          </EntryWindow>
        );
      })}
    </div>
  );
}
