import { InputRule, mergeAttributes, Node, PasteRule } from "@tiptap/core";
import type { Campaign } from "../campaign/campaign";
import { actingCharacterId } from "../features/characters/api";
import { trackerBlock } from "../features/characters/trackers";
import { parseTrackerButton, TRACKER_NODE, trackerToken } from "../data/richText";
import type { TrackerButton } from "../data/richText";
import { pressTrackerButton } from "./commands/characters";
import type { CampaignContext } from "./campaignContext";

/*
 * Inline resource buttons in rich text: typing or pasting [[+1 XP]] (or
 * [[-1 Treasure|Spend 1 Treasure]]) makes a button that adds to, or spends
 * from, the selected character's number when pressed.
 */

/** A pressed button that can't act gives a small shake. */
export function shake(element: Element) {
  element.animate(
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

export function trackerButtonExtension(context: CampaignContext) {
  const { campaign } = context;
  const TOKEN = /\[\[\s*[+-]\d+\s+[^\]|]+?(?:\|[^\]]+?)?]]/;
  const attributesOf = (raw: string) => {
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
        by: { default: 1, parseHTML: (element: HTMLElement) => Number(element.dataset["by"] ?? 1) },
        name: { default: "", parseHTML: (element: HTMLElement) => element.dataset["name"] ?? "" },
        label: {
          default: "",
          parseHTML: (element: HTMLElement) =>
            element.dataset["label"] ?? element.textContent ?? "",
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
            const attributes = attributesOf(match[1] ?? "");
            if (attributes)
              state.tr.replaceWith(range.from, range.to, this.type.create(attributes));
          },
        }),
      ];
    },
    addPasteRules() {
      return [
        new PasteRule({
          find: new RegExp(TOKEN.source, "g"),
          handler: ({ state, range, match }) => {
            const attributes = attributesOf(match[0]);
            if (attributes)
              state.tr.replaceWith(range.from, range.to, this.type.create(attributes));
          },
        }),
      ];
    },
    onCreate() {
      const { dom } = this.editor.view;
      const buttonAt = (e: Event) =>
        (e.target as Element).closest<HTMLElement>(`[data-type="${TRACKER_NODE}"]`);
      const toButton = (element: HTMLElement): TrackerButton => ({
        by: Number(element.dataset["by"] ?? 0),
        name: element.dataset["name"] ?? "",
        label: element.dataset["label"] ?? "",
      });
      // Hovering shows what pressing would do for the selected character, or why it can't.
      dom.addEventListener("pointerover", (e) => {
        const element = buttonAt(e);
        if (element)
          element.dataset["tip"] = trackerTip(
            campaign,
            actingCharacterId(campaign),
            toButton(element),
          );
      });
      dom.addEventListener("click", (e) => {
        const element = buttonAt(e);
        if (!element) return;
        e.preventDefault();
        const id = actingCharacterId(campaign);
        if (
          !id ||
          !context.execute(pressTrackerButton, { characterId: id, button: toButton(element) })
        )
          shake(element);
      });
    },
  });
}
