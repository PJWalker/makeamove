import { MoveBody } from "../workspace/MoveBody";
import { baseSystemOf, systemOf } from "../features/characters/api";
import type { CharacterView } from "../features/characters/types";
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
  type LibrarySource,
} from "../features/library";
import { toggleSetValue } from "../lib/set";
import type { Campaign } from "../campaign/campaign";
import { useQuery } from "../ui/useQuery";
import { Segmented } from "../ui/Segmented";
import { IconImage } from "../ui/icons";
import { List, ListExpand, ListGroup, Tag } from "../ui/List";
import { EntryRow, EntryWindow } from "../workspace/EntryWindow";
import { useEntryWindows } from "../workspace/entryWindowState";
import { dragEntity } from "../workspace/entityDrag";
import { entity } from "../workspace/dragEntities";
import { linkProxy } from "../workspace/linkProxy";
import { rollTag } from "../workspace/actionPresentation";
import { actionMenuItems } from "../workspace/actionMenu";
import { getEntityGraphic } from "../workspace/entityGraphics";
import { CampaignEntityGraphic } from "../workspace/EntityGraphic";
import { useCampaign, type CampaignContext } from "../workspace/campaignContext";
import { joinSections } from "../workspace/commands/views";
import { EntryActionButtons } from "../workspace/EntryActionButtons";
import { entryActionMenu, useLibraryActions, type EntryAction } from "../workspace/libraryActions";

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

type Browsing = {
  campaign: Campaign;
  actionsFor: (e: LibraryEntry) => EntryAction[];
  windows: ReturnType<typeof useEntryWindows>;
  openedIds: ReadonlySet<string>;
  searching: boolean;
  toggle: (id: string) => void;
};

/** An entry's context menu: what it offers, pinning it, and changing its graphic. */
function useEntryMenu({ actionsFor }: Pick<Browsing, "actionsFor">) {
  const ctx = useCampaign();
  return (e: LibraryEntry) =>
    joinSections([
      entryActionMenu(actionsFor(e)),
      hotbarMenu(ctx, e),
      [
        {
          label: "Change Graphic…",
          Icon: IconImage,
          onSelect: () => ctx.table.editGraphic(e.kind, e.id, e.name, e.icon),
        },
      ],
    ]);
}

/** Pinning an item or move to the hotbar, or giving it a shortcut. */
function hotbarMenu(ctx: CampaignContext, e: LibraryEntry) {
  if (e.kind === "item") return actionMenuItems(ctx, [{ id: `library:${e.id}`, title: e.name }]);
  if (e.kind === "move") return actionMenuItems(ctx, [{ id: `move:${e.id}`, title: e.name }]);
  return [];
}

/** What dragging an entry's row carries: an item or move to link, or any other entry as a token. */
function dragPayload(ctx: CampaignContext, campaign: Campaign, e: LibraryEntry) {
  if (e.kind === "item" || e.kind === "move") return entity(ctx, e.kind, e.id, e.name);
  return {
    label: e.name,
    libraryEntry: { kind: e.kind, id: e.id },
    token: {
      name: e.name,
      graphic: getEntityGraphic(campaign, e.kind, e.id, e.icon),
      entityRef: { kind: e.kind, id: e.id },
    },
  };
}

const TIP_HINT: Partial<Record<EntryKind, string>> = {
  item: "Drag onto a character to give it to them, or into a note to link it.",
  move: "Drag onto a character to teach it to them, or into a note to link it.",
};

/** One entry: its row, and what it holds underneath when opened. */
function LibraryRow({
  browsing,
  sourceId,
  path,
  view: v,
  aligned,
}: {
  browsing: Browsing;
  sourceId: string;
  path: string;
  view: EntryView;
  aligned: boolean;
}) {
  const ctx = useCampaign();
  const menuFor = useEntryMenu(browsing);
  const { campaign, windows, openedIds, searching, toggle } = browsing;
  const e = v.entry;
  const id = `${path}/${e.id}`;
  const holds = v.groups.length > 0;
  const open = holds && (searching ? v.reveal || openedIds.has(id) : openedIds.has(id));
  const hint = TIP_HINT[e.kind];
  return (
    <>
      <EntryRow
        name={e.name}
        before={
          holds ? (
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
        tag={e.kind === "move" ? rollTag(systemOf(campaign), e.move) : null}
        meta={metaOf(e)}
        tip={hint ? `${e.text}\n\n${hint}` : e.text}
        onOpen={(rowElement) => windows.show(libraryKey(sourceId, e), rowElement)}
        menuItems={menuFor(e)}
        onPointerDown={
          e.kind === "monster"
            ? undefined
            : (ev) => dragEntity(ctx.canvas, ev, dragPayload(ctx, campaign, e))
        }
      />
      {open && (
        <li className="library-nest">
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
              <LibraryRows
                browsing={browsing}
                sourceId={sourceId}
                path={`${id}/${group.id}`}
                views={entries}
              />
            </section>
          ))}
        </li>
      )}
    </>
  );
}

function LibraryRows({
  browsing,
  sourceId,
  path,
  views,
}: {
  browsing: Browsing;
  sourceId: string;
  path: string;
  views: EntryView[];
}) {
  const aligned = views.some((v) => v.groups.length > 0);
  return (
    <List>
      {views.map((v) => (
        <LibraryRow
          key={v.entry.id}
          browsing={browsing}
          sourceId={sourceId}
          path={path}
          view={v}
          aligned={aligned}
        />
      ))}
    </List>
  );
}

/** The windows open on library entries. */
function LibraryEntryWindows({
  browsing,
  sources,
  me,
}: {
  browsing: Browsing;
  sources: LibrarySource[];
  me: CharacterView | undefined;
}) {
  const ctx = useCampaign();
  const menuFor = useEntryMenu(browsing);
  const { campaign, windows, actionsFor } = browsing;
  const entries = sources.flatMap((s) =>
    sourceEntries(s).map((e) => [libraryKey(s.id, e), e] as const),
  );
  return windows.keys.map((key) => {
    const e = entries.find(([k]) => k === key)?.[1];
    if (!e) return null;
    const tag = e.kind === "move" ? rollTag(systemOf(campaign), e.move) : null;
    const meta = metaOf(e);
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
        menuItems={menuFor(e)}
      >
        {tag && <Tag>{tag}</Tag>}
        {meta && <span className="muted">{meta}</span>}
        <EntryActionButtons actions={actionsFor(e)} />
      </EntryWindow>
    );
  });
}

/** The search box, and a filter by kind when the libraries hold more than one. */
function LibraryTools({ kinds }: { kinds: EntryKind[] }) {
  const ctx = useCampaign();
  const { kind, query } = useQuery(ctx.library.view);
  return (
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
  );
}

/** Who the Libraries add things to. */
function targetNote(me: CharacterView | undefined, canAct: boolean) {
  if (!me) return "Choose a character to add things to";
  return canAct ? `Adding to ${me.name}` : `${me.name} isn’t yours to change`;
}

/**
 * The Libraries: everything the game system and plugins contribute (items,
 * moves, options, tags), grouped by where it comes from. Gear can be added
 * to the selected character, and moves made by them.
 */
export function LibrariesPanel({ campaign }: { campaign: Campaign }) {
  const ctx = useCampaign();
  // The Libraries are the system's own; homebrew is in the Items panel.
  const sources = useLibrariesFor(baseSystemOf(campaign));
  const { me, canAct, actionsFor } = useLibraryActions(campaign);
  const windows = useEntryWindows();
  const { kind, query } = useQuery(ctx.library.view);
  const openedIds = useQuery(ctx.library.openedEntries);
  const searching = query.trim() !== "";
  const browsing: Browsing = {
    campaign,
    actionsFor,
    windows,
    openedIds,
    searching,
    toggle: (id) =>
      ctx.library.openedEntries.set(toggleSetValue(ctx.library.openedEntries.value, id)),
  };

  const kinds = (Object.keys(KIND_LABEL) as EntryKind[]).filter((k) =>
    sources.some((s) => s.collections.some((c) => c.kind === k)),
  );
  const shown = sources.flatMap((s) => {
    const listed = topLevelKeys(s);
    const collections = s.collections.flatMap((c) => {
      const views = viewEntries(c.entries, query, kind, listed);
      return views.length > 0 ? [{ c, views }] : [];
    });
    return collections.length > 0 ? [{ s, collections }] : [];
  });

  return (
    <div className="panel-scroll libraries">
      <LibraryTools kinds={kinds} />
      <p className="muted libraries-target">{targetNote(me, canAct)}</p>

      {shown.map(({ s, collections }) => (
        <section key={s.id} className="library-source" aria-label={s.name}>
          <h3 className="eyebrow">{s.name}</h3>
          {collections.map(({ c, views }) => {
            const id = `${s.id}/${c.id}`;
            return (
              <ListGroup
                key={c.id}
                label={c.name}
                count={views.length}
                open={searching || openedIds.has(id)}
                onToggle={() => browsing.toggle(id)}
              >
                <LibraryRows browsing={browsing} sourceId={s.id} path={id} views={views} />
              </ListGroup>
            );
          })}
          {s.attribution && <p className="muted sheet-attribution">{s.attribution}</p>}
        </section>
      ))}
      {searching && !shown.length && <p className="empty">Nothing matches “{query.trim()}”.</p>}
      <LibraryEntryWindows browsing={browsing} sources={sources} me={me} />
    </div>
  );
}
