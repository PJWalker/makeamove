import { InputRule, mergeAttributes, Node, PasteRule } from "@tiptap/core";
import type { Campaign } from "../campaign/campaign";
import { selectedCharacterId } from "../features/characters/api";
import {
  parseTrackerButton,
  pressTracker,
  trackerBlock,
  trackerToken,
  type TrackerButton,
} from "../features/characters/trackers";

/*
 * Inline resource buttons in rich text: typing or pasting [[+1 XP]] (or
 * [[-1 Treasure|Spend 1 Treasure]]) makes a button that adds to, or spends
 * from, the selected character's number when pressed.
 */

export const TRACKER_NODE = "trackerButton";

/** A pressed button that can't act gives a small shake. */
export function shake(el: Element) {
  el.animate(
    [{ translate: "0" }, { translate: "-3px" }, { translate: "3px" }, { translate: "0" }],
    { duration: 180 },
  );
}

/** What a press does, as its tooltip: the change, or why it can't happen. */
export function trackerTip(
  campaign: Campaign,
  characterId: string | null | undefined,
  b: TrackerButton,
): string {
  const blocked = trackerBlock(campaign, characterId, b);
  if (blocked) return blocked;
  return `${b.by > 0 ? "Add" : "Spend"} ${Math.abs(b.by)} ${b.name}`;
}

export function trackerButtonExtension(campaign: Campaign) {
  const TOKEN = /\[\[\s*[+-]\d+\s+[^\]|]+?(?:\|[^\]]+?)?\]\]/;
  const attrsOf = (raw: string) => {
    const b = parseTrackerButton(raw);
    return b ? { by: b.by, name: b.name, label: b.label } : null;
  };
  return Node.create({
    name: TRACKER_NODE,
    group: "inline",
    inline: true,
    atom: true,
    selectable: true,
    addAttributes() {
      return {
        by: { default: 1, parseHTML: (el: HTMLElement) => Number(el.dataset.by ?? 1) },
        name: { default: "", parseHTML: (el: HTMLElement) => el.dataset.name ?? "" },
        label: {
          default: "",
          parseHTML: (el: HTMLElement) => el.dataset.label ?? el.textContent ?? "",
        },
      };
    },
    parseHTML() {
      return [{ tag: `button[data-type="${TRACKER_NODE}"]` }];
    },
    renderHTML({ node }) {
      const { by, name, label } = node.attrs as TrackerButton;
      return [
        "button",
        mergeAttributes({
          type: "button",
          class: "tracker-button",
          contenteditable: "false",
          "data-type": TRACKER_NODE,
          "data-by": String(by),
          "data-name": name,
          "data-label": label,
          "data-tip": `${by > 0 ? "Add" : "Spend"} ${Math.abs(by)} ${name}`,
        }),
        label,
      ];
    },
    renderText({ node }) {
      return trackerToken(node.attrs as TrackerButton);
    },
    addInputRules() {
      return [
        new InputRule({
          find: new RegExp(`(${TOKEN.source})$`),
          handler: ({ state, range, match }) => {
            const attrs = attrsOf(match[1] ?? "");
            if (attrs) state.tr.replaceWith(range.from, range.to, this.type.create(attrs));
          },
        }),
      ];
    },
    addPasteRules() {
      return [
        new PasteRule({
          find: new RegExp(TOKEN.source, "g"),
          handler: ({ state, range, match }) => {
            const attrs = attrsOf(match[0]);
            if (attrs) state.tr.replaceWith(range.from, range.to, this.type.create(attrs));
          },
        }),
      ];
    },
    onCreate() {
      const dom = this.editor.view.dom;
      const buttonAt = (e: Event) =>
        (e.target as Element).closest<HTMLElement>(`[data-type="${TRACKER_NODE}"]`);
      const toButton = (el: HTMLElement): TrackerButton => ({
        by: Number(el.dataset.by ?? 0),
        name: el.dataset.name ?? "",
        label: el.dataset.label ?? "",
      });
      // Hovering shows what pressing would do for the selected character, or why it can't.
      dom.addEventListener("pointerover", (e) => {
        const el = buttonAt(e);
        if (el) el.dataset.tip = trackerTip(campaign, selectedCharacterId(campaign), toButton(el));
      });
      dom.addEventListener("click", (e) => {
        const el = buttonAt(e);
        if (!el) return;
        e.preventDefault();
        const id = selectedCharacterId(campaign);
        if (!id || !pressTracker(campaign, id, toButton(el))) shake(el);
      });
    },
  });
}
