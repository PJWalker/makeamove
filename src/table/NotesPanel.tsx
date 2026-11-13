import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  backlinks,
  getNote,
  listNoteFolders,
  listNotes,
  searchNotes,
  type NoteFolderView,
  type NoteMatch,
  type NoteView,
} from "../features/notes/api";
import type { Campaign } from "../campaign/campaign";
import { useQuery } from "../ui/useQuery";
import { Button } from "../ui/Button";
import { IconAdd, IconNewFolder, IconNotes, IconSecret } from "../ui/icons";
import { morphOpen } from "../ui/morph";
import { TwoPane, usePaneLevel } from "../ui/TwoPane";
import { List, ListRow } from "../ui/List";
import { menuTrigger } from "../ui/menuTrigger";
import { ContextMenu, type MenuItem } from "../ui/ContextMenu";
import { dragEntity } from "../workspace/entityDrag";
import { entity } from "../workspace/dragEntities";
import { NoteEditor } from "./NoteEditor";
import { FolderTree } from "./FolderTree";
import { notesLayout } from "./panelLayouts";
import { useCampaign } from "../workspace/campaignContext";
import {
  ensureDefaultNoteFolders,
  filePage,
  newGmPage,
  newPage,
  noteFolders,
  renamePage,
  revealPage,
} from "../workspace/commands/notes";
import { invoke, menuFor } from "../workspace/commands/views";

/** How long ago, roughly, for a page's last edit. */
function ago(at: number) {
  if (!at) return "";
  const s = (Date.now() - at) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/**
 * Notes: pages filed in folders (Sessions and World to start with), written
 * together. The list and the open page sit side by side, or take turns.
 */
export function NotesPanel({ campaign }: { campaign: Campaign }) {
  const ctx = useCampaign();
  // GM-only pages, on a GM device; watched too, so the list keeps up with them.
  const vault = useQuery(campaign.vault);
  useQuery(vault?.notes, () => null);
  const notes = useQuery(campaign.notes, () => listNotes(campaign));
  const folders = useQuery(campaign.noteFolders, () => listNoteFolders(campaign));
  // After useQuery, so it is already watching when the folders appear.
  useEffect(() => ctx.execute(ensureDefaultNoteFolders, undefined), [ctx]);
  const openId = useQuery(ctx.links.openNoteId);
  const open = openId ? notes.find((n) => n.id === openId) : undefined;
  const split = useQuery(notesLayout.mode) === "split";
  const { level, go, show } = usePaneLevel(notesLayout, open ? "detail" : "list");

  // Asked to open a page (from the list, a link or elsewhere): show it.
  const requests = useQuery(ctx.links.noteOpened);
  const seen = useRef(requests);
  useEffect(() => {
    if (requests !== seen.current && ctx.links.openNoteId.value) go("detail");
    seen.current = requests;
  }, [ctx, requests, go]);
  // The open page was deleted: back to the list.
  useEffect(() => {
    if (openId && !open && !campaign.notes.has(openId)) {
      ctx.links.openNoteId.set(null);
      go("list");
    }
  }, [ctx, openId, open, campaign.notes, go]);

  const folder = folders.find((f) => f.id === open?.folder);
  return (
    <TwoPane
      layout={notesLayout}
      level={level}
      title={folder?.name ?? "Notes"}
      backLabel="Back to the notes"
      onBack={() => go("list")}
      resizeLabel="Resize the notes list"
      list={
        <NoteList
          campaign={campaign}
          notes={notes}
          folders={folders}
          openId={openId}
          showList={() => show("list")}
        />
      }
      detail={
        open ? (
          <NotePage
            campaign={campaign}
            note={open}
            notes={notes}
            active={level === "detail" || split}
          />
        ) : (
          <p className="empty">Pick a page, or make a new one.</p>
        )
      }
    />
  );
}

function NoteList({
  campaign,
  notes,
  folders,
  openId,
  showList,
}: {
  campaign: Campaign;
  notes: NoteView[];
  folders: NoteFolderView[];
  openId: string | null;
  showList: () => Promise<void>;
}) {
  const ctx = useCampaign();
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [query, setQuery] = useState("");
  const needle = query.trim();
  // The last search's results, for what it searched; anything else is still searching.
  const [result, setResult] = useState<{
    needle: string;
    notes: NoteView[];
    matches: NoteMatch[];
  } | null>(null);
  const fresh = !!needle && result?.needle === needle && result.notes === notes;
  const matches = fresh ? result.matches : [];
  const searching = !!needle && !fresh;
  // GM pages need the vault, which a GM device opens once the campaign has loaded.
  const gmPages = useQuery(campaign.vault, () => ctx.commands.check(newGmPage, {}) === true);
  useEffect(() => {
    if (!needle) return;
    let cancelled = false;
    const search = async () => {
      const found = await searchNotes(campaign, needle, () => cancelled);
      if (!cancelled) setResult({ needle, notes, matches: found });
    };
    const timer = window.setTimeout(() => void search(), 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [campaign, notes, needle]);

  const row = (n: NoteView) => {
    const dragged = entity(ctx, "note", n.id, n.title);
    dragged.folder = (folder) => void ctx.execute(filePage, { id: n.id, folder });
    const trigger = menuTrigger((x, y) =>
      setMenu({ x, y, items: menuFor(ctx, { kind: "note", id: n.id }) }),
    );
    return (
      <ListRow
        key={n.id}
        lead={n.gmOnly ? <IconSecret size={22} /> : <IconNotes size={22} />}
        name={n.title}
        tag={n.gmOnly ? "GM" : null}
        meta={ago(n.updatedAt)}
        selected={n.id === openId}
        onPick={() => ctx.links.openNote(n.id)}
        pick={{
          onPointerDown: (e) => {
            trigger.onPointerDown(e);
            dragEntity(ctx.canvas, e, dragged);
          },
          onContextMenu: trigger.onContextMenu,
        }}
      />
    );
  };

  return (
    <>
      <div className="notes-browser">
        <div className="panel-bar">
          <input
            type="search"
            aria-label="Search Notes"
            placeholder="Search Notes…"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </div>
        {query.trim() ? (
          <div className="panel-scroll notes-search-results">
            {searching ? (
              <p className="empty">Searching notes…</p>
            ) : matches.length ? (
              <List>
                {matches.map((match) => (
                  <ListRow
                    key={`${match.note.id}:${match.from ?? "title"}`}
                    lead={match.note.gmOnly ? <IconSecret size={22} /> : <IconNotes size={22} />}
                    name={match.note.title}
                    meta={match.snippet}
                    tag={match.note.gmOnly ? "GM" : null}
                    selected={match.note.id === openId}
                    onPick={() => {
                      ctx.links.noteSearchTarget.set(
                        match.from === undefined
                          ? null
                          : { noteId: match.note.id, from: match.from, to: match.to! },
                      );
                      ctx.links.openNote(match.note.id);
                    }}
                  />
                ))}
              </List>
            ) : (
              <p className="empty">Nothing matches “{needle}”.</p>
            )}
          </div>
        ) : (
          <FolderTree
            ariaLabel="Notes"
            className="notes-list"
            folders={folders}
            items={notes}
            folderOf={(note) => note.folder}
            renderItem={row}
            renderActions={(newFolder) => (
              <>
                <Button icon={IconAdd} onClick={() => ctx.execute(newPage, {})}>
                  New Page
                </Button>
                {gmPages && (
                  <Button
                    variant="ghost"
                    icon={IconSecret}
                    title="Only you can see it, until you reveal it"
                    onClick={() => ctx.execute(newGmPage, {})}
                  >
                    New GM Page
                  </Button>
                )}
                <Button variant="ghost" icon={IconNewFolder} onClick={newFolder}>
                  New Folder
                </Button>
              </>
            )}
            tree="note"
            folderCommands={noteFolders}
            showList={showList}
            emptyContent={!notes.length ? <p className="empty-inline">No pages yet.</p> : null}
          />
        )}
      </div>
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </>
  );
}

function NotePage({
  campaign,
  note,
  notes,
  active,
}: {
  campaign: Campaign;
  note: NoteView;
  notes: NoteView[];
  active: boolean;
}) {
  const ctx = useCampaign();
  const linkedFrom = backlinks(campaign, `note:${note.id}`);
  const titleRef = useRef<HTMLInputElement>(null);
  // A brand-new page starts with its title ready to type.
  useLayoutEffect(() => {
    if (!getNote(campaign, note.id)?.title || note.title === "Untitled") titleRef.current?.focus();
  }, [campaign, note.id, note.title]);

  return (
    <article className="note-page" aria-label={note.title}>
      <div className="panel-scroll note-scroll">
        {note.gmOnly && (
          <p className="note-secret">
            <IconSecret size={22} />
            <span>Only you can see this page.</span>
            <Button
              variant="ghost"
              onClick={(e) =>
                morphOpen(e.currentTarget, () => invoke(ctx, revealPage, { id: note.id }))
              }
            >
              Reveal to Players…
            </Button>
          </p>
        )}
        <input
          ref={titleRef}
          className="title"
          aria-label="Title"
          placeholder="Untitled"
          value={note.title === "Untitled" ? "" : note.title}
          onChange={(e) => ctx.execute(renamePage, { id: note.id, title: e.currentTarget.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
              (
                e.currentTarget
                  .closest(".note-page")
                  ?.querySelector(".note-body") as HTMLElement | null
              )?.focus();
            }
          }}
        />
        <NoteEditor key={note.id} campaign={campaign} noteId={note.id} active={active} />
        {linkedFrom.length > 0 && (
          <section className="note-backlinks" aria-label="Linked from">
            <h3 className="eyebrow">Linked from</h3>
            <List>
              {linkedFrom.map((n) => (
                <ListRow
                  key={n.id}
                  lead={<IconNotes size={22} />}
                  name={notes.find((k) => k.id === n.id)?.title ?? n.title}
                  onPick={() => ctx.links.openNote(n.id)}
                />
              ))}
            </List>
          </section>
        )}
      </div>
    </article>
  );
}
