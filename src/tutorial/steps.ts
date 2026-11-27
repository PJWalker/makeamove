import type { ToolId } from "../scene/tools";
import type { PanelId } from "../workspace/layoutModel";
import type { Goal } from "./goals";

/*
 * The tutorial, as data: each step says what to try, what in the UI it
 * points at, and how the tutorial tells it's done (goals.ts). To teach a new
 * feature, add a step here; `tutorial.test.ts` fails until every tool and
 * panel is taught by a step or listed in NOT_IN_TUTORIAL.
 */

/**
 * Parts of the UI a step can point at that aren't a tool or a panel's tab.
 * Each is marked in the UI with `data-tutorial="…"`; the test checks every
 * one is.
 */
export const UI_ANCHORS = ["quick-dice", "chat-message", "new-note"] as const;
export type UiAnchor = (typeof UI_ANCHORS)[number];

/** What a step points at: a tool's button, a panel's tab, or a marked part of the UI. */
export type Anchor = { panel: PanelId } | { tool: ToolId } | { ui: UiAnchor };

export interface Step {
  id: string;
  /** The part of the tutorial it's in, shown above its title. */
  section: string;
  title: string;
  text: string;
  goal: Goal;
  /** What to point at, best first: the first one showing is highlighted. */
  anchors?: readonly Anchor[];
}

export const STEPS: readonly Step[] = [
  {
    id: "welcome",
    section: "Welcome",
    title: "A Tiny Dungeon",
    text: "This campaign is a sandbox for learning the table. Each step asks you to try one thing, and moves on when you've done it. You're the GM here, so you can try everything.",
    goal: { kind: "read" },
  },
  {
    id: "move",
    section: "Playing",
    title: "Move the Hero",
    text: "With the Select tool, drag the Hero token towards the corridor. Everyone at the table sees it move.",
    goal: { kind: "moved", piece: "hero" },
    anchors: [{ tool: "select" }],
  },
  {
    id: "pan",
    section: "Playing",
    title: "Look Around",
    text: "Pick the Pan tool and drag to move the map. Scroll or pinch to zoom, from any tool.",
    goal: { kind: "tool", tool: "pan" },
    anchors: [{ tool: "pan" }],
  },
  {
    id: "measure",
    section: "Playing",
    title: "Measure a Distance",
    text: "Pick Measure, then drag from the Hero to the Goblin to see how far it is.",
    goal: { kind: "tool", tool: "ruler" },
    anchors: [{ tool: "ruler" }],
  },
  {
    id: "ping",
    section: "Playing",
    title: "Point Something Out",
    text: "Pick Ping and click the map. Everyone sees a ripple where you clicked.",
    goal: { kind: "tool", tool: "ping" },
    anchors: [{ tool: "ping" }],
  },
  {
    id: "roll",
    section: "At the Table",
    title: "Roll the Dice",
    text: "Click a die in the dice tray to roll it. Click more than one to roll them together.",
    goal: { kind: "more", of: "roll" },
    anchors: [{ ui: "quick-dice" }, { panel: "chat" }],
  },
  {
    id: "chat",
    section: "At the Table",
    title: "Say Something",
    text: "Type a message and press Enter. You can also roll from here: try 2d6+1.",
    goal: { kind: "more", of: "message" },
    anchors: [{ ui: "chat-message" }, { panel: "chat" }],
  },
  {
    id: "draw",
    section: "Marking the Map",
    title: "Draw on the Map",
    text: "Pick Draw and sketch a path for the Hero to take.",
    goal: { kind: "more", of: "drawing" },
    anchors: [{ tool: "draw" }],
  },
  {
    id: "erase",
    section: "Marking the Map",
    title: "Rub It Out",
    text: "Pick Erase and drag over your drawing.",
    goal: { kind: "fewer", of: "drawing" },
    anchors: [{ tool: "erase" }],
  },
  {
    id: "shape",
    section: "Marking the Map",
    title: "Draw a Shape",
    text: "Pick Shapes and drag out a square or circle, such as a trap's area.",
    goal: { kind: "more", of: "shape" },
    anchors: [{ tool: "shape" }],
  },
  {
    id: "text",
    section: "Marking the Map",
    title: "Label Something",
    text: "Pick Text, click the map and type a label.",
    goal: { kind: "more", of: "text" },
    anchors: [{ tool: "text" }],
  },
  {
    id: "note",
    section: "At the Table",
    title: "Keep Notes",
    text: "Open Notes and make a new page. Everyone can read and edit it, and you can link to it from chat with @.",
    goal: { kind: "more", of: "note" },
    anchors: [{ ui: "new-note" }, { panel: "notes" }],
  },
  {
    id: "door",
    section: "Running the Game",
    title: "Open the Door",
    text: "Walls and doors are the GM's, and only you see them. With Select, click the door into the Treasure Room and choose Open.",
    goal: { kind: "opened", piece: "door" },
    anchors: [{ tool: "select" }],
  },
  {
    id: "wall",
    section: "Running the Game",
    title: "Close the Gap",
    text: "The Treasure Room has a gap in its east wall. Pick Walls and drag across the gap to close it. Walls block sight and light.",
    goal: { kind: "more", of: "wall" },
    anchors: [{ tool: "wall" }],
  },
  {
    id: "light",
    section: "Running the Game",
    title: "Light the Treasure Room",
    text: "Pick Lights and click inside the Treasure Room to put down a lamp.",
    goal: { kind: "more", of: "light" },
    anchors: [{ tool: "light" }],
  },
  {
    id: "effect",
    section: "Running the Game",
    title: "Add Some Atmosphere",
    text: "Pick Effects and drag out some fog or embers. Fog hides what's in it.",
    goal: { kind: "more", of: "effect" },
    anchors: [{ tool: "effect" }],
  },
  {
    id: "members",
    section: "Playing Together",
    title: "Invite Your Players",
    text: "In a real campaign, Members has the invite link. Send it to your players and they join from their own devices.",
    goal: { kind: "read" },
    anchors: [{ panel: "members" }],
  },
  {
    id: "done",
    section: "Done",
    title: "You're Ready",
    text: "That's the table. Keep this campaign as a sandbox, or delete it from the lobby when you're done.",
    goal: { kind: "read" },
  },
];

/**
 * Tools and panels the tutorial doesn't teach yet, and why. A new tool or
 * panel must be taught by a step, or listed here.
 */
export const NOT_IN_TUTORIAL: Partial<Record<PanelId | ToolId, string>> = {
  scene: "Needs a step for adding and switching scenes.",
  pc: "Needs a game system and a character; the tutorial plays without a system.",
  characters: "Needs a step for making a character and dropping its token.",
  combat: "Needs a game system with initiative.",
  libraries: "Needs a game system with libraries.",
  reference: "Needs a game system with GM guidance.",
  items: "Needs a game system with gear.",
};
