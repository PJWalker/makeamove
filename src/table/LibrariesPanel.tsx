import { plainText } from "../features/characters/trackers";
import { MoveBody } from "./MoveBody";
import {
  addItem,
  baseSystemOf,
  canEdit,
  getCharacter,
  newNpcFromMonster,
  selectedCharacterId,
  setData,
  startMove,
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
import { useY } from "../ui/useY";
import { Button } from "../ui/Button";
import { Segmented } from "../ui/Segmented";
import { IconGive, IconImage } from "../ui/icons";
import { List, ListExpand, ListGroup, Tag } from "../ui/List";
import { EntryRow, EntryWindow, rollTag, useEntryWindows } from "./EntryWindow";
import { dragEntity, entity } from "./entityDrag";
import { libraryView as view, openedLibraryEntries, type KindFilter } from "./libraryView";
import { linkProxy } from "./LinkChip";
import { makeVerb } from "./sheetParts";
import { actionMenuItems } from "./actionMenu";
import { getEntityGraphic } from "./entityGraphics";
import { CampaignEntityGraphic } from "./EntityGraphic";
import { editEntityGraphic } from "./GraphicDialogs";
import type { ItemDef } from "../systems/types";
import { useValue } from "../ui/useValue";

/**
 * The Libraries: everything the game system and plugins contribute (items,
 * moves, options, tags), grouped by where it comes from. Gear can be added
 * to the selected character, and moves made by them.
 */
export function LibrariesPanel({ campaign }: { campaign: Campaign }) {
  const system = systemOf(campaign);
  // The Libraries are the system's own; homebrew is in the Items panel.
  const sources = useLibrariesFor(baseSystemOf(campaign));
  const meId = useY(campaign.members, () => selectedCharacterId(campaign));
  const me = useY(campaign.characters, () => getCharacter(campaign, meId));
  const canAct = !!me && canEdit(campaign, me);
  const windows = useEntryWindows();
  const { kind, query } = useValue(view);
  const openedIds = useValue(openedLibraryEntries);
  const searching = query.trim() !== "";

  const kinds = (Object.keys(KIND_LABEL) as EntryKind[]).filter((k) =>
    sources.some((s) => s.collections.some((c) => c.kind === k)),
  );
  const acquisition = (item: ItemDef) => system.acquireItem?.(item, me);
  const canPurchase = (item: ItemDef) => {
    const how = acquisition(item);
    return canAct && (!how?.gmOnly || campaign.isGm()) && !how?.blocked;
  };
  const acquireItem = (item: ItemDef) => {
    if (!me || !canPurchase(item)) return;
    const how = acquisition(item);
    campaign.doc.transact(() => {
      for (const [field, value] of Object.entries(how?.data ?? {}))
        setData(campaign, me.id, field, value);
      addItem(campaign, me.id, item);
    });
  };
  const toggle = (id: string) => {
    openedLibraryEntries.value = toggleSetValue(openedLibraryEntries.value, id);
  };

  /** The buttons an entry offers, in its row or its window. */
  const actions = (e: LibraryEntry, inWindow = false) => {
    if (e.kind === "item" && inWindow) {
      return (
        <Button
          size="sm"
          variant="primary"
          disabled={!canPurchase(e.item)}
          title={
            canPurchase(e.item)
              ? undefined
              : !me
                ? "Choose a character first"
                : !canAct
                  ? "Not your character"
                  : (acquisition(e.item)?.blocked ??
                    (acquisition(e.item)?.gmOnly ? "Only the GM can grant this" : undefined))
          }
          onClick={() => acquireItem(e.item)}
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
          onClick={() => me && startMove(campaign, me.id, e.move)}
        >
          <Icon size={22} /> {label}
          {me ? ` as ${me.name}` : ""}
        </Button>
      );
    }
    if (e.kind === "monster" && inWindow) {
      return (
        <Button
          size="sm"
          variant="primary"
          disabled={!campaign.isGm()}
          onClick={() => newNpcFromMonster(campaign, e.monster.id)}
        >
          Create NPC
        </Button>
      );
    }
    return null;
  };

  const tagOf = (e: LibraryEntry) => (e.kind === "move" ? rollTag(system, e.move) : null);
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
        (g) =>
          `${g.name}${g.note ? ` (${g.note})` : ""}: ${g.entries.map((c) => c.name).join(", ")}`,
      ),
    ].join("\n\n");

  const menuItemsFor = (e: LibraryEntry) => {
    const actions =
      e.kind === "item"
        ? actionMenuItems(campaign, [{ id: `library:${e.id}`, title: e.name }])
        : e.kind === "move"
          ? actionMenuItems(campaign, [{ id: `move:${e.id}`, title: e.name }])
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
                acquireItem(e.item);
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
                  if (me && canAct) startMove(campaign, me.id, e.move);
                },
              },
              ...(actions.length ? (["divider"] as const) : []),
              ...actions,
            ]
          : e.kind === "monster"
            ? [
                {
                  label: "Create NPC",
                  disabled: !campaign.isGm(),
                  onSelect: () => {
                    if (campaign.isGm()) newNpcFromMonster(campaign, e.monster.id);
                  },
                },
              ]
            : actions;
    return [
      ...items,
      ...(items.length ? (["divider"] as const) : []),
      {
        label: "Change Graphic…",
        Icon: IconImage,
        onSelect: () => editEntityGraphic(campaign, e.kind, e.id, e.name, e.icon),
      },
    ];
  };

  const all = sources.flatMap((s) => sourceEntries(s).map((e) => [s.id, e] as const));
  const shown = sources
    .map((s) => {
      const listed = topLevelKeys(s);
      return {
        s,
        collections: s.collections
          .map((c) => ({ c, views: viewEntries(c.entries, query, kind, listed) }))
          .filter(({ views }) => views.length > 0),
      };
    })
    .filter(({ collections }) => collections.length > 0);

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
              ? `${plainText(e.text)}\n\nDrag onto a character to teach it to them, or into a note to link it.`
              : e.text
        }
        onOpen={(rowElement) => windows.show(libraryKey(sourceId, e), rowElement)}
        menuItems={menuItemsFor(e)}
        onPointerDown={
          e.kind === "monster"
            ? undefined
            : (ev) =>
                dragEntity(
                  ev,
                  e.kind === "item" || e.kind === "move"
                    ? entity(campaign, e.kind, e.id, e.name)
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
      <div className="libraries-tools">
        <input
          type="search"
          placeholder="Search the Libraries…"
          aria-label="Search the Libraries"
          value={query}
          onInput={(e) => (view.value = { ...view.value, query: e.currentTarget.value })}
        />
        {kinds.length > 1 && (
          <Segmented
            label="Show"
            value={kind}
            options={[
              { id: "all" as KindFilter, label: "All" },
              ...kinds.map((k) => ({ id: k as KindFilter, label: KIND_LABEL[k] })),
            ]}
            onChange={(k) => (view.value = { ...view.value, kind: k })}
          />
        )}
        <p className="muted libraries-target">
          {me
            ? canAct
              ? `Adding to ${me.name}`
              : `${me.name} isn’t yours to change`
            : "Choose a character to add things to"}
        </p>
      </div>

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
            text={plainText(textOf(e))}
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
                ? linkProxy(campaign, e.kind, e.id, e.name, e.icon)
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
