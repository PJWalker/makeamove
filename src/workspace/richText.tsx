
import { Editor, mergeAttributes } from "@tiptap/core";
import Collaboration from "@tiptap/extension-collaboration";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { ySyncPluginKey } from "@tiptap/y-tiptap";
import { createRoot  } from "react-dom/client";
import type {Root} from "react-dom/client";
import type * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import { IconDelete, IconImage, IconReveal, IconSecret , IconRename } from "../ui/icons";
import { getNote } from "../features/notes/api";
import type { LinkKind } from "../features/notes/links";
import { LINK_NODE } from "../features/notes/links";
import { linkLabel, linkTargets, linkTip  } from "../features/notes/targets";
import type {LinkTarget} from "../features/notes/targets";
import { menuTrigger } from "../ui/menuTrigger";
import type { MenuItem } from "../ui/ContextMenu";
import type { Campaign } from "../campaign/campaign";
import { joinSections } from "./commands/views";
import { linkMenuSections } from "./linkActions";
import {
  carets,
  deleteSecret,
  insertImages,
  makeSecret,
  NoteImage,
  revealSecret,
  secretFragment,
  secretNode,
  SECRET_NODE,
} from "./noteExtensions";
import type { CampaignContext } from "./campaignContext";
import { dragEntity, registerLinkDrop } from "./entityDrag";
import { entity } from "./dragEntities";
import { CampaignEntityGraphic } from "./EntityGraphic";
import { trackerButtonExtension } from "./trackerButtons";

/*
 * Rich text edited together: notes, and the long text on character sheets.
 * Markdown-style shortcuts format it (# for headings, ** for bold, - for
 * lists), typing @ links a note, character, scene, item or move, and
 * [[+1 XP]] makes a button that changes the selected character's XP. Link
 * chips can be clicked to follow them or dragged onto characters, the
 * hotbar or other text; anything dragged in becomes a link.
 */

export interface RichTextOptions {
  ctx: CampaignContext;
  /** The Yjs fragment holding the text. */
  fragment: Y.XmlFragment;
  placeholder: string;
  /** Its accessible name. */
  label: string;
  editable?: boolean | undefined;
  /** The note being edited, so it doesn't offer itself as a link. */
  noteId?: string | undefined;
  /** Players can read it: links to GM-only pages leave their titles off. */
  shared: boolean;
  /** After each edit made here (not ones arriving from peers). */
  onLocalEdit?: (editor: Editor) => void;
  /** Others editing the same text, to show their carets, and the name to show for yours. */
  carets?: { awareness: Awareness; name: string };
  /**
   * A note's secrets: the GM vault's document, where their text lives, or
   * null for a player, who sees none of them. Absent where text has no
   * secrets (sheets, chat, a secret's own text).
   */
  secrets?: { vault: Y.Doc | null };
}

/**
 * A link to a note, character, scene, item or move: an inline chip, typed
 * by starting a word with `@`. It stores its target's kind and id (and the
 * name it had, as a fallback); it shows the target's current name.
 */
export function linkExtension(campaign: Campaign, o: Pick<RichTextOptions, "noteId" | "shared">) {
  return Mention.extend({
    name: LINK_NODE,
    addAttributes() {
      return {
        ...this.parent?.(),
        kind: {
          default: "note",
          parseHTML: (element: HTMLElement) => element.getAttribute("data-kind"),
          renderHTML: (attributes: { kind: string }) => ({
            "data-kind": attributes.kind,
          }),
        },
        /** Text chosen for the link, shown instead of its target's name. */
        text: {
          default: null,
          parseHTML: (element: HTMLElement) => element.getAttribute("data-text"),
          renderHTML: (attributes: { text: string | null }) =>
            attributes.text ? { "data-text": attributes.text } : {},
        },
      };
    },
  }).configure({
    renderHTML: ({ node }) => {
      const { kind, id, label, text } = node.attrs as {
        kind: LinkKind;
        id: string;
        label?: string;
        text?: string | null;
      };
      const current = linkLabel(campaign, kind, id);
      const tip = current === null ? "Not available" : linkTip(campaign, kind, id);
      return [
        "span",
        mergeAttributes({
          class: "note-link",
          "data-type": LINK_NODE,
          "data-kind": kind,
          "data-id": id,
          "data-label": label,
          "data-missing": current === null ? "true" : undefined,
          "data-tip": tip ?? undefined,
          "data-tip-long": current === null ? undefined : "true",
          // Clicking turns the tooltip into the link's pop-up.
          "data-tip-opens": current === null ? undefined : "true",
        }),
        text || current || label || "Unavailable",
      ];
    },
    renderText: ({ node }) => `@${node.attrs["text"] || node.attrs["label"] || node.attrs["id"]}`,
    suggestion: {
      char: "@",
      allowSpaces: true,
      items: ({ query }) => linkTargets(campaign, query, o.noteId),
      command: ({ editor, range, props }) => {
        const t = props as unknown as LinkTarget;
        // Shared text mustn't carry a GM-only page's title where players could read it.
        const label = t.gmOnly && o.shared ? "" : t.label;
        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            { type: LINK_NODE, attrs: { kind: t.kind, id: t.id, label } },
            { type: "text", text: " " },
          ])
          .run();
      },
      render: () => suggestionList(campaign),
    },
  });
}

/**
 * The list that drops down after `@`: arrow keys move, Enter or Tab picks,
 * Escape closes. It's anchored to the `@` text being typed (richText.css).
 */
/** Counts suggestion lists, so each gets its own React id prefix. */
let suggestionRoots = 0;

function suggestionList(campaign: Campaign) {
  const host = document.createElement("div");
  let root: Root | null = null;
  host.className = "note-suggest mention-list context-menu panel drops-down";
  host.setAttribute("role", "listbox");
  let properties: SuggestionProps<LinkTarget> | null = null;
  let index = 0;

  const draw = () => {
    if (!properties) return;
    const {items} = properties;
    root?.render(
      items.length > 0 ? (
        <>
          {items.map((t, index_) => (
              <button
                key={`${t.kind}:${t.id}`}
                type="button"
                role="option"
                className="menu-item"
                aria-selected={index_ === index}
                data-active={index_ === index || undefined}
                onPointerDown={(e) => { e.preventDefault(); }}
                onClick={() => properties?.command(t)}
              >
                <CampaignEntityGraphic campaign={campaign} kind={t.kind} id={t.id} size={22} />
                <span className="menu-label">{t.label}</span>
                <span className="menu-shortcut">{t.detail}</span>
              </button>
            ))}
        </>
      ) : (
        <p className="empty-inline note-suggest-empty">Nothing by that name.</p>
      ),
    );
  };

  return {
    onStart(p: SuggestionProps<LinkTarget>) {
      // Its own id prefix, so ids (an icon's mask) can't clash with the app root's.
      root = createRoot(host, { identifierPrefix: `link-suggestions-${++suggestionRoots}-` });
      properties = p;
      index = 0;
      document.body.append(host);
      draw();
    },
    onUpdate(p: SuggestionProps<LinkTarget>) {
      properties = p;
      index = Math.min(index, Math.max(0, p.items.length - 1));
      draw();
    },
    onKeyDown({ event }: SuggestionKeyDownProps) {
      const n = properties?.items.length ?? 0;
      if (event.key === "Escape") {
        host.remove();
        return true;
      }
      if (!n) return false;
      switch (event.key) {
      case "ArrowDown": {
      index = (index + 1) % n;
      break;
      }
      case "ArrowUp": {
      index = (index - 1 + n) % n;
      break;
      }
      case "Enter":
      case "Tab": {
        properties?.command(properties.items[index]);
        return true;
      }
      default: { return false;
      }
      }
      draw();
      return true;
    },
    onExit() {
      root?.unmount();
      root = null;
      host.remove();
      properties = null;
    },
  };
}

/** Ask for image files and put them in at the cursor. */
function pickImages(editor: Editor) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.multiple = true;
  input.addEventListener('change', () => void insertImages(editor, [...(input.files ?? [])]));
  input.click();
}

/** Put a rich-text editor in `host`; returns it and a function that takes it down. */
export function mountRichText(
  host: HTMLElement,
  o: RichTextOptions,
): { editor: Editor; destroy: () => void } {
  const { ctx } = o;
  const { campaign } = ctx;
  const vault = o.secrets?.vault ?? null;
  /** A secret's own text, edited in place inside the note (GM only). */
  const mountSecret = (body: HTMLElement, id: string, document: Y.Doc): (() => void) => {
    const nested = mountRichText(body, {
      ctx,
      fragment: secretFragment(document, id),
      placeholder: "Only you can see this.",
      label: "Secret text",
      editable: o.editable,
      noteId: o.noteId,
      shared: false,
    });
    return nested.destroy;
  };
  const editor: Editor = new Editor({
    element: host,
    editable: o.editable ?? true,
    extensions: [
      // Yjs keeps the history, so undo only takes back your own edits.
      StarterKit.configure({ undoRedo: false, link: false }),
      Collaboration.configure({ fragment: o.fragment }),
      Placeholder.configure({ placeholder: o.placeholder }),
      linkExtension(campaign, o),
      trackerButtonExtension(ctx),
      NoteImage.configure({ peers: ctx.blobs }),
      ...(o.carets ? [carets(o.carets.awareness, o.carets.name)] : []),
      ...(o.secrets ? [secretNode(vault ? (host, id) => mountSecret(host, id, vault) : null)] : []),
    ],
    editorProps: {
      attributes: { class: "note-body", "aria-label": o.label },
      // Image files pasted or dropped in are stored and shown in place.
      handlePaste: (_view, e) => {
        const files = [...(e.clipboardData?.files ?? [])].filter((f) =>
          f.type.startsWith("image/"),
        );
        if (files.length === 0 || !editor.isEditable) return false;
        void insertImages(editor, files);
        return true;
      },
      handleDrop: (view, e) => {
        const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith("image/"));
        if (files.length === 0 || !editor.isEditable) return false;
        e.preventDefault();
        void insertImages(
          editor,
          files,
          view.posAtCoords({ left: e.clientX, top: e.clientY })?.pos,
        );
        return true;
      },
    },
    onUpdate: ({ editor: ed, transaction }) => {
      // Edits that arrived from peers are theirs to record.
      const sync = transaction.getMeta(ySyncPluginKey) as { isChangeOrigin?: boolean } | undefined;
      if (sync?.isChangeOrigin) return;
      o.onLocalEdit?.(ed);
    },
  });

  const chipAt = (e: Event) =>
    (e.target as Element).closest<HTMLElement>(`[data-type="${LINK_NODE}"]`);
  const referenceOf = (chip: HTMLElement) => ({
    kind: chip.dataset["kind"] as LinkKind,
    id: chip.dataset["id"] ?? "",
  });
  /** Opening a link: a note links on to another page in the Notes panel; anything else opens a pop-up. */
  const followsInPlace = (kind: LinkKind) => kind === "note" && !!o.noteId;

  // Clicking a link chip.
  const onClick = (e: MouseEvent) => {
    const chip = chipAt(e);
    if (!chip || chip.dataset["missing"]) return;
    e.preventDefault();
    const link = referenceOf(chip);
    if (followsInPlace(link.kind)) ctx.links.followLink(link.kind, link.id);
    else ctx.linkPopups.show(link, chip);
  };
  host.addEventListener("click", onClick);

  /** The link node a chip draws, and where it is, so it can be changed. */
  const nodeOf = (chip: HTMLElement) => {
    const at = editor.view.posAtDOM(chip, 0);
    for (const pos of [at, at - 1]) {
      const node = pos >= 0 ? editor.state.doc.nodeAt(pos) : null;
      if (node?.type.name === LINK_NODE) return { pos, node };
    }
    return null;
  };

  // Right-clicking text: add an image; for the GM, make it secret, or reveal or delete a secret.
  const textMenu = menuTrigger((x, y) => {
    if (!editor.isEditable) return;
    const items: MenuItem[] = [
      { label: "Insert Image…", Icon: IconImage, onSelect: () => { pickImages(editor); } },
    ];
    if (vault) {
      const secret = menuSecret;
      if (secret) {
        const pos = editor.view.posAtDOM(secret, 0);
        items.push("divider", {
          label: "Reveal to Players",
          Icon: IconReveal,
          onSelect: () => { revealSecret(editor, vault, pos); },
        }, {
          label: "Delete Secret",
          Icon: IconDelete,
          danger: true,
          onSelect: () => { deleteSecret(editor, vault, pos); },
        });
      } else {
        items.push("divider", {
          label: "Make Secret",
          Icon: IconSecret,
          onSelect: () => makeSecret(editor, vault),
        });
      }
    }
    ctx.linkPopups.linkMenu.set({ x, y, items });
  });
  let menuSecret: HTMLElement | null = null;

  // Right-clicking a link chip: open it elsewhere, or change what it says.
  const menu = menuTrigger((x, y) => {
    const chip = menuChip;
    if (!chip) return;
    const link = referenceOf(chip);
    const found = nodeOf(chip);
    const sections = chip.dataset["missing"]
      ? []
      : linkMenuSections(ctx, link, {
          title: chip.textContent ?? undefined,
          ...(followsInPlace(link.kind)
            ? { openInWindow: () => { ctx.linkPopups.show(link, chip); } }
            : {}),
        });
    if (found && editor.isEditable) {
      const custom = !!found.node.attrs["text"];
      sections.push([
        {
          label: "Edit Link Text…",
          Icon: IconRename,
          onSelect: () => { ctx.linkPopups.rename({
              text: chip.textContent ?? "",
              custom,
              save: (text) => {
                const now = nodeOf(chip) ?? found;
                editor.view.dispatch(
                  editor.state.tr.setNodeMarkup(now.pos, undefined, {
                    ...now.node.attrs,
                    text: text?.trim() || null,
                  }),
                );
              },
            }); },
        },
      ]);
    }
    const items = joinSections(sections);
    if (items.length > 0) ctx.linkPopups.linkMenu.set({ x, y, items });
  });
  let menuChip: HTMLElement | null = null;
  /** Whether a press is for the text menu: in this editor's own text, not a nested secret's, with notes' extras on. */
  const ownText = (e: Event) => {
    if (!o.secrets) return false;
    const secret = (e.target as Element).closest<HTMLElement>(`[data-type="${SECRET_NODE}"]`);
    // A secret's text has its own editor and menu; its label is this one's.
    if (secret && !(e.target as Element).closest(".note-secret-label")) return false;
    menuSecret = secret;
    return true;
  };
  const onMenuPress = (e: PointerEvent) => {
    menuChip = chipAt(e);
    if (menuChip) menu.onPointerDown(e);
    else if (ownText(e)) textMenu.onPointerDown(e);
  };
  const onContextMenu = (e: MouseEvent) => {
    menuChip = chipAt(e);
    if (menuChip) menu.onContextMenu(e);
    else if (ownText(e)) textMenu.onContextMenu(e);
  };
  host.addEventListener("pointerdown", onMenuPress);
  host.addEventListener("contextmenu", onContextMenu);

  // Dragging a link chip out: onto a character (gear and moves), the hotbar or other text.
  const onPointerDown = (e: PointerEvent) => {
    const chip = (e.target as Element).closest<HTMLElement>(`[data-type="${LINK_NODE}"]`);
    if (!chip || chip.dataset["missing"] || e.button !== 0) return;
    // Keep the editor from starting a text selection; a click still follows the link.
    e.preventDefault();
    dragEntity(
      ctx.canvas,
      e,
      entity(
        ctx,
        chip.dataset["kind"] as LinkKind,
        chip.dataset["id"] ?? "",
        chip.textContent ?? "",
      ),
      chip,
    );
  };
  host.addEventListener("pointerdown", onPointerDown);

  // Anything dragged in (from a list, the palette, the hotbar or other text) becomes a link where it's dropped.
  const stopLinkDrop =
    o.editable === false
      ? () => {}
      : registerLinkDrop(host, (dropped, x, y) => {
          const gmPage =
            dropped.kind === "note" && getNote(campaign, dropped.id)?.gmOnly && o.shared;
          const pos =
            editor.view.posAtCoords({ left: x, top: y })?.pos ?? editor.state.doc.content.size;
          editor
            .chain()
            .focus()
            .insertContentAt(pos, [
              {
                type: LINK_NODE,
                attrs: { kind: dropped.kind, id: dropped.id, label: gmPage ? "" : dropped.label },
              },
              { type: "text", text: " " },
            ])
            .run();
        });

  return {
    editor,
    destroy() {
      host.removeEventListener("click", onClick);
      host.removeEventListener("pointerdown", onPointerDown);
      host.removeEventListener("pointerdown", onMenuPress);
      host.removeEventListener("contextmenu", onContextMenu);
      stopLinkDrop();
      editor.destroy();
    },
  };
}
