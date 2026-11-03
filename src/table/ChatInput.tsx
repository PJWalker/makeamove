import { Editor, Extension } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef } from "react";
import {
  contentFromText,
  emptyChatContent,
  type ChatContent,
} from "../features/chat/content";
import { LINK_NODE } from "../features/notes/links";
import type { Campaign } from "../campaign/campaign";
import { registerLinkDrop } from "./entityDrag";
import { linkExtension } from "./richText";

/*
 * The chat's message box stores Tiptap JSON. Enter sends; Shift+Enter starts
 * a new line.
 */

export function chatContentExtensions(campaign: Campaign) {
  return [
    StarterKit.configure({
      heading: false,
      blockquote: false,
      codeBlock: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      listKeymap: false,
      horizontalRule: false,
      link: {
        openOnClick: false,
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
      },
    }),
    linkExtension(campaign, { shared: true }),
  ];
}

export interface ChatInputHandle {
  /** Replace the current document with text or Tiptap JSON. */
  set(content: string | ChatContent): void;
  focus(): void;
}

export function ChatInput({
  campaign,
  placeholder,
  label,
  invalid,
  className = "input chat-input",
  initialContent,
  onChange,
  onEnter,
  onUp,
  onEscape,
  handle,
}: {
  campaign: Campaign;
  placeholder: string;
  label: string;
  invalid: boolean;
  className?: string;
  initialContent?: string | ChatContent;
  /** The text as it changes, links as tokens. */
  onChange: (content: ChatContent) => void;
  onEnter: () => void;
  /** Up arrow in an empty box. */
  onUp: () => void;
  onEscape: () => void;
  handle: { current: ChatInputHandle | null };
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  // Callbacks change every render; the editor reads the latest.
  const cb = useRef({ onChange, onEnter, onUp, onEscape });
  cb.current = { onChange, onEnter, onUp, onEscape };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const keys = Extension.create({
      name: "chatKeys",
      // Before the editor's own Enter (a new paragraph); the @ list keeps its keys while it's open.
      priority: 1000,
      addKeyboardShortcuts() {
        const listOpen = () => !!document.querySelector(".note-suggest");
        return {
          Enter: () => {
            if (listOpen()) return false;
            cb.current.onEnter();
            return true;
          },
          ArrowUp: ({ editor }) => {
            if (!editor.isEmpty || listOpen()) return false;
            cb.current.onUp();
            return true;
          },
          Escape: ({ editor }) => {
            if (editor.isEmpty || listOpen()) return false;
            cb.current.onEscape();
            return true;
          },
        };
      },
    });
    const editor = new Editor({
      element: host,
      extensions: [
        ...chatContentExtensions(campaign),
        Placeholder.configure({ placeholder }),
        keys,
      ],
      editorProps: {
        attributes: {
          class: "chat-input-body",
          "aria-label": label,
          role: "textbox",
          "aria-multiline": "true",
        },
      },
      onUpdate: ({ editor: ed }) => cb.current.onChange(ed.getJSON()),
    });
    const initial =
      typeof initialContent === "string"
        ? contentFromText(initialContent)
        : (initialContent ?? emptyChatContent());
    editor.commands.setContent(initial);
    cb.current.onChange(editor.getJSON());
    handle.current = {
      set: (content) => {
        editor.commands.setContent(
          typeof content === "string" ? contentFromText(content) : content,
        );
        editor.commands.focus("end");
        cb.current.onChange(editor.getJSON());
      },
      focus: () => editor.commands.focus(),
    };
    // Something dragged in becomes a link where it's dropped.
    const stop = registerLinkDrop(host, (link, x, y) => {
      const pos =
        editor.view.posAtCoords({ left: x, top: y })?.pos ??
        editor.state.doc.content.size;
      editor
        .chain()
        .focus()
        .insertContentAt(pos, [
          {
            type: LINK_NODE,
            attrs: { kind: link.kind, id: link.id, label: link.label },
          },
          { type: "text", text: " " },
        ])
        .run();
    });
    return () => {
      stop();
      handle.current = null;
      editor.destroy();
    };
  }, [campaign]);

  return <div ref={hostRef} className={className} aria-invalid={invalid} />;
}
